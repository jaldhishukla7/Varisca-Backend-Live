// ─── Razorpay: create order, verify signature, webhook ───────────────
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Joi from 'joi';
import pool from '../db';
import { getRazorpay, getRazorpayKeyId, isRazorpayConfigured } from '../lib/razorpay';
import { optionalCustomerAuthMiddleware } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

const createRzOrderSchema = Joi.object({
  orderId: Joi.string().uuid(),
  order_id: Joi.string().uuid(),
  amount: Joi.number().positive().required(),
  email: Joi.string().email().required(),
  contact: Joi.string().allow('').optional(),
})
  .or('orderId', 'order_id')
  .messages({ 'object.missing': 'orderId or order_id is required' });

const verifySchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
});

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function assertOrderAccess(
  order: { customer_id: string | null; customer_email: string },
  req: Request,
  email: string,
): void {
  const em = email.trim().toLowerCase();
  const orderEm = String(order.customer_email).trim().toLowerCase();
  if (req.user && req.user.role === 'customer') {
    if (order.customer_id && order.customer_id !== req.user.userId) {
      throw new AppError('Forbidden — order belongs to another account', 403);
    }
    if (!order.customer_id && em !== orderEm) {
      throw new AppError('Forbidden — email does not match this order', 403);
    }
    return;
  }
  if (em !== orderEm) {
    throw new AppError('Email does not match this order', 403);
  }
}

function isCashOnDelivery(method: string): boolean {
  return /cash\s*on\s*delivery|^cod$/i.test(method);
}

// POST /api/payment/create-order
router.post(
  '/create-order',
  optionalCustomerAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!isRazorpayConfigured()) {
      res.status(503).json({ success: false, message: 'Razorpay is not configured on the server' });
      return;
    }

    const { error, value } = createRzOrderSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ success: false, message: error.details.map((d) => d.message).join(', ') });
      return;
    }

    const orderId = (value.orderId || value.order_id) as string;
    const { amount, email, contact } = value;

    const { rows } = await pool.query(
      `SELECT id, customer_id, customer_email, total, payment_status, payment_method, is_deleted
       FROM orders WHERE id = $1`,
      [orderId],
    );
    if (rows.length === 0 || rows[0].is_deleted) {
      throw new AppError('Order not found', 404);
    }
    const order = rows[0];

    assertOrderAccess(order, req, email);

    if (isCashOnDelivery(String(order.payment_method))) {
      throw new AppError('This order uses Cash on Delivery — no online payment needed', 400);
    }

    if (order.payment_status === 'paid') {
      throw new AppError('Order is already paid', 400);
    }

    const expectedRupees = roundMoney(Number(order.total));
    if (roundMoney(amount) !== expectedRupees) {
      throw new AppError(`Amount mismatch: expected ₹${expectedRupees}`, 400);
    }

    const amountPaise = Math.round(expectedRupees * 100);
    const rz = getRazorpay();

    const rzOrder = await rz.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `ord_${String(orderId).slice(0, 8)}_${Date.now()}`,
      notes: {
        order_id: orderId,
        ...(order.customer_id ? { customer_id: order.customer_id } : {}),
      },
    });

    await pool.query(
      `INSERT INTO payments (
        customer_id, order_id, rz_order_id, amount_paise, currency, status, email, contact
      ) VALUES ($1,$2,$3,$4,'INR','created',$5,$6)`,
      [order.customer_id, order.id, rzOrder.id, amountPaise, email, contact || ''],
    );

    res.json({
      success: true,
      rzOrderId: rzOrder.id,
      amount: rzOrder.amount,
      currency: rzOrder.currency,
      key: getRazorpayKeyId(),
    });
  }),
);

// POST /api/payment/verify
router.post(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isRazorpayConfigured()) {
      res.status(503).json({ success: false, message: 'Razorpay not configured' });
      return;
    }

    const { error, value } = verifySchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ success: false, message: error.details.map((d) => d.message).join(', ') });
      return;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = value;
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!secret) {
      res.status(503).json({ success: false, message: 'Razorpay not configured' });
      return;
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (expected !== razorpay_signature) {
      await pool.query(
        `UPDATE payments SET status = 'failed', error_desc = $1, updated_at = NOW() WHERE rz_order_id = $2`,
        ['Signature mismatch', razorpay_order_id],
      );
      res.status(400).json({ success: false, message: 'Payment verification failed' });
      return;
    }

    const rz = getRazorpay();
    let method: string | null = null;
    try {
      const p = await rz.payments.fetch(razorpay_payment_id);
      method = (p as { method?: string }).method || null;
    } catch (e) {
      logger.warn('Could not fetch Razorpay payment for method', e);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const payRes = await client.query(
        `UPDATE payments SET
          rz_payment_id = $1,
          rz_signature = $2,
          status = 'paid',
          method = COALESCE($3, method),
          updated_at = NOW()
        WHERE rz_order_id = $4
        RETURNING order_id`,
        [razorpay_payment_id, razorpay_signature, method, razorpay_order_id],
      );

      if (payRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, message: 'Payment record not found' });
        return;
      }

      const oid = payRes.rows[0].order_id;

      // Mark payment received and move fulfillment out of generic "pending" so storefront
      // shows progress (was confusing: Razorpay paid but status still looked "Pending").
      await client.query(
        `UPDATE orders SET
          payment_status = 'paid',
          status = CASE
            WHEN status::text = 'pending' THEN 'processing'::order_status
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = $1`,
        [oid],
      );

      await client.query(
        `UPDATE transactions SET status = 'completed' WHERE order_id = $1`,
        [oid],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Payment verified' });
  }),
);

export default router;

/**
 * Mounted in index.ts BEFORE express.json() — req.body is a Buffer.
 */
export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!webhookSecret) {
    logger.warn('RAZORPAY_WEBHOOK_SECRET not set — webhook rejected');
    res.status(503).json({ received: false, message: 'Webhook not configured' });
    return;
  }

  const sig = req.headers['x-razorpay-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).json({ message: 'Missing signature' });
    return;
  }

  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw)) {
    res.status(400).json({ message: 'Invalid body' });
    return;
  }

  const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
  if (expected !== sig) {
    logger.warn('Razorpay webhook signature mismatch');
    res.status(400).json({ message: 'Invalid webhook signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ message: 'Invalid JSON' });
    return;
  }

  const event = payload.event as string;

  try {
    if (event === 'payment.captured') {
      const entity = payload.payload?.payment?.entity;
      const rzOrderId = entity?.order_id as string | undefined;
      const payId = entity?.id as string | undefined;
      const method = entity?.method as string | undefined;
      if (rzOrderId) {
        await pool.query(
          `UPDATE payments SET
            rz_payment_id = COALESCE(rz_payment_id, $1),
            status = 'paid',
            method = COALESCE($2, method),
            updated_at = NOW()
          WHERE rz_order_id = $3`,
          [payId || null, method || null, rzOrderId],
        );
        const pr = await pool.query(`SELECT order_id FROM payments WHERE rz_order_id = $1`, [rzOrderId]);
        if (pr.rows[0]) {
          const oid = pr.rows[0].order_id;
          await pool.query(
            `UPDATE orders SET
              payment_status = 'paid',
              status = CASE
                WHEN status::text = 'pending' THEN 'processing'::order_status
                ELSE status
              END,
              updated_at = NOW()
            WHERE id = $1`,
            [oid],
          );
          await pool.query(`UPDATE transactions SET status = 'completed' WHERE order_id = $1`, [oid]);
        }
      }
    } else if (event === 'payment.failed') {
      const entity = payload.payload?.payment?.entity;
      const rzOrderId = entity?.order_id as string | undefined;
      const payId = entity?.id as string | undefined;
      const errCode = entity?.error_code as string | undefined;
      const errDesc = entity?.error_description as string | undefined;
      if (rzOrderId) {
        await pool.query(
          `UPDATE payments SET
            status = 'failed',
            rz_payment_id = COALESCE($1, rz_payment_id),
            error_code = $2,
            error_desc = $3,
            updated_at = NOW()
          WHERE rz_order_id = $4`,
          [payId || null, errCode || null, errDesc || null, rzOrderId],
        );
      }
    }
  } catch (e) {
    logger.error('Webhook handler error', e);
    res.status(500).json({ message: 'Webhook handling failed' });
    return;
  }

  res.json({ received: true });
}

// ─── Orders + Items CRUD ────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import pool from '../db';
import logger from '../utils/logger';
import { customerAuthMiddleware } from '../middleware/auth';
import { asyncHandler, AppError, handleValidationError, handleDatabaseError } from '../middleware/errorHandler';

const router = Router();

// ─── Joi Schema ───────────────────────────────────────────────────────
const orderItemSchema = Joi.object({
  product_id: Joi.string().allow(null, '').optional(),
  productId:  Joi.string().allow(null, '').optional(),
  name:        Joi.string().required(),
  qty:         Joi.number().integer().min(1).required(),
  price:       Joi.number().min(0).required(),
  size:        Joi.string().allow('').optional(),
  color:       Joi.string().allow('').optional(),
  image:       Joi.string().allow('').optional(),
});

const createOrderSchema = Joi.object({
  customer_name:    Joi.string().trim().min(1).required(),
  customer_email:   Joi.string().email().required(),
  customer_phone:   Joi.string().allow('').optional(),
  customer_id:      Joi.string().allow(null, '').optional(),
  items:            Joi.array().items(orderItemSchema).min(1).required(),
  shipping_address: Joi.string().allow('').optional(),
  payment_method:   Joi.string().allow('').optional(),
  subtotal:         Joi.number().min(0).optional(),
  discount:         Joi.number().min(0).optional(),
  shipping_cost:    Joi.number().min(0).optional(),
  tax:              Joi.number().min(0).optional(),
  handling_fee:     Joi.number().min(0).optional(),
  total:            Joi.number().min(0).required(),
  coupon_code:      Joi.string().allow('').optional(),
  notes:            Joi.string().allow('').optional(),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// GET /api/orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, status, sort = 'created_at', order = 'desc', page = '1', limit = '50' } = req.query;
    const params: any[] = [];
    let where = 'WHERE o.is_deleted = FALSE';
    let i = 1;

    if (search) { where += ` AND (o.order_number ILIKE $${i} OR o.customer_name ILIKE $${i} OR o.customer_email ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (status) { where += ` AND o.status = $${i}`; params.push(status); i++; }

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const countRes = await pool.query(`SELECT COUNT(*) FROM orders o ${where}`, params);
    const { rows } = await pool.query(
      `SELECT o.* FROM orders o ${where} ORDER BY o.created_at ${sortOrder} LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit as string, 10), offset]
    );

    // Attach items to each order
    for (const row of rows) {
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.id]);
      row.items = items.rows;
    }

    res.json({ data: rows, total: parseInt(countRes.rows[0].count, 10) });
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// GET /api/orders/my  (customer JWT) — fetch current customer's orders + items
router.get('/my', customerAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const customerId = req.user!.userId;
    const email = (req.user!.email || '').toLowerCase().trim();

    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE is_deleted = FALSE
         AND (
           customer_id = $1
           OR (customer_id IS NULL AND LOWER(customer_email) = $2)
         )
       ORDER BY created_at DESC
       LIMIT 100`,
      [customerId, email]
    );

    for (const row of rows) {
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [row.id]);
      row.items = items.rows;
    }

    res.json(rows);
  } catch (err: any) {
    logger.error(`Customer orders fetch failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// GET /api/orders/stats/summary
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as payment_done,
        COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled', 'refunded')), 0) as total_revenue
      FROM orders WHERE is_deleted = FALSE
    `);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// GET /api/orders/by-number/:orderNumber  (public — for order confirmation page)
router.get('/by-number/:orderNumber', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE order_number = $1 AND is_deleted = FALSE',
      [req.params.orderNumber]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [rows[0].id]);
    rows[0].items = items.rows;
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// GET /api/orders/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    rows[0].items = items.rows;
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// POST /api/orders
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = createOrderSchema.validate(req.body, { abortEarly: false });
  if (error) {
    throw handleValidationError(error);
  }

  let db: any;
  try {
    db = await pool.connect();
    await db.query('BEGIN');
    const {
      customer_name, customer_email, customer_phone, items,
      shipping_address, payment_method, discount, shipping_cost, tax,
      customer_id, coupon_code, handling_fee, notes,
    } = value;

    let resolvedCustomerId: string | null =
      customer_id && UUID_REGEX.test(String(customer_id)) ? String(customer_id) : null;
    if (!resolvedCustomerId) {
      const lookup = await db.query(
        `SELECT id FROM customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND is_deleted = FALSE LIMIT 1`,
        [customer_email]
      );
      if (lookup.rows.length > 0) resolvedCustomerId = lookup.rows[0].id;
    }

    type NormItem = {
      product_id: string | null;
      name: string;
      qty: number;
      price: number;
      size: string;
      color: string;
      image: string;
      sku: string;
    };

    const normalizedItems: NormItem[] = [];

    for (const item of items) {
      const rawProductId = item.product_id || item.productId || null;
      const validProductId =
        rawProductId && UUID_REGEX.test(String(rawProductId)) ? String(rawProductId) : null;

      let name = String(item.name).trim();
      let price = roundMoney(Number(item.price));
      let image = item.image ? String(item.image) : '';
      let sku = '';

      if (validProductId) {
        const pr = await db.query(
          `SELECT name, price, image, sku, inventory FROM products
           WHERE id = $1 AND is_deleted = FALSE AND status = 'active' FOR UPDATE`,
          [validProductId]
        );
        if (pr.rows.length === 0) {
          await db.query('ROLLBACK');
          res.status(400).json({
            error: 'One or more products are no longer available. Refresh your bag and try again.',
          });
          return;
        }
        const row = pr.rows[0];
        if (Number(row.inventory) < item.qty) {
          await db.query('ROLLBACK');
          res.status(400).json({ error: `Insufficient stock for "${row.name}".` });
          return;
        }
        price = roundMoney(Number(row.price));
        if (row.name) name = row.name;
        if (!image && row.image) image = row.image;
        sku = row.sku ? String(row.sku) : '';
      }

      normalizedItems.push({
        product_id: validProductId,
        name,
        qty: item.qty,
        price,
        size: item.size ? String(item.size) : '',
        color: item.color ? String(item.color) : '',
        image,
        sku,
      });
    }

    const computedSubtotal = roundMoney(
      normalizedItems.reduce((s, it) => s + it.price * it.qty, 0)
    );
    const discountAmt = roundMoney(Math.min(Number(discount || 0), computedSubtotal));
    const shippingAmt = roundMoney(Number(shipping_cost || 0));
    const taxAmt = roundMoney(Number(tax || 0));
    const handlingAmt = roundMoney(Number(handling_fee || 0));
    const computedTotal = roundMoney(
      computedSubtotal - discountAmt + shippingAmt + taxAmt + handlingAmt
    );

    const couponCodeClean = coupon_code ? String(coupon_code).trim().slice(0, 100) : '';

    const orderNumber = `VRN${Date.now().toString().slice(-8)}`;
    const payMethod = payment_method || 'upi';
    const notesVal = notes ? String(notes).slice(0, 5000) : '';

    const { rows } = await db.query(
      `INSERT INTO orders (
        order_number, customer_id, customer_name, customer_email, customer_phone,
        shipping_address, payment_method, subtotal, discount, shipping_cost, tax,
        handling_fee, total, notes, coupon_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        orderNumber,
        resolvedCustomerId,
        customer_name,
        customer_email,
        customer_phone || '',
        shipping_address || '',
        payMethod,
        computedSubtotal,
        discountAmt,
        shippingAmt,
        taxAmt,
        handlingAmt,
        computedTotal,
        notesVal,
        couponCodeClean,
      ]
    );

    const order = rows[0];

    for (const it of normalizedItems) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, name, qty, price, size, color, image, sku)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id,
          it.product_id,
          it.name,
          it.qty,
          it.price,
          it.size,
          it.color,
          it.image,
          it.sku,
        ]
      );
      if (it.product_id) {
        await db.query(
          `UPDATE products SET inventory = GREATEST(0, inventory - $1), updated_at = NOW() WHERE id = $2`,
          [it.qty, it.product_id]
        );
      }
    }

    await db.query(
      `INSERT INTO transactions (order_id, order_number, customer_name, amount, method, status, type)
       VALUES ($1,$2,$3,$4,$5,'pending','payment')`,
      [order.id, orderNumber, customer_name, computedTotal, payMethod]
    );

    if (resolvedCustomerId) {
      await db.query(
        `UPDATE customers SET orders_count = orders_count + 1, total_spent = total_spent + $1, last_order_date = CURRENT_DATE, updated_at = NOW() WHERE id = $2`,
        [computedTotal, resolvedCustomerId]
      );
    }

    if (couponCodeClean) {
      await db.query(
        `UPDATE coupons SET used_count = used_count + 1, updated_at = NOW()
         WHERE UPPER(TRIM(code)) = UPPER(TRIM($1)) AND is_deleted = FALSE AND status = 'active'`,
        [couponCodeClean]
      );
    }

    await db.query('COMMIT');

    const itemRows = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    order.items = itemRows.rows;
    res.status(201).json(order);
  } catch (err: any) {
    if (db) await db.query('ROLLBACK');
    throw handleDatabaseError(err);
  } finally {
    if (db) db.release();
  }
}));

// PUT /api/orders/:id/status
router.put('/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

    const { rows } = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) {
      throw new AppError('Order not found', 404);
    }

    // Update associated transaction
    const txnStatus = status === 'cancelled' || status === 'refunded' ? 'refunded' : status === 'delivered' ? 'completed' : 'pending';
    await pool.query('UPDATE transactions SET status = $1 WHERE order_id = $2', [txnStatus, req.params.id]);

    res.json(rows[0]);
}));

// PUT /api/orders/:id/payment-status  (admin marks payment as paid/pending)
router.put('/:id/payment-status', asyncHandler(async (req: Request, res: Response) => {
  const { payment_status } = req.body;
  const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
  if (!validPaymentStatuses.includes(payment_status)) {
    throw new AppError('Invalid payment_status. Must be one of: pending, paid, failed, refunded', 400);
  }

    const { rows } = await pool.query(
      'UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE RETURNING *',
      [payment_status, req.params.id]
    );
    if (rows.length === 0) {
      throw new AppError('Order not found', 404);
    }

    res.json(rows[0]);
}));

export default router;

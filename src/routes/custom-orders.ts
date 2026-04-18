// ─── Custom orders (storefront POST public, GET/PATCH admin) ────────
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import pool from '../db';
import logger from '../utils/logger';

const router = Router();

const lineSchema = Joi.object({
  size: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
});

const createSchema = Joi.object({
  customer: Joi.object({
    name: Joi.string().trim().min(1).required(),
    phone: Joi.string().trim().min(1).required(),
    email: Joi.string().allow('').optional(),
    address: Joi.string().allow('').optional(),
    city: Joi.string().allow('').optional(),
    state: Joi.string().allow('').optional(),
    pincode: Joi.string().allow('').optional(),
  }).required(),
  productType: Joi.string().trim().min(1).required(),
  variety: Joi.string().trim().min(1).required(),
  printType: Joi.string().allow('').optional(),
  printPositions: Joi.array().items(Joi.string()).optional(),
  color: Joi.string().allow('').optional(),
  notes: Joi.string().allow('').optional(),
  lines: Joi.array().items(lineSchema).min(1).required(),
  unitPrice: Joi.number().min(0).required(),
  itemsTotal: Joi.number().min(0).required(),
  shipping: Joi.number().min(0).optional(),
  total: Joi.number().min(0).required(),
});

function rowToApi(r: any) {
  return {
    id: r.id,
    createdAt: r.created_at,
    customer: {
      name: r.customer_name,
      phone: r.customer_phone,
      email: r.customer_email || '',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      pincode: r.pincode || '',
    },
    productType: r.product_type,
    variety: r.variety,
    printType: r.print_type || '',
    printPositions: r.print_positions || [],
    color: r.color || '',
    notes: r.notes || '',
    lines: Array.isArray(r.lines) ? r.lines : [],
    unitPrice: Number(r.unit_price),
    itemsTotal: Number(r.items_total),
    shipping: Number(r.shipping),
    total: Number(r.total),
    status: r.status,
    backendOrderId: r.backend_order_id || undefined,
    backendOrderNumber: r.backend_order_number || undefined,
  };
}

// POST /api/custom-orders
router.post('/', async (req: Request, res: Response) => {
  const { error, value } = createSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    res.status(400).json({ error: error.details.map((d) => d.message).join('; ') });
    return;
  }

  const c = value.customer;
  const lines = value.lines;
  const printPositions = value.printPositions || [];
  const shipping = Number(value.shipping || 0);

  const computedItemsTotal = lines.reduce((s: number, l: { quantity: number }) => s + value.unitPrice * l.quantity, 0);
  const computedTotal = computedItemsTotal + shipping;
  const itemsTotal = Math.round(computedItemsTotal * 100) / 100;
  const total = Math.round(computedTotal * 100) / 100;

  if (Math.abs(itemsTotal - Math.round(Number(value.itemsTotal) * 100) / 100) > 0.05) {
    res.status(400).json({ error: 'Line totals do not match submitted items total.' });
    return;
  }
  if (Math.abs(total - Math.round(Number(value.total) * 100) / 100) > 0.05) {
    res.status(400).json({ error: 'Order total does not match items and shipping.' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO custom_orders (
        customer_name, customer_phone, customer_email, address, city, state, pincode,
        product_type, variety, print_type, print_positions, color, notes,
        lines, unit_price, items_total, shipping, total, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        c.name,
        c.phone,
        (c.email || '').toLowerCase().trim(),
        c.address || '',
        c.city || '',
        c.state || '',
        c.pincode || '',
        value.productType,
        value.variety,
        value.printType || '',
        printPositions,
        value.color || '',
        value.notes || '',
        JSON.stringify(lines),
        value.unitPrice,
        itemsTotal,
        shipping,
        total,
        'awaiting_confirmation',
      ]
    );
    res.status(201).json(rowToApi(rows[0]));
  } catch (err: any) {
    logger.error(`Create custom order failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Failed to save custom order.' });
  }
});

// GET /api/custom-orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = '100' } = req.query;
    const allowedStatus = ['awaiting_confirmation', 'confirmed', 'cancelled'];
    if (status && !allowedStatus.includes(String(status))) {
      res.status(400).json({ error: 'Invalid status filter' });
      return;
    }
    const params: any[] = [];
    let where = '1=1';
    if (status) {
      where += ` AND status = $1`;
      params.push(status);
    }
    const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100));
    const { rows } = await pool.query(
      `SELECT * FROM custom_orders WHERE ${where} ORDER BY created_at DESC LIMIT ${lim}`,
      params
    );
    res.json({ data: rows.map(rowToApi) });
  } catch (err: any) {
    logger.error(`List custom orders failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// PATCH /api/custom-orders/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  const statusSchema = Joi.object({
    status: Joi.string().valid('awaiting_confirmation', 'confirmed', 'cancelled').required(),
    backend_order_id: Joi.string().uuid().optional(),
    backend_order_number: Joi.string().allow('').optional(),
  });
  const { error, value } = statusSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({ error: error.details.map((d) => d.message).join('; ') });
    return;
  }

  try {
    const sets = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [value.status];
    let i = 2;
    if (value.backend_order_id) {
      sets.push(`backend_order_id = $${i++}`);
      params.push(value.backend_order_id);
    }
    if (value.backend_order_number !== undefined) {
      sets.push(`backend_order_number = $${i++}`);
      params.push(value.backend_order_number || null);
    }
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE custom_orders SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(rowToApi(rows[0]));
  } catch (err: any) {
    logger.error(`Update custom order failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

export default router;

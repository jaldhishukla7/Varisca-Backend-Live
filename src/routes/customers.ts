// ─── Customers CRUD + Auth + Address sub-routes ─────────────────────
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import pool from '../db';
import logger from '../utils/logger';
import { signToken, customerAuthMiddleware } from '../middleware/auth';


const router = Router();

// ─── Auth Joi Schemas ─────────────────────────────────────────────────

const registerSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  last_name: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': 'Last name is required',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'A valid email address is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one number, and one special character',
      'any.required': 'Password is required',
    }),

});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'A valid email address is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(1).required().messages({
    'any.required': 'Password is required',
  }),
});

// ─── Address Joi Schema ───────────────────────────────────────────────
const addressSchema = Joi.object({
  name:    Joi.string().trim().min(1).required(),
  phone:   Joi.string().allow('').optional(),
  address: Joi.string().trim().min(1).required(),
  city:    Joi.string().allow('').optional(),
  state:   Joi.string().allow('').optional(),
  pincode: Joi.string().allow('').optional(),
  type:    Joi.string().valid('home', 'work', 'other').default('home'),
  is_default: Joi.boolean().default(false),
});

/** Display line: profile `address` or default/first row from address book (for admin / API consumers). */
const ADDRESS_DISPLAY_SQL = `COALESCE(
  NULLIF(trim(c.address), ''),
  (SELECT trim(concat_ws(', ',
    NULLIF(trim(ca.address), ''),
    NULLIF(trim(ca.city), ''),
    NULLIF(trim(ca.state), ''),
    NULLIF(trim(ca.pincode), '')
  ))
  FROM customer_addresses ca
  WHERE ca.customer_id = c.id
  ORDER BY ca.is_default DESC, ca.created_at ASC
  LIMIT 1),
  ''
)`;

const customerProfileUpdateSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).required(),
  last_name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().allow('').max(30).optional().default(''),
  address: Joi.string().allow('').max(5000).optional().default(''),
});

// Helper: build safe customer object (no password_hash)
function safeCustomer(row: any) {
  const { password_hash, ...safe } = row;
  return safe;
}

// ─── POST /api/customers/auth/register ──────────────────────────────
router.post('/auth/register', async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({ error: error.details.map(d => d.message).join('; ') });
    return;
  }

  try {
    const { first_name, last_name, email, password } = value;

    // Check if account already exists
    const existing = await pool.query(
      'SELECT id FROM customers WHERE LOWER(email) = $1 AND is_deleted = FALSE',
      [email]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const name = `${first_name} ${last_name}`.trim();

    const { rows } = await pool.query(
      `INSERT INTO customers (name, first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, first_name, last_name, email, password_hash]
    );

    const customer = rows[0];
    const token = signToken({ userId: customer.id, email: customer.email, role: 'customer' });

    res.status(201).json({ token, customer: safeCustomer(customer) });
  } catch (err: any) {
    logger.error(`Customer register failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// ─── POST /api/customers/auth/login ─────────────────────────────────
router.post('/auth/login', async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({ error: error.details.map(d => d.message).join('; ') });
    return;
  }

  try {
    const { email, password } = value;

    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE LOWER(email) = $1 AND is_deleted = FALSE',
      [email]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const customer = rows[0];

    // Guest/legacy account with no password
    if (!customer.password_hash) {
      res.status(401).json({ error: 'No password set for this account. Please register to create a password.' });
      return;
    }

    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Update last seen
    await pool.query('UPDATE customers SET updated_at = NOW() WHERE id = $1', [customer.id]);

    const token = signToken({ userId: customer.id, email: customer.email, role: 'customer' });

    res.json({ token, customer: safeCustomer(customer) });
  } catch (err: any) {
    logger.error(`Customer login failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// ─── GET /api/customers/auth/me ──────────────────────────────────────
router.get('/auth/me', customerAuthMiddleware, async (req: Request, res: Response) => {

  try {
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND is_deleted = FALSE',
      [req.user!.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(safeCustomer(rows[0]));
  } catch (err: any) {
    logger.error(`Customer me failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// PUT /api/customers/auth/me — logged-in customer updates own profile (persists to DB; admin list uses same columns + address display)
router.put('/auth/me', customerAuthMiddleware, async (req: Request, res: Response) => {
  const { error, value } = customerProfileUpdateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({ error: error.details.map(d => d.message).join('; ') });
    return;
  }

  const { first_name, last_name, email, phone, address } = value;
  const name = `${first_name} ${last_name}`.trim();
  const customerId = req.user!.userId;

  try {
    const taken = await pool.query(
      `SELECT id FROM customers WHERE LOWER(email) = LOWER($1) AND is_deleted = FALSE AND id <> $2`,
      [email, customerId]
    );
    if (taken.rows.length > 0) {
      res.status(409).json({ error: 'An account already uses this email address.' });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE customers
       SET first_name = $1, last_name = $2, name = $3, email = LOWER($4), phone = $5, address = $6, updated_at = NOW()
       WHERE id = $7 AND is_deleted = FALSE
       RETURNING *`,
      [first_name, last_name, name, email, phone || '', address || '', customerId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(safeCustomer(rows[0]));
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'An account already uses this email address.' });
      return;
    }
    logger.error(`Customer profile update failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// ─── GET /api/customers — orders_count and total_spent computed from orders so they stay in sync
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, sort = 'created_at', order = 'desc', page = '1', limit = '50' } = req.query;
    const params: any[] = [];
    let where = 'WHERE c.is_deleted = FALSE';
    let i = 1;
    if (search) { where += ` AND (c.name ILIKE $${i} OR c.email ILIKE $${i})`; params.push(`%${search}%`); i++; }
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const countRes = await pool.query(`SELECT COUNT(*) FROM customers c ${where}`, params);
    const sortCol = sort === 'total_spent' ? 'total_spent' : sort === 'orders_count' ? 'orders_count' : 'c.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.first_name, c.last_name, c.email, c.phone, ${ADDRESS_DISPLAY_SQL} AS address, c.created_at, c.joined_date,
        (SELECT COUNT(*)::int FROM orders o WHERE o.is_deleted = FALSE AND o.status NOT IN ('cancelled', 'refunded')
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS orders_count,
        (SELECT COALESCE(SUM(o.total), 0)::numeric FROM orders o WHERE o.is_deleted = FALSE AND o.status NOT IN ('cancelled', 'refunded')
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS total_spent,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.is_deleted = FALSE
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS last_order_date
       FROM customers c ${where}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit as string, 10), offset]
    );
    res.json({ data: rows, total: parseInt(countRes.rows[0].count, 10) });
  } catch (e) { res.status(500).json({ error: 'An internal error occurred' }); }
});

// GET /api/customers/stats/summary
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as total_customers,
             COALESCE(SUM(total_spent), 0) as total_revenue,
             COUNT(*) FILTER (WHERE orders_count > 1) as repeat_customers
      FROM customers WHERE is_deleted = FALSE
    `);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// GET /api/customers/:id — include computed orders_count and total_spent from orders
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.first_name, c.last_name, c.email, c.phone, ${ADDRESS_DISPLAY_SQL} AS address, c.created_at, c.joined_date, c.updated_at,
        (SELECT COUNT(*)::int FROM orders o WHERE o.is_deleted = FALSE AND o.status NOT IN ('cancelled', 'refunded')
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS orders_count,
        (SELECT COALESCE(SUM(o.total), 0)::numeric FROM orders o WHERE o.is_deleted = FALSE AND o.status NOT IN ('cancelled', 'refunded')
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS total_spent,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.is_deleted = FALSE
         AND (o.customer_id = c.id OR (o.customer_id IS NULL AND LOWER(o.customer_email) = LOWER(c.email)))) AS last_order_date
       FROM customers c WHERE c.id = $1 AND c.is_deleted = FALSE`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    const orders = await pool.query(
      `SELECT id, order_number, status, total, created_at FROM orders
       WHERE (customer_id = $1 OR (customer_id IS NULL AND LOWER(customer_email) = (SELECT LOWER(email) FROM customers WHERE id = $1)))
         AND is_deleted = FALSE ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    rows[0].orders = orders.rows;
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// POST /api/customers
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, address } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO customers (name, email, phone, address) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET name=COALESCE($1,customers.name), phone=COALESCE($3,customers.phone), address=COALESCE($4,customers.address), updated_at=NOW()
       RETURNING id, name, email, phone, address, created_at, joined_date`,
      [name, email.toLowerCase(), phone || '', address || '']
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// PUT /api/customers/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, first_name, last_name, email, phone, address } = req.body;
    const derivedName =
      typeof first_name === 'string' && typeof last_name === 'string'
        ? `${first_name} ${last_name}`.trim()
        : undefined;
    const finalName = derivedName || name;
    const { rows } = await pool.query(
      `UPDATE customers SET
         name=COALESCE($1,name),
         first_name=COALESCE($2,first_name),
         last_name=COALESCE($3,last_name),
         email=COALESCE($4,email),
         phone=COALESCE($5,phone),
         address=COALESCE($6,address),
         updated_at=NOW()
       WHERE id=$7 AND is_deleted=FALSE
       RETURNING id, name, first_name, last_name, email, phone, address, created_at`,
      [
        finalName ?? null,
        first_name ?? null,
        last_name ?? null,
        email ?? null,
        phone ?? null,
        address ?? null,
        req.params.id,
      ]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE customers SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// ─── Customer Addresses ───────────────────────────────────────────────

// GET /api/customers/:id/addresses
router.get('/:id/addresses', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

// POST /api/customers/:id/addresses
router.post('/:id/addresses', async (req: Request, res: Response) => {
  const { error, value } = addressSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
  if (error) { res.status(400).json({ error: error.details.map(d => d.message).join('; ') }); return; }

  let client: any;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (value.is_default) {
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1', [req.params.id]);
    }
    const existing = await client.query('SELECT COUNT(*) FROM customer_addresses WHERE customer_id = $1', [req.params.id]);
    const isFirst = parseInt(existing.rows[0].count, 10) === 0;

    const { rows } = await client.query(
      `INSERT INTO customer_addresses (customer_id, name, phone, address, city, state, pincode, type, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, value.name, value.phone || '', value.address, value.city || '', value.state || '', value.pincode || '', value.type, value.is_default || isFirst]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    logger.error(`Create customer address failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  } finally { if (client) client.release(); }
});

// PUT /api/customers/:id/addresses/:addrId
router.put('/:id/addresses/:addrId', async (req: Request, res: Response) => {
  const { error, value } = addressSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
  if (error) { res.status(400).json({ error: error.details.map(d => d.message).join('; ') }); return; }

  let client: any;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    if (value.is_default) {
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1', [req.params.id]);
    }
    const { rows } = await client.query(
      `UPDATE customer_addresses
       SET name=$1, phone=$2, address=$3, city=$4, state=$5, pincode=$6, type=$7, is_default=$8, updated_at=NOW()
       WHERE id=$9 AND customer_id=$10 RETURNING *`,
      [value.name, value.phone || '', value.address, value.city || '', value.state || '', value.pincode || '', value.type, value.is_default || false, req.params.addrId, req.params.id]
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Address not found' }); return; }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    logger.error(`Update customer address failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'An internal error occurred' });
  } finally { if (client) client.release(); }
});

// DELETE /api/customers/:id/addresses/:addrId
router.delete('/:id/addresses/:addrId', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM customer_addresses WHERE id=$1 AND customer_id=$2', [req.params.addrId, req.params.id]);
    res.json({ message: 'Address deleted' });
  } catch { res.status(500).json({ error: 'An internal error occurred' }); }
});

export default router;

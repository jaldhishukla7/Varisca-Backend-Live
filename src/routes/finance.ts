// ─── Finance Routes ─────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import pool from '../db';
import { createCrudRouter } from './crud-factory';

const router = Router();

// ─── Transactions (mainly read-only, auto-created with orders) ──────
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { search, status, sort = 'created_at', order = 'desc', page = '1', limit = '50' } = req.query;
    const params: any[] = [];
    let where = 'WHERE TRUE';
    let i = 1;
    if (search) { where += ` AND (order_number ILIKE $${i} OR customer_name ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (status) { where += ` AND status = $${i}`; params.push(status); i++; }

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const countRes = await pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params);
    const { rows } = await pool.query(
      `SELECT * FROM transactions ${where} ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'} LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit as string, 10), offset]
    );
    res.json({ data: rows, total: parseInt(countRes.rows[0].count, 10) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/transactions/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND type = 'payment'), 0) as total_revenue,
             COUNT(*) as total_transactions,
             COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
             COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0) as total_refunds
      FROM transactions
    `);
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Payouts ────────────────────────────────────────────────────────
router.use('/payouts', createCrudRouter({
  table: 'payouts',
  searchFields: ['partner', 'reference'],
  defaultSort: 'created_at',
  insertFields: ['partner', 'amount', 'status', 'method', 'reference'],
  updateFields: ['partner', 'amount', 'status', 'method', 'reference'],
}));

export default router;

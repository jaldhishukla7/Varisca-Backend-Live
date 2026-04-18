// ─── Settings Routes ────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import pool from '../db';
import { createCrudRouter } from './crud-factory';

const router = Router();

// ─── Key-Value Settings ─────────────────────────────────────────────

// GET /api/settings/:key
router.get('/kv/:key', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE key = $1', [req.params.key]);
    if (rows.length === 0) { res.status(404).json({ error: 'Setting not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings/:key
router.put('/kv/:key', async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *`,
      [req.params.key, JSON.stringify(value)]
    );
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/settings/kv — all settings
router.get('/kv', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings ORDER BY key');
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Tax Rules ──────────────────────────────────────────────────────
const taxRouter = createCrudRouter({
  table: 'tax_rules',
  searchFields: ['name', 'region'],
  defaultSort: 'created_at',
  insertFields: ['name', 'rate', 'region', 'category', 'is_active'],
  updateFields: ['name', 'rate', 'region', 'category', 'is_active'],
});
router.use('/tax', taxRouter);

// ─── Notification Templates ─────────────────────────────────────────
const notifRouter = createCrudRouter({
  table: 'notification_templates',
  searchFields: ['name', 'event'],
  defaultSort: 'created_at',
  insertFields: ['name', 'type', 'event', 'subject', 'body', 'is_active'],
  updateFields: ['name', 'type', 'event', 'subject', 'body', 'is_active'],
});
router.use('/notifications', notifRouter);

export default router;

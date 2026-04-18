// ─── Admin Users CRUD ───────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let where = 'WHERE is_deleted = FALSE';
    const params: any[] = [];
    if (search) { where += ' AND (name ILIKE $1 OR email ILIKE $1)'; params.push(`%${search}%`); }
    const { rows } = await pool.query(
      `SELECT id, name, email, role, status, last_login, created_at FROM admin_users ${where} ORDER BY created_at DESC`, params
    );
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, status, last_login, created_at FROM admin_users WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, status } = req.body;
    const hash = await bcrypt.hash(password || 'admin123', 10);
    const { rows } = await pool.query(
      `INSERT INTO admin_users (name, email, password_hash, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, status, created_at`,
      [name, email.toLowerCase(), hash, role || 'admin', status || 'active']
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, email, role, status, password } = req.body;
    let extra = '';
    const params: any[] = [name, email, role, status, req.params.id];
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      extra = ', password_hash = $6';
      params.push(hash);
    }
    const { rows } = await pool.query(
      `UPDATE admin_users SET name=COALESCE($1,name), email=COALESCE($2,email), role=COALESCE($3,role), status=COALESCE($4,status), updated_at=NOW()${extra} WHERE id=$5 AND is_deleted=FALSE RETURNING id, name, email, role, status`,
      params
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE admin_users SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

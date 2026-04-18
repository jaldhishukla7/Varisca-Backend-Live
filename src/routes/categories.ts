// ─── Categories CRUD ────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories WHERE is_deleted = FALSE ORDER BY created_at DESC');
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, slug, description, parent_id, image, status } = req.body;
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-');
    const { rows } = await pool.query(
      `INSERT INTO categories (name, slug, description, parent_id, image, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, finalSlug, description || '', parent_id || null, image || '', status || 'active']
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, slug, description, parent_id, image, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET name=COALESCE($1,name), slug=COALESCE($2,slug), description=COALESCE($3,description), parent_id=$4, image=COALESCE($5,image), status=COALESCE($6,status), updated_at=NOW() WHERE id=$7 AND is_deleted=FALSE RETURNING *`,
      [name, slug, description, parent_id || null, image, status, req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE categories SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const { rowCount } = await pool.query('UPDATE categories SET is_deleted=TRUE WHERE id=ANY($1)', [ids]);
    res.json({ message: `${rowCount} deleted` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

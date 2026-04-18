// ─── Generic CRUD Factory ───────────────────────────────────────────
// Generates standard CRUD routes for simple tables to reduce boilerplate.
import { Router, Request, Response } from 'express';
import pool from '../db';

interface CrudOptions {
  table: string;
  softDelete?: boolean;
  searchFields?: string[];
  defaultSort?: string;
  insertFields: string[];
  updateFields: string[];
}

export function createCrudRouter(opts: CrudOptions): Router {
  const router = Router();
  const { table, softDelete = false, searchFields = [], defaultSort = 'created_at', insertFields, updateFields } = opts;
  const deleteFilter = softDelete ? ' AND is_deleted = FALSE' : '';

  // GET all
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { search, sort, order = 'desc', page = '1', limit = '100' } = req.query;
      const params: any[] = [];
      let where = softDelete ? 'WHERE is_deleted = FALSE' : 'WHERE TRUE';
      let i = 1;

      if (search && searchFields.length > 0) {
        const searchClauses = searchFields.map(f => `${f} ILIKE $${i}`).join(' OR ');
        where += ` AND (${searchClauses})`;
        params.push(`%${search}%`);
        i++;
      }

      const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
      const sortCol = (sort && updateFields.includes(sort as string)) ? sort : defaultSort;
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

      const countRes = await pool.query(`SELECT COUNT(*) FROM ${table} ${where}`, params);
      const { rows } = await pool.query(
        `SELECT * FROM ${table} ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit as string, 10), offset]
      );

      res.json({ data: rows, total: parseInt(countRes.rows[0].count, 10) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET by id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1${deleteFilter}`, [req.params.id]);
      if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST create
  router.post('/', async (req: Request, res: Response) => {
    try {
      const values = insertFields.map(f => req.body[f] ?? null);
      const placeholders = insertFields.map((_, idx) => `$${idx + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${insertFields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // PUT update
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let i = 1;
      for (const f of updateFields) {
        if (f in req.body) { setClauses.push(`${f} = $${i}`); values.push(req.body[f]); i++; }
      }
      if (setClauses.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
      setClauses.push('updated_at = NOW()');
      values.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${i}${deleteFilter} RETURNING *`,
        values
      );
      if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // DELETE
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      if (softDelete) {
        await pool.query(`UPDATE ${table} SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
      } else {
        await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      }
      res.json({ message: 'Deleted' });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST bulk delete
  router.post('/bulk-delete', async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) { res.status(400).json({ error: 'ids required' }); return; }
      if (softDelete) {
        const { rowCount } = await pool.query(`UPDATE ${table} SET is_deleted = TRUE WHERE id = ANY($1)`, [ids]);
        res.json({ message: `${rowCount} deleted` });
      } else {
        const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
        res.json({ message: `${rowCount} deleted` });
      }
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

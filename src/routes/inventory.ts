// ─── Inventory Routes ───────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import pool from '../db';
import logger from '../utils/logger';

const router = Router();

// GET /api/inventory — product stock levels
router.get('/', async (req: Request, res: Response) => {
  try {
    const { filter } = req.query; // all, low, out
    let where = 'WHERE is_deleted = FALSE';
    if (filter === 'low') where += ' AND inventory > 0 AND inventory <= 10';
    else if (filter === 'out') where += ' AND inventory = 0';

    const { rows } = await pool.query(`SELECT id, name, sku, category, inventory, price, status, image FROM products ${where} ORDER BY inventory ASC`);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory/adjust — adjust stock
router.post('/adjust', async (req: Request, res: Response) => {
  let client: any;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { product_id, type, quantity, reason } = req.body;
    if (!product_id || !type || !quantity) { res.status(400).json({ error: 'product_id, type, quantity required' }); return; }

    // Get current inventory
    const { rows: products } = await client.query('SELECT inventory FROM products WHERE id = $1 AND is_deleted = FALSE', [product_id]);
    if (products.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }

    const currentInv = products[0].inventory;
    const newInv = type === 'in' ? currentInv + quantity : Math.max(0, currentInv - quantity);

    await client.query('UPDATE products SET inventory = $1, updated_at = NOW() WHERE id = $2', [newInv, product_id]);

    const { rows: logs } = await client.query(
      `INSERT INTO inventory_logs (product_id, type, quantity, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
      [product_id, type, quantity, reason || (type === 'in' ? 'Stock added' : 'Stock removed')]
    );

    await client.query('COMMIT');
    res.status(201).json({ log: logs[0], new_inventory: newInv });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    logger.error(`Adjust inventory failed: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: err.message });
  } finally { if (client) client.release(); }
});

// GET /api/inventory/logs/:productId — stock history
router.get('/logs/:productId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM inventory_logs WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.productId]);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/inventory/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as total,
             SUM(inventory) as total_units,
             COUNT(*) FILTER (WHERE inventory > 0 AND inventory <= 10) as low_stock,
             COUNT(*) FILTER (WHERE inventory = 0) as out_of_stock
      FROM products WHERE is_deleted = FALSE
    `);
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

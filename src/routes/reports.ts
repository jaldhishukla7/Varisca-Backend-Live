// ─── Reports Routes (Aggregation Queries) ───────────────────────────
import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/reports/sales — daily sales breakdown
router.get('/sales', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT DATE(created_at) as date,
             COUNT(*) as orders,
             COALESCE(SUM(total), 0) as revenue,
             COALESCE(SUM((SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id)), 0) as items
      FROM orders o
      WHERE is_deleted = FALSE AND status NOT IN ('cancelled', 'refunded')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 90
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/revenue — monthly revenue
router.get('/revenue', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
             COUNT(*) as orders,
             COALESCE(SUM(total), 0) as revenue,
             CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total) / COUNT(*), 0) ELSE 0 END as avg_value
      FROM orders
      WHERE is_deleted = FALSE AND status NOT IN ('cancelled', 'refunded')
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 24
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/products — product performance
router.get('/products', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT oi.name,
             SUM(oi.qty) as units_sold,
             SUM(oi.price * oi.qty) as revenue,
             COUNT(DISTINCT oi.order_id) as orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.is_deleted = FALSE AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY oi.name
      ORDER BY revenue DESC
      LIMIT 50
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/customers — customer analytics
router.get('/customers', async (_req: Request, res: Response) => {
  try {
    const stats = await pool.query(`
      SELECT COUNT(*) as total,
             COALESCE(SUM(total_spent), 0) as total_revenue,
             CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total_spent) / COUNT(*), 0) ELSE 0 END as avg_ltv,
             COUNT(*) FILTER (WHERE orders_count > 1) as repeat_customers
      FROM customers WHERE is_deleted = FALSE
    `);
    const top = await pool.query(
      `SELECT id, name, email, orders_count, total_spent FROM customers WHERE is_deleted = FALSE ORDER BY total_spent DESC LIMIT 10`
    );
    res.json({ stats: stats.rows[0], top_customers: top.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/dashboard — overview stats
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const orders = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending,
             COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled','refunded')), 0) as revenue
      FROM orders WHERE is_deleted = FALSE
    `);
    const customers = await pool.query('SELECT COUNT(*) as total FROM customers WHERE is_deleted = FALSE');
    const products = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE inventory <= 10) as low_stock FROM products WHERE is_deleted = FALSE');

    res.json({
      orders: orders.rows[0],
      customers: customers.rows[0],
      products: products.rows[0],
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

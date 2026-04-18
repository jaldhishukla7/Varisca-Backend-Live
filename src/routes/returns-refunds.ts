// ─── Returns & Refund Requests ──────────────────────────────────────
import { Router } from 'express';
import { createCrudRouter } from './crud-factory';

const router = Router();

// Returns
router.use('/returns', createCrudRouter({
  table: 'returns',
  searchFields: ['order_number', 'customer_name'],
  defaultSort: 'created_at',
  insertFields: ['order_id', 'order_number', 'customer_name', 'customer_email', 'reason', 'status', 'items', 'request_date', 'processed_date', 'processed_by'],
  updateFields: ['status', 'processed_date', 'processed_by'],
}));

// Refund Requests
router.use('/refunds', createCrudRouter({
  table: 'refund_requests',
  searchFields: ['order_number', 'customer_name'],
  defaultSort: 'created_at',
  insertFields: ['order_id', 'order_number', 'customer_name', 'amount', 'reason', 'status', 'request_date', 'processed_date', 'processed_by'],
  updateFields: ['status', 'processed_date', 'processed_by'],
}));

export default router;

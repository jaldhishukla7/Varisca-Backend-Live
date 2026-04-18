// ─── Marketing Routes ───────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import pool from '../db';
import { createCrudRouter } from './crud-factory';

const router = Router();

// ─── Coupon Validation (public endpoint — called at checkout) ─────────
const validateCouponSchema = Joi.object({
  code:       Joi.string().trim().min(1).required(),
  orderTotal: Joi.number().min(0).required(),
});

router.post('/coupons/validate', async (req: Request, res: Response) => {
  const { error, value } = validateCouponSchema.validate(req.body);
  if (error) { res.status(400).json({ valid: false, message: error.details[0].message }); return; }

  try {
    const { code, orderTotal } = value;
    const now = new Date();

    const { rows } = await pool.query(
      `SELECT * FROM coupons
       WHERE UPPER(code) = UPPER($1)
         AND status = 'active'
         AND is_deleted = FALSE
         AND (start_date IS NULL OR start_date <= $2)
         AND (end_date IS NULL OR end_date >= $2)`,
      [code.trim(), now]
    );

    if (rows.length === 0) {
      res.json({ valid: false, message: 'Invalid or expired coupon code' });
      return;
    }

    const coupon = rows[0];

    // Check usage limit
    if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
      res.json({ valid: false, message: 'Coupon usage limit reached' });
      return;
    }

    // Check minimum order
    if (coupon.min_order != null && orderTotal < Number(coupon.min_order)) {
      res.json({
        valid: false,
        message: `Minimum order of ₹${coupon.min_order} required for this coupon`,
      });
      return;
    }

    // Calculate discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (orderTotal * Number(coupon.value)) / 100;
      if (coupon.max_discount != null) {
        discount = Math.min(discount, Number(coupon.max_discount));
      }
    } else {
      discount = Number(coupon.value);
    }
    discount = Math.min(discount, orderTotal); // cannot exceed order total

    res.json({
      valid: true,
      message: 'Coupon applied successfully!',
      discount: Math.round(discount * 100) / 100,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      max_discount: coupon.max_discount != null ? Number(coupon.max_discount) : null,
      min_order: coupon.min_order != null ? Number(coupon.min_order) : 0,
    });
  } catch {
    res.status(500).json({ valid: false, message: 'An internal error occurred' });
  }
});

// Coupons CRUD (admin)
router.use('/coupons', createCrudRouter({
  table: 'coupons',
  softDelete: true,
  searchFields: ['code'],
  defaultSort: 'created_at',
  insertFields: ['code', 'type', 'value', 'min_order', 'max_discount', 'usage_limit', 'used_count', 'status', 'start_date', 'end_date'],
  updateFields: ['code', 'type', 'value', 'min_order', 'max_discount', 'usage_limit', 'used_count', 'status', 'start_date', 'end_date'],
}));

// Banners
router.use('/banners', createCrudRouter({
  table: 'banners',
  softDelete: true,
  searchFields: ['title'],
  defaultSort: 'created_at',
  insertFields: ['title', 'subtitle', 'image_url', 'link_url', 'position', 'status', 'start_date', 'end_date', 'clicks', 'impressions'],
  updateFields: ['title', 'subtitle', 'image_url', 'link_url', 'position', 'status', 'start_date', 'end_date', 'clicks', 'impressions'],
}));

// Email Campaigns
router.use('/campaigns', createCrudRouter({
  table: 'email_campaigns',
  softDelete: true,
  searchFields: ['name', 'subject'],
  defaultSort: 'created_at',
  insertFields: ['name', 'subject', 'body', 'recipient_count', 'status', 'scheduled_date', 'sent_date', 'open_rate', 'click_rate'],
  updateFields: ['name', 'subject', 'body', 'recipient_count', 'status', 'scheduled_date', 'sent_date', 'open_rate', 'click_rate'],
}));

export default router;

// ─── Auth Routes ────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import pool from '../db';
import { signToken, authMiddleware } from '../middleware/auth';

const router = Router();

// Joi schema for login
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'A valid email is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(1).required().messages({
    'any.required': 'Password is required',
  }),
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
      return;
    }

    const email = value.email.toLowerCase().trim();
    const password = value.password.trim();

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role, status FROM admin_users WHERE email = $1 AND is_deleted = FALSE',
      [email]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = rows[0];
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account suspended' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Update last login
    await pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch {
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, status, last_login, created_at FROM admin_users WHERE id = $1 AND is_deleted = FALSE',
      [req.user!.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

export default router;

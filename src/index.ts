import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { authMiddleware, customerAuthMiddleware } from './middleware/auth';
import logger from './utils/logger';
import pool from './db';
import { errorHandler, asyncHandler } from './middleware/errorHandler';

// Route imports
import authRoutes from './routes/auth';
import productRoutes, { productFiltersHandler } from './routes/products';
import categoryRoutes from './routes/categories';
import brandRoutes from './routes/brands';
import attributeRoutes from './routes/attributes';
import orderRoutes from './routes/orders';
import customerRoutes from './routes/customers';
import inventoryRoutes from './routes/inventory';
import reportRoutes from './routes/reports';
import adminUserRoutes from './routes/admin-users';
import settingsRoutes from './routes/settings';
import shippingRoutes from './routes/shipping';
import marketingRoutes from './routes/marketing';
import financeRoutes from './routes/finance';
import returnsRefundsRoutes from './routes/returns-refunds';
import customOrderRoutes from './routes/custom-orders';
import paymentRoutes, { handlePaymentWebhook } from './routes/payment';

const app = express();
app.set('trust proxy', 1);
const isProd = process.env.NODE_ENV === 'production';

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled promise rejection: ${message}`, { stack });
});

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});

// ─── Rate Limiters (unchanged) ──────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again in a few minutes.' },
});

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order attempts. Please try again in a few minutes.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again after 1 hour.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact attempts. Please try again after 1 hour.' },
});

const customOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many custom order submissions. Please try again after 1 hour.' },
});

// ─── CORS ────────────────────────────────────────────────────────────
const allowedOrigins = [
  "https://varisca.in",
  "https://www.varisca.in"
];

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

// ── OPTIONS preflight MUST be before helmet ──────────────────────────
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ─── Helmet ──────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ─── Payment Webhook (raw body before json parser) ───────────────────
app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    Promise.resolve(handlePaymentWebhook(req, res)).catch(next);
  },
);

// ─── Global Rate Limiter ─────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.method === 'GET' && (req.path === '/api/products' || req.path.startsWith('/api/products/'))) {
    return next();
  }
  next();
}, globalLimiter);

app.use(express.json({ limit: '50mb' }));

app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

app.get('/', (_req, res) => {
  res.send("API running");
});

// ─── Routes ──────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/customers/auth/register', registerLimiter);
app.use('/api/customers/auth/login', loginLimiter);
app.use('/api/customers', customerRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/products/filters', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  productFiltersHandler(req, res, next);
});

app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
}, productRoutes);

app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/attributes', attributeRoutes);
app.use('/api/orders', orderLimiter);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/admin-users', authMiddleware, adminUserRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/marketing', authMiddleware, marketingRoutes);
app.use('/api/finance', authMiddleware, financeRoutes);
app.use('/api/returns-refunds', returnsRefundsRoutes);
app.use('/api/custom-orders', customOrderLimiter);
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/payment', paymentRoutes);

// ─── Test DB route (optional, keep for debugging) ───────────────────
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers LIMIT 1');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── Export for Vercel (no app.listen) ──────────────────────────────
export default app;

// ─── Local development server (only when run directly) ───────────────
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT || '3001', 10);
  app.listen(PORT, () => {
    console.log(`🚀 Varisca API running locally on port ${PORT}`);
  });
}
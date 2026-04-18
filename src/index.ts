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
const PORT = parseInt(process.env.PORT || '3001', 10);
const isProd = process.env.NODE_ENV === 'production';

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled promise rejection: ${message}`, { stack });
});

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});

// ─── Rate Limiters ──────────────────────────────────────────────────
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

// ─── Middleware ──────────────────────────────────────────────────────

/* =========================
   ✅ CORS FIX (ONLY CHANGE)
   ========================= */

const allowedOrigins = [
  "https://varisca.in",
  "https://www.varisca.in"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      return callback(null, true);
    }

    return callback(null, false); // IMPORTANT: no error
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options('*', cors());

/* =========================
   END OF CORS FIX
   ========================= */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    Promise.resolve(handlePaymentWebhook(req, res)).catch(next);
  },
);

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

// ─── Routes (UNCHANGED) ──────────────────────────────────────────────
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

// ─── Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Varisca API running on port ${PORT}`);
});

export default app;
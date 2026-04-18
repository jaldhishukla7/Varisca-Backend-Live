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
// Global limiter: each page load makes ~10 API calls; allow normal browsing traffic
const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 2000,                 // 2000 requests per IP per 5 min (~6.6 req/sec) to avoid 429 on storefront browsing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again in a few minutes.' },
});

// Strict limiter for order placement (storefront checkout)
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,                   // 30 orders per IP per 10 min
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

// Rate limiter for customer registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                   // 5 registrations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again after 1 hour.' },
});

// Rate limiter for contact/support forms
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                  // 10 contact submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact attempts. Please try again after 1 hour.' },
});

// Rate limiter for custom orders
const customOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,                  // 15 custom orders per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many custom order submissions. Please try again after 1 hour.' },
});

// ─── Middleware ──────────────────────────────────────────────────────
const extraOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([
    process.env.CORS_ORIGIN || 'https://varisca.in',
    ...extraOrigins,
    // Production storefront domains (Hostinger often serves/redirects with www)
    'https://varisca.in',
    'https://www.varisca.in',
    // Custom API subdomain (if you open tools from there — rare)
    'https://api.varisca.in',
    // Safety for any http redirects/misconfig (ideally keep site on https only)
    'http://varisca.in',
    'http://www.varisca.in',
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
  ]),
];

/** Allow Vite dev server on LAN (mobile testing): e.g. http://192.168.1.5:8080 */
function isPrivateNetworkDevOrigin(origin: string): boolean {
  if (isProd) return false;
  try {
    const u = new URL(origin);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

function corsOriginCallback(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  // No Origin: same-origin requests, curl, server-to-server — allow
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  if (isPrivateNetworkDevOrigin(origin)) return callback(null, true);
  // Reject without passing Error — avoids error middleware responding without CORS headers
  callback(null, false);
}

/** Shared CORS config for app.use + app.options so preflight matches actual responses */
const corsOptions: cors.CorsOptions = {
  origin: corsOriginCallback,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: [],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86_400,
};

app.use(cors(corsOptions));
// Explicit wildcard OPTIONS so every path responds to preflight (some proxies/CDNs are picky)
app.options('*', cors(corsOptions));
// Default Helmet sets Cross-Origin-Resource-Policy: same-origin — can break cross-origin fetch visibility; API should allow cross-origin
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Razorpay webhook must use raw body — registered before express.json()
app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    Promise.resolve(handlePaymentWebhook(req, res)).catch(next);
  },
);

// Global limiter should not block storefront browsing of products.
// Many real users can share a single IP (mobile carrier NAT / office Wi‑Fi),
// so a global per-IP limiter can randomly block some users from seeing products.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.method === 'GET' && (req.path === '/api/products' || req.path.startsWith('/api/products/'))) {
    return next();
  }
  next();
}, globalLimiter);
// Admin product forms send multiple base64 images; 10mb is too small and causes silent JSON parse failures.
app.use(express.json({ limit: '50mb' }));

// ─── Request Logging ────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

app.get('/', (_req: express.Request, res: express.Response) => {
  res.send("API running");
});

// ─── Public Routes ──────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

// Customer auth with rate limiting
app.use('/api/customers/auth/register', registerLimiter);
app.use('/api/customers/auth/login', loginLimiter);
app.use('/api/customers', customerRoutes);


// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/** Which database the API pool is connected to (compare with pgAdmin: run the same SELECT there). */
app.get(
  '/api/health/db',
  asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { rows } = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS db_user,
        inet_server_addr()::text AS server_addr,
        inet_server_port()::text AS server_port
    `);
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS products_count FROM products WHERE is_deleted = FALSE',
    );
    res.json({
      status: 'ok',
      ...rows[0],
      products_count: countRows[0]?.products_count ?? null,
      timestamp: new Date().toISOString(),
    });
  }),
);

// Payment: Razorpay create-order + verify (webhook mounted above, before JSON parser)
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please try again shortly.' },
});
app.use('/api/payment', paymentLimiter, paymentRoutes);

// Public: coupon validation (called from checkout — no JWT needed)
app.post('/api/marketing/coupons/validate', (req, res, next) => {
  import('./routes/marketing').then(m => m.default(req, res, next));
});

// Public: order by number (for order confirmation page on refresh)
app.get('/api/orders/by-number/:orderNumber', (req, res, next) => {
  orderRoutes(req, res, next);
});

// Custom orders: POST public (storefront) with rate limiting, GET/PATCH admin JWT
app.use('/api/custom-orders', (req, res, next) => {
  if (req.method === 'POST') return customOrderLimiter(req, res, next);
  return authMiddleware(req, res, next);
}, customOrderRoutes);

// ─── Protected Routes (require JWT) ─────────────────────────────────
// Products: GET /api/products/filters registered on app so "filters" is never treated as product :id
app.get('/api/products/filters', (req, res, next) => {
  // Cache filters briefly; they don't change often and are requested on every shop visit.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=300');
  productFiltersHandler(req, res, next);
});
// Products: GET is public (storefront), writes require JWT
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') {
    // Admin panel sends Authorization: list must match DB; browsers must not reuse cached GET.
    if (req.headers.authorization) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      // Short caching for product browsing; reduces backend load and prevents spikes from breaking UX.
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
    }
  }
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
}, productRoutes);
app.use('/api/categories', (req, res, next) => {
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
}, categoryRoutes);
app.use('/api/brands', (req, res, next) => {
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
}, brandRoutes);
app.use('/api/attributes', (req, res, next) => {
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
}, attributeRoutes);

// Orders:
// - `POST /api/orders` must be PUBLIC (storefront checkout).
// - All other methods are ADMIN-protected, except `GET /api/orders/my` (customer self service).
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  // Public checkout endpoint
  if (req.method === 'POST') return orderLimiter(req, res, next);
  // Customer self-service endpoint
  if (req.path === '/my') return next();
  // Admin endpoints (GET/PUT/PATCH/etc)
  return authMiddleware(req, res, next);
}, orderRoutes);

// Customers: /auth/* are public (register/login) or self-protected (/me has middleware in router)
// Addresses and POST / are public. All other customer routes require admin JWT.
app.use('/api/customers', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  if (req.path.includes('/addresses') || (req.method === 'POST' && req.path === '/')) return next();
  return authMiddleware(req, res, next);
}, customerRoutes);

app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/admin-users', authMiddleware, adminUserRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/shipping', authMiddleware, shippingRoutes);
app.use('/api/marketing', authMiddleware, marketingRoutes);
app.use('/api/finance', authMiddleware, financeRoutes);
app.use('/api/order-ops', authMiddleware, returnsRefundsRoutes);

// ─── Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Varisca API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

export default app;

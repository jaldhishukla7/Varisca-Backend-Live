// ─── JWT Auth Middleware ─────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set!');
  return secret;
})();

export function signToken(payload: AuthPayload): string {
  const options: SignOptions = {};
  if (process.env.JWT_EXPIRES_IN) {
    // Accept either numeric seconds or string duration, relax typing via cast
    options.expiresIn = process.env.JWT_EXPIRES_IN as any;
  } else {
    // Default: 7 days in seconds
    options.expiresIn = 60 * 60 * 24 * 7;
  }
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — no token provided' });
    return;
  }

  try {
    const token = header.split(' ')[1];
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
}

// Optional: require specific roles
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden — insufficient permissions' });
      return;
    }
    next();
  };
}

// Customer-specific auth middleware (role === 'customer')
export function customerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — no token provided' });
    return;
  }

  try {
    const token = header.split(' ')[1];
    const payload = verifyToken(token);
    if (payload.role !== 'customer') {
      res.status(403).json({ error: 'Forbidden — customer token required' });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}

/** If `Authorization: Bearer` is present and valid, sets `req.user`; otherwise continues without error. */
export function optionalCustomerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const token = header.split(' ')[1];
    const payload = verifyToken(token);
    if (payload.role === 'customer') {
      req.user = payload;
    }
  } catch {
    /* ignore invalid token for optional auth */
  }
  next();
}


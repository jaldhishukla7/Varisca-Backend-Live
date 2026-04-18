-- ═══════════════════════════════════════════════════════════════════
-- Migration 003: Orders Tables
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE order_status AS ENUM (
  'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

CREATE TYPE return_status AS ENUM (
  'requested', 'approved', 'rejected', 'received', 'refunded'
);

CREATE TYPE refund_status AS ENUM (
  'pending', 'approved', 'rejected', 'processed'
);

-- ─── orders ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     VARCHAR(30) UNIQUE NOT NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    VARCHAR(255) NOT NULL,
  customer_email   VARCHAR(255) NOT NULL,
  customer_phone   VARCHAR(20) DEFAULT '',
  status           order_status NOT NULL DEFAULT 'pending',
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost    NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax              NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL,
  shipping_address TEXT NOT NULL DEFAULT '',
  payment_method   VARCHAR(50) NOT NULL DEFAULT 'cod',
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_orders_date ON orders(created_at DESC);

-- ─── order_items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name       VARCHAR(500) NOT NULL,
  qty        INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC(10,2) NOT NULL,
  size       VARCHAR(20) DEFAULT '',
  color      VARCHAR(50) DEFAULT '',
  image      TEXT DEFAULT ''
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─── returns ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS returns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number   VARCHAR(30) NOT NULL,
  customer_name  VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  reason         TEXT NOT NULL,
  status         return_status NOT NULL DEFAULT 'requested',
  items          JSONB DEFAULT '[]',
  request_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  processed_date DATE,
  processed_by   UUID REFERENCES admin_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status);

-- ─── refund_requests ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refund_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number   VARCHAR(30) NOT NULL,
  customer_name  VARCHAR(255) NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  reason         TEXT NOT NULL,
  status         refund_status NOT NULL DEFAULT 'pending',
  request_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  processed_date DATE,
  processed_by   UUID REFERENCES admin_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refund_requests_order ON refund_requests(order_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);

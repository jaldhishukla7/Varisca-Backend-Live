-- ═══════════════════════════════════════════════════════════════════
-- Migration 001: Core Tables — admin_users, customers
-- ═══════════════════════════════════════════════════════════════════

-- ─── ENUMS ──────────────────────────────────────────────────────────

CREATE TYPE admin_role AS ENUM (
  'super_admin', 'admin', 'product_manager', 'finance_manager', 'support_executive'
);

CREATE TYPE user_status AS ENUM ('active', 'suspended');

-- ─── admin_users ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          admin_role NOT NULL DEFAULT 'admin',
  status        user_status NOT NULL DEFAULT 'active',
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_admin_users_email ON admin_users(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_admin_users_role ON admin_users(role) WHERE is_deleted = FALSE;

-- ─── customers ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(20) DEFAULT '',
  address         TEXT DEFAULT '',
  orders_count    INTEGER NOT NULL DEFAULT 0,
  total_spent     NUMERIC(12,2) NOT NULL DEFAULT 0,
  joined_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  last_order_date DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_customers_email ON customers(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_customers_name ON customers(name) WHERE is_deleted = FALSE;

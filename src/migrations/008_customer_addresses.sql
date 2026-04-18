-- ═══════════════════════════════════════════════════════════════════
-- Migration 008: Customer Addresses + Order Payment Status
-- ═══════════════════════════════════════════════════════════════════

-- ─── customer_addresses ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(20)  DEFAULT '',
  address     TEXT         NOT NULL,
  city        VARCHAR(100) DEFAULT '',
  state       VARCHAR(100) DEFAULT '',
  pincode     VARCHAR(10)  DEFAULT '',
  type        VARCHAR(20)  NOT NULL DEFAULT 'home',
  is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_addr_customer ON customer_addresses(customer_id);

-- ─── orders — add payment_status ─────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status) WHERE is_deleted = FALSE;

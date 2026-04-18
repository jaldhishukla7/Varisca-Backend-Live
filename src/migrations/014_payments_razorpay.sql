-- ═══════════════════════════════════════════════════════════════════
-- Migration 014: Razorpay payments audit table
-- ═══════════════════════════════════════════════════════════════════
-- orders.payment_status already exists (008). This stores each Razorpay attempt.

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  rz_order_id      VARCHAR(100) NOT NULL UNIQUE,
  rz_payment_id    VARCHAR(100),
  rz_signature     TEXT,

  amount_paise     INTEGER NOT NULL,
  currency         VARCHAR(10) NOT NULL DEFAULT 'INR',
  method           VARCHAR(50),
  status           VARCHAR(20) NOT NULL DEFAULT 'created',

  email            VARCHAR(255),
  contact          VARCHAR(20),
  error_code       VARCHAR(100),
  error_desc       TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_rz_order_id ON payments(rz_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ═══════════════════════════════════════════════════════════════════
-- Migration 005: Finance Tables
-- ═══════════════════════════════════════════════════════════════════

-- ─── transactions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_number   VARCHAR(30) NOT NULL,
  customer_name  VARCHAR(255) NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  method         VARCHAR(50) NOT NULL DEFAULT 'cod',
  status         VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed, pending, failed, refunded
  type           VARCHAR(20) NOT NULL DEFAULT 'payment',   -- payment, refund
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_date ON transactions(created_at DESC);

-- ─── payouts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner    VARCHAR(255) NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  method     VARCHAR(100) NOT NULL DEFAULT 'Bank Transfer',
  reference  VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_date ON payouts(created_at DESC);

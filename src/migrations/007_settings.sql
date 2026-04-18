-- ═══════════════════════════════════════════════════════════════════
-- Migration 007: Settings Tables
-- ═══════════════════════════════════════════════════════════════════

-- ─── settings (key-value store) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(255) PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── tax_rules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_rules (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(255) NOT NULL,
  rate      NUMERIC(5,2) NOT NULL,
  region    VARCHAR(255) DEFAULT 'India',
  category  VARCHAR(255) DEFAULT 'All',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── notification_templates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_templates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(255) NOT NULL,
  type      VARCHAR(20) NOT NULL DEFAULT 'email',  -- email, sms, push
  event     VARCHAR(100) NOT NULL,                  -- order.placed, order.shipped, etc.
  subject   VARCHAR(500) DEFAULT '',
  body      TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Migration Tracking ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS _migrations (
  id         SERIAL PRIMARY KEY,
  filename   VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

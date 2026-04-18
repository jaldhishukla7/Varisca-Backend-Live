-- ═══════════════════════════════════════════════════════════════════
-- Migration 006: Shipping Tables
-- ═══════════════════════════════════════════════════════════════════

-- ─── delivery_zones ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  pin_codes_from VARCHAR(10) NOT NULL,
  pin_codes_to   VARCHAR(10) NOT NULL,
  state          VARCHAR(255) DEFAULT 'Multiple',
  delivery_days  INTEGER NOT NULL DEFAULT 3,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── shipping_charges ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shipping_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone        VARCHAR(255) NOT NULL,
  min_weight  NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_weight  NUMERIC(8,2) NOT NULL DEFAULT 5,
  base_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
  per_kg_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  free_above  NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── delivery_partners ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_partners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  code             VARCHAR(10) NOT NULL,
  phone            VARCHAR(20) DEFAULT '',
  email            VARCHAR(255) DEFAULT '',
  zones            TEXT[] DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  rating           NUMERIC(2,1) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

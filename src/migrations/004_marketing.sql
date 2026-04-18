-- ═══════════════════════════════════════════════════════════════════
-- Migration 004: Marketing Tables
-- ═══════════════════════════════════════════════════════════════════

-- ─── coupons ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(50) UNIQUE NOT NULL,
  type         VARCHAR(20) NOT NULL DEFAULT 'percentage',  -- percentage, fixed
  value        NUMERIC(10,2) NOT NULL,
  min_order    NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  usage_limit  INTEGER NOT NULL DEFAULT 100,
  used_count   INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expired, disabled
  start_date   DATE,
  end_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_coupons_code ON coupons(code) WHERE is_deleted = FALSE;
CREATE INDEX idx_coupons_status ON coupons(status) WHERE is_deleted = FALSE;

-- ─── banners ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS banners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(500) NOT NULL,
  subtitle    VARCHAR(500) DEFAULT '',
  image_url   TEXT DEFAULT '',
  link_url    TEXT DEFAULT '',
  position    VARCHAR(20) NOT NULL DEFAULT 'hero',  -- hero, sidebar, footer, popup
  status      VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, scheduled
  start_date  DATE,
  end_date    DATE,
  clicks      INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_banners_position ON banners(position) WHERE is_deleted = FALSE;

-- ─── email_campaigns ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(500) NOT NULL,
  subject         VARCHAR(500) NOT NULL,
  body            TEXT DEFAULT '',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, scheduled, sent, cancelled
  scheduled_date  DATE,
  sent_date       DATE,
  open_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
  click_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

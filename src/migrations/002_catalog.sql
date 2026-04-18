-- ═══════════════════════════════════════════════════════════════════
-- Migration 002: Catalog Tables
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE product_status AS ENUM ('active', 'draft', 'archived');

-- ─── categories ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  description   TEXT DEFAULT '',
  parent_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  image         TEXT DEFAULT '',
  product_count INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- ─── brands ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  logo          TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  website       VARCHAR(500) DEFAULT '',
  product_count INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_brands_slug ON brands(slug);

-- ─── attributes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attributes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  type             VARCHAR(20) NOT NULL DEFAULT 'text',  -- text, select, color, size
  values           TEXT[] DEFAULT '{}',
  used_in_products INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── products ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(500) NOT NULL,
  slug           VARCHAR(500),
  price          NUMERIC(10,2) NOT NULL,
  original_price NUMERIC(10,2),
  image          TEXT DEFAULT '',
  hover_image    TEXT DEFAULT '',
  sub_images     TEXT[] DEFAULT '{}',
  category_id    UUID REFERENCES categories(id) ON DELETE SET NULL,
  category       VARCHAR(255) DEFAULT '',
  subcategory    VARCHAR(255) DEFAULT '',
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL,
  sizes          TEXT[] DEFAULT '{}',
  colors         TEXT[] DEFAULT '{}',
  badge          VARCHAR(20),                          -- new, sale, bestseller
  rating         NUMERIC(2,1) DEFAULT 0,
  reviews        INTEGER DEFAULT 0,
  description    TEXT DEFAULT '',
  material       VARCHAR(500) DEFAULT '',
  inventory      INTEGER NOT NULL DEFAULT 0,
  sku            VARCHAR(100) UNIQUE,
  status         product_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_products_category ON products(category) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_brand ON products(brand_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_status ON products(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products USING GIN(to_tsvector('english', name));

-- ─── product_images ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt_text   VARCHAR(500) DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ─── inventory_logs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL,  -- in, out, adjustment
  quantity   INTEGER NOT NULL,
  reason     TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_logs_product ON inventory_logs(product_id);
CREATE INDEX idx_inventory_logs_date ON inventory_logs(created_at DESC);

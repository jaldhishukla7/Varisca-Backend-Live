-- ═══════════════════════════════════════════════════════════════════
-- Migration 010: Expanded Product Attributes
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS design VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(255) DEFAULT '';

-- Add indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_products_fit ON products(fit) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_sleeve ON products(sleeve_length) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_neck ON products(neck_type) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_material ON products(material) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_design ON products(design) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_purpose ON products(purpose) WHERE is_deleted = FALSE;

-- Ensure GIN indexing on array columns if not already present
-- sizes and colors are already TEXT[]
CREATE INDEX IF NOT EXISTS idx_products_sizes ON products USING GIN(sizes);
CREATE INDEX IF NOT EXISTS idx_products_colors ON products USING GIN(colors);

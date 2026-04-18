-- ═══════════════════════════════════════════════════════════════════
-- Migration 009: Product Attributes
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS fit VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS sleeve_length VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS neck_type VARCHAR(255) DEFAULT '';

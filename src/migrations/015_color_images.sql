-- Per-color preview/hero images for storefront (JSON map: color label -> image URL or data URL)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS color_images JSONB NOT NULL DEFAULT '{}'::jsonb;

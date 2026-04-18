-- SKU uniqueness should apply to catalog rows that appear in the admin/storefront.
-- Soft-deleted rows used to keep their SKU and still blocked new inserts (products_sku_key).

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_active
  ON products (sku)
  WHERE is_deleted = FALSE AND sku IS NOT NULL AND btrim(sku) <> '';

-- Free SKUs on rows that are already hidden from the catalog (optional cleanup for existing DBs)
UPDATE products SET sku = NULL WHERE is_deleted = TRUE AND sku IS NOT NULL;

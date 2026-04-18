-- Remove rows that were only soft-deleted so the products table matches live catalog data.
-- Child rows: product_images + inventory_logs CASCADE; order_items.product_id SET NULL (order lines keep name/price snapshot).

DELETE FROM products WHERE is_deleted = TRUE;

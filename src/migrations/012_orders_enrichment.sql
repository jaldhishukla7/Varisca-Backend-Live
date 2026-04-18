-- Order totals alignment: coupon + handling fee; line SKU snapshot
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handling_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku VARCHAR(120) DEFAULT '';

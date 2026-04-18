-- Custom t-shirt / bespoke orders (storefront → DB → admin)
CREATE TABLE IF NOT EXISTS custom_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name    VARCHAR(255) NOT NULL,
  customer_phone   VARCHAR(50)  NOT NULL,
  customer_email   VARCHAR(255) NOT NULL DEFAULT '',
  address          TEXT         NOT NULL DEFAULT '',
  city             VARCHAR(120) NOT NULL DEFAULT '',
  state            VARCHAR(120) NOT NULL DEFAULT '',
  pincode          VARCHAR(20)  NOT NULL DEFAULT '',
  product_type     VARCHAR(255) NOT NULL,
  variety          VARCHAR(255) NOT NULL,
  print_type       VARCHAR(120) NOT NULL DEFAULT '',
  print_positions  TEXT[]       NOT NULL DEFAULT '{}',
  color            VARCHAR(100) NOT NULL DEFAULT '',
  notes            TEXT         NOT NULL DEFAULT '',
  lines            JSONB        NOT NULL DEFAULT '[]',
  unit_price       NUMERIC(12,2) NOT NULL,
  items_total      NUMERIC(12,2) NOT NULL,
  shipping         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL,
  status           VARCHAR(40)  NOT NULL DEFAULT 'awaiting_confirmation',
  backend_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  backend_order_number VARCHAR(30),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_orders_status ON custom_orders(status);
CREATE INDEX IF NOT EXISTS idx_custom_orders_created ON custom_orders(created_at DESC);

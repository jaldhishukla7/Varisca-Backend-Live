-- Bottom length for women's pants (Ankle / Long / Chudidar)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pants_length VARCHAR(255) DEFAULT '';

-- ═══════════════════════════════════════════════════════════════════
-- Migration 011: Customer Auth — add password_hash, first_name, last_name
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_name    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name     VARCHAR(100);

-- Backfill first_name from name for existing rows (take the first word)
UPDATE customers
SET first_name = split_part(name, ' ', 1),
    last_name  = NULLIF(trim(substring(name FROM position(' ' IN name))), '')
WHERE first_name IS NULL;

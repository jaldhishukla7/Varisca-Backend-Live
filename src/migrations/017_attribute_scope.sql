-- Optional scope: attribute value lists apply to a whole parent category or a specific subcategory
ALTER TABLE attributes
  ADD COLUMN IF NOT EXISTS scope_parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attributes_scope_parent ON attributes(scope_parent_category_id);
CREATE INDEX IF NOT EXISTS idx_attributes_scope_sub ON attributes(scope_subcategory_id);

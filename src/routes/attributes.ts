// ─── Attributes CRUD ────────────────────────────────────────────────
import { Router } from 'express';
import { createCrudRouter } from './crud-factory';

export default createCrudRouter({
  table: 'attributes',
  searchFields: ['name'],
  defaultSort: 'created_at',
  insertFields: ['name', 'type', 'values', 'used_in_products', 'scope_parent_category_id', 'scope_subcategory_id'],
  updateFields: ['name', 'type', 'values', 'used_in_products', 'scope_parent_category_id', 'scope_subcategory_id'],
});

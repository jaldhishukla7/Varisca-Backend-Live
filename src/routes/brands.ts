// ─── Brands CRUD ────────────────────────────────────────────────────
import { Router } from 'express';
import { createCrudRouter } from './crud-factory';

export default createCrudRouter({
  table: 'brands',
  softDelete: true,
  searchFields: ['name'],
  defaultSort: 'created_at',
  insertFields: ['name', 'slug', 'logo', 'description', 'website', 'product_count', 'status'],
  updateFields: ['name', 'slug', 'logo', 'description', 'website', 'product_count', 'status'],
});

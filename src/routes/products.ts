// ─── Products CRUD ──────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import pool from '../db';
import logger from '../utils/logger';
import { asyncHandler, AppError, handleValidationError, handleDatabaseError } from '../middleware/errorHandler';

const router = Router();

// ─── Joi Schemas ───────────────────────────────────────────────────────
/** Allow uploaded data URLs from admin (Joi uri() rejects data:image/...;base64,...). */
const imageField = Joi.string().allow('').max(50_000_000).optional();

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  price: Joi.number().min(0).required(),
  original_price: Joi.number().min(0).optional(),
  image: imageField,
  hover_image: imageField,
  sub_images: Joi.array().items(Joi.string().allow('')).optional(),
  category: Joi.string().trim().optional(),
  subcategory: Joi.string().trim().optional(),
  category_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().valid(''), Joi.valid(null))
    .optional(),
  // Empty string from clients must not fail UUID validation
  brand_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().valid(''), Joi.valid(null))
    .optional(),
  sizes: Joi.array().items(Joi.string()).optional(),
  colors: Joi.array().items(Joi.string()).optional(),
  badge: Joi.string().optional(),
  rating: Joi.number().min(0).max(5).optional(),
  reviews: Joi.number().min(0).optional(),
  description: Joi.string().max(5000).optional(),
  material: Joi.string().max(500).optional(),
  inventory: Joi.number().min(0).optional(),
  sku: Joi.string().optional(),
  status: Joi.string().valid('active', 'draft', 'archived').optional(),
  fit: Joi.string().trim().max(500).allow('').optional(),
  sleeve_length: Joi.string().trim().max(500).allow('').optional(),
  neck_type: Joi.string().trim().max(500).allow('').optional(),
  design: Joi.string().trim().max(500).allow('').optional(),
  /** Admin form uses human-readable labels (e.g. "Sports / Gym T-Shirt"), not only casual|formal|… */
  purpose: Joi.string().trim().max(500).allow('').optional(),
  /** Map of color name -> image (URL or data URL) for PDP swatches and gallery */
  color_images: Joi.object().pattern(Joi.string(), Joi.string().allow('').max(50_000_000)).optional(),
  /** Women's pants: Ankle / Long / Chudidar */
  pants_length: Joi.string().trim().max(500).allow('').optional(),
});

const updateProductSchema = createProductSchema.fork(['name'], (schema) => schema.optional());

// GET /api/products
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const { search, category, status, sort = 'created_at', order = 'desc', page = '1', limit = '50', fit, sleeve_length, neck_type, material, design, purpose, sizes, colors } = req.query;
    const params: any[] = [];
    let where = 'WHERE p.is_deleted = FALSE';
    let i = 1;

    if (search) { where += ` AND (p.name ILIKE $${i} OR p.sku ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (category) { where += ` AND p.category = $${i}`; params.push(category); i++; }
    if (status) { where += ` AND p.status = $${i}`; params.push(status); i++; }
    if (fit) { where += ` AND p.fit = $${i}`; params.push(fit); i++; }
    if (sleeve_length) { where += ` AND p.sleeve_length = $${i}`; params.push(sleeve_length); i++; }
    if (neck_type) { where += ` AND p.neck_type = $${i}`; params.push(neck_type); i++; }
    if (material) { where += ` AND p.material = $${i}`; params.push(material); i++; }
    if (design) { where += ` AND p.design = $${i}`; params.push(design); i++; }
    if (purpose) { where += ` AND p.purpose = $${i}`; params.push(purpose); i++; }
    
    // sizes and colors usually comma-separated if multiple
    if (sizes) {
      const sizeArr = (sizes as string).split(',');
      where += ` AND p.sizes && $${i}`; 
      params.push(sizeArr); 
      i++;
    }
    if (colors) {
      const colorArr = (colors as string).split(',');
      where += ` AND p.colors && $${i}`; 
      params.push(colorArr); 
      i++;
    }

    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
    const allowedSort = ['name', 'price', 'inventory', 'created_at', 'rating'];
    const sortCol = allowedSort.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await pool.query(`SELECT COUNT(*) FROM products p ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const { rows } = await pool.query(
      `SELECT p.* FROM products p ${where} ORDER BY p.${sortCol} ${sortOrder} LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit as string, 10), offset]
    );

    res.json({ data: rows, total, page: parseInt(page as string, 10), limit: parseInt(limit as string, 10) });
}));

// GET /api/products/filters — also exported for app-level route so "filters" is not captured by /:id
export const productFiltersHandler = asyncHandler(async (req: Request, res: Response) => {
    const { rows } = await pool.query(`
      SELECT 
        array_agg(DISTINCT elements) as distinct_sizes,
        array_agg(DISTINCT color_elements) as distinct_colors,
        array_agg(DISTINCT material) FILTER (WHERE material != '') as materials,
        array_agg(DISTINCT fit) FILTER (WHERE fit != '') as fits,
        array_agg(DISTINCT sleeve_length) FILTER (WHERE sleeve_length != '') as sleeve_lengths,
        array_agg(DISTINCT neck_type) FILTER (WHERE neck_type != '') as neck_types,
        array_agg(DISTINCT design) FILTER (WHERE design != '') as designs,
        array_agg(DISTINCT purpose) FILTER (WHERE purpose != '') as purposes,
        array_agg(DISTINCT category) FILTER (WHERE category != '') as categories
      FROM products p
      LEFT JOIN LATERAL unnest(p.sizes) as elements ON true
      LEFT JOIN LATERAL unnest(p.colors) as color_elements ON true
      WHERE p.status = 'active' AND p.is_deleted = FALSE
    `);

    const filters = {
      sizes: (rows[0].distinct_sizes || []).filter(Boolean),
      colors: (rows[0].distinct_colors || []).filter(Boolean),
      materials: rows[0].materials || [],
      fits: rows[0].fits || [],
      sleeve_lengths: rows[0].sleeve_lengths || [],
      neck_types: rows[0].neck_types || [],
      designs: rows[0].designs || [],
      purposes: rows[0].purposes || [],
      categories: rows[0].categories || []
    };

    res.json(filters);
});

router.get('/filters', productFiltersHandler);

/** Next suggested `VRN-TSH-###` SKU from the full table (not limited to admin list pagination). */
router.get('/next-sku', asyncHandler(async (_req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX((regexp_match(sku, '^VRN-TSH-([0-9]+)$', 'i'))[1]::integer), 0) AS max_n
    FROM products
    WHERE is_deleted = FALSE
      AND sku IS NOT NULL
      AND sku ~* '^VRN-TSH-[0-9]+$'
  `);
  const max = Number(rows[0]?.max_n) || 0;
  const next = `VRN-TSH-${String(max + 1).padStart(3, '0')}`;
  res.json({ sku: next });
}));

// GET /api/products/:id — must be after /filters and /next-sku so those paths are not treated as ids
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!UUID_REGEX.test(id)) {
    throw new AppError('Product not found', 404);
  }
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (rows.length === 0) {
      throw new AppError('Product not found', 404);
    }
    res.json(rows[0]);
}));

// POST /api/products
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = createProductSchema.validate(req.body, {
    abortEarly: false,
    convert: true,
    stripUnknown: true,
  });
  if (error) {
    throw handleValidationError(error);
  }

  const { rows } = await pool.query(
    `INSERT INTO products (name, price, original_price, image, hover_image, sub_images, category, subcategory, category_id, brand_id, sizes, colors, badge, rating, reviews, description, material, inventory, sku, status, fit, sleeve_length, neck_type, design, purpose, color_images, pants_length)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
    [value.name, value.price, value.original_price || null, value.image || '', value.hover_image || '', value.sub_images || [], value.category || '', value.subcategory || '', value.category_id || null, value.brand_id || null, value.sizes || [], value.colors || [], value.badge || null, value.rating || 0, value.reviews || 0, value.description || '', value.material || '', value.inventory || 0, value.sku || null, value.status || 'active', value.fit || '', value.sleeve_length || '', value.neck_type || '', value.design || '', value.purpose || '', value.color_images || {}, value.pants_length || '']
  );
  res.status(201).json(rows[0]);
}));

// POST /api/products/bulk-delete — before /:id so "bulk-delete" is never captured as an id
const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

router.post('/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = bulkDeleteSchema.validate(req.body, { abortEarly: false });
  if (error) {
    throw handleValidationError(error);
  }
  const { rowCount } = await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [value.ids]);
  res.json({ message: `${rowCount} product(s) deleted` });
}));

// PUT /api/products/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = updateProductSchema.validate(req.body, {
    abortEarly: false,
    convert: true,
    stripUnknown: true,
  });
  if (error) {
    throw handleValidationError(error);
  }

  const id = req.params.id;
  if (!UUID_REGEX.test(id)) {
    throw new AppError('Invalid product ID', 400);
  }

    const setClauses: string[] = [];
  const values: any[] = [];
  let i = 1;
  const allowed = ['name', 'price', 'original_price', 'image', 'hover_image', 'sub_images', 'category', 'subcategory', 'category_id', 'brand_id', 'sizes', 'colors', 'badge', 'rating', 'reviews', 'description', 'material', 'inventory', 'sku', 'status', 'fit', 'sleeve_length', 'neck_type', 'design', 'purpose', 'color_images', 'pants_length'];

  for (const key of allowed) {
    if (key in value) {
      setClauses.push(`${key} = $${i}`);
      // Empty SKU must be NULL so UNIQUE(sku) allows multiple products without a code
      let v: unknown = value[key];
      if (key === 'sku') v = value.sku || null;
      else if (key === 'category_id') v = value.category_id || null;
      values.push(v);
      i++;
    }
  }
  if (setClauses.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING *`,
    values
  );
  if (rows.length === 0) {
    throw new AppError('Product not found', 404);
  }
  res.json(rows[0]);
}));

// DELETE /api/products/:id — hard delete (row removed; order_items keep line snapshot, product_id nulled per FK)
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!UUID_REGEX.test(id)) {
    throw new AppError('Invalid product ID', 400);
  }

  const { rows } = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  if (rows.length === 0) {
    throw new AppError('Product not found', 404);
  }
  res.json({ message: 'Product deleted', id: rows[0].id });
}));

export default router;

// ─── Seed Script ────────────────────────────────────────────────────
import pool from './db';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...\n');

    // ─── Admin Users ────────────────────────────────────────────────
    const hash = await bcrypt.hash('admin123', 10);
    const managerHash = await bcrypt.hash('manager123', 10);
    const productsHash = await bcrypt.hash('products123', 10);
    const financeHash = await bcrypt.hash('finance123', 10);
    const supportHash = await bcrypt.hash('support123', 10);

    await client.query(`
      INSERT INTO admin_users (name, email, password_hash, role, status) VALUES
        ('Varisca Admin', 'admin@varisca.com', $1, 'super_admin', 'active'),
        ('Store Manager', 'manager@varisca.com', $2, 'admin', 'active'),
        ('Product Manager', 'products@varisca.com', $3, 'product_manager', 'active'),
        ('Finance Manager', 'finance@varisca.com', $4, 'finance_manager', 'active'),
        ('Support Agent', 'support@varisca.com', $5, 'support_executive', 'active')
      ON CONFLICT (email) DO NOTHING
    `, [hash, managerHash, productsHash, financeHash, supportHash]);
    console.log('  ✅ Admin users');

    // ─── Categories ─────────────────────────────────────────────────
    const { rows: catRows } = await client.query(`
      INSERT INTO categories (name, slug, description, product_count, status) VALUES
        ('Men', 'men', 'Men''s clothing', 6, 'active'),
        ('Women', 'women', 'Women''s clothing', 2, 'active')
      ON CONFLICT (slug) DO NOTHING
      RETURNING id, slug
    `);
    const catMap: Record<string, string> = {};
    catRows.forEach(r => { catMap[r.slug] = r.id; });

    // Subcategories
    if (catMap['men']) {
      await client.query(`
        INSERT INTO categories (name, slug, description, parent_id, product_count, status) VALUES
          ('T-Shirts', 'tshirts', 'Casual tees', $1, 5, 'active'),
          ('Polo Shirts', 'polo', 'Polo collection', $1, 1, 'active')
        ON CONFLICT (slug) DO NOTHING
      `, [catMap['men']]);
    }
    if (catMap['women']) {
      await client.query(`
        INSERT INTO categories (name, slug, description, parent_id, product_count, status) VALUES
          ('Graphic Tees', 'graphic-tees', 'Graphic print tees', $1, 1, 'active')
        ON CONFLICT (slug) DO NOTHING
      `, [catMap['women']]);
    }
    console.log('  ✅ Categories');

    // ─── Brands ─────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO brands (name, slug, description, website, product_count, status) VALUES
        ('Varisca Originals', 'varisca-originals', 'In-house brand', 'https://varisca.com', 8, 'active'),
        ('Urban Street', 'urban-street', 'Streetwear collection', '', 3, 'active')
      ON CONFLICT (slug) DO NOTHING
    `);
    console.log('  ✅ Brands');

    // ─── Attributes ─────────────────────────────────────────────────
    await client.query(`
      INSERT INTO attributes (name, type, values, used_in_products) VALUES
        ('Size', 'size', ARRAY['XS','S','M','L','XL','XXL'], 8),
        ('Color', 'color', ARRAY['Black','White','Navy','Grey','Olive','Maroon'], 8),
        ('Material', 'text', ARRAY['Cotton','Polyester','Linen','Organic Cotton'], 8)
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✅ Attributes');

    // ─── Products ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO products (name, price, original_price, image, hover_image, category, subcategory, sizes, colors, badge, rating, reviews, description, material, inventory, sku, status) VALUES
        ('Urban Street Oversized Tee', 1299, 1799, '/images/black_oversized_tee_street_style_1770113164208.png', '/images/black_oversized_tee_street_style_1770113164208.png', 'men', 'tshirts', ARRAY['S','M','L','XL','XXL'], ARRAY['Black','White','Grey'], 'bestseller', 4.8, 324, 'Premium cotton oversized tee with a relaxed fit.', '100% Premium Cotton, 220 GSM', 45, 'VRN-TSH-001', 'active'),
        ('Essential Navy Crew', 899, 1299, '/images/mens_navy_tee_front_1770113988560.png', '/images/mens_navy_tee_back_1770114006296.png', 'men', 'tshirts', ARRAY['S','M','L','XL'], ARRAY['Navy','Black','White'], 'new', 4.9, 128, 'Classic navy crew neck tee.', '100% Cotton', 60, 'VRN-TSH-002', 'active'),
        ('Olive Garden Pocket Tee', 999, NULL, '/images/mens_olive_pocket_tee_front_1770114063842.png', NULL, 'men', 'tshirts', ARRAY['M','L','XL'], ARRAY['Olive','Sand'], NULL, 4.7, 89, 'Relaxed fit tee with chest pocket.', '100% Organic Cotton', 30, 'VRN-TSH-003', 'active'),
        ('Long Sleeve Basic', 1499, 1999, '/images/long_sleeve_tshirt_1770113309403.png', NULL, 'men', 'tshirts', ARRAY['S','M','L','XL'], ARRAY['Grey','Navy','Olive'], 'sale', 4.9, 512, 'Essential long sleeve tee.', '80% Cotton, 20% Polyester', 25, 'VRN-TSH-004', 'active'),
        ('Artistic Vibe Graphic Tee', 999, 1499, '/images/womens_graphic_tee_lifestyle_1770113146661.png', NULL, 'women', 'tshirts', ARRAY['XS','S','M','L'], ARRAY['White','Cream','Pink'], 'sale', 4.6, 267, 'Express yourself with this graphic print tee.', '95% Cotton, 5% Elastane', 40, 'VRN-TSH-005', 'active'),
        ('Premium V-Neck Tee', 799, NULL, '/images/v_neck_tshirt_1770113330903.png', NULL, 'men', 'tshirts', ARRAY['S','M','L','XL'], ARRAY['Maroon','Black','White','Navy'], NULL, 4.5, 423, 'Classic V-neck silhouette.', '100% Cotton', 55, 'VRN-TSH-006', 'active'),
        ('Classic White Crew', 899, NULL, '/images/mens_white_tee_lifestyle_1770113127002.png', NULL, 'men', 'tshirts', ARRAY['S','M','L','XL'], ARRAY['White','Black'], 'bestseller', 4.7, 189, 'The ultimate white t-shirt.', '100% Premium Cotton', 70, 'VRN-TSH-007', 'active'),
        ('Signature Polo', 1299, 1799, '/images/polo_shirt_detail_1770113184008.png', NULL, 'men', 'tshirts', ARRAY['S','M','L','XL'], ARRAY['Navy','White','Black'], NULL, 4.7, 198, 'Timeless polo shirt.', '100% Cotton Pique', 35, 'VRN-TSH-008', 'active')
      ON CONFLICT (sku) WHERE is_deleted = FALSE AND sku IS NOT NULL AND btrim(sku) <> '' DO NOTHING
    `);
    console.log('  ✅ Products (8)');

    // ─── Delivery Zones ─────────────────────────────────────────────
    await client.query(`
      INSERT INTO delivery_zones (name, pin_codes_from, pin_codes_to, state, delivery_days, is_active) VALUES
        ('Metro Cities', '100001', '199999', 'Multiple', 2, true),
        ('Tier-1 Cities', '200001', '399999', 'Multiple', 3, true),
        ('Tier-2 Cities', '400001', '599999', 'Multiple', 5, true),
        ('Remote Areas', '600001', '999999', 'Multiple', 7, false)
    `);
    console.log('  ✅ Delivery zones');

    // ─── Shipping Charges ───────────────────────────────────────────
    await client.query(`
      INSERT INTO shipping_charges (zone, min_weight, max_weight, base_cost, per_kg_cost, free_above, is_active) VALUES
        ('Metro Cities', 0, 5, 49, 10, 999, true),
        ('Tier-1 Cities', 0, 5, 79, 15, 1499, true),
        ('Tier-2 Cities', 0, 5, 99, 20, 1999, true)
    `);
    console.log('  ✅ Shipping charges');

    // ─── Delivery Partners ──────────────────────────────────────────
    await client.query(`
      INSERT INTO delivery_partners (name, code, phone, email, zones, is_active, total_deliveries, rating) VALUES
        ('BlueDart Express', 'BD', '+91-9876543210', 'ops@bluedart.com', ARRAY['Metro Cities','Tier-1 Cities'], true, 156, 4.5),
        ('Delhivery', 'DL', '+91-9876543211', 'ops@delhivery.com', ARRAY['Tier-1 Cities','Tier-2 Cities'], true, 89, 4.2)
    `);
    console.log('  ✅ Delivery partners');

    // ─── Coupons ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, used_count, status, start_date, end_date) VALUES
        ('WELCOME10', 'percentage', 10, 500, 200, 100, 12, 'active', '2026-01-01', '2026-12-31'),
        ('FLAT200', 'fixed', 200, 1000, 200, 50, 8, 'active', '2026-01-01', '2026-06-30')
      ON CONFLICT (code) DO NOTHING
    `);
    console.log('  ✅ Coupons');

    // ─── Tax Rules ──────────────────────────────────────────────────
    await client.query(`
      INSERT INTO tax_rules (name, rate, region, category, is_active) VALUES
        ('GST Standard', 18, 'India', 'All', true),
        ('GST Clothing (< ₹1000)', 5, 'India', 'Apparel', true),
        ('GST Clothing (> ₹1000)', 12, 'India', 'Premium Apparel', true)
    `);
    console.log('  ✅ Tax rules');

    // ─── Notification Templates ─────────────────────────────────────
    await client.query(`
      INSERT INTO notification_templates (name, type, event, subject, body, is_active) VALUES
        ('Order Confirmation', 'email', 'order.placed', 'Your order {{orderNumber}} has been confirmed!', 'Hi {{customerName}}, thank you for your order.', true),
        ('Shipping Update', 'email', 'order.shipped', 'Your order {{orderNumber}} has been shipped!', 'Hi {{customerName}}, your order is on its way.', true),
        ('Order SMS', 'sms', 'order.placed', '', 'Order {{orderNumber}} confirmed! Track: {{trackingUrl}}', false)
    `);
    console.log('  ✅ Notification templates');

    // ─── Default Settings ───────────────────────────────────────────
    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('general', '{"storeName":"Varisca","storeUrl":"https://varisca.com","storeEmail":"support@varisca.com","storePhone":"+91-9876543210","currency":"INR","locale":"en-IN","timezone":"Asia/Kolkata","maintenanceMode":false}'::jsonb),
        ('payment', '{"codEnabled":true,"codLimit":10000,"upiEnabled":true,"upiId":"varisca@upi","razorpayEnabled":false,"razorpayKeyId":"","razorpayKeySecret":""}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('  ✅ Settings');

    console.log('\n🌱 Seeding complete!');
  } catch (err: any) {
    console.error('Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

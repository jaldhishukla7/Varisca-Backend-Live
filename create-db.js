// Quick script to create varisca_db if it doesn't exist
const { Pool } = require('pg');
require('dotenv').config();

async function createDb() {
  // Connect to default 'postgres' database first
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'varisca_db'"
    );
    if (rows.length === 0) {
      await pool.query('CREATE DATABASE varisca_db');
      console.log('✅ Created database: varisca_db');
    } else {
      console.log('✅ Database varisca_db already exists');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

createDb();

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO public').catch((err) => {
    console.error('Failed to set search_path:', err);
  });
});

export default pool;
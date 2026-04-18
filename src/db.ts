// ─── PostgreSQL Connection Pool ─────────────────────────────────────
import { Pool } from 'pg';
import dotenv from 'dotenv';
import logger from './utils/logger';

dotenv.config();

// Use DATABASE_URL if set (e.g. Supabase, Railway), otherwise use DB_* vars.
// Railway containers can fail to route IPv6 DB endpoints; DB_HOST allows overriding hostname.
const dbUrl = process.env.DATABASE_POOLER_URL?.trim() || process.env.DATABASE_URL;

const dbHostOverride = process.env.DB_HOST?.trim();
const dbUrlHostOverride = process.env.DB_URL_HOST?.trim();
const isProduction = process.env.NODE_ENV === 'production';
const forceIPv4 =
  process.env.PG_FORCE_IPV4 === 'true' ||
  (isProduction && process.env.PG_FORCE_IPV4 !== 'false');
const dbSource = process.env.DB_SOURCE?.toLowerCase(); // local | url
const localHost = dbHostOverride || 'localhost';
const localPort = parseInt(process.env.DB_PORT || '5432', 10);
const localDatabase = process.env.DB_NAME || 'varisca_db';

const shouldUseUrl =
  dbSource === 'url' ||
  (dbSource !== 'local' && isProduction && !!dbUrl) ||
  (dbSource !== 'local' && !dbHostOverride && !!dbUrl);

const connectionConfig = shouldUseUrl && dbUrl
  ? (() => {
      const url = new URL(dbUrl);
      // Only override URL hostname when explicitly requested for URL mode.
      if (dbUrlHostOverride) {
        url.hostname = dbUrlHostOverride;
      }
      logger.info(`DB source: url (${url.hostname})`);
      logger.info(`DB network family: ${forceIPv4 ? 'ipv4' : 'auto'}`);
      return {
        connectionString: url.toString(),
        // PM2 cluster: each worker gets its own pool.
        // With max:8, 4 PM2 workers = 32 total connections (safe under PG default 100)
        max: 8,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        // Supabase always requires SSL — enable it whenever using DATABASE_URL
        ssl: { rejectUnauthorized: false },

        ...(forceIPv4 ? { family: 4 as const } : {}),
      };
    })()
  : {
      host: localHost,
      port: localPort,
      database: localDatabase,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      ...(forceIPv4 ? { family: 4 as const } : {}),
    };

if (!shouldUseUrl) {
  logger.info(`DB source: local (${localHost}:${localPort}/${localDatabase})`);
  logger.info(`DB network family: ${forceIPv4 ? 'ipv4' : 'auto'}`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
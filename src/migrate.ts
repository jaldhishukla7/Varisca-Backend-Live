// ─── Migration Runner ───────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import pool from './db';

// Always resolve to src/migrations/ relative to the project root
// Works whether invoked via `tsx src/migrate.ts` or compiled `node dist/migrate.js`
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC_MIGRATIONS = path.join(PROJECT_ROOT, 'src', 'migrations');
// Fallback: if running via tsx, __dirname IS src/, so src/migrations exists directly
const MIGRATIONS_DIR = fs.existsSync(SRC_MIGRATIONS)
  ? SRC_MIGRATIONS
  : path.join(__dirname, 'migrations');


async function migrate() {
  const client = await pool.connect();
  try {
    const { rows: who } = await client.query(
      'SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS host',
    );
    const w = who[0] as { db: string; role: string; host: string | null };
    console.log(
      `🔄 Running migrations on database "${w.db}" (user ${w.role}${w.host ? `, host ${w.host}` : ''})\n` +
        `   Tip: if this is not your local pgAdmin DB, set DB_SOURCE=local in .env and use DB_NAME / DB_USER / DB_PASSWORD.\n`,
    );


    // Ensure _migrations table exists (created in 007 but we need it first)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query('SELECT filename FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.map(r => r.filename));

    // Get all .sql files sorted
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        await client.query('COMMIT');
        console.log(`  ✅ ${file}`);
        count++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`  ❌ ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n✅ Migrations complete. ${count} new migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

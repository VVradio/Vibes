// Runs db/schema.sql against whatever database is configured in .env /
// DATABASE_URL. Safe to run repeatedly — every statement is IF NOT EXISTS
// or ADD COLUMN IF NOT EXISTS.
//
// Usage:
//   node backend/db/migrate.js
//   (or, from the repo root): npm run db:migrate

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('▶ Running schema.sql...');
  try {
    await pool.query(sql);
    console.log('✓ Schema is up to date.');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();

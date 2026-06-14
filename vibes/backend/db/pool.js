const { Pool } = require('pg');

// Railway, Render, and most managed Postgres hosts provide a single
// DATABASE_URL (and usually require SSL). Fall back to discrete
// DB_* vars for a traditional VPS + local Postgres setup.
const useConnectionString = !!process.env.DATABASE_URL;

const pool = useConnectionString
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'vibes',
      user:     process.env.DB_USER     || 'vibes_user',
      password: process.env.DB_PASSWORD,
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

module.exports = pool;

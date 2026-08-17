const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      password_encrypted TEXT,
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_error TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Upgrade path for tables created before these columns existed.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_encrypted TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_error TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      day INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // If upgrading from an earlier version of this schema, make sure the
  // "day" column exists even on tables created before this field was added.
  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS day INTEGER NOT NULL DEFAULT 1;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER
    );
  `);

  console.log('Database schema ready.');
}

module.exports = { pool, initSchema };

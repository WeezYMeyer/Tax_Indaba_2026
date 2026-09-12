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
      access_day1 BOOLEAN NOT NULL DEFAULT TRUE,
      access_day2 BOOLEAN NOT NULL DEFAULT TRUE,
      access_day3 BOOLEAN NOT NULL DEFAULT TRUE,
      first_name TEXT,
      last_name TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Upgrade path for tables created before these columns existed.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_encrypted TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_error TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_day1 BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_day2 BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_day3 BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;`);

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

  // --- TP Summit: a separate, free, email-gated mini-event ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tp_summit_leads (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      captured_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tp_summit_sessions (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES tp_summit_leads(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tp_summit_messages (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES tp_summit_leads(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // --- Support chat: the "Support" button available on every page ---
  // A conversation is identified by whatever name+email the visitor types
  // into the widget (checked against `users` for a possible match, but not
  // required to match — anyone can start a conversation). Messages come
  // from three senders: 'visitor', 'bot' (canned auto-replies), and 'admin'
  // (the organizer replying from the Support tab in /admin).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_conversations (
      id SERIAL PRIMARY KEY,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open',
      unread_by_admin BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_message_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES support_conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Database schema ready.');
}

module.exports = { pool, initSchema };

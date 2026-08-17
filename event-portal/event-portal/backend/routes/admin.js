const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { sendLoginEmail } = require('../emailService');

const router = express.Router();

// POST /api/admin/login — separate from attendee login, gated by ADMIN_PASSWORD in .env
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }
  const token = jwt.sign({ isAdmin: true, id: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

function generatePassword() {
  // Readable-ish random password, e.g. "k3f9-m2pq"
  return crypto.randomBytes(4).toString('hex').match(/.{1,4}/g).join('-');
}

// POST /api/admin/add-attendees
// body: { attendees: [{ email, name }, ...] }
router.post('/add-attendees', requireAdmin, async (req, res) => {
  const { attendees } = req.body;
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "attendees" array of { email, name }' });
  }

  const results = [];

  for (const entry of attendees) {
    const email = (entry.email || '').toLowerCase().trim();
    const name = (entry.name || '').trim();
    if (!email || !email.includes('@')) {
      results.push({ email, status: 'skipped', reason: 'invalid email' });
      continue;
    }

    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        results.push({ email, status: 'skipped', reason: 'already exists' });
        continue;
      }

      const password = generatePassword();
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)',
        [email, name, hash]
      );

      await sendLoginEmail({ to: email, name, password });
      results.push({ email, status: 'created_and_emailed' });
    } catch (err) {
      console.error('Failed to add attendee', email, err);
      results.push({ email, status: 'error', reason: err.message });
    }
  }

  res.json({ results });
});

// GET /api/admin/attendees — list all users (for a simple admin table)
router.get('/attendees', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ attendees: rows });
});

// DELETE /api/admin/attendees/:id — revoke an attendee's access
router.delete('/attendees/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;

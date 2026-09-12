const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { sendLoginEmail } = require('../emailService');
const { encrypt, decrypt } = require('../passwordVault');

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
  // 6-digit numeric code — easy to type on a phone keypad (no letters,
  // no shift key, no ambiguous characters like 0/O or 1/l), while still
  // giving a million possible combinations.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Converts a ticket-tier code into the three access booleans stored per user.
function accessFromTier(tier) {
  switch (tier) {
    case 'day1': return { access_day1: true, access_day2: false, access_day3: false };
    case 'day2': return { access_day1: false, access_day2: true, access_day3: false };
    case 'day3': return { access_day1: false, access_day2: false, access_day3: true };
    case 'all':
    default: return { access_day1: true, access_day2: true, access_day3: true };
  }
}

// POST /api/admin/add-attendees
// body: { attendees: [{ email, firstName, lastName }, ...], tier: 'day1' | 'day2' | 'day3' | 'all', sendEmail: bool }
router.post('/add-attendees', requireAdmin, async (req, res) => {
  const { attendees, tier, sendEmail } = req.body;
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return res.status(400).json({ error: 'Provide a non-empty "attendees" array of { email, firstName, lastName }' });
  }

  const access = accessFromTier(tier);
  const results = [];

  for (const entry of attendees) {
    const email = (entry.email || '').toLowerCase().trim();
    const firstName = (entry.firstName || '').trim();
    const lastName = (entry.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    if (!email || !email.includes('@')) {
      results.push({ email, status: 'skipped', reason: 'invalid email' });
      continue;
    }
    if (!firstName) {
      results.push({ email, status: 'skipped', reason: 'first name required' });
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
      const encryptedPassword = encrypt(password);

      const { rows } = await pool.query(
        `INSERT INTO users (email, name, first_name, last_name, password_hash, password_encrypted, access_day1, access_day2, access_day3)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [email, fullName, firstName, lastName || null, hash, encryptedPassword, access.access_day1, access.access_day2, access.access_day3]
      );
      const userId = rows[0].id;

      if (!sendEmail) {
        // Just create the account — the organizer will hand out the
        // password themselves (e.g. the client is sending their own emails).
        await pool.query('UPDATE users SET email_status = $1, email_error = NULL WHERE id = $2', ['not_sent', userId]);
        results.push({ email, status: 'created' });
        continue;
      }

      try {
        await sendLoginEmail({
          to: email,
          name: fullName,
          password,
          access: { day1: access.access_day1, day2: access.access_day2, day3: access.access_day3 },
        });
        await pool.query('UPDATE users SET email_status = $1, email_error = NULL WHERE id = $2', ['sent', userId]);
        results.push({ email, status: 'created_and_emailed' });
      } catch (emailErr) {
        console.error('Email send failed for', email, emailErr);
        await pool.query('UPDATE users SET email_status = $1, email_error = $2 WHERE id = $3', ['failed', emailErr.message, userId]);
        results.push({ email, status: 'created_but_email_failed', reason: emailErr.message });
      }
    } catch (err) {
      console.error('Failed to add attendee', email, err);
      results.push({ email, status: 'error', reason: err.message });
    }
  }

  res.json({ results });
});

// GET /api/admin/attendees — list all users, including decrypted password,
// email delivery status, first/last name, and per-day access, for the admin table.
router.get('/attendees', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, name, first_name, last_name, is_admin, email_status, email_error, password_encrypted,
            access_day1, access_day2, access_day3, created_at
     FROM users ORDER BY created_at DESC`
  );
  const attendees = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    firstName: r.first_name,
    lastName: r.last_name,
    is_admin: r.is_admin,
    email_status: r.email_status,
    email_error: r.email_error,
    password: decrypt(r.password_encrypted), // null if never set / undecryptable
    access: { day1: r.access_day1, day2: r.access_day2, day3: r.access_day3 },
    created_at: r.created_at,
  }));
  res.json({ attendees });
});

// PATCH /api/admin/attendees/:id/access — update one attendee's per-day access,
// e.g. after a ticket upgrade. body: { day1: bool, day2: bool, day3: bool }
router.patch('/attendees/:id/access', requireAdmin, async (req, res) => {
  const { day1, day2, day3 } = req.body;
  await pool.query(
    'UPDATE users SET access_day1 = $1, access_day2 = $2, access_day3 = $3 WHERE id = $4',
    [Boolean(day1), Boolean(day2), Boolean(day3), req.params.id]
  );
  res.json({ success: true });
});

// POST /api/admin/attendees/:id/resend — generate a fresh password and re-send
// the login email (useful when the first send failed, or someone lost theirs).
router.post('/attendees/:id/resend', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, access_day1, access_day2, access_day3 FROM users WHERE id = $1',
    [req.params.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Attendee not found' });

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const encryptedPassword = encrypt(password);
  const access = { day1: user.access_day1, day2: user.access_day2, day3: user.access_day3 };

  try {
    await sendLoginEmail({ to: user.email, name: user.name, password, access });
    await pool.query(
      'UPDATE users SET password_hash = $1, password_encrypted = $2, email_status = $3, email_error = NULL WHERE id = $4',
      [hash, encryptedPassword, 'sent', user.id]
    );
    res.json({ success: true });
  } catch (err) {
    await pool.query(
      'UPDATE users SET password_hash = $1, password_encrypted = $2, email_status = $3, email_error = $4 WHERE id = $5',
      [hash, encryptedPassword, 'failed', err.message, user.id]
    );
    res.status(502).json({ error: `Password reset, but email failed to send: ${err.message}` });
  }
});

// DELETE /api/admin/attendees/:id — revoke an attendee's access
router.delete('/attendees/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// GET /api/admin/attendance-report — per-attendee minutes watched per day,
// plus CPD points, for post-event reporting.
router.get('/attendance-report', requireAdmin, async (req, res) => {
  // How many minutes of "full attendance" each day is worth. Configure per
  // day via EVENT_DAY1_DURATION_MINUTES etc; defaults to a 7-hour conference day.
  const dayDurationMinutes = {};
  for (const n of [1, 2, 3]) {
    dayDurationMinutes[n] = Number(process.env[`EVENT_DAY${n}_DURATION_MINUTES`]) || 420;
  }

  // How many minutes of watch time earns one CPD point. Default: 1 point per hour.
  const minutesPerCpdPoint = Number(process.env.CPD_MINUTES_PER_POINT) || 60;

  // Minimum % of a day's duration someone must have been present for to
  // count that day as "attended" for CPD purposes.
  const cpdThresholdPercent = Number(process.env.CPD_THRESHOLD_PERCENT) || 70;

  const { rows: users } = await pool.query(
    'SELECT id, email, name FROM users WHERE is_admin = FALSE ORDER BY email'
  );

  // Sum closed sessions (ended_at IS NOT NULL) per user per day. Any session
  // still open (someone currently connected) is counted using NOW() so a
  // report pulled mid-event isn't misleadingly at zero for active viewers.
  const { rows: sessionRows } = await pool.query(`
    SELECT
      user_id,
      day,
      SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at)))) AS total_seconds
    FROM attendance_sessions
    GROUP BY user_id, day
  `);

  const byUser = {};
  for (const row of sessionRows) {
    byUser[row.user_id] = byUser[row.user_id] || {};
    byUser[row.user_id][row.day] = Math.round(Number(row.total_seconds) / 60); // minutes
  }

  const report = users.map((u) => {
    const days = [1, 2, 3].map((n) => {
      const minutesWatched = byUser[u.id]?.[n] || 0;
      const percent = Math.min(100, Math.round((minutesWatched / dayDurationMinutes[n]) * 100));
      return {
        day: n,
        minutesWatched,
        percent,
        attended: percent >= cpdThresholdPercent,
      };
    });

    const totalMinutes = days.reduce((sum, d) => sum + d.minutesWatched, 0);
    const cpdPoints = Math.round((totalMinutes / minutesPerCpdPoint) * 10) / 10; // 1 decimal

    return {
      email: u.email,
      name: u.name,
      days,
      totalMinutes,
      cpdPoints,
    };
  });

  res.json({ report, cpdThresholdPercent, minutesPerCpdPoint, dayDurationMinutes });
});

// POST /api/admin/clear-test-data — wipes chat messages and attendance
// sessions (from testing before the real event), without touching attendee
// accounts, passwords, or access tiers.
router.post('/clear-test-data', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM messages');
  await pool.query('DELETE FROM attendance_sessions');
  res.json({ success: true });
});

// GET /api/admin/tp-summit-leads — everyone who's captured their email for
// TP Summit (via the public link or the "TP Summit" tab on /event), plus
// how many minutes they've watched.
router.get('/tp-summit-leads', requireAdmin, async (req, res) => {
  const { rows: leads } = await pool.query(
    'SELECT id, email, name, captured_at FROM tp_summit_leads ORDER BY captured_at DESC'
  );

  const { rows: sessionRows } = await pool.query(`
    SELECT
      lead_id,
      SUM(COALESCE(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at)))) AS total_seconds
    FROM tp_summit_sessions
    GROUP BY lead_id
  `);
  const minutesByLead = {};
  for (const row of sessionRows) {
    minutesByLead[row.lead_id] = Math.round(Number(row.total_seconds) / 60);
  }

  const result = leads.map((l) => ({
    email: l.email,
    name: l.name,
    captured_at: l.captured_at,
    minutesWatched: minutesByLead[l.id] || 0,
  }));

  res.json({ leads: result });
});

// GET /api/admin/support/conversations — the Support tab inbox: everyone
// who's messaged the Support widget, newest activity first, with whether
// their email matched a registered attendee and a preview of the last
// message. Real-time updates arrive over the 'support-admin' socket room;
// this REST endpoint is for the initial load and manual refresh.
router.get('/support/conversations', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      sc.id, sc.guest_name, sc.guest_email, sc.status, sc.unread_by_admin,
      sc.created_at, sc.last_message_at,
      (sc.user_id IS NOT NULL) AS matched,
      (SELECT content FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
      (SELECT sender FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) AS last_sender
    FROM support_conversations sc
    ORDER BY sc.last_message_at DESC
  `);
  res.json({ conversations: rows });
});

// GET /api/admin/support/conversations/:id/messages — full thread for one
// conversation. Also clears the unread flag, since opening it in the admin
// UI is what "reading" it means.
router.get('/support/conversations/:id/messages', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT sender, content, created_at FROM support_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  await pool.query('UPDATE support_conversations SET unread_by_admin = FALSE WHERE id = $1', [req.params.id]);
  res.json({ messages: rows });
});

module.exports = router;

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

// Verifies whichever token is presented — either a TP Summit lead token
// (issued below, for the public no-login link) or a normal attendee/admin
// token (for the "TP Summit" tab on the logged-in /event page) — and
// ensures a tp_summit_leads row exists for that email either way. This is
// what lets both entry paths report into one unified "who watched" list.
async function resolveTpLead(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  const email = (payload.email || '').toLowerCase().trim();
  if (!email) return null;
  const name = payload.name || null;

  const { rows } = await pool.query(
    `INSERT INTO tp_summit_leads (email, name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = COALESCE(tp_summit_leads.name, EXCLUDED.name)
     RETURNING id, email, name`,
    [email, name]
  );
  return rows[0];
}

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function requireTpLead(req, res, next) {
  const lead = await resolveTpLead(extractBearerToken(req));
  if (!lead) return res.status(401).json({ error: 'Not authenticated' });
  req.tpLead = lead;
  next();
}

// POST /api/tp-summit/capture — the public, no-password entry point.
// body: { email, name }. Creates (or reuses) a lead and hands back a token
// used for stream access and chat — no full attendee account is created.
// Name is collected too (not just email) so the chat can show a name
// instead of ever exposing someone's email address to other viewers.
router.post('/capture', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const name = (req.body.name || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO tp_summit_leads (email, name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = COALESCE(tp_summit_leads.name, EXCLUDED.name)
     RETURNING id, email, name`,
    [email, name]
  );
  const lead = rows[0];

  const token = jwt.sign(
    { leadId: lead.id, email: lead.email, name: lead.name, kind: 'tp-summit-lead' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token });
});

// GET /api/tp-summit/access — works for both a lead token and a normal
// attendee token (see resolveTpLead above).
router.get('/access', requireTpLead, (req, res) => {
  const embedUrl = process.env.TP_SUMMIT_EMBED_URL;
  if (!embedUrl) {
    return res.status(503).json({ error: 'TP Summit stream is not configured yet' });
  }
  res.json({ embedUrl });
});

module.exports = { router, resolveTpLead };

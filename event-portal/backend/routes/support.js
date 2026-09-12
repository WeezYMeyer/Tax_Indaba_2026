const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { welcomeMessage } = require('../supportBot');

const router = express.Router();

// POST /api/support/start — the public entry point for the Support widget.
// No login required (this has to work for someone who can't even log in).
// body: { name, email }.
//
// Reuses the visitor's latest OPEN conversation for that email if one
// exists (so closing/reopening the widget, or reloading the page, continues
// the same thread instead of starting over) — otherwise creates a new one
// and seeds it with a bot welcome message. Also checks whether the email
// matches a registered attendee, purely to personalise the bot and flag it
// for whoever answers in /admin — it never grants any account access.
router.post('/start', async (req, res) => {
  const name = (req.body.name || '').trim().slice(0, 100);
  const email = (req.body.email || '').toLowerCase().trim();
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Please enter a valid email address.' });

  try {
    const { rows: userRows } = await pool.query(
      'SELECT id, name, access_day1, access_day2, access_day3 FROM users WHERE email = $1',
      [email]
    );
    const matchedUser = userRows[0] || null;

    const { rows: existing } = await pool.query(
      `SELECT * FROM support_conversations WHERE guest_email = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    let conversation = existing[0];

    if (!conversation) {
      const { rows: inserted } = await pool.query(
        `INSERT INTO support_conversations (guest_name, guest_email, user_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, email, matchedUser?.id || null]
      );
      conversation = inserted[0];

      const ctx = {
        matched: Boolean(matchedUser),
        name,
        email,
        attendeeName: matchedUser?.name,
        access: matchedUser
          ? { day1: matchedUser.access_day1, day2: matchedUser.access_day2, day3: matchedUser.access_day3 }
          : null,
      };
      await pool.query(
        `INSERT INTO support_messages (conversation_id, sender, content) VALUES ($1, 'bot', $2)`,
        [conversation.id, welcomeMessage(ctx)]
      );
      await pool.query('UPDATE support_conversations SET last_message_at = NOW() WHERE id = $1', [conversation.id]);
    }

    const { rows: messages } = await pool.query(
      'SELECT sender, content, created_at FROM support_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation.id]
    );

    const token = jwt.sign(
      { conversationId: conversation.id, email, name, kind: 'support-visitor' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, conversationId: conversation.id, matched: Boolean(matchedUser), messages });
  } catch (err) {
    console.error('Failed to start support conversation', err);
    res.status(500).json({ error: 'Could not start a support chat right now — please try again shortly.' });
  }
});

module.exports = router;

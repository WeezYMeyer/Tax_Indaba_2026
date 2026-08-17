const express = require('express');
const { requireAuth } = require('../auth');
const { pool } = require('../db');

const router = express.Router();

async function getAccess(userId) {
  if (userId === 'admin') return { access_day1: true, access_day2: true, access_day3: true };
  const { rows } = await pool.query(
    'SELECT access_day1, access_day2, access_day3 FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || { access_day1: false, access_day2: false, access_day3: false };
}

// GET /api/stream/days — which days are configured AND which the logged-in
// attendee has ticket access to, so the frontend can show locked vs. open tabs.
router.get('/days', requireAuth, async (req, res) => {
  const access = await getAccess(req.user.id);
  const days = [1, 2, 3].map((n) => ({
    day: n,
    label: process.env[`EVENT_DAY${n}_LABEL`] || `Day ${n}`,
    configured: Boolean(process.env[`VIMEO_EMBED_URL_DAY${n}`] || (n === 1 && process.env.VIMEO_EMBED_URL)),
    hasAccess: Boolean(access[`access_day${n}`]),
  }));
  res.json({ days });
});

// GET /api/stream/access?day=1|2|3 — only returns the embeddable Vimeo URL
// for the requested day if the user is logged in AND their ticket covers that day.
router.get('/access', requireAuth, async (req, res) => {
  const day = ['1', '2', '3'].includes(req.query.day) ? req.query.day : '1';

  const access = await getAccess(req.user.id);
  if (!access[`access_day${day}`]) {
    return res.status(403).json({ error: `Your ticket doesn't include access to Day ${day}.` });
  }

  // Preferred: paste the full embed src Vimeo gives you for that day's Live Event.
  let embedUrl = process.env[`VIMEO_EMBED_URL_DAY${day}`];

  // Backwards-compatible fallback for day 1 if only the old single var was set.
  if (!embedUrl && day === '1') {
    embedUrl = process.env.VIMEO_EMBED_URL;
    if (!embedUrl && process.env.VIMEO_VIDEO_ID) {
      embedUrl = `https://player.vimeo.com/video/${process.env.VIMEO_VIDEO_ID}${process.env.VIMEO_HASH ? `?h=${process.env.VIMEO_HASH}` : ''}`;
    }
  }

  if (!embedUrl) {
    return res.status(503).json({ error: `Stream for day ${day} is not configured yet` });
  }

  res.json({ embedUrl, day: Number(day) });
});

module.exports = router;

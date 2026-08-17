const express = require('express');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/stream/days — returns metadata about which days are configured,
// so the frontend can show tabs like "Day 1 / Day 2 / Day 3" dynamically.
router.get('/days', requireAuth, (req, res) => {
  const days = [1, 2, 3].map((n) => ({
    day: n,
    label: process.env[`EVENT_DAY${n}_LABEL`] || `Day ${n}`,
    configured: Boolean(process.env[`VIMEO_EMBED_URL_DAY${n}`] || (n === 1 && process.env.VIMEO_EMBED_URL)),
  }));
  res.json({ days });
});

// GET /api/stream/access?day=1|2|3 — only returns the embeddable Vimeo URL
// for the requested day if the user is logged in.
router.get('/access', requireAuth, (req, res) => {
  const day = ['1', '2', '3'].includes(req.query.day) ? req.query.day : '1';

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

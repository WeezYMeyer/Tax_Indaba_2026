const express = require('express');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/stream/access — only returns the embeddable Vimeo URL if the user is logged in
router.get('/access', requireAuth, (req, res) => {
  // Preferred: paste the full embed src Vimeo gives you (works for both regular
  // videos and Live Events, since live event embed URLs vary in format).
  let embedUrl = process.env.VIMEO_EMBED_URL;

  // Fallback: build from separate ID/hash if that's what was set instead.
  if (!embedUrl && process.env.VIMEO_VIDEO_ID) {
    embedUrl = `https://player.vimeo.com/video/${process.env.VIMEO_VIDEO_ID}${process.env.VIMEO_HASH ? `?h=${process.env.VIMEO_HASH}` : ''}`;
  }

  if (!embedUrl) {
    return res.status(503).json({ error: 'Stream is not configured yet' });
  }

  res.json({ embedUrl });
});

module.exports = router;

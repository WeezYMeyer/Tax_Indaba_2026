const express = require('express');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/stream/access — only returns the embeddable Vimeo URL if the user is logged in
router.get('/access', requireAuth, (req, res) => {
  const videoId = process.env.VIMEO_VIDEO_ID;
  const hash = process.env.VIMEO_HASH;

  if (!videoId) {
    return res.status(503).json({ error: 'Stream is not configured yet' });
  }

  const embedUrl = `https://player.vimeo.com/video/${videoId}${hash ? `?h=${hash}` : ''}`;
  res.json({ embedUrl });
});

module.exports = router;

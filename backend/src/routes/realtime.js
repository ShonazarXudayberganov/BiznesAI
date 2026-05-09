/**
 * Real-time SSE stream endpoint.
 *
 *   GET /api/realtime/stream — auth qilingan user uchun real-time event'lar.
 *   GET /api/realtime/stats  — admin uchun ulanish statistikasi.
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const realtime = require('../services/realtime');

const router = express.Router();

router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx buffering off
  res.flushHeaders();

  // Welcome event
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now(), userId: req.userId })}\n\n`);

  const unsubscribe = realtime.subscribe({
    res,
    userId: req.userId,
    organizationId: req.user?.organization_id || null,
  });

  req.on('close', () => {
    unsubscribe();
  });
});

router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  res.json(realtime.getStats());
});

module.exports = router;

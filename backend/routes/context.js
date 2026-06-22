'use strict';
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { generateContextCard } = require('../lib/contextCard');

router.use(cors({ origin: true }));

const shareTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.params.share_token || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const invalidTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

router.get('/card/:share_token', shareTokenLimiter, async (req, res) => {
  try {
    const { share_token } = req.params;

    const { data: household } = await supabase
      .from('households')
      .select('id, context, context_sharing')
      .eq('share_token', share_token)
      .single();

    if (!household) {
      invalidTokenLimiter(req, res, () => {
        res.status(404).json({ error: 'Not found' });
      });
      return;
    }

    const [{ data: partners }, { data: orders }] = await Promise.all([
      supabase.from('partners').select('display_name').eq('household_id', household.id),
      supabase.from('household_orders').select('*').eq('household_id', household.id).order('created_at', { ascending: false }).limit(10),
    ]);

    const card = generateContextCard(
      household.context, partners, household.context_sharing, orders || []
    );

    // Log access (hashed IP, truncated user-agent)
    const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 16);
    const ua = (req.headers['user-agent'] || '').slice(0, 500);
    supabase.from('share_access_log')
      .insert({ household_id: household.id, ip_hash: ipHash, user_agent: ua })
      .then(() => {}).catch(() => {});

    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');

    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.startsWith('text/');
    if (wantsJson) {
      res.json({ card });
    } else {
      res.type('text/plain').send(card || '');
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

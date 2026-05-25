const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');

router.post('/event', requireAuth, async (req, res) => {
  const { event, metadata } = req.body;
  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'event is required' });
  }

  try {
    const { data: partner } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    await supabase.from('funnel_events').insert({
      partner_id:   partner?.id   ?? null,
      household_id: partner?.household_id ?? null,
      event,
      metadata: metadata ?? null,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

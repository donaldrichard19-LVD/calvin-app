const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const { supabase } = require('../lib/supabase');

router.post('/clerk', async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] CLERK_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const wh = new Webhook(secret);
  let event;
  try {
    event = wh.verify(req.body, {
      'svix-id':        req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    console.error('[webhook] verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'user.created') {
    const { id, email_addresses, first_name, created_at } = event.data;
    const email = email_addresses?.[0]?.email_address ?? null;

    const { error } = await supabase.from('signups').insert({
      clerk_user_id: id,
      email,
      created_at: new Date(created_at).toISOString(),
    });

    if (error) console.error('[webhook] insert error:', error.message);
    else console.log('[webhook] signup recorded:', email);
  }

  res.json({ received: true });
});

module.exports = router;

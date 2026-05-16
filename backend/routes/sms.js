const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { sendSMS } = require('../lib/twilio');

router.post('/test', requireAuth, async (req, res) => {
  try {
    const { data: partner } = await supabase
      .from('partners')
      .select('phone, display_name')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!partner?.phone) return res.status(400).json({ error: 'No phone number on file' });

    await sendSMS(partner.phone, 'Calvin: Test alert — SMS is working correctly.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invite', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const { data: partner } = await supabase
      .from('partners')
      .select('display_name, households(invite_code)')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!partner?.households?.invite_code) {
      return res.status(400).json({ error: 'No household invite code found' });
    }

    const inviteCode = partner.households.invite_code;
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const signupUrl = `${frontendUrl}?invite=${inviteCode}`;
    const senderName = partner.display_name || 'Your partner';
    const greeting = name ? `Hi ${name}! ` : '';

    const message = `${greeting}${senderName} invited you to join Calvin — the shared household app. Sign up here: ${signupUrl}`;

    await sendSMS(phone, message);
    res.json({ success: true, invite_code: inviteCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

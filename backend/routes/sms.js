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

module.exports = router;

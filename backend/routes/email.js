const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { sendEmail } = require('../lib/google');

router.post('/send', requireAuth, async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const { data: partner } = await supabase
      .from('partners')
      .select('id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const { data: intg } = await supabase
      .from('integrations')
      .select('*')
      .eq('partner_id', partner.id)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null)
      .single();

    if (!intg) {
      return res.status(400).json({ error: 'Google account not connected. Go to Settings and reconnect Google.' });
    }

    const result = await sendEmail(intg, { to, subject, body });
    res.json({ success: true, messageId: result.id });
  } catch (err) {
    console.error('[email/send] error:', err.message);
    const isScope = err.message?.includes('insufficient') || err.code === 403 || err.status === 403;
    if (isScope) {
      return res.status(403).json({ error: 'Gmail send access not granted. Go to Settings and reconnect Google to enable email sending.' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

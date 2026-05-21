'use strict';
const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const { supabase } = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Persist to signups table (ignore duplicates)
  await supabase.from('signups').upsert({ email, name: name || null }, { onConflict: 'email', ignoreDuplicates: true });

  // Notify admin
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>',
      to: 'donald.richard19@gmail.com',
      subject: `New Calvin signup: ${email}`,
      html: `<p><strong>${name || 'Someone'}</strong> signed up for Calvin.</p><p>Email: <strong>${email}</strong></p><p>Add to <a href="https://console.cloud.google.com/apis/credentials/consent">Google Cloud Console → Test Users</a>.</p>`,
    });
  } catch (err) {
    console.error('[waitlist] notification email failed:', err.message);
  }

  res.json({ success: true });
});

module.exports = router;

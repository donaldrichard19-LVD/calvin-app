'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Resend } = require('resend');
const { supabase } = require('../lib/supabase');
const { sendWelcomeEmail } = require('../lib/email');

const BASE_URL = (process.env.BACKEND_URL || 'https://calvin-app.onrender.com').replace(/\/$/, '');

function signToken(email) {
  const secret = process.env.WAITLIST_SECRET || process.env.ENCRYPTION_KEY;
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}

function approveUrl(email, name) {
  const token = signToken(email);
  const params = new URLSearchParams({ email, token, name: name || '' });
  return `${BASE_URL}/api/waitlist/approve?${params}`;
}

router.post('/', async (req, res) => {
  const { email, name, plan } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  await supabase.from('signups').upsert(
    { email, name: name || null, plan: plan || null },
    { onConflict: 'email', ignoreDuplicates: true }
  );

  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : '—';

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const link = approveUrl(email, name);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>',
      to: 'donald.richard19@gmail.com',
      subject: `New Calvin signup: ${email}`,
      html: `
        <p><strong>${name || 'Someone'}</strong> requested access to Calvin.</p>
        <p>Email: <strong>${email}</strong></p>
        <p>Plan: <strong>${planLabel}</strong></p>
        <p>
          <strong>Step 1:</strong>
          <a href="https://console.cloud.google.com/apis/credentials/consent">Add to Google Cloud Console → Test Users</a>
        </p>
        <p>
          <strong>Step 2:</strong>
          <a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">
            Send welcome email to ${email}
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8">Click step 2 only after you've added them to Google Cloud Console.</p>
      `,
    });
  } catch (err) {
    console.error('[waitlist] notification email failed:', err.message);
  }

  res.json({ success: true });
});

// Admin-only: fires when Donald clicks the button in the notification email
router.get('/approve', async (req, res) => {
  const { email, token, name } = req.query;
  if (!email || !token) return res.status(400).send('Missing email or token');

  const expected = signToken(email);
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(403).send('Invalid token');
  }

  try {
    await sendWelcomeEmail({ email, firstName: name || null });
    res.send(`<p style="font-family:sans-serif">✅ Welcome email sent to <strong>${email}</strong>.</p>`);
  } catch (err) {
    console.error('[waitlist] welcome email failed:', err.message);
    res.status(500).send(`Failed to send welcome email: ${err.message}`);
  }
});

module.exports = router;

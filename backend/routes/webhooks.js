const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Webhook } = require('svix');
const { Resend } = require('resend');
const { supabase } = require('../lib/supabase');

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
    const name = first_name || null;

    const { error } = await supabase.from('signups').insert({
      clerk_user_id: id,
      email,
      created_at: new Date(created_at).toISOString(),
    });

    if (error) console.error('[webhook] insert error:', error.message);
    else console.log('[webhook] signup recorded:', email);

    if (email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const link = approveUrl(email, name);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>',
          to: 'donald.richard19@gmail.com',
          subject: `New Calvin signup: ${email}`,
          html: `
            <p><strong>${name || 'Someone'}</strong> signed up for Calvin.</p>
            <p>Email: <strong>${email}</strong></p>
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
        console.log('[webhook] admin notification sent for:', email);
      } catch (err) {
        console.error('[webhook] admin notification failed:', err.message);
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;

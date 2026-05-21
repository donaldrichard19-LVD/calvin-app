require('dotenv').config();
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { getAuthUrl, getTokensFromCode } = require('../lib/google');
const { encrypt } = require('../lib/crypto');

router.get('/connect', requireAuth, async (req, res) => {
  try {
    const { data: partner } = await supabase
      .from('partners')
      .select('id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!partner) {
      return res.status(400).json({ error: 'Partner record not found. Complete onboarding first.' });
    }

    const url = getAuthUrl(partner.id);
    res.json({ url });
  } catch (err) {
    console.error('[google/connect]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/callback', async (req, res) => {
  const { code, state: partnerId, error: oauthError } = req.query;
  const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/$/, '');

  if (oauthError || !code || !partnerId) {
    console.error('[google/callback] Missing params:', { oauthError, hasCode: !!code, partnerId });
    return res.redirect(`${FRONTEND_URL}/onboarding?error=google_auth_failed`);
  }

  console.log('[google/callback] GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
  console.log('[google/callback] partnerId from state:', partnerId);

  try {
    const { access_token, refresh_token, expiry_date, email } = await getTokensFromCode(code);
    console.log('[google/callback] Tokens received for email:', email);

    const { data: partner, error: partnerErr } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('id', partnerId)
      .single();

    if (partnerErr || !partner) {
      console.error('[google/callback] Partner not found:', partnerErr?.message);
      return res.redirect(`${FRONTEND_URL}/onboarding?error=partner_not_found`);
    }

    console.log('[google/callback] Partner found:', partner.id, 'household:', partner.household_id);

    // Preserve the existing refresh_token if Google doesn't return a new one
    const { data: existingIntg } = await supabase
      .from('integrations')
      .select('refresh_token')
      .eq('partner_id', partner.id)
      .eq('provider', 'google')
      .maybeSingle();

    const { error: upsertError } = await supabase.from('integrations').upsert(
      {
        partner_id: partner.id,
        household_id: partner.household_id,
        provider: 'google',
        access_token: encrypt(access_token),
        refresh_token: refresh_token ? encrypt(refresh_token) : (existingIntg?.refresh_token || null),
        token_expiry: expiry_date ? new Date(expiry_date).toISOString() : null,
        account_email: email,
        scope: 'calendar gmail userinfo.email',
        is_active: true,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'partner_id,provider' }
    );

    if (upsertError) {
      console.error('[google/callback] Integration upsert failed:', upsertError);
      return res.redirect(`${FRONTEND_URL}/dashboard?error=upsert_${encodeURIComponent(upsertError.message)}`);
    }

    console.log('[google/callback] Integration saved successfully for partner:', partner.id);
    res.redirect(`${FRONTEND_URL}/dashboard?connected=google`);
  } catch (err) {
    const detail = err.response?.data || {};
    const googleErrorCode = detail.error || 'unknown';
    console.error('[google/callback] Token exchange error:', err.message, JSON.stringify({
      google_detail: detail,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      client_id_prefix: (process.env.GOOGLE_CLIENT_ID || '').slice(0, 20),
      client_secret_length: (process.env.GOOGLE_CLIENT_SECRET || '').length,
    }));
    res.redirect(`${FRONTEND_URL}/dashboard?error=google_${encodeURIComponent(googleErrorCode)}`);
  }
});

module.exports = router;

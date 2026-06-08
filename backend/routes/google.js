require('dotenv').config();
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { getAuthUrl, getTokensFromCode } = require('../lib/google');
const { encrypt } = require('../lib/crypto');

const MAX_GOOGLE_ACCOUNTS = 3;
const MAX_ACCOUNTS_ERROR = "You've reached the maximum of 3 connected Gmail accounts.";

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

    const { count, error: countErr } = await supabase
      .from('integrations')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partner.id)
      .eq('provider', 'google')
      .eq('is_active', true);

    if (countErr) throw countErr;

    if ((count || 0) >= MAX_GOOGLE_ACCOUNTS) {
      return res.status(403).json({ error: MAX_ACCOUNTS_ERROR });
    }

    // ?mode=add lets the frontend explicitly request the Google account
    // chooser (e.g. "Add another Gmail account" CTAs), so the user isn't
    // silently re-authed into an account they've already connected.
    const selectAccount = req.query.mode === 'add';
    const url = getAuthUrl(partner.id, { selectAccount });
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

    // Look up an existing row for this exact (partner, provider, account_email)
    // — this is the re-auth/reconnect case, where we update tokens in place
    // rather than inserting a duplicate row.
    const { data: existingIntg } = await supabase
      .from('integrations')
      .select('id, refresh_token')
      .eq('partner_id', partner.id)
      .eq('provider', 'google')
      .eq('account_email', email)
      .maybeSingle();

    // Defense against UI bypass: re-check the active-account cap server-side.
    // Only block if this would be a brand-new account (not a re-auth of an
    // already-connected one, which doesn't change the count).
    if (!existingIntg) {
      const { count, error: countErr } = await supabase
        .from('integrations')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partner.id)
        .eq('provider', 'google')
        .eq('is_active', true);

      if (countErr) throw countErr;

      if ((count || 0) >= MAX_GOOGLE_ACCOUNTS) {
        console.warn(`[google/callback] Rejected new account ${email} for partner ${partner.id} — already at cap of ${MAX_GOOGLE_ACCOUNTS}`);
        return res.redirect(`${FRONTEND_URL}/dashboard?error=${encodeURIComponent(MAX_ACCOUNTS_ERROR)}`);
      }
    }

    const tokenFields = {
      access_token: encrypt(access_token),
      refresh_token: refresh_token ? encrypt(refresh_token) : (existingIntg?.refresh_token || null),
      token_expiry: expiry_date ? new Date(expiry_date).toISOString() : null,
      scope: 'calendar gmail userinfo.email',
      is_active: true,
    };

    let upsertError;
    if (existingIntg) {
      // Re-auth case: update tokens in place for this specific account, scoped
      // by id (and therefore by account_email) so reconnecting one account
      // never clobbers another account's tokens.
      ({ error: upsertError } = await supabase
        .from('integrations')
        .update({
          ...tokenFields,
          household_id: partner.household_id,
          account_email: email,
          connected_at: new Date().toISOString(),
        })
        .eq('id', existingIntg.id));
    } else {
      // New distinct account for this partner — insert a new row.
      ({ error: upsertError } = await supabase
        .from('integrations')
        .insert({
          partner_id: partner.id,
          household_id: partner.household_id,
          provider: 'google',
          account_email: email,
          connected_at: new Date().toISOString(),
          ...tokenFields,
        }));
    }

    if (upsertError) {
      console.error('[google/callback] Integration upsert failed:', upsertError);
      return res.redirect(`${FRONTEND_URL}/dashboard?error=upsert_${encodeURIComponent(upsertError.message)}`);
    }

    console.log('[google/callback] Integration saved successfully for partner:', partner.id, 'account:', email);
    res.redirect(`${FRONTEND_URL}/dashboard?connected=google`);
  } catch (err) {
    const detail = err.response?.data || {};
    console.error('[google/callback] Token exchange error:', err.message, JSON.stringify(detail));
    const msg = JSON.stringify({
      error: err.message,
      google_detail: detail,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      client_id_prefix: (process.env.GOOGLE_CLIENT_ID || '').slice(0, 20),
      client_secret_length: (process.env.GOOGLE_CLIENT_SECRET || '').length,
    });
    res.redirect(`${FRONTEND_URL}/dashboard?error=callback_${encodeURIComponent(msg)}`);
  }
});

module.exports = router;

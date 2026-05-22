require('dotenv').config();
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// Registered OAuth clients. Add Claude's exact redirect_uri here once confirmed
// by Anthropic during the review process.
const CLIENTS = {
  claude: {
    name: 'Claude',
    // Accept any redirect URI starting with these prefixes.
    // Claude's MCP OAuth redirect will be clarified during submission review.
    allowed_origins: [
      'https://claude.ai',
      'https://api.claude.ai',
    ],
  },
};

function isAllowedRedirectUri(client, uri) {
  if (!uri) return false;
  return client.allowed_origins.some((origin) => uri.startsWith(origin));
}

// GET /api/oauth/authorize
// Claude sends users here to start the flow.
router.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, response_type } = req.query;

  if (response_type !== 'code') {
    return res.status(400).send('Only response_type=code is supported.');
  }

  const client = CLIENTS[client_id];
  if (!client) return res.status(400).send('Unknown client_id.');

  if (!isAllowedRedirectUri(client, redirect_uri)) {
    return res.status(400).send('Invalid redirect_uri.');
  }

  // Hand off to the Calvin frontend consent page (Clerk auth is already there)
  const frontendUrl = process.env.FRONTEND_URL || 'https://calvinai.co';
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    state: state || '',
    client_name: client.name,
  });
  res.redirect(`${frontendUrl}/oauth?${params}`);
});

// POST /api/oauth/code
// Called by the frontend after the user has signed in and consented.
// Returns a short-lived auth code that Claude can exchange for a token.
router.post('/code', requireAuth, async (req, res) => {
  try {
    const { client_id, redirect_uri } = req.body;

    const client = CLIENTS[client_id];
    if (!client) return res.status(400).json({ error: 'Unknown client_id' });

    if (!isAllowedRedirectUri(client, redirect_uri)) {
      return res.status(400).json({ error: 'Invalid redirect_uri' });
    }

    const { data: partner, error: partnerErr } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (partnerErr || !partner?.household_id) {
      return res.status(400).json({ error: 'No household found. Complete Calvin onboarding first.' });
    }

    const code = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabase.from('oauth_codes').insert({
      code,
      partner_id: partner.id,
      household_id: partner.household_id,
      client_id,
      redirect_uri,
      expires_at: expiresAt,
    });
    if (insertErr) throw insertErr;

    res.json({ code });
  } catch (err) {
    console.error('[oauth] /code error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/oauth/token
// Claude exchanges the auth code for an access token (the household's mcp_token).
router.post('/token', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Accept both JSON and application/x-www-form-urlencoded
    const body = { ...req.body, ...req.query };
    const { grant_type, code, client_id, redirect_uri } = body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    if (!code || !client_id) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const { data: oauthCode, error: codeErr } = await supabase
      .from('oauth_codes')
      .select('*')
      .eq('code', code)
      .eq('client_id', client_id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (codeErr || !oauthCode) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    if (redirect_uri && oauthCode.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    // Mark code as used (one-time use)
    await supabase.from('oauth_codes').update({ used: true }).eq('code', code);

    // Use (or generate) the household's mcp_token as the access token
    const { data: household } = await supabase
      .from('households')
      .select('id, mcp_token')
      .eq('id', oauthCode.household_id)
      .single();

    let accessToken = household?.mcp_token;
    if (!accessToken) {
      accessToken = crypto.randomUUID();
      await supabase.from('households').update({ mcp_token: accessToken }).eq('id', oauthCode.household_id);
    }

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      scope: 'household:read household:write',
    });
  } catch (err) {
    console.error('[oauth] /token error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');

async function getPartner(clerkUserId) {
  const { data } = await supabase
    .from('partners')
    .select('id, household_id, display_name')
    .eq('clerk_user_id', clerkUserId)
    .single();
  return data;
}

function stripTokens(integration) {
  const { access_token, refresh_token, ...safe } = integration;
  return safe;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner) return res.json([]);

    const { data, error } = await supabase
      .from('integrations')
      .select('id, provider, account_email, scope, is_active, last_synced_at, connected_at')
      .eq('partner_id', partner.id);
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/household', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.json([]);

    const { data: partners } = await supabase
      .from('partners')
      .select('id, display_name, clerk_user_id')
      .eq('household_id', partner.household_id);

    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('id, partner_id, provider, account_email, scope, is_active, last_synced_at, connected_at')
      .eq('household_id', partner.household_id);
    if (error) throw error;

    const result = (integrations || []).map((intg) => ({
      ...intg,
      partner: partners?.find((p) => p.id === intg.partner_id) || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:provider', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const { error } = await supabase
      .from('integrations')
      .update({ is_active: false, access_token: null, refresh_token: null })
      .eq('partner_id', partner.id)
      .eq('provider', req.params.provider);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { runAnalysisForHousehold } = require('../jobs/analyze');

async function getPartner(clerkUserId) {
  const { data } = await supabase
    .from('partners')
    .select('*, households(*)')
    .eq('clerk_user_id', clerkUserId)
    .single();
  return data;
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner) return res.json({ partner: null, household: null });

    const { data: allPartners } = await supabase
      .from('partners')
      .select('id, display_name, phone, clerk_user_id')
      .eq('household_id', partner.household_id);

    const other = allPartners?.find((p) => p.clerk_user_id !== req.auth.userId) || null;

    res.json({
      partner: {
        id: partner.id,
        display_name: partner.display_name,
        phone: partner.phone,
        clerk_user_id: partner.clerk_user_id,
        household_id: partner.household_id,
      },
      household: partner.households,
      other_partner: other,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create', requireAuth, async (req, res) => {
  try {
    const existing = await getPartner(req.auth.userId);
    // Only block if they already belong to a household
    if (existing?.household_id) return res.status(400).json({ error: 'Already in a household' });

    const { data: household, error: hErr } = await supabase
      .from('households')
      .insert({ name: req.body.name || 'Our Household' })
      .select()
      .single();
    if (hErr) throw hErr;

    let partner;
    if (existing) {
      // Partner row exists (from step 1 name entry) — just link it to the new household
      const { data, error: pErr } = await supabase
        .from('partners')
        .update({ household_id: household.id })
        .eq('id', existing.id)
        .select()
        .single();
      if (pErr) throw pErr;
      partner = data;
    } else {
      const { data, error: pErr } = await supabase
        .from('partners')
        .insert({
          household_id: household.id,
          clerk_user_id: req.auth.userId,
          display_name: req.body.display_name || null,
          phone: req.body.phone || null,
        })
        .select()
        .single();
      if (pErr) throw pErr;
      partner = data;
    }

    res.json({ household, partner, invite_code: household.invite_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/join', requireAuth, async (req, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'invite_code required' });

    const existing = await getPartner(req.auth.userId);
    if (existing?.household_id) return res.status(400).json({ error: 'Already in a household' });

    const { data: household, error: hErr } = await supabase
      .from('households')
      .select()
      .eq('invite_code', invite_code.trim())
      .single();
    if (hErr || !household) return res.status(404).json({ error: 'Invite code not found' });

    const { data: members } = await supabase
      .from('partners')
      .select('id')
      .eq('household_id', household.id);
    if (members?.length >= 2) return res.status(400).json({ error: 'Household already full' });

    let partner;
    if (existing) {
      // Partner row exists (from step 1 name entry) — just link it
      const { data, error: pErr } = await supabase
        .from('partners')
        .update({ household_id: household.id })
        .eq('id', existing.id)
        .select()
        .single();
      if (pErr) throw pErr;
      partner = data;
    } else {
      const { data: inserted, error: pErr } = await supabase
        .from('partners')
        .insert({
          household_id: household.id,
          clerk_user_id: req.auth.userId,
          display_name: req.body.display_name || null,
          phone: req.body.phone || null,
        })
        .select()
        .single();
      if (pErr) throw pErr;
      partner = inserted;
    }

    res.json({ household, partner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/partner', requireAuth, async (req, res) => {
  try {
    const { display_name, phone } = req.body;
    const partner = await getPartner(req.auth.userId);

    if (partner) {
      const { data, error } = await supabase
        .from('partners')
        .update({ display_name, phone })
        .eq('clerk_user_id', req.auth.userId)
        .select()
        .single();
      if (error) throw error;
      return res.json({ partner: data });
    }

    const { data, error } = await supabase
      .from('partners')
      .insert({ clerk_user_id: req.auth.userId, display_name, phone })
      .select()
      .single();
    if (error) throw error;
    res.json({ partner: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/leave', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    await supabase
      .from('integrations')
      .update({ is_active: false, access_token: null, refresh_token: null })
      .eq('partner_id', partner.id);

    const { error } = await supabase
      .from('partners')
      .update({ household_id: null })
      .eq('id', partner.id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/context', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.json({ context: {} });

    const { data, error } = await supabase
      .from('households')
      .select('context')
      .eq('id', partner.household_id)
      .single();
    if (error) throw error;
    res.json({ context: data?.context || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/context', requireAuth, async (req, res) => {
  try {
    const { context } = req.body;
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { error } = await supabase
      .from('households')
      .update({ context })
      .eq('id', partner.household_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mcp-info', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { data: household } = await supabase
      .from('households')
      .select('mcp_token, digest_email_enabled, digest_email_frequency')
      .eq('id', partner.household_id)
      .single();

    let token = household?.mcp_token;
    if (!token) {
      token = require('crypto').randomUUID();
      await supabase.from('households').update({ mcp_token: token }).eq('id', partner.household_id);
    }

    const base = (process.env.BACKEND_URL || 'https://calvin-app-production.up.railway.app').replace(/\/$/, '');
    res.json({
      mcp_url: `${base}/mcp/${token}`,
      digest_email_enabled: household?.digest_email_enabled ?? false,
      digest_email_frequency: household?.digest_email_frequency || 'daily',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { digest_email_enabled, digest_email_frequency } = req.body;
    const update = {};
    if (digest_email_enabled !== undefined) update.digest_email_enabled = digest_email_enabled;
    if (digest_email_frequency !== undefined) update.digest_email_frequency = digest_email_frequency;

    const { error } = await supabase.from('households').update(update).eq('id', partner.household_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const runId = await runAnalysisForHousehold(partner.household_id);
    res.json({ run_id: runId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

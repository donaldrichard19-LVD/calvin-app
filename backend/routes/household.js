const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { runAnalysisForHousehold } = require('../jobs/analyze');
const { generateContextCard } = require('../lib/contextCard');

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

    const householdId = partner.household_id;

    await supabase
      .from('integrations')
      .update({ is_active: false, access_token: null, refresh_token: null })
      .eq('partner_id', partner.id);

    const { error } = await supabase
      .from('partners')
      .update({ household_id: null })
      .eq('id', partner.id);
    if (error) throw error;

    // Regenerate both tokens so departed partner's saved URLs stop working
    if (householdId) {
      const { data: remaining } = await supabase
        .from('partners').select('id').eq('household_id', householdId);
      if (remaining?.length) {
        await supabase.from('households').update({
          mcp_token: crypto.randomUUID(),
          share_token: crypto.randomBytes(32).toString('hex'),
        }).eq('id', householdId);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/context', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.json({ context: {}, context_sharing: {} });

    const { data, error } = await supabase
      .from('households')
      .select('context, context_sharing')
      .eq('id', partner.household_id)
      .single();
    if (error) throw error;
    res.json({
      context: data?.context || {},
      context_sharing: data?.context_sharing || { members: true, routines: true, preferences: true, logistics: true, orders: true },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/context', requireAuth, async (req, res) => {
  try {
    const { context, context_sharing } = req.body;
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const update = {};
    if (context !== undefined) update.context = context;
    if (context_sharing !== undefined) update.context_sharing = context_sharing;

    const { error } = await supabase
      .from('households')
      .update(update)
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

    const base = (process.env.BACKEND_URL || 'https://calvin-app.onrender.com').replace(/\/$/, '');
    res.json({
      mcp_url: `${base}/mcp/${token}`,
      digest_email_enabled: household?.digest_email_enabled ?? false,
      digest_email_frequency: household?.digest_email_frequency || 'daily',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/connections', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { data: household } = await supabase
      .from('households')
      .select('claude_last_seen_at, chatgpt_last_seen_at')
      .eq('id', partner.household_id)
      .single();

    const toStatus = (lastSeen) => {
      if (!lastSeen) return { status: 'never', last_seen_at: null };
      const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
      return {
        status: mins < 5 ? 'live' : mins < 1440 ? 'recent' : 'inactive',
        last_seen_at: lastSeen,
      };
    };

    res.json({
      claude: toStatus(household?.claude_last_seen_at),
      chatgpt: toStatus(household?.chatgpt_last_seen_at),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connections/revoke', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const newToken = require('crypto').randomUUID();
    await supabase.from('households')
      .update({
        mcp_token: newToken,
        claude_last_seen_at: null,
        chatgpt_last_seen_at: null,
      })
      .eq('id', partner.household_id);

    const base = (process.env.BACKEND_URL || 'https://calvin-app.onrender.com').replace(/\/$/, '');
    res.json({ mcp_url: `${base}/mcp/${newToken}` });
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

// ── Context Card ──────────────────────────────────────────────────────────────

router.get('/context/card', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const [{ data: household }, { data: partners }, { data: orders }] = await Promise.all([
      supabase.from('households').select('context, context_sharing').eq('id', partner.household_id).single(),
      supabase.from('partners').select('display_name').eq('household_id', partner.household_id),
      supabase.from('household_orders').select('*').eq('household_id', partner.household_id).is('archived_at', null),
    ]);

    const card = generateContextCard(
      household?.context, partners, household?.context_sharing, orders || []
    );
    res.json({ card });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Share Token Management ───────────────────────────────────────────────────

router.get('/share-info', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { data: household } = await supabase
      .from('households')
      .select('share_token')
      .eq('id', partner.household_id)
      .single();

    let token = household?.share_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await supabase.from('households').update({ share_token: token }).eq('id', partner.household_id);
    }

    const base = (process.env.BACKEND_URL || 'https://calvin-app.onrender.com').replace(/\/$/, '');
    res.json({ share_url: `${base}/api/context/card/${token}`, share_token: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/share-token/regenerate', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const token = crypto.randomBytes(32).toString('hex');
    await supabase.from('households').update({ share_token: token }).eq('id', partner.household_id);

    const base = (process.env.BACKEND_URL || 'https://calvin-app.onrender.com').replace(/\/$/, '');
    res.json({ share_url: `${base}/api/context/card/${token}`, share_token: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Orders ───────────────────────────────────────────────────────────────────

router.get('/orders', requireAuth, async (req, res) => {
  try {
    const partner = await getPartner(req.auth.userId);
    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const { data, error } = await supabase
      .from('household_orders')
      .select('*')
      .eq('household_id', partner.household_id)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ orders: data || [] });
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

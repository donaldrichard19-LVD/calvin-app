const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');

async function getHouseholdId(clerkUserId) {
  const { data } = await supabase
    .from('partners')
    .select('household_id')
    .eq('clerk_user_id', clerkUserId)
    .single();
  return data?.household_id;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    if (!householdId) return res.json({ alerts: [], meta: {} });

    const now = new Date().toISOString();

    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'active')
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('severity', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const severityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = (alerts || []).sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    const { data: lastRun } = await supabase
      .from('analysis_runs')
      .select('completed_at')
      .eq('household_id', householdId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      alerts: sorted,
      meta: {
        total: sorted.length,
        high_count: sorted.filter((a) => a.severity === 'high').length,
        medium_count: sorted.filter((a) => a.severity === 'medium').length,
        low_count: sorted.filter((a) => a.severity === 'low').length,
        last_analysis_at: lastRun?.completed_at || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:alertId/dismiss', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', householdId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:alertId/snooze', requireAuth, async (req, res) => {
  try {
    const { hours = 24 } = req.body;
    const householdId = await getHouseholdId(req.auth.userId);
    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'snoozed', snoozed_until: snoozedUntil, updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', householdId);
    if (error) throw error;
    res.json({ success: true, snoozed_until: snoozedUntil });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:alertId/resolve', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', householdId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    if (!householdId) return res.json([]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('household_id', householdId)
      .in('status', ['dismissed', 'resolved'])
      .gte('updated_at', sevenDaysAgo)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

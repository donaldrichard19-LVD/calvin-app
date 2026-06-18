const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { sendSMS } = require('../lib/twilio');

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

    // Dedup pass 1: per type+exact-title cluster keep the highest-severity alert.
    const clusterBest = new Map();
    for (const a of sorted) {
      const key = `${a.type}::${(a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
      const best = clusterBest.get(key);
      if (!best || (severityOrder[a.severity] ?? 3) < (severityOrder[best.severity] ?? 3)) {
        clusterBest.set(key, a);
      }
    }
    const exactDeduped = sorted.filter((a) => {
      const key = `${a.type}::${(a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
      return clusterBest.get(key)?.id === a.id;
    });

    // Dedup pass 2: fuzzy word-set overlap within same alert type (catches near-identical titles).
    // sorted is already highest-severity-first, so the first alert in each fuzzy cluster wins.
    function titleWordSet(title) {
      const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'with', 'has', 'have', 'are', 'this', 'that', 'from', 'not']);
      return new Set(
        (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
      );
    }
    const fuzzyKept = [];
    const fuzzyKeptWords = [];
    for (const a of exactDeduped) {
      const aWords = titleWordSet(a.title);
      const aEventIds = new Set((a.source_data?.event_ids || []).filter(Boolean));
      const isDup = fuzzyKept.some((b, i) => {
        if (b.type !== a.type || aWords.size === 0 || fuzzyKeptWords[i].size === 0) return false;
        // Different calendar events are never duplicates regardless of title similarity
        const bEventIds = new Set((b.source_data?.event_ids || []).filter(Boolean));
        if (aEventIds.size > 0 && bEventIds.size > 0) {
          if (![...aEventIds].some((id) => bEventIds.has(id))) return false;
        }
        const overlap = [...aWords].filter((w) => fuzzyKeptWords[i].has(w)).length;
        return overlap / Math.max(aWords.size, fuzzyKeptWords[i].size) >= 0.5;
      });
      if (!isDup) {
        fuzzyKept.push(a);
        fuzzyKeptWords.push(aWords);
      }
    }
    const deduped = fuzzyKept;

    const { data: lastRun } = await supabase
      .from('analysis_runs')
      .select('completed_at')
      .eq('household_id', householdId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      alerts: deduped,
      meta: {
        total: deduped.length,
        high_count: deduped.filter((a) => a.severity === 'high').length,
        medium_count: deduped.filter((a) => a.severity === 'medium').length,
        low_count: deduped.filter((a) => a.severity === 'low').length,
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

    const { data: alert, error: fetchErr } = await supabase
      .from('alerts')
      .select('id, title, relevant_to')
      .eq('id', req.params.alertId)
      .eq('household_id', householdId)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', householdId);
    if (error) throw error;

    // SMS the other partner if the alert was shared with both
    if (alert?.relevant_to?.length > 1) {
      const { data: me } = await supabase
        .from('partners')
        .select('id, display_name')
        .eq('clerk_user_id', req.auth.userId)
        .single();

      const { data: allPartners } = await supabase
        .from('partners')
        .select('id, display_name, phone')
        .eq('household_id', householdId);

      const other = allPartners?.find((p) => p.id !== me?.id);
      if (other?.phone) {
        const resolverName = me?.display_name || 'Your partner';
        await sendSMS(
          other.phone,
          `✅ ${resolverName} resolved: "${alert.title}"`
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    if (!householdId) return res.json({ active: 0, resolved_30d: 0, dismissed_30d: 0, resolution_rate: 0, by_type: {}, by_severity: {} });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: all } = await supabase
      .from('alerts')
      .select('id, type, severity, status, title, created_at, updated_at')
      .eq('household_id', householdId)
      .order('updated_at', { ascending: false });

    const alerts = all || [];
    const active     = alerts.filter((a) => a.status === 'active');
    const resolved30 = alerts.filter((a) => a.status === 'resolved'  && a.updated_at >= thirtyDaysAgo);
    const dismissed30 = alerts.filter((a) => a.status === 'dismissed' && a.updated_at >= thirtyDaysAgo);
    const created30  = alerts.filter((a) => a.created_at >= thirtyDaysAgo);

    const by_type = {};
    for (const a of alerts) by_type[a.type] = (by_type[a.type] || 0) + 1;

    const by_severity = {};
    for (const a of active) by_severity[a.severity] = (by_severity[a.severity] || 0) + 1;

    const recentResolved = resolved30.slice(0, 5).map((a) => ({
      id: a.id, title: a.title, type: a.type, severity: a.severity, updated_at: a.updated_at,
    }));

    res.json({
      active: active.length,
      resolved_30d: resolved30.length,
      dismissed_30d: dismissed30.length,
      created_30d: created30.length,
      resolution_rate: created30.length > 0 ? Math.round((resolved30.length / created30.length) * 100) : 0,
      by_type,
      by_severity,
      recent_resolved: recentResolved,
    });
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

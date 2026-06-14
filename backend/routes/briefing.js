const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { sendSMS } = require('../lib/twilio');
const { cancelCalendarEvent } = require('../lib/google');

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

    // Dedup: per type+title cluster keep the highest-severity alert.
    // Catches DB-level duplicates that survived the analysis run cleanup.
    const clusterBest = new Map();
    for (const a of sorted) {
      const key = `${a.type}::${(a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
      const best = clusterBest.get(key);
      if (!best || (severityOrder[a.severity] ?? 3) < (severityOrder[best.severity] ?? 3)) {
        clusterBest.set(key, a);
      }
    }
    const deduped = sorted.filter((a) => {
      const key = `${a.type}::${(a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
      return clusterBest.get(key)?.id === a.id;
    });

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

router.post('/:alertId/cancel-event', requireAuth, async (req, res) => {
  try {
    const householdId = await getHouseholdId(req.auth.userId);
    if (!householdId) return res.status(400).json({ error: 'No household found' });

    const { data: alert } = await supabase
      .from('alerts')
      .select('id, type, source_data')
      .eq('id', req.params.alertId)
      .eq('household_id', householdId)
      .eq('type', 'event_cancel_confirm')
      .in('status', ['active', 'snoozed'])
      .single();

    if (!alert) return res.status(404).json({ error: 'Confirmation alert not found' });

    const { event_id, partner, partner_id, integration_id, account_email } = alert.source_data || {};
    if (!event_id || !partner_id) return res.status(400).json({ error: 'Alert is missing event metadata' });

    // A partner may have multiple connected Google accounts now — resolve the
    // exact account this event came from when we have that info (tagged at
    // alert-creation time in jobs/analyze.js), falling back to "first active
    // account for this partner" for older alerts created before this field existed.
    let integration = null;
    if (integration_id) {
      ({ data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration_id)
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .maybeSingle());
    }
    if (!integration && account_email) {
      ({ data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('partner_id', partner_id)
        .eq('provider', 'google')
        .eq('account_email', account_email)
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .maybeSingle());
    }
    if (!integration) {
      const { data: candidates } = await supabase
        .from('integrations')
        .select('*')
        .eq('partner_id', partner_id)
        .eq('provider', 'google')
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .order('connected_at', { ascending: true })
        .limit(1);
      integration = candidates?.[0] || null;
    }

    if (!integration) return res.status(400).json({ error: 'Google Calendar not connected for this partner' });

    await cancelCalendarEvent(integration, event_id);

    const { data: action } = await supabase
      .from('calendar_actions')
      .insert({
        household_id: householdId,
        event_id,
        event_title: alert.source_data?.event_title || null,
        partner: partner || null,
        partner_id,
        trigger_email_subject: alert.source_data?.trigger_email_subject || null,
        trigger_reason: alert.source_data?.trigger_reason || null,
      })
      .select()
      .single();

    const cancelFingerprint = `auto-cancel-${event_id}`;
    const { data: cancelAlert } = await supabase
      .from('alerts')
      .insert({
        household_id: householdId,
        type: 'event_auto_cancelled',
        severity: 'low',
        title: `Cancelled: ${alert.source_data?.event_title || 'Calendar event'}`,
        summary: `You confirmed this was already done and Calvin removed it from your calendar. "${alert.source_data?.trigger_email_subject || ''}"`,
        action_hint: 'Tap Undo if this was a mistake.',
        source_data: {
          event_id,
          partner,
          trigger_email_subject: alert.source_data?.trigger_email_subject || null,
          action_id: action?.id || null,
          // Carry the resolved account forward so Undo (calendar.js /restore)
          // targets the same Google account this event was cancelled on.
          integration_id: integration.id,
          account_email: integration.account_email,
        },
        relevant_to: [partner],
        status: 'active',
      })
      .select()
      .single();

    if (cancelAlert) {
      await supabase.from('alert_fingerprints').upsert(
        { household_id: householdId, fingerprint: cancelFingerprint, alert_id: cancelAlert.id },
        { onConflict: 'household_id,fingerprint' }
      );
      if (action) {
        await supabase.from('calendar_actions').update({ alert_id: cancelAlert.id }).eq('id', action.id);
      }
    }

    await supabase
      .from('alerts')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', alert.id);

    console.log(`[briefing] User confirmed cancel of event ${event_id} for household ${householdId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[briefing/cancel-event]', err.message);
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

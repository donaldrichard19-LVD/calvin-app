require('dotenv').config();
const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, getRecentEmails, cancelCalendarEvent } = require('../lib/google');
const { analyzeHousehold } = require('../lib/anthropic');
const { sendAlertSMS } = require('../lib/twilio');

async function runAnalysisForHousehold(householdId) {
  const { data: run, error: runErr } = await supabase
    .from('analysis_runs')
    .insert({ household_id: householdId, status: 'running' })
    .select()
    .single();
  if (runErr) throw runErr;

  try {
    const { data: partners } = await supabase
      .from('partners')
      .select('id, display_name, phone')
      .eq('household_id', householdId);

    if (!partners?.length) throw new Error('No partners found');

    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .not('access_token', 'is', null);

    const [partnerA, partnerB] = partners;
    const getIntegration = (partnerId) =>
      integrations?.find((i) => i.partner_id === partnerId) || null;

    const intA = getIntegration(partnerA?.id);
    const intB = partnerB ? getIntegration(partnerB.id) : null;

    const [eventsA, emailsA, eventsB, emailsB] = await Promise.all([
      intA ? getCalendarEvents(intA).catch((err) => { console.error('[analyze] eventsA failed:', err.message); return []; }) : Promise.resolve([]),
      intA ? getRecentEmails(intA).catch((err) => { console.error('[analyze] emailsA failed:', err.message); return []; })  : Promise.resolve([]),
      intB ? getCalendarEvents(intB).catch((err) => { console.error('[analyze] eventsB failed:', err.message); return []; }) : Promise.resolve([]),
      intB ? getRecentEmails(intB).catch((err) => { console.error('[analyze] emailsB failed:', err.message); return []; })  : Promise.resolve([]),
    ]);

    console.log(`[analyze] Data fetched — eventsA:${eventsA.length} emailsA:${emailsA.length} eventsB:${eventsB.length} emailsB:${emailsB.length}`);

    await Promise.all([
      intA && supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', intA.id),
      intB && supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', intB.id),
    ].filter(Boolean));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [fingerprintsResult, activeAlertsResult, householdResult, dismissedResult] = await Promise.all([
      supabase.from('alert_fingerprints').select('fingerprint').eq('household_id', householdId),
      supabase.from('alerts').select('id, type, title, summary, action_hint, source_data, status').eq('household_id', householdId).in('status', ['active', 'snoozed']),
      supabase.from('households').select('id, name').eq('id', householdId).single(),
      supabase.from('alerts').select('type, title').eq('household_id', householdId).eq('status', 'dismissed').gte('updated_at', thirtyDaysAgo),
    ]);

    const existingFingerprints = (fingerprintsResult.data || []).map((f) => f.fingerprint);
    const activeAlerts = activeAlertsResult.data || [];

    const dismissedAlerts = dismissedResult.data || [];
    const dismissalsByType = dismissedAlerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    const dismissalPatterns = {
      by_type: dismissalsByType,
      recent_titles: dismissedAlerts.slice(0, 30).map((a) => a.title),
    };

    const context = {
      household: { id: householdId, name: householdResult.data?.name },
      partnerA: { id: partnerA?.id, display_name: partnerA?.display_name, email: intA?.account_email },
      partnerB: partnerB ? { id: partnerB.id, display_name: partnerB.display_name, email: intB?.account_email } : null,
      partnerA_events: eventsA,
      partnerB_events: eventsB,
      partnerA_emails: emailsA,
      partnerB_emails: emailsB,
      existing_alert_fingerprints: existingFingerprints,
      existing_active_alerts: activeAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        summary: a.summary,
        action_hint: a.action_hint,
        source_data: a.source_data,
        status: a.status,
      })),
      dismissal_patterns: dismissalPatterns,
      current_time: new Date().toISOString(),
      timezone: 'America/New_York',
    };

    console.log(`[analyze] Existing fingerprints: ${existingFingerprints.length}, active alerts: ${activeAlerts.length}`);
    const { alerts, resolveIds, deleteEvents, confirmEvents } = await analyzeHousehold(context);
    console.log(`[analyze] Claude returned ${alerts.length} new alerts, ${resolveIds.length} to auto-resolve, ${deleteEvents.length} events to cancel, ${confirmEvents.length} to confirm`);
    if (alerts.length) console.log('[analyze] New:', alerts.map((a) => `${a.severity}:${a.fingerprint}`));

    let created = 0;
    const smsAlerts = [];
    const activeTitles = new Set(activeAlerts.map((a) => `${a.type}::${a.title?.toLowerCase()}`));

    // Build a set of event/email IDs already covered by active alerts
    const activeEventIds = new Set();
    const activeEmailIds = new Set();
    for (const a of activeAlerts) {
      (a.source_data?.event_ids || []).forEach((id) => activeEventIds.add(id));
      (a.source_data?.email_ids || []).forEach((id) => activeEmailIds.add(id));
    }

    for (const alert of alerts) {
      const fp = alert.fingerprint || alert._md5;
      if (existingFingerprints.includes(fp)) { console.log(`[analyze] Skipping duplicate fingerprint: ${fp}`); continue; }

      const titleKey = `${alert.type}::${alert.title?.toLowerCase()}`;
      if (activeTitles.has(titleKey)) { console.log(`[analyze] Skipping duplicate active title: ${alert.title}`); continue; }

      // Skip if any referenced event/email is already covered by an active alert
      const newEventIds = alert.source_data?.event_ids || [];
      const newEmailIds = alert.source_data?.email_ids || [];
      const overlapsEvent = newEventIds.some((id) => activeEventIds.has(id));
      const overlapsEmail = newEmailIds.some((id) => activeEmailIds.has(id));
      if (overlapsEvent || overlapsEmail) { console.log(`[analyze] Skipping — source already covered by active alert: ${alert.title}`); continue; }

      const { data: inserted, error: insertErr } = await supabase
        .from('alerts')
        .insert({
          household_id: householdId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          summary: alert.summary,
          detail: alert.detail || null,
          source_data: alert.source_data || {},
          action_hint: alert.action_hint,
          relevant_to: alert.relevant_to || [],
          status: 'active',
          expires_at: alert.expires_at || null,
        })
        .select()
        .single();

      if (insertErr) continue;

      activeTitles.add(titleKey);
      newEventIds.forEach((id) => activeEventIds.add(id));
      newEmailIds.forEach((id) => activeEmailIds.add(id));
      await supabase.from('alert_fingerprints').upsert(
        { household_id: householdId, fingerprint: fp, alert_id: inserted.id },
        { onConflict: 'household_id,fingerprint' }
      );

      created++;
      if (alert.severity === 'high' || alert.severity === 'medium') smsAlerts.push(alert);
    }

    if (smsAlerts.length > 0 && partners.some((p) => p.phone)) {
      for (const sa of smsAlerts) {
        await sendAlertSMS(partners, sa.title, sa.severity);
      }
    }

    const now = new Date().toISOString();

    // Auto-resolve alerts whose recommended actions are now completed
    let autoResolved = 0;
    if (resolveIds.length > 0) {
      const { data: toResolve } = await supabase
        .from('alerts')
        .select('id')
        .in('id', resolveIds)
        .eq('household_id', householdId)
        .in('status', ['active', 'snoozed']);

      if (toResolve?.length) {
        const safeIds = toResolve.map((a) => a.id);
        await supabase.from('alerts').update({ status: 'resolved', updated_at: now }).in('id', safeIds);
        // Remove fingerprints so the issue can re-surface if it re-occurs
        await supabase.from('alert_fingerprints').delete().in('alert_id', safeIds);
        autoResolved = safeIds.length;
        console.log(`[analyze] Auto-resolved ${autoResolved} alerts`);
      }
    }

    // Soft-cancel calendar events whose underlying activities are confirmed complete
    let cancelledEvents = 0;

    // Guard against duplicates within this run and against already-active undo alerts
    const activeCancelledEventIds = new Set(
      activeAlerts
        .filter((a) => a.type === 'event_auto_cancelled')
        .map((a) => a.source_data?.event_id)
        .filter(Boolean)
    );
    const processedEventIds = new Set(); // tracks event_ids handled this run

    for (const ev of deleteEvents) {
      const integration = ev.partner === 'partnerB' ? intB : intA;
      const partnerRecord = ev.partner === 'partnerB' ? partnerB : partnerA;
      if (!integration || !partnerRecord) continue;

      const cancelFingerprint = `auto-cancel-${ev.event_id}`;
      if (existingFingerprints.includes(cancelFingerprint)) continue;
      if (activeCancelledEventIds.has(ev.event_id)) continue;
      if (processedEventIds.has(ev.event_id)) continue;

      try {
        await cancelCalendarEvent(integration, ev.event_id);
        cancelledEvents++;
        processedEventIds.add(ev.event_id);
        console.log(`[analyze] Soft-cancelled event ${ev.event_id} (${ev.partner}): ${ev.reason}`);

        const { data: action } = await supabase
          .from('calendar_actions')
          .insert({
            household_id: householdId,
            event_id: ev.event_id,
            event_title: ev.event_title || null,
            partner: ev.partner,
            partner_id: partnerRecord.id,
            trigger_email_subject: ev.email_subject || null,
            trigger_reason: ev.reason || null,
          })
          .select()
          .single();

        const { data: cancelAlert } = await supabase
          .from('alerts')
          .insert({
            household_id: householdId,
            type: 'event_auto_cancelled',
            severity: 'low',
            title: `Cancelled: ${ev.event_title || 'Calendar event'}`,
            summary: `Calvin detected this was already done and removed it from your calendar. "${ev.email_subject || ev.reason}"`,
            action_hint: 'Tap Undo if this was a mistake.',
            source_data: {
              event_id: ev.event_id,
              partner: ev.partner,
              trigger_email_subject: ev.email_subject || null,
              action_id: action?.id || null,
            },
            relevant_to: [ev.partner],
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
      } catch (err) {
        console.error(`[analyze] Failed to cancel event ${ev.event_id}:`, err.message);
      }
    }

    // Surface low-confidence matches as confirmation alerts
    for (const ev of confirmEvents) {
      if (processedEventIds.has(ev.event_id)) continue; // already auto-cancelled this run
      if (activeCancelledEventIds.has(ev.event_id)) continue; // already have an undo alert

      const confirmFingerprint = `confirm-cancel-${ev.event_id}`;
      if (existingFingerprints.includes(confirmFingerprint)) continue;

      const confirmPartnerRecord = ev.partner === 'partnerB' ? partnerB : partnerA;

      try {
        const { data: confirmAlert } = await supabase
          .from('alerts')
          .insert({
            household_id: householdId,
            type: 'event_cancel_confirm',
            severity: 'low',
            title: `Should Calvin cancel: ${ev.event_title || 'Calendar event'}?`,
            summary: `An email suggests this event may already be done: "${ev.email_subject}". ${ev.reason}`,
            action_hint: 'Tap "Cancel it" to remove from calendar, or dismiss to keep it.',
            source_data: {
              event_id: ev.event_id,
              partner: ev.partner,
              partner_id: confirmPartnerRecord?.id || null,
              trigger_email_subject: ev.email_subject || null,
              trigger_reason: ev.reason || null,
            },
            relevant_to: [ev.partner],
            status: 'active',
          })
          .select()
          .single();

        if (confirmAlert) {
          await supabase.from('alert_fingerprints').upsert(
            { household_id: householdId, fingerprint: confirmFingerprint, alert_id: confirmAlert.id },
            { onConflict: 'household_id,fingerprint' }
          );
        }
        console.log(`[analyze] Created confirm-cancel alert for event ${ev.event_id}`);
      } catch (err) {
        console.error(`[analyze] Failed to create confirm alert for ${ev.event_id}:`, err.message);
      }
    }

    const { data: expired } = await supabase
      .from('alerts')
      .select('id')
      .eq('household_id', householdId)
      .eq('status', 'active')
      .lt('expires_at', now)
      .not('expires_at', 'is', null);

    const resolvedCount = expired?.length || 0;
    if (resolvedCount > 0) {
      await supabase
        .from('alerts')
        .update({ status: 'resolved', updated_at: now })
        .in('id', expired.map((e) => e.id));
    }

    await supabase
      .from('analysis_runs')
      .update({
        status: 'completed',
        completed_at: now,
        alerts_created: created,
        alerts_resolved: resolvedCount + autoResolved,
      })
      .eq('id', run.id);

    console.log(`[analyze] Household ${householdId}: ${created} new, ${autoResolved} auto-resolved, ${resolvedCount} expired, ${cancelledEvents} events soft-cancelled`);
    return run.id;
  } catch (err) {
    console.error(`[analyze] Household ${householdId} failed:`, err.message);
    await supabase
      .from('analysis_runs')
      .update({ status: 'failed', error: err.message, completed_at: new Date().toISOString() })
      .eq('id', run.id);
    throw err;
  }
}

async function runAllHouseholds() {
  try {
    const { data: households } = await supabase
      .from('households')
      .select('id');

    if (!households?.length) return;

    for (const h of households) {
      const { data: activeIntegrations } = await supabase
        .from('integrations')
        .select('id')
        .eq('household_id', h.id)
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .limit(1);

      if (!activeIntegrations?.length) continue;

      runAnalysisForHousehold(h.id).catch((err) =>
        console.error(`[analyze] Error for household ${h.id}:`, err.message)
      );
    }
  } catch (err) {
    console.error('[analyze] runAllHouseholds error:', err.message);
  }
}

function startCronJob() {
  const interval = parseInt(process.env.ANALYSIS_INTERVAL_MINUTES || '30', 10);
  const cronExpr = `*/${interval} * * * *`;
  console.log(`[analyze] Cron job starting, interval: every ${interval} minutes`);
  cron.schedule(cronExpr, () => {
    console.log('[analyze] Analysis run starting for all households...');
    runAllHouseholds();
  });
}

module.exports = { startCronJob, runAnalysisForHousehold };

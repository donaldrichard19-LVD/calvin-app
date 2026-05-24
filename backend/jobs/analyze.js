require('dotenv').config();
const cron = require('node-cron');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, getRecentEmails, cancelCalendarEvent } = require('../lib/google');
const { analyzeHousehold } = require('../lib/anthropic');
const { sendAlertSMS } = require('../lib/twilio');

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

// Deterministic fingerprint so the same issue isn't re-created across runs
// even when Claude phrases its fingerprint string differently.
function computeFingerprint(alert) {
  const parts = [alert.type || 'unknown'];
  const eventIds = (alert.source_data?.event_ids || []).filter(Boolean).sort();
  const emailIds = (alert.source_data?.email_ids || []).filter(Boolean).sort();
  const dates    = (alert.source_data?.dates    || []).filter(Boolean).sort();

  if (eventIds.length) {
    parts.push('ev:' + eventIds.join(','));
  } else if (emailIds.length) {
    parts.push('em:' + emailIds.join(','));
  } else if (dates.length) {
    parts.push('dt:' + dates.join(','));
    parts.push('to:' + (alert.relevant_to || []).sort().join(','));
  } else {
    const normTitle = (alert.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    parts.push('t:' + normTitle);
    parts.push('to:' + (alert.relevant_to || []).sort().join(','));
  }

  return crypto.createHash('md5').update(parts.join('|')).digest('hex');
}

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

    let intA = getIntegration(partnerA?.id);
    let intB = partnerB ? getIntegration(partnerB.id) : null;

    // Fallback: integrations created before household_id was backfilled may be missing it
    const missingIds = [
      !intA && partnerA?.id,
      !intB && partnerB?.id,
    ].filter(Boolean);
    if (missingIds.length) {
      const { data: fallbacks } = await supabase
        .from('integrations')
        .select('*')
        .in('partner_id', missingIds)
        .eq('is_active', true)
        .not('access_token', 'is', null);
      for (const fb of fallbacks || []) {
        await supabase.from('integrations').update({ household_id: householdId }).eq('id', fb.id);
        if (!intA && fb.partner_id === partnerA?.id) intA = fb;
        if (!intB && partnerB && fb.partner_id === partnerB.id) intB = fb;
      }
      if (fallbacks?.length) console.log(`[analyze] Backfilled household_id for ${fallbacks.length} integration(s)`);
    }

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
    const [fingerprintsResult, activeAlertsResult, householdResult, dismissedResult, resolvedResult] = await Promise.all([
      supabase.from('alert_fingerprints').select('fingerprint').eq('household_id', householdId),
      supabase.from('alerts').select('id, type, title, summary, action_hint, source_data, status, created_at, severity, relevant_to').eq('household_id', householdId).in('status', ['active', 'snoozed']),
      supabase.from('households').select('id, name').eq('id', householdId).single(),
      supabase.from('alerts').select('type, title').eq('household_id', householdId).eq('status', 'dismissed').gte('updated_at', thirtyDaysAgo),
      supabase.from('alerts').select('type, title, updated_at').eq('household_id', householdId).eq('status', 'resolved').gte('updated_at', thirtyDaysAgo).order('updated_at', { ascending: false }).limit(50),
    ]);

    const existingFingerprints = (fingerprintsResult.data || []).map((f) => f.fingerprint);
    const activeAlerts = activeAlertsResult.data || [];

    // Returns the set of meaningful words from an alert title for fuzzy deduplication
    function titleWordSet(title) {
      const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'with', 'has', 'have', 'are', 'this', 'that', 'from', 'not']);
      return new Set(
        (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
      );
    }
    const activeTitleWordSets = activeAlerts.map((a) => ({ alert: a, words: titleWordSet(a.title) }));

    // Clean up any existing duplicate active alerts — keep highest severity per type+title cluster
    {
      const bestByCluster = new Map(); // clusterKey → alert with highest severity
      for (const a of activeAlerts) {
        const wordKey = [...titleWordSet(a.title)].sort().join(',');
        const clusterKey = `${a.type}::${wordKey}`;
        const current = bestByCluster.get(clusterKey);
        if (!current || (SEVERITY_RANK[a.severity] || 0) > (SEVERITY_RANK[current.severity] || 0)) {
          bestByCluster.set(clusterKey, a);
        }
      }
      const dupIds = activeAlerts.filter((a) => {
        const wordKey = [...titleWordSet(a.title)].sort().join(',');
        const best = bestByCluster.get(`${a.type}::${wordKey}`);
        return best && best.id !== a.id;
      }).map((a) => a.id);
      if (dupIds.length) {
        await supabase.from('alerts').update({ status: 'dismissed', updated_at: new Date().toISOString() }).in('id', dupIds);
        console.log(`[analyze] Cleaned up ${dupIds.length} existing duplicate active alert(s)`);
      }
    }

    // Dismiss duplicate event_auto_cancelled alerts — keep the newest, dismiss the rest
    const cancelAlertsByEventId = {};
    for (const a of activeAlerts) {
      if (a.type !== 'event_auto_cancelled') continue;
      const eid = a.source_data?.event_id;
      if (!eid) continue;
      if (!cancelAlertsByEventId[eid]) cancelAlertsByEventId[eid] = [];
      cancelAlertsByEventId[eid].push(a);
    }
    const staleIds = [];
    for (const alerts of Object.values(cancelAlertsByEventId)) {
      if (alerts.length <= 1) continue;
      alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      staleIds.push(...alerts.slice(1).map((a) => a.id));
    }
    if (staleIds.length) {
      await supabase.from('alerts').update({ status: 'dismissed', updated_at: new Date().toISOString() }).in('id', staleIds);
      console.log(`[analyze] Cleaned up ${staleIds.length} duplicate event_auto_cancelled alert(s)`);
    }

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
      resolved_topics: (resolvedResult.data || []).map((a) => ({
        type: a.type,
        title: a.title,
        resolved_at: a.updated_at,
      })),
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

    // Build maps from event/email IDs → existing alert so we can upgrade severity
    const activeEventIdToAlert = new Map();
    const activeEmailIdToAlert = new Map();
    const activeFpToAlert = new Map();
    for (const a of activeAlerts) {
      (a.source_data?.event_ids || []).forEach((id) => activeEventIdToAlert.set(id, a));
      (a.source_data?.email_ids || []).forEach((id) => activeEmailIdToAlert.set(id, a));
    }
    for (const a of activeAlerts) {
      const fp = computeFingerprint(a);
      activeFpToAlert.set(fp, a);
      if (a.fingerprint) activeFpToAlert.set(a.fingerprint, a);
    }
    const activeEventIds = new Set(activeEventIdToAlert.keys());
    const activeEmailIds = new Set(activeEmailIdToAlert.keys());

    async function upgradeAlertSeverityIfNeeded(existingAlert, newSeverity) {
      if ((SEVERITY_RANK[newSeverity] || 0) > (SEVERITY_RANK[existingAlert.severity] || 0)) {
        await supabase.from('alerts').update({ severity: newSeverity, updated_at: new Date().toISOString() }).eq('id', existingAlert.id);
        console.log(`[analyze] Upgraded alert ${existingAlert.id} severity ${existingAlert.severity} → ${newSeverity}`);
        existingAlert.severity = newSeverity;
      }
    }

    for (const alert of alerts) {
      const fp = computeFingerprint(alert);

      // Fingerprint match — upgrade severity if needed, then skip insert
      const fpMatch = activeFpToAlert.get(fp) || (alert.fingerprint ? activeFpToAlert.get(alert.fingerprint) : null);
      if (fpMatch) {
        await upgradeAlertSeverityIfNeeded(fpMatch, alert.severity);
        console.log(`[analyze] Skipping duplicate fingerprint: ${fp}`);
        continue;
      }
      if (existingFingerprints.includes(fp) || (alert.fingerprint && existingFingerprints.includes(alert.fingerprint))) {
        console.log(`[analyze] Skipping fingerprint already in DB: ${fp}`);
        continue;
      }

      const titleKey = `${alert.type}::${alert.title?.toLowerCase()}`;
      if (activeTitles.has(titleKey)) { console.log(`[analyze] Skipping duplicate active title: ${alert.title}`); continue; }

      // Fuzzy title overlap — catches same issue rephrased slightly between runs
      const newWords = titleWordSet(alert.title);
      if (newWords.size > 0) {
        const fuzzyMatch = activeTitleWordSets.find(({ alert: a, words }) => {
          if (a.type !== alert.type || words.size === 0) return false;
          const overlap = [...newWords].filter((w) => words.has(w)).length;
          return overlap / Math.max(newWords.size, words.size) >= 0.6;
        });
        if (fuzzyMatch) {
          await upgradeAlertSeverityIfNeeded(fuzzyMatch.alert, alert.severity);
          console.log(`[analyze] Skipping — fuzzy title match with existing: "${alert.title}"`);
          continue;
        }
      }

      // Source ID overlap — upgrade severity if needed, then skip insert
      const newEventIds = alert.source_data?.event_ids || [];
      const newEmailIds = alert.source_data?.email_ids || [];
      const overlappingAlert =
        newEventIds.map((id) => activeEventIdToAlert.get(id)).find(Boolean) ||
        newEmailIds.map((id) => activeEmailIdToAlert.get(id)).find(Boolean);
      if (overlappingAlert) {
        await upgradeAlertSeverityIfNeeded(overlappingAlert, alert.severity);
        console.log(`[analyze] Skipping — source already covered by active alert: ${alert.title}`);
        continue;
      }

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
      newEventIds.forEach((id) => { activeEventIds.add(id); activeEventIdToAlert.set(id, inserted); });
      newEmailIds.forEach((id) => { activeEmailIds.add(id); activeEmailIdToAlert.set(id, inserted); });
      activeFpToAlert.set(fp, inserted);
      existingFingerprints.push(fp); // prevent duplicates within the same run
      const fpRows = [{ household_id: householdId, fingerprint: fp, alert_id: inserted.id }];
      if (alert.fingerprint && alert.fingerprint !== fp) {
        fpRows.push({ household_id: householdId, fingerprint: alert.fingerprint, alert_id: inserted.id });
      }
      await supabase.from('alert_fingerprints').upsert(fpRows, { onConflict: 'household_id,fingerprint' });

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

require('dotenv').config();
const cron = require('node-cron');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, getRecentEmails, cancelCalendarEvent } = require('../lib/google');
const { analyzeHousehold } = require('../lib/anthropic');
const { sendAlertSMS } = require('../lib/twilio');

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

function trimEmail(email) {
  const addrMatch = (email.from || '').match(/<([^>]+)>/);
  const from = addrMatch ? addrMatch[1] : (email.from || '');
  return {
    id: email.id,
    subject: email.subject,
    from,
    date: email.date,
    snippet: (email.snippet || '').slice(0, 150),
    unread: (email.labels || []).includes('UNREAD'),
    important: (email.labels || []).includes('IMPORTANT'),
    ...(email.body ? { body: email.body.slice(0, 500) } : {}),
  };
}

function trimCalendarEvent(event) {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    ...(event.location ? { location: event.location } : {}),
    ...(event.attendees?.length ? { attendees: event.attendees } : {}),
    ...(event.description ? { description: event.description.slice(0, 200) } : {}),
    isAllDay: event.isAllDay,
    // Tag the event with its source integration so Claude can echo it back in
    // delete_events / confirm_events — lets us resolve the correct account's
    // API client when a partner has multiple connected Gmail accounts.
    ...(event._integration_id ? { integration_id: event._integration_id } : {}),
    ...(event._account_email ? { account_email: event._account_email } : {}),
  };
}

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
    // A partner may now have MULTIPLE active Google integrations (up to 3).
    // Collect all of them per partner rather than assuming exactly one.
    const getIntegrations = (partnerId) =>
      (integrations || []).filter((i) => i.partner_id === partnerId);

    let integrationsA = getIntegrations(partnerA?.id);
    let integrationsB = partnerB ? getIntegrations(partnerB.id) : [];

    // Fallback: integrations created before household_id was backfilled may be missing it
    const missingIds = [
      integrationsA.length === 0 && partnerA?.id,
      integrationsB.length === 0 && partnerB?.id,
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
        if (fb.partner_id === partnerA?.id) integrationsA.push(fb);
        if (partnerB && fb.partner_id === partnerB.id) integrationsB.push(fb);
      }
      if (fallbacks?.length) console.log(`[analyze] Backfilled household_id for ${fallbacks.length} integration(s)`);
    }

    // Keep `intA`/`intB` as the "primary" integration for each partner —
    // used for backwards-compatible bits (e.g. context.partnerA.email fallback,
    // and as the default account-resolution target). Account resolution for
    // auto-cancel now happens per-event via integration_id (see deleteEvents loop).
    const intA = integrationsA[0] || null;
    const intB = integrationsB[0] || null;

    // Fetch calendar events + emails from EVERY active integration per partner,
    // in parallel, with per-integration error isolation so one expired/invalid
    // token doesn't block the partner's other accounts or the overall run.
    async function fetchAllForPartner(integrationsList, label) {
      const results = await Promise.all(
        integrationsList.map(async (intg) => {
          const [events, emails] = await Promise.all([
            getCalendarEvents(intg).catch((err) => {
              console.error(`[analyze] events${label} failed for ${intg.account_email}:`, err.message);
              return [];
            }),
            getRecentEmails(intg).catch((err) => {
              console.error(`[analyze] emails${label} failed for ${intg.account_email}:`, err.message);
              return [];
            }),
          ]);
          return { integration: intg, events, emails };
        })
      );
      return {
        events: results.flatMap((r) => r.events.map((e) => ({ ...e, _integration_id: r.integration.id, _account_email: r.integration.account_email }))),
        emails: results.flatMap((r) => r.emails),
        synced: results.map((r) => r.integration),
      };
    }

    const [forA, forB] = await Promise.all([
      fetchAllForPartner(integrationsA, 'A'),
      fetchAllForPartner(integrationsB, 'B'),
    ]);

    const eventsA = forA.events, emailsA = forA.emails;
    const eventsB = forB.events, emailsB = forB.emails;

    console.log(`[analyze] Data fetched — eventsA:${eventsA.length} (${integrationsA.length} acct) emailsA:${emailsA.length} eventsB:${eventsB.length} (${integrationsB.length} acct) emailsB:${emailsB.length}`);

    // Update last_synced_at for every successfully-synced active integration,
    // not just the first one per partner.
    const syncedAt = new Date().toISOString();
    await Promise.all(
      [...forA.synced, ...forB.synced].map((intg) =>
        supabase.from('integrations').update({ last_synced_at: syncedAt }).eq('id', intg.id)
      )
    );

    // Lookup map for resolving an event back to its source integration
    // (used by the auto-cancel loop below).
    const integrationsById = new Map(
      [...integrationsA, ...integrationsB].map((i) => [i.id, i])
    );
    const integrationsByEmail = new Map(
      [...integrationsA, ...integrationsB].map((i) => [i.account_email, i])
    );

    const thirtyDaysAgo  = new Date(Date.now() -  30 * 86400000).toISOString();
    const ninetyDaysAgo  = new Date(Date.now() -  90 * 86400000).toISOString();
    const [fingerprintsResult, activeAlertsResult, householdResult, dismissedResult, resolvedResult] = await Promise.all([
      supabase.from('alert_fingerprints').select('fingerprint, alert_id').eq('household_id', householdId),
      supabase.from('alerts').select('id, type, title, summary, action_hint, source_data, status, created_at, severity, relevant_to').eq('household_id', householdId).in('status', ['active', 'snoozed']),
      supabase.from('households').select('id, name').eq('id', householdId).single(),
      supabase.from('alerts').select('type, title').eq('household_id', householdId).eq('status', 'dismissed').gte('updated_at', thirtyDaysAgo),
      supabase.from('alerts').select('type, title, source_data, relevant_to, updated_at').eq('household_id', householdId).eq('status', 'resolved').gte('updated_at', ninetyDaysAgo).order('updated_at', { ascending: false }).limit(100),
    ]);

    const activeAlertIds = new Set((activeAlertsResult.data || []).map((a) => a.id));
    // Only treat a fingerprint as a blocker if its alert is still active/snoozed,
    // OR if it's an auto-cancel/confirm fingerprint (to prevent double-cancellation).
    const existingFingerprints = (fingerprintsResult.data || [])
      .filter((f) => {
        if (f.fingerprint.startsWith('auto-cancel-') || f.fingerprint.startsWith('confirm-cancel-')) return true;
        return f.alert_id && activeAlertIds.has(f.alert_id);
      })
      .map((f) => f.fingerprint);
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
      // Each partner may have multiple connected Gmail accounts now — pass the
      // full list of emails. (Cross-account duplicate event/email dedup is
      // explicitly out of scope for this pass — see BACKLOG.md.)
      partnerA: { id: partnerA?.id, display_name: partnerA?.display_name, emails: integrationsA.map((i) => i.account_email) },
      partnerB: partnerB ? { id: partnerB.id, display_name: partnerB.display_name, emails: integrationsB.map((i) => i.account_email) } : null,
      partnerA_events: eventsA.map(trimCalendarEvent),
      partnerB_events: eventsB.map(trimCalendarEvent),
      partnerA_emails: emailsA.map(trimEmail),
      partnerB_emails: emailsB.map(trimEmail),
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
        source_data: a.source_data || {},
        relevant_to: a.relevant_to || [],
        resolved_at: a.updated_at,
      })),
      current_time: new Date().toISOString(),
      timezone: 'America/New_York',
    };

    const contextBytes = Buffer.byteLength(JSON.stringify(context));
    console.log(`[analyze] Existing fingerprints: ${existingFingerprints.length}, active alerts: ${activeAlerts.length}, context payload: ${(contextBytes / 1024).toFixed(1)}KB`);
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

    const STALE_TIME_WORDS = /\b(today|tonight|tomorrow|this week|this morning|this afternoon|this evening|right now|soon|upcoming)\b/i;

    async function upgradeAlertSeverityIfNeeded(existingAlert, newSeverity) {
      if ((SEVERITY_RANK[newSeverity] || 0) > (SEVERITY_RANK[existingAlert.severity] || 0)) {
        await supabase.from('alerts').update({ severity: newSeverity, updated_at: new Date().toISOString() }).eq('id', existingAlert.id);
        console.log(`[analyze] Upgraded alert ${existingAlert.id} severity ${existingAlert.severity} → ${newSeverity}`);
        existingAlert.severity = newSeverity;
      }
    }

    async function refreshStaleTitle(existingAlert, newAlert) {
      const existingHasStaleWords = STALE_TIME_WORDS.test(existingAlert.title || '');
      const newIsClean = newAlert.title && !STALE_TIME_WORDS.test(newAlert.title);
      if (existingHasStaleWords && newIsClean) {
        await supabase.from('alerts').update({ title: newAlert.title, updated_at: new Date().toISOString() }).eq('id', existingAlert.id);
        console.log(`[analyze] Refreshed stale title for alert ${existingAlert.id}: "${existingAlert.title}" → "${newAlert.title}"`);
        existingAlert.title = newAlert.title;
      }
    }

    for (const alert of alerts) {
      const fp = computeFingerprint(alert);

      // Fingerprint match — upgrade severity and fix stale relative-time titles, then skip insert
      const fpMatch = activeFpToAlert.get(fp) || (alert.fingerprint ? activeFpToAlert.get(alert.fingerprint) : null);
      if (fpMatch) {
        await upgradeAlertSeverityIfNeeded(fpMatch, alert.severity);
        await refreshStaleTitle(fpMatch, alert);
        if (alert.links?.length > 0) {
          await supabase.from('alerts').update({ links: alert.links, updated_at: new Date().toISOString() }).eq('id', fpMatch.id);
        }
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
          await refreshStaleTitle(fuzzyMatch.alert, alert);
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
          links: alert.links || [],
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

    // Resolve which Google account's API client to use for a given delete/confirm
    // entry. Claude echoes back integration_id/account_email (tagged onto each
    // event in trimCalendarEvent); fall back to the partner's primary/first
    // active integration for backwards compatibility if those are absent.
    function resolveIntegration(ev) {
      if (ev.integration_id && integrationsById.has(ev.integration_id)) {
        return integrationsById.get(ev.integration_id);
      }
      if (ev.account_email && integrationsByEmail.has(ev.account_email)) {
        return integrationsByEmail.get(ev.account_email);
      }
      return ev.partner === 'partnerB' ? intB : intA;
    }

    for (const ev of deleteEvents) {
      const integration = resolveIntegration(ev);
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
              // Carry the resolved account forward so Undo (calendar.js
              // /restore) can target the exact same Google account even when
              // a partner has multiple connected Gmail accounts.
              integration_id: integration.id,
              account_email: integration.account_email,
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
      const confirmIntegration = resolveIntegration(ev);

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
              // Carry the resolved account so the "Cancel it" confirmation
              // route (briefing.js /cancel-event) targets the right Google
              // account when a partner has multiple connected accounts.
              integration_id: confirmIntegration?.id || null,
              account_email: confirmIntegration?.account_email || null,
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

function buildCronExpr(intervalMinutes) {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  const hours = Math.round(intervalMinutes / 60);
  return `0 */${hours} * * *`;
}

function startCronJob() {
  const interval = parseInt(process.env.ANALYSIS_INTERVAL_MINUTES || '720', 10);
  const cronExpr = buildCronExpr(interval);
  console.log(`[analyze] Cron job starting, interval: every ${interval} minutes`);
  cron.schedule(cronExpr, () => {
    console.log('[analyze] Analysis run starting for all households...');
    runAllHouseholds();
  });
}

module.exports = { startCronJob, runAnalysisForHousehold };

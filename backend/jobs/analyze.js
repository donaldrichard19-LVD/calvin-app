require('dotenv').config();
const cron = require('node-cron');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, getRecentEmails } = require('../lib/google');
const { analyzeHousehold } = require('../lib/anthropic');
const { sendAlertSMS } = require('../lib/twilio');
const { detectOrderEmail, isDuplicateOrder } = require('../lib/orderDetection');
const { reconcileOrders, createReconciliationAlerts } = require('../lib/orderReconciliation');
const { SHUTDOWN, blocked } = require('../lib/killSwitch');

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };
const TYPE_PRIORITY = { coverage_gap: 6, deadline: 5, action_needed: 4, upcoming_commitment: 3, unshared_context: 2, heads_up: 1 };

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
    ...(email.body ? { body: email.body.slice(0, 800) } : {}),
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
    ...(event.description ? { description: event.description.slice(0, 500) } : {}),
    ...(event.hangoutLink ? { hangoutLink: event.hangoutLink } : {}),
    ...(event.organizer ? { organizer: event.organizer } : {}),
    isAllDay: event.isAllDay,
    ...(event._integration_id ? { integration_id: event._integration_id } : {}),
    ...(event._account_email ? { account_email: event._account_email } : {}),
  };
}

// Hash of raw calendar+email data — used to skip the Claude call when nothing changed.
function computeInputHash(eventsA, emailsA, eventsB, emailsB) {
  const stableEvent = (e) => `${e.id}|${e.title}|${e.start}|${e.end}|${e.location || ''}|${e.hangoutLink || ''}`;
  const stableEmail = (e) => `${e.id}|${e.subject}|${e.snippet || ''}`;
  const parts = [
    eventsA.map(stableEvent).sort().join(';;'),
    emailsA.map(stableEmail).sort().join(';;'),
    eventsB.map(stableEvent).sort().join(';;'),
    emailsB.map(stableEmail).sort().join(';;'),
  ];
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
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

async function backFillCalendarLinks(householdId, eventsA, eventsB) {
  const eventDataMap = new Map([...eventsA, ...eventsB].map((e) => [e.id, e]));
  const { data: linklessAlerts } = await supabase
    .from('alerts')
    .select('id, source_data, links')
    .eq('household_id', householdId)
    .in('status', ['active', 'snoozed']);
  for (const a of (linklessAlerts || [])) {
    if (a.links?.length > 0) continue;
    const eventId = a.source_data?.event_ids?.[0];
    if (!eventId) continue;
    const ev = eventDataMap.get(eventId);
    if (!ev) continue;
    const url = ev.hangoutLink ||
      (ev.description || '').match(/https?:\/\/[^\s<"]+zoom[^\s<"]+|https?:\/\/meet\.google\.com\/[^\s<"]+/)?.[0] ||
      null;
    if (!url) continue;
    const label = url.includes('zoom') ? 'Join Zoom call' : 'Join Google Meet';
    await supabase.from('alerts').update({
      links: [{ url, label, source: ev.organizer || '', source_type: 'calendar' }],
      updated_at: new Date().toISOString(),
    }).eq('id', a.id);
    console.log(`[analyze] Back-filled calendar link for alert ${a.id}`);
  }
}

async function runAnalysisForHousehold(householdId) {
  if (SHUTDOWN) { blocked(`analysis run for household ${householdId}`); return null; }
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

    // ── Order detection pass ─────────────────────────────────────────────
    const allEmailsWithPartner = [
      ...emailsA.map((e) => ({ ...e, _partner_id: partnerA?.id })),
      ...emailsB.map((e) => ({ ...e, _partner_id: partnerB?.id })),
    ];
    const detectedOrders = [];
    for (const email of allEmailsWithPartner) {
      const detected = detectOrderEmail(email);
      if (!detected) continue;
      const dup = await isDuplicateOrder(supabase, householdId, detected.email_id, detected.merchant_name, detected.order_total, detected.order_date);
      if (dup) continue;
      await supabase.from('detected_order_emails').upsert({
        household_id: householdId,
        partner_id: email._partner_id || null,
        ...detected,
      }, { onConflict: 'household_id,email_id' });
      detectedOrders.push(detected);
    }
    if (detectedOrders.length) console.log(`[analyze] Detected ${detectedOrders.length} new order email(s)`);

    // ── Order reconciliation ──────────────────────────────────────────────
    if (detectedOrders.length) {
      try {
        const recons = await reconcileOrders(supabase, householdId, detectedOrders);
        if (recons.length) {
          await createReconciliationAlerts(supabase, householdId, recons, partners);
          console.log(`[analyze] Created ${recons.length} order reconciliation(s)`);
        }
      } catch (err) {
        console.error('[analyze] Order reconciliation error:', err.message);
      }
    }

    const thirtyDaysAgo  = new Date(Date.now() -  30 * 86400000).toISOString();
    const ninetyDaysAgo  = new Date(Date.now() -  90 * 86400000).toISOString();
    const [fingerprintsResult, activeAlertsResult, householdResult, dismissedResult, resolvedResult] = await Promise.all([
      supabase.from('alert_fingerprints').select('fingerprint, alert_id').eq('household_id', householdId),
      supabase.from('alerts').select('id, type, title, summary, action_hint, source_data, status, created_at, severity, relevant_to').eq('household_id', householdId).in('status', ['active', 'snoozed']),
      supabase.from('households').select('id, name, context, last_input_hash, last_analyzed_email_ids').eq('id', householdId).single(),
      supabase.from('alerts').select('type, title').eq('household_id', householdId).eq('status', 'dismissed').gte('updated_at', thirtyDaysAgo),
      supabase.from('alerts').select('type, title, source_data, relevant_to, updated_at').eq('household_id', householdId).eq('status', 'resolved').gte('updated_at', ninetyDaysAgo).order('updated_at', { ascending: false }).limit(20),
    ]);

    // Hash-based cache: skip Claude entirely when calendar+email data is unchanged
    const inputHash = computeInputHash(eventsA, emailsA, eventsB, emailsB);
    const storedHash = householdResult.data?.last_input_hash;
    if (storedHash && storedHash === inputHash) {
      console.log(`[analyze] Household ${householdId}: input unchanged — skipping Claude`);
      await backFillCalendarLinks(householdId, eventsA, eventsB);
      await supabase.from('analysis_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        alerts_created: 0,
        alerts_resolved: 0,
      }).eq('id', run.id);
      return run.id;
    }

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

    // Track all IDs dismissed during cleanup so the fuzzy pass skips them
    const cleanedUpIds = new Set();

    // Clean up any existing duplicate active alerts — keep highest severity per title cluster (cross-type)
    {
      function alertRank(a) { return (SEVERITY_RANK[a.severity] || 0) * 10 + (TYPE_PRIORITY[a.type] || 0); }
      const bestByCluster = new Map();
      for (const a of activeAlerts) {
        const wordKey = [...titleWordSet(a.title)].sort().join(',');
        if (!wordKey) continue;
        const current = bestByCluster.get(wordKey);
        if (!current || alertRank(a) > alertRank(current)) {
          bestByCluster.set(wordKey, a);
        }
      }
      const dupIds = activeAlerts.filter((a) => {
        const wordKey = [...titleWordSet(a.title)].sort().join(',');
        if (!wordKey) return false;
        const best = bestByCluster.get(wordKey);
        return best && best.id !== a.id;
      }).map((a) => a.id);
      if (dupIds.length) {
        await supabase.from('alerts').update({ status: 'dismissed', updated_at: new Date().toISOString() }).in('id', dupIds);
        console.log(`[analyze] Cleaned up ${dupIds.length} existing duplicate active alert(s)`);
        dupIds.forEach((id) => cleanedUpIds.add(id));
      }
    }

    // Fuzzy pairwise cleanup — catches near-duplicates with slightly different wording.
    // Sort highest-severity first so the best alert wins each cluster.
    {
      const remaining = activeAlerts.filter((a) => !cleanedUpIds.has(a.id));
      const kept = [];
      const keptWords = [];
      const fuzzyDupIds = [];
      for (const a of [...remaining].sort((x, y) => (SEVERITY_RANK[y.severity] || 0) - (SEVERITY_RANK[x.severity] || 0))) {
        const aWords = titleWordSet(a.title);
        const aEventIds = new Set((a.source_data?.event_ids || []).filter(Boolean));
        const isDup = kept.some((b, i) => {
          if (aWords.size === 0 || keptWords[i].size === 0) return false;
          const bEventIds = new Set((b.source_data?.event_ids || []).filter(Boolean));
          if (aEventIds.size > 0 && bEventIds.size > 0) {
            if (![...aEventIds].some((id) => bEventIds.has(id))) return false;
          }
          const overlap = [...aWords].filter((w) => keptWords[i].has(w)).length;
          return overlap / Math.max(aWords.size, keptWords[i].size) >= 0.5;
        });
        if (isDup) {
          fuzzyDupIds.push(a.id);
        } else {
          kept.push(a);
          keptWords.push(aWords);
        }
      }
      if (fuzzyDupIds.length) {
        await supabase.from('alerts').update({ status: 'dismissed', updated_at: new Date().toISOString() }).in('id', fuzzyDupIds);
        console.log(`[analyze] Cleaned up ${fuzzyDupIds.length} fuzzy-duplicate active alert(s)`);
        fuzzyDupIds.forEach((id) => cleanedUpIds.add(id));
      }
    }

    // ── Email delta filter ──────────────────────────────────────────────────
    // Only send new or alert-referenced emails to Claude. Read emails that
    // were present in the last run and aren't tied to an active alert are
    // omitted — Claude already decided they weren't worth alerting on.
    const prevEmailIds = new Set(householdResult.data?.last_analyzed_email_ids || []);
    const alertEmailIds = new Set(activeAlerts.flatMap((a) => a.source_data?.email_ids || []));

    function shouldSendToClaude(email) {
      if (!prevEmailIds.has(email.id)) return true;      // new since last run
      if (alertEmailIds.has(email.id)) return true;      // needed for resolve-check
      const labels = email.labels || [];
      if (labels.includes('UNREAD') || labels.includes('IMPORTANT')) return true;
      return false;
    }

    const claudeEmailsA = emailsA.filter(shouldSendToClaude);
    const claudeEmailsB = emailsB.filter(shouldSendToClaude);
    console.log(`[analyze] Email delta: ${claudeEmailsA.length}/${emailsA.length} A, ${claudeEmailsB.length}/${emailsB.length} B sent to Claude`);

    // ── Deterministic auto-resolve ──────────────────────────────────────────
    // Resolve an alert only when its referenced event IDs have ALL left the
    // calendar fetch AND every associated date is in the past. Future-dated
    // alerts are kept active even if the event ID is temporarily missing
    // (reschedule, sync lag, or event on a different connected account).
    const nowDate = new Date();
    const currentEventIdSet = new Set([...eventsA, ...eventsB].map((e) => e.id));
    const deterministicResolveIds = [];
    for (const alert of activeAlerts) {
      if (alert.type === 'event_auto_cancelled') continue;
      const eventIds = (alert.source_data?.event_ids || []).filter(Boolean);
      if (eventIds.length === 0) continue;
      if (!eventIds.every((id) => !currentEventIdSet.has(id))) continue;
      // Keep active if any referenced date is still in the future
      const dates = (alert.source_data?.dates || []).filter(Boolean);
      if (dates.some((d) => new Date(d) >= nowDate)) continue;
      deterministicResolveIds.push(alert.id);
    }

    // ── Email-based completion detection ───────────────────────────────────
    // For email-only alerts (no event_ids), check if a completion-confirmation
    // email has arrived from the same sender domain. Handles pickup/delivery
    // confirmations without waiting for the next Claude analysis.
    {
      const COMPLETION_RE = [
        /enjoy your (drive.?up|order|purchase)/i,
        /pick\s*up (confirmed|complete[d]?)/i,
        /has been (picked up|delivered|completed)/i,
        /order.*(picked up|delivered|completed)/i,
        /delivery (confirmed|complete[d]?)/i,
        /thank you for (your )?(visit|order|purchase|picking up)/i,
        /your order is complete/i,
      ];

      const allCurrentEmails = [...emailsA, ...emailsB];
      const emailById = new Map(allCurrentEmails.map((e) => [e.id, e]));

      for (const alert of activeAlerts) {
        if (alert.type === 'event_auto_cancelled') continue;
        const eventIds = (alert.source_data?.event_ids || []).filter(Boolean);
        if (eventIds.length > 0) continue;
        const sourceEmailIds = (alert.source_data?.email_ids || []).filter(Boolean);
        if (sourceEmailIds.length === 0) continue;

        const sourceDomains = new Set();
        for (const eid of sourceEmailIds) {
          const email = emailById.get(eid);
          if (email) {
            const domain = (email.from || '').match(/@([\w.-]+)/)?.[1]?.toLowerCase();
            if (domain) sourceDomains.add(domain);
          }
        }
        if (sourceDomains.size === 0) continue;

        const hasCompletion = allCurrentEmails.some((email) => {
          if (sourceEmailIds.includes(email.id)) return false;
          const domain = (email.from || '').match(/@([\w.-]+)/)?.[1]?.toLowerCase();
          if (!domain || !sourceDomains.has(domain)) return false;
          const text = `${email.subject || ''} ${email.snippet || ''}`;
          return COMPLETION_RE.some((p) => p.test(text));
        });

        if (hasCompletion) {
          deterministicResolveIds.push(alert.id);
          console.log(`[analyze] Email-completion auto-resolve: "${alert.title}"`);
        }
      }
    }

    if (deterministicResolveIds.length) {
      console.log(`[analyze] Deterministic auto-resolve: ${deterministicResolveIds.length} alert(s)`);
    }
    const deterministicResolveSet = new Set(deterministicResolveIds);

    const dismissedAlerts = dismissedResult.data || [];
    const dismissalsByType = dismissedAlerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    const dismissalPatterns = {
      by_type: dismissalsByType,
      recent_titles: dismissedAlerts.slice(0, 30).map((a) => a.title),
    };

    const walletCtx = householdResult.data?.context || {};
    const householdWallet = {};
    if (walletCtx.members?.length) householdWallet.members = walletCtx.members;
    if (walletCtx.routines?.length) householdWallet.routines = walletCtx.routines;
    if (walletCtx.preferences?.length) householdWallet.preferences = walletCtx.preferences;
    if (walletCtx.logistics?.length) householdWallet.logistics = walletCtx.logistics;
    if (walletCtx.notes) householdWallet.notes = walletCtx.notes;

    const context = {
      household: { id: householdId, name: householdResult.data?.name, ...Object.keys(householdWallet).length ? { context_wallet: householdWallet } : {} },
      // Each partner may have multiple connected Gmail accounts now — pass the
      // full list of emails. (Cross-account duplicate event/email dedup is
      // explicitly out of scope for this pass — see BACKLOG.md.)
      partnerA: { id: partnerA?.id, display_name: partnerA?.display_name, emails: integrationsA.map((i) => i.account_email) },
      partnerB: partnerB ? { id: partnerB.id, display_name: partnerB.display_name, emails: integrationsB.map((i) => i.account_email) } : null,
      partnerA_events: eventsA.map(trimCalendarEvent),
      partnerB_events: eventsB.map(trimCalendarEvent),
      // Delta-filtered: only new emails + emails referenced by active alerts
      partnerA_emails: claudeEmailsA.map(trimEmail),
      partnerB_emails: claudeEmailsB.map(trimEmail),
      existing_alert_fingerprints: existingFingerprints,
      // Exclude deterministically-resolved alerts so Claude doesn't waste tokens on them
      existing_active_alerts: activeAlerts.filter((a) => !deterministicResolveSet.has(a.id)).map((a) => ({
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
    console.log(`[analyze] Fingerprints: ${existingFingerprints.length}, active alerts: ${activeAlerts.length - deterministicResolveIds.length} to Claude, context: ${(contextBytes / 1024).toFixed(1)}KB`);
    const { alerts, resolveIds: claudeResolveIds } = await analyzeHousehold(context);
    // Filter Claude's resolves: block resolving any alert whose source_data dates are
    // all in the future — guards against Claude prematurely resolving upcoming_commitment
    // alerts just because the event is already on the calendar.
    const alertById = new Map(activeAlerts.map((a) => [a.id, a]));
    const filteredClaudeResolveIds = claudeResolveIds.filter((id) => {
      const alert = alertById.get(id);
      if (!alert) return true; // unknown alert — let it through
      const dates = (alert.source_data?.dates || []).filter(Boolean);
      if (dates.length === 0) return true; // no date info — let Claude decide
      const allFuture = dates.every((d) => new Date(d) >= nowDate);
      if (allFuture) {
        console.log(`[analyze] Blocked premature resolve of future-dated alert ${id}: "${alert.title}"`);
        return false;
      }
      return true;
    });
    // Merge deterministic resolves with Claude's resolves, deduplicated
    const resolveIds = [...new Set([...deterministicResolveIds, ...filteredClaudeResolveIds])];
    console.log(`[analyze] Claude returned ${alerts.length} new alerts, ${claudeResolveIds.length} to auto-resolve (+${deterministicResolveIds.length} deterministic)`);
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
        if (Array.isArray(alert.links)) {
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
          if (words.size === 0) return false;
          const overlap = [...newWords].filter((w) => words.has(w)).length;
          return overlap / Math.max(newWords.size, words.size) >= 0.5;
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

    // Back-fill links for active calendar-event alerts that still have empty links.
    await backFillCalendarLinks(householdId, eventsA, eventsB);

    // Persist the input hash and the full set of seen email IDs.
    // The email ID set powers the delta filter on the next run — only new
    // emails (not in this set) get forwarded to Claude.
    const allCurrentEmailIds = [...emailsA, ...emailsB].map((e) => e.id);
    await supabase.from('households').update({
      last_input_hash: inputHash,
      last_analyzed_email_ids: allCurrentEmailIds,
    }).eq('id', householdId);

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

    console.log(`[analyze] Household ${householdId}: ${created} new, ${autoResolved} auto-resolved, ${resolvedCount} expired`);
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
  if (SHUTDOWN) { blocked('analysis cron scheduling'); return; }
  const interval = parseInt(process.env.ANALYSIS_INTERVAL_MINUTES || '720', 10);
  const cronExpr = buildCronExpr(interval);
  console.log(`[analyze] Cron job starting, interval: every ${interval} minutes`);
  cron.schedule(cronExpr, () => {
    console.log('[analyze] Analysis run starting for all households...');
    runAllHouseholds();
  });
}

module.exports = { startCronJob, runAnalysisForHousehold };

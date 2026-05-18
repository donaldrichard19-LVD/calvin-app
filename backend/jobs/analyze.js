require('dotenv').config();
const cron = require('node-cron');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, getRecentEmails } = require('../lib/google');
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
    const { alerts, resolveIds } = await analyzeHousehold(context);
    console.log(`[analyze] Claude returned ${alerts.length} new alerts, ${resolveIds.length} to auto-resolve`);
    if (alerts.length) console.log('[analyze] New:', alerts.map((a) => `${a.severity}:${a.fingerprint}`));

    let created = 0;
    const smsAlerts = [];
    const activeTitles = new Set(activeAlerts.map((a) => `${a.type}::${a.title?.toLowerCase()}`));

    for (const alert of alerts) {
      const fp = alert.fingerprint || alert._md5;
      if (existingFingerprints.includes(fp)) { console.log(`[analyze] Skipping duplicate fingerprint: ${fp}`); continue; }

      const titleKey = `${alert.type}::${alert.title?.toLowerCase()}`;
      if (activeTitles.has(titleKey)) { console.log(`[analyze] Skipping duplicate active title: ${alert.title}`); continue; }

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

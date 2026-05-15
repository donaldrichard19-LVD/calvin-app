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
      intA ? getCalendarEvents(intA) : Promise.resolve([]),
      intA ? getRecentEmails(intA) : Promise.resolve([]),
      intB ? getCalendarEvents(intB) : Promise.resolve([]),
      intB ? getRecentEmails(intB) : Promise.resolve([]),
    ]);

    await Promise.all([
      intA && supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', intA.id),
      intB && supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', intB.id),
    ].filter(Boolean));

    const { data: fingerprints } = await supabase
      .from('alert_fingerprints')
      .select('fingerprint')
      .eq('household_id', householdId);

    const existingFingerprints = (fingerprints || []).map((f) => f.fingerprint);

    const { data: household } = await supabase
      .from('households')
      .select('id, name')
      .eq('id', householdId)
      .single();

    const context = {
      household: { id: householdId, name: household?.name },
      partnerA: { id: partnerA?.id, display_name: partnerA?.display_name, email: intA?.account_email },
      partnerB: partnerB ? { id: partnerB.id, display_name: partnerB.display_name, email: intB?.account_email } : null,
      partnerA_events: eventsA,
      partnerB_events: eventsB,
      partnerA_emails: emailsA,
      partnerB_emails: emailsB,
      existing_alert_fingerprints: existingFingerprints,
      current_time: new Date().toISOString(),
      timezone: 'America/New_York',
    };

    const alerts = await analyzeHousehold(context);

    let created = 0;
    const highAlerts = [];

    for (const alert of alerts) {
      const fp = alert.fingerprint || alert._md5;
      if (existingFingerprints.includes(fp)) continue;

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

      await supabase.from('alert_fingerprints').upsert(
        { household_id: householdId, fingerprint: fp, alert_id: inserted.id },
        { onConflict: 'household_id,fingerprint' }
      );

      created++;
      if (alert.severity === 'high') highAlerts.push(alert);
    }

    if (highAlerts.length > 0 && partners.some((p) => p.phone)) {
      for (const ha of highAlerts) {
        await sendAlertSMS(partners, ha.title);
      }
    }

    const now = new Date().toISOString();
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
        alerts_resolved: resolvedCount,
      })
      .eq('id', run.id);

    console.log(`[analyze] Household ${householdId}: ${created} new alerts, ${resolvedCount} resolved`);
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

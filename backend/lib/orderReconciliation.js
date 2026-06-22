'use strict';

const crypto = require('crypto');

const DIRECT_MATCH_MERCHANTS = {
  'doordash.com': 'Ask DoorDash',
  'amazon.com': 'Amazon Rufus',
  'instacart.com': 'ChatGPT',
  'ubereats.com': 'ChatGPT',
};

async function reconcileOrders(supabase, householdId, detectedOrders) {
  if (!detectedOrders.length) return [];

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: accessLogs } = await supabase
    .from('share_access_log')
    .select('*')
    .eq('household_id', householdId)
    .gte('created_at', twentyFourHoursAgo)
    .not('assistant_name', 'is', null);

  const logs = accessLogs || [];
  const reconciliations = [];

  for (const order of detectedOrders) {
    const { data: existing } = await supabase
      .from('order_reconciliations')
      .select('id')
      .eq('household_id', householdId)
      .eq('email_id', order.email_id)
      .limit(1);
    if (existing?.length) continue;

    let match = null;

    // Direct match: known merchant domain → known AI assistant, within 24h
    const directAssistant = order.sender_domain ? DIRECT_MATCH_MERCHANTS[order.sender_domain] : null;
    if (directAssistant) {
      const directLog = logs.find((l) =>
        l.assistant_name === directAssistant &&
        new Date(l.created_at) >= new Date(Date.now() - 24 * 3600000)
      );
      if (directLog) {
        match = { log: directLog, confidence: 'high' };
      }
    }

    // Indirect match: any AI access within 2h window before order
    if (!match) {
      const twoHoursBefore = new Date(new Date(order.order_date).getTime() - 2 * 3600000);
      const indirectLog = logs.find((l) => {
        const logTime = new Date(l.created_at);
        return logTime >= twoHoursBefore && logTime <= new Date(order.order_date);
      });
      if (indirectLog) {
        match = { log: indirectLog, confidence: 'medium' };
      }
    }

    if (match) {
      const { data: inserted } = await supabase
        .from('order_reconciliations')
        .insert({
          household_id: householdId,
          email_id: order.email_id,
          access_log_id: match.log.id,
          assistant_name: match.log.assistant_name,
          merchant_name: order.merchant_name,
          confidence: match.confidence,
          order_total: order.order_total,
          order_description: order.item_summary,
        })
        .select()
        .single();
      if (inserted) reconciliations.push(inserted);
    }
  }

  return reconciliations;
}

async function createReconciliationAlerts(supabase, householdId, reconciliations, partners) {
  if (!reconciliations.length) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: dismissed } = await supabase
    .from('alerts')
    .select('id')
    .eq('household_id', householdId)
    .eq('type', 'ai_order_reconciled')
    .eq('status', 'dismissed')
    .gte('updated_at', thirtyDaysAgo);
  const dismissCount = dismissed?.length || 0;
  if (dismissCount >= 3) {
    console.log(`[reconcile] Skipping ai_order_reconciled alerts — ${dismissCount} dismissed in 30d`);
    return;
  }

  const { data: existingFps } = await supabase
    .from('alert_fingerprints')
    .select('fingerprint')
    .eq('household_id', householdId);
  const fpSet = new Set((existingFps || []).map((f) => f.fingerprint));

  const relevantTo = (partners || []).map((_, i) => i === 0 ? 'partnerA' : 'partnerB');

  for (const rec of reconciliations) {
    const fingerprint = crypto.createHash('md5')
      .update(`ai_order_reconciled|${rec.email_id}|${rec.access_log_id}`)
      .digest('hex');

    if (fpSet.has(fingerprint)) continue;

    const totalText = rec.order_total ? ` ($${rec.order_total.toFixed(2)})` : '';
    const title = `${rec.assistant_name} may have placed a ${rec.merchant_name} order${totalText}`;
    const evidence = `${rec.assistant_name} accessed your household context, then a ${rec.merchant_name} order confirmation arrived.`;
    const body = rec.confidence === 'high'
      ? `High confidence: ${rec.assistant_name} accessed your context and a matching ${rec.merchant_name} order was confirmed.`
      : `${rec.assistant_name} was active before this ${rec.merchant_name} order appeared.`;

    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        household_id: householdId,
        type: 'ai_order_reconciled',
        severity: 'low',
        title,
        summary: body,
        body,
        status: 'active',
        source: 'system',
        relevant_to: relevantTo,
        source_data: {
          evidence_text: evidence,
          confidence: rec.confidence,
          assistant_name: rec.assistant_name,
          merchant_name: rec.merchant_name,
          order_total: rec.order_total,
          order_description: rec.order_description,
          email_id: rec.email_id,
          access_log_id: rec.access_log_id,
          reconciliation_id: rec.id,
        },
      })
      .select()
      .single();

    if (alert) {
      await supabase
        .from('alert_fingerprints')
        .upsert({ household_id: householdId, fingerprint, alert_id: alert.id }, { onConflict: 'household_id,fingerprint' });
      fpSet.add(fingerprint);

      await supabase
        .from('order_reconciliations')
        .update({ alert_id: alert.id })
        .eq('id', rec.id);
    }
  }
}

module.exports = { reconcileOrders, createReconciliationAlerts };

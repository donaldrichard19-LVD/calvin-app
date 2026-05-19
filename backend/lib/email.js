'use strict';
const { Resend } = require('resend');
const { supabase } = require('./supabase');
const { getCalendarEvents } = require('./google');

function getClient() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  return new Resend(process.env.RESEND_API_KEY);
}

function buildHtml({ type, dateStr, alerts, partnerA, partnerB, todayA, todayB }) {
  const severityColor = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
  const severityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };

  const alertRows = alerts.slice(0, 8).map((a) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:${severityColor[a.severity]}22;color:${severityColor[a.severity]}">
          ${severityLabel[a.severity]}
        </span>
        <div style="margin-top:4px;font-size:14px;color:#1e293b;font-weight:500">${a.title}</div>
        ${a.body ? `<div style="margin-top:2px;font-size:13px;color:#64748b">${a.body}</div>` : ''}
      </td>
    </tr>`).join('');

  const calRow = (name, events) => {
    if (!events.length) return `<div style="font-size:13px;color:#94a3b8">${name}: nothing scheduled today</div>`;
    return `<div style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">${name}</div>
      ${events.map((e) => {
        const t = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        return `<div style="font-size:14px;color:#1e293b;padding:3px 0">${t ? `<span style="color:#64748b;min-width:60px;display:inline-block">${t}</span>` : ''}${e.summary || 'Event'}</div>`;
      }).join('')}
    </div>`;
  };

  const high = alerts.filter((a) => a.severity === 'high').length;
  const previewText = alerts.length
    ? `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}${high ? ` · ${high} high priority` : ''}`
    : 'All clear — no active alerts';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${previewText}</div>
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <!-- Header -->
    <div style="background:#0f172a;padding:24px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">Calvin</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:2px">${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'} · ${dateStr}</div>
    </div>

    <div style="padding:24px 32px">
      <!-- Alerts section -->
      ${alerts.length === 0
        ? `<div style="text-align:center;padding:24px 0">
            <div style="font-size:32px">✅</div>
            <div style="font-size:16px;font-weight:600;color:#1e293b;margin-top:8px">All clear!</div>
            <div style="font-size:14px;color:#64748b;margin-top:4px">No active alerts for your household.</div>
           </div>`
        : `<div style="margin-bottom:24px">
            <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">
              Active Alerts (${alerts.length})
            </div>
            <table style="width:100%;border-collapse:collapse">${alertRows}</table>
            ${alerts.length > 8 ? `<div style="font-size:13px;color:#94a3b8;margin-top:8px">+${alerts.length - 8} more alerts</div>` : ''}
           </div>`
      }

      <!-- Calendar section -->
      ${(todayA.length || todayB.length) ? `
      <div style="border-top:1px solid #f1f5f9;padding-top:20px">
        <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Today's Schedule</div>
        ${calRow(partnerA, todayA)}
        ${calRow(partnerB, todayB)}
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #f1f5f9">
      <div style="font-size:12px;color:#94a3b8;text-align:center">Sent by Calvin · Your family coordination assistant</div>
    </div>
  </div>
</body>
</html>`;
}

async function sendDigestEmail(householdId, type = 'daily') {
  const resend = getClient();
  const now = new Date();
  const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

  const [{ data: alerts }, { data: partners }, { data: integrations }] = await Promise.all([
    supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('partners').select('id, display_name').eq('household_id', householdId),
    supabase.from('integrations').select('*').eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
  ]);

  const sortedAlerts = (alerts || []).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

  const [evA, evB] = await Promise.all([
    integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
    integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
  ]);

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const isToday = (e) => { const s = new Date(e.start?.dateTime || e.start?.date); return s >= todayStart && s <= todayEnd; };

  const dateStr = type === 'weekly'
    ? `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const html = buildHtml({
    type, dateStr,
    alerts: sortedAlerts,
    partnerA: partners?.[0]?.display_name || 'Partner 1',
    partnerB: partners?.[1]?.display_name || 'Partner 2',
    todayA: evA.filter(isToday),
    todayB: evB.filter(isToday),
  });

  // Collect all connected partner emails
  const toAddresses = (integrations || [])
    .filter((i) => i.account_email)
    .map((i) => i.account_email)
    .filter((v, i, a) => a.indexOf(v) === i); // dedupe

  if (!toAddresses.length) throw new Error('No connected email addresses found for this household');

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <onboarding@resend.dev>';
  const subject = type === 'weekly'
    ? `Calvin Weekly Digest — ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
    : `Calvin Daily Briefing — ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: toAddresses,
    subject,
    html,
  });

  if (error) throw new Error(error.message);
  return { id: data?.id, to: toAddresses };
}

module.exports = { sendDigestEmail };

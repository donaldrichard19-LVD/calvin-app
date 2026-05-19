'use strict';
const { Resend } = require('resend');
const { supabase } = require('./supabase');
const { getCalendarEvents } = require('./google');

const APP_URL = 'https://calvinai.co';

function getClient() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  return new Resend(process.env.RESEND_API_KEY);
}

function validDate(val) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtTime(e) {
  const d = validDate(e.start?.dateTime);
  if (d) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return 'All day';
}

function fmtDayLabel(date) {
  const now = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function buildWeekBuckets(eventsA, eventsB, partnerA, partnerB) {
  const now = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  const buckets = {};
  const addEvent = (e, name) => {
    const raw = e.start?.dateTime || e.start?.date;
    const start = validDate(raw);
    if (!start) return;
    const dayStart = new Date(start); dayStart.setHours(0,0,0,0);
    const daysAhead = Math.round((dayStart - today) / 86400000);
    if (daysAhead < 0 || daysAhead > 6) return;
    const key = dayStart.toDateString();
    if (!buckets[key]) buckets[key] = { date: dayStart, events: [] };
    buckets[key].events.push({ ...e, _partner: name });
  };
  eventsA.forEach((e) => addEvent(e, partnerA));
  eventsB.forEach((e) => addEvent(e, partnerB));
  return Object.values(buckets).sort((a, b) => a.date - b.date);
}

function buildHtml({ type, dateStr, alerts, partnerA, partnerB, weekBuckets }) {
  const severityColor = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
  const severityBg    = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
  const severityLabel = { high: 'High', medium: 'Medium', low: 'Low' };

  const high = alerts.filter((a) => a.severity === 'high').length;
  const med  = alerts.filter((a) => a.severity === 'medium').length;
  const totalEvents = weekBuckets.reduce((s, b) => s + b.events.length, 0);

  const previewText = alerts.length
    ? `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}${high ? ` · ${high} high priority` : ''} · ${totalEvents} event${totalEvents !== 1 ? 's' : ''} this week`
    : `All clear · ${totalEvents} event${totalEvents !== 1 ? 's' : ''} this week`;

  // Summary stat pills
  const statPill = (val, label, color) =>
    `<td style="padding:0 8px;text-align:center">
       <div style="font-size:22px;font-weight:700;color:${color}">${val}</div>
       <div style="font-size:11px;color:#94a3b8;margin-top:1px;white-space:nowrap">${label}</div>
     </td>`;

  const summaryBar = `
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr>
        ${statPill(alerts.length, 'Active alerts', alerts.length ? '#1e293b' : '#22c55e')}
        <td style="width:1px;background:#f1f5f9"></td>
        ${statPill(high, 'High priority', high ? '#ef4444' : '#94a3b8')}
        <td style="width:1px;background:#f1f5f9"></td>
        ${statPill(med, 'Medium', med ? '#f59e0b' : '#94a3b8')}
        <td style="width:1px;background:#f1f5f9"></td>
        ${statPill(totalEvents, 'Events this week', '#3b82f6')}
      </tr>
    </table>`;

  // Alert cards
  const alertCards = alerts.length === 0
    ? `<div style="text-align:center;padding:20px 0 28px">
         <div style="font-size:36px">✅</div>
         <div style="font-size:16px;font-weight:600;color:#1e293b;margin-top:10px">You're all clear!</div>
         <div style="font-size:14px;color:#64748b;margin-top:4px">No active alerts for your household.</div>
       </div>`
    : `<div style="margin-bottom:24px">
         <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Alerts</div>
         ${alerts.slice(0, 8).map((a) => `
           <div style="border:1px solid ${severityColor[a.severity]}33;background:${severityBg[a.severity]};border-radius:8px;padding:12px 14px;margin-bottom:8px">
             <div style="display:flex;align-items:center;gap:8px">
               <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${severityColor[a.severity]};color:#fff">
                 ${severityLabel[a.severity].toUpperCase()}
               </span>
               <span style="font-size:14px;font-weight:600;color:#1e293b">${a.title}</span>
             </div>
             ${a.body ? `<div style="margin-top:5px;font-size:13px;color:#475569;line-height:1.4">${a.body}</div>` : ''}
           </div>`).join('')}
         ${alerts.length > 8 ? `<div style="font-size:13px;color:#94a3b8;margin-top:4px;padding-left:2px">+${alerts.length - 8} more — open Calvin to see all</div>` : ''}
       </div>`;

  // Week calendar
  const calendarSection = weekBuckets.length === 0 ? '' : `
    <div style="border-top:1px solid #f1f5f9;padding-top:20px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px">This Week</div>
      ${weekBuckets.map((bucket) => `
        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#3b82f6;margin-bottom:6px">${fmtDayLabel(bucket.date)}</div>
          ${bucket.events.map((e) => `
            <div style="display:flex;align-items:baseline;gap:10px;padding:4px 0;border-bottom:1px solid #f8fafc">
              <span style="font-size:12px;color:#94a3b8;min-width:58px;flex-shrink:0">${fmtTime(e)}</span>
              <span style="font-size:13px;color:#1e293b;flex:1">${e.summary || 'Event'}</span>
              <span style="font-size:11px;color:#cbd5e1;flex-shrink:0">${e._partner}</span>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;

  // CTA button
  const ctaButton = `
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${APP_URL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;letter-spacing:-.1px">
        Open Calvin →
      </a>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;color:#f1f5f9">${previewText}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>
  <div style="max-width:580px;margin:32px auto 48px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px 24px">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">Calvin</div>
      <div style="font-size:13px;color:#64748b;margin-top:3px">${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'} &nbsp;·&nbsp; ${dateStr}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px 8px">
      ${summaryBar}
      ${alertCards}
      ${calendarSection}
      ${ctaButton}
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;margin-top:8px">
      <div style="font-size:11px;color:#cbd5e1;text-align:center">
        Sent by <a href="${APP_URL}" style="color:#94a3b8;text-decoration:none">Calvin</a> · Your family coordination assistant
      </div>
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

  const partnerA = partners?.[0]?.display_name || 'Partner 1';
  const partnerB = partners?.[1]?.display_name || 'Partner 2';

  const [evA, evB] = await Promise.all([
    integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
    integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
  ]);

  const dateStr = type === 'weekly'
    ? `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const weekBuckets = buildWeekBuckets(evA, evB, partnerA, partnerB);

  const html = buildHtml({ type, dateStr, alerts: sortedAlerts, partnerA, partnerB, weekBuckets });

  const toAddresses = (integrations || [])
    .filter((i) => i.account_email)
    .map((i) => i.account_email)
    .filter((v, i, a) => a.indexOf(v) === i);

  if (!toAddresses.length) throw new Error('No connected email addresses found for this household');

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <onboarding@resend.dev>';
  const subject = type === 'weekly'
    ? `Calvin Weekly Digest — ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
    : `Calvin Daily Briefing — ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;

  const { data, error } = await resend.emails.send({ from: fromAddress, to: toAddresses, subject, html });
  if (error) throw new Error(error.message);
  return { id: data?.id, to: toAddresses };
}

module.exports = { sendDigestEmail };

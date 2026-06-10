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

function buildHtml({ type, dateStr, alerts, autoResolvedAlerts, partnerName, weekBuckets }) {
  const firstName = partnerName ? partnerName.split(' ')[0] : 'there';
  const highCount = alerts.filter((a) => a.severity === 'high').length;
  const totalEvents = weekBuckets.reduce((s, b) => s + b.events.length, 0);

  const previewText = alerts.length
    ? `${highCount ? `${highCount} high priority · ` : ''}${alerts.length} alert${alerts.length !== 1 ? 's' : ''} need your attention today`
    : `You're all clear today`;

  const TYPE_STYLE = {
    schedule_conflict:    { emoji: '⚡', label: 'CONFLICT',        labelColor: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
    coverage_gap:         { emoji: '⚠️', label: 'COVERAGE GAP',   labelColor: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    dropped_commitment:   { emoji: '📋', label: 'ACTION NEEDED',  labelColor: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    invisible_dependency: { emoji: '🔗', label: 'DEPENDENCY',     labelColor: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    expiring_item:        { emoji: '⏰', label: 'DEADLINE',       labelColor: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    asymmetric_context:   { emoji: '💡', label: 'HEADS UP',       labelColor: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
    event_auto_cancelled: { emoji: '✅', label: 'AUTO-RESOLVED',  labelColor: '#16a34a', bg: '#ffffff', border: '#e5e7eb' },
    event_cancel_confirm: { emoji: '❓', label: 'CONFIRM CANCEL', labelColor: '#64748b', bg: '#ffffff', border: '#e5e7eb' },
  };

  const renderCard = (a) => {
    const style = a.status === 'auto_resolved'
      ? { emoji: '✅', label: 'AUTO-RESOLVED', labelColor: '#16a34a', bg: '#ffffff', border: '#e5e7eb' }
      : (TYPE_STYLE[a.type] || { emoji: '•', label: (a.type || 'ALERT').replace(/_/g, ' ').toUpperCase(), labelColor: '#64748b', bg: '#ffffff', border: '#e5e7eb' });
    const text = a.body || a.title;
    return `
      <div style="background:${style.bg};border:1.5px solid ${style.border};border-radius:12px;padding:14px 16px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:${style.labelColor};letter-spacing:.8px;margin-bottom:8px">${style.emoji} ${style.label}</div>
        <div style="font-size:14px;color:#1e293b;line-height:1.5">${text}</div>
      </div>`;
  };

  const orderedAlerts = [
    ...alerts.filter((a) => a.severity === 'high'),
    ...alerts.filter((a) => a.severity !== 'high'),
    ...(autoResolvedAlerts || []),
  ];

  const alertSection = orderedAlerts.length === 0
    ? `<div style="text-align:center;padding:32px 0 28px">
         <div style="font-size:36px">✅</div>
         <div style="font-size:16px;font-weight:600;color:#1e293b;margin-top:10px">You're all clear!</div>
         <div style="font-size:14px;color:#94a3b8;margin-top:4px">No active alerts for your household.</div>
       </div>`
    : `<div style="margin-bottom:8px">
         ${orderedAlerts.slice(0, 8).map(renderCard).join('')}
         ${orderedAlerts.length > 8 ? `<div style="font-size:13px;color:#94a3b8;margin-top:4px">+${orderedAlerts.length - 8} more — open Calvin to see all</div>` : ''}
       </div>`;

  const calendarSection = weekBuckets.length === 0 ? '' : `
    <div style="border-top:1px solid #f1f5f9;padding-top:20px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px">This Week</div>
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
  <div style="max-width:540px;margin:32px auto 48px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

    <!-- Body -->
    <div style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#3730a3;margin-bottom:6px">Good morning, ${firstName} 👋</div>
      <div style="font-size:14px;color:#94a3b8;margin-bottom:24px">Here's what needs your attention today.</div>
      ${alertSection}
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
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: alerts }, { data: autoResolved }, { data: partners }, { data: integrations }] = await Promise.all([
    supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'auto_resolved').gte('updated_at', since24h).order('updated_at', { ascending: false }),
    supabase.from('partners').select('id, display_name').eq('household_id', householdId),
    supabase.from('integrations').select('*').eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
  ]);

  const sortedAlerts = (alerts || []).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

  const partnerA = partners?.[0]?.display_name || 'Partner 1';
  const partnerB = partners?.[1]?.display_name || 'Partner 2';
  const partnerName = partnerA;

  const [evA, evB] = await Promise.all([
    integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
    integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
  ]);

  const dateStr = type === 'weekly'
    ? `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const weekBuckets = buildWeekBuckets(evA, evB, partnerA, partnerB);

  const html = buildHtml({ type, dateStr, alerts: sortedAlerts, autoResolvedAlerts: autoResolved || [], partnerName, weekBuckets });

  const toAddresses = (integrations || [])
    .filter((i) => i.account_email)
    .map((i) => i.account_email)
    .filter((v, i, a) => a.indexOf(v) === i);

  if (!toAddresses.length) throw new Error('No connected email addresses found for this household');

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <briefing@calvinai.co>';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const subject = type === 'weekly'
    ? `Your weekly family briefing – ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
    : `Your 7:30 AM family briefing – ${dayOfWeek}`;

  const { data, error } = await resend.emails.send({ from: fromAddress, to: toAddresses, subject, html });
  if (error) throw new Error(error.message);
  return { id: data?.id, to: toAddresses };
}

function buildWelcomeHtml({ firstName }) {
  const name = firstName ? `Hi ${firstName}` : 'Hi there';
  const APP_URL_LOCAL = 'https://calvinai.co';

  const valueProps = [
    {
      icon: '📅',
      heading: 'Conflicts caught before they happen',
      body: 'Calvin reads both calendars and both inboxes simultaneously — spotting double-bookings, missing childcare coverage, and back-to-back commitments with no travel time.',
    },
    {
      icon: '🔔',
      heading: 'Actionable alerts, not noise',
      body: 'Every alert is a specific, time-sensitive issue with a suggested next step. No generic reminders — just things that will cause a problem if nobody acts.',
    },
    {
      icon: '🔄',
      heading: 'Stays in sync with what you do',
      body: 'When you create an event, pick up an order, or complete a task, Calvin detects it and resolves the alert automatically. No manual housekeeping required.',
    },
    {
      icon: '🤝',
      heading: 'Both partners, one picture',
      body: 'Calvin flags when one partner knows something the other doesn\'t — medication schedules, vet appointments, pickups — so nothing falls through the cracks.',
    },
  ];

  const propCards = valueProps.map((p) => `
    <tr>
      <td style="padding:0 0 16px">
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;overflow:hidden">
          <tr>
            <td style="width:48px;padding:16px 0 16px 16px;vertical-align:top">
              <div style="font-size:24px;line-height:1">${p.icon}</div>
            </td>
            <td style="padding:16px 16px 16px 12px;vertical-align:top">
              <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">${p.heading}</div>
              <div style="font-size:13px;color:#475569;line-height:1.5">${p.body}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to Calvin</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;color:#f1f5f9">Welcome to Calvin — your family's coordination layer.&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>
  <div style="max-width:580px;margin:32px auto 48px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px 24px">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">Calvin</div>
      <div style="font-size:13px;color:#64748b;margin-top:3px">Your family's coordination layer</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px 24px">
      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">${name}, welcome aboard.</div>
      <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px">
        Calvin works quietly in the background — reading both partners' calendars and inboxes,
        detecting gaps and conflicts, and surfacing only the things that actually need attention.
        Here's what it does for you:
      </div>

      <!-- Value props -->
      <table style="width:100%;border-collapse:collapse">
        ${propCards}
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin:8px 0 24px">
        <a href="${APP_URL_LOCAL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;letter-spacing:-.1px">
          Get started →
        </a>
      </div>

      <div style="font-size:13px;color:#94a3b8;text-align:center;line-height:1.5">
        Connect your Google Calendar and Gmail to activate Calvin's analysis.<br>
        It takes about 60 seconds.
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #f1f5f9">
      <div style="font-size:11px;color:#cbd5e1;text-align:center">
        Sent by <a href="${APP_URL_LOCAL}" style="color:#94a3b8;text-decoration:none">Calvin</a> · Your family coordination assistant
      </div>
    </div>

  </div>
</body>
</html>`;
}

async function sendWelcomeEmail({ email, firstName }) {
  if (!email) throw new Error('email is required');
  const resend = getClient();
  const html = buildWelcomeHtml({ firstName });
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>';

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: 'Welcome to Calvin',
    html,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id };
}

module.exports = { sendDigestEmail, sendWelcomeEmail };

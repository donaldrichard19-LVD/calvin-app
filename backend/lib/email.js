'use strict';
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const { supabase } = require('./supabase');
const { getCalendarEvents } = require('./google');
const { SHUTDOWN, blocked } = require('./killSwitch');

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
  const highAlerts = alerts.filter((a) => a.severity === 'high');
  const mediumAlerts = alerts.filter((a) => a.severity === 'medium');
  const lowAlerts = alerts.filter((a) => a.severity !== 'high' && a.severity !== 'medium');

  const previewText = alerts.length
    ? `${highAlerts.length ? `${highAlerts.length} urgent · ` : ''}${alerts.length} alert${alerts.length !== 1 ? 's' : ''} need your attention today`
    : `You're all clear today`;

  const TYPE_EMOJI = {
    schedule_conflict: '⚡', coverage_gap: '⚠️', dropped_commitment: '📋',
    invisible_dependency: '🔗', expiring_item: '⏰', unshared_context: '🔔',
    asymmetric_context: '💡', event_auto_cancelled: '✅',
  };

  const SEVERITY_STYLE = {
    high:   { bg: '#FEE2E2', dot: '#EF4444', text: '#991B1B', border: '#EF444420' },
    medium: { bg: '#FEF3C7', dot: '#F59E0B', text: '#92400E', border: '#F59E0B20' },
    low:    { bg: '#DBEAFE', dot: '#3B82F6', text: '#1E40AF', border: '#3B82F620' },
  };

  const renderAlertRow = (a) => {
    const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low;
    const emoji = a.status === 'auto_resolved' ? '✅' : (TYPE_EMOJI[a.type] || '•');
    const title = a.title || a.body || 'Alert';
    const hint = a.action_hint || a.body || '';
    const link = (a.links || a.metadata?.links || [])[0];

    let linkBadge = '';
    if (link?.label && link?.url) {
      linkBadge = `
        <div style="margin-top:8px">
          <a href="${link.url}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${sev.text};background:${sev.dot}20;text-decoration:none;padding:4px 10px;border-radius:999px">
            ${link.label} ↗
          </a>
        </div>`;
    }

    return `
      <div style="background:${sev.bg};border:1px solid ${sev.border};border-radius:12px;padding:12px 16px;margin-bottom:10px">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="width:24px;vertical-align:top;padding-top:2px;font-size:14px">${emoji}</td>
          <td style="vertical-align:top;padding-left:8px">
            <div style="font-size:13px;font-weight:600;color:#1F2937;line-height:1.4">${title}</div>
            <div style="font-size:12px;color:#6B7280;line-height:1.5;margin-top:4px">${hint}</div>
            ${linkBadge}
          </td>
        </tr></table>
      </div>`;
  };

  const renderSection = (label, sectionAlerts, severity) => {
    if (!sectionAlerts.length) return '';
    const sev = SEVERITY_STYLE[severity] || SEVERITY_STYLE.low;
    return `
      <div style="margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>
          <td style="width:10px;vertical-align:middle;padding-right:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${sev.dot}"></div>
          </td>
          <td style="vertical-align:middle;padding-right:8px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${sev.text}">${label}</span>
          </td>
          <td style="vertical-align:middle"><div style="height:1px;background:#E5E7EB"></div></td>
        </tr></table>
        ${sectionAlerts.slice(0, 5).map(renderAlertRow).join('')}
      </div>`;
  };

  const autoResolved = (autoResolvedAlerts || []).map(a => ({ ...a, severity: 'low' }));

  const statsBar = `
    <table style="width:100%;border-collapse:collapse;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="text-align:center;padding:12px 0">
          <table style="border-collapse:collapse;margin:0 auto"><tr>
            <td style="padding:0 12px;vertical-align:middle">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#EF4444;vertical-align:middle"></span>
              <span style="font-size:13px;font-weight:600;color:#991B1B;margin-left:6px;vertical-align:middle">${highAlerts.length} urgent</span>
            </td>
            <td style="width:1px;padding:0"><div style="width:1px;height:16px;background:#D1D5DB"></div></td>
            <td style="padding:0 12px;vertical-align:middle">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#F59E0B;vertical-align:middle"></span>
              <span style="font-size:13px;font-weight:600;color:#92400E;margin-left:6px;vertical-align:middle">${mediumAlerts.length} needs action</span>
            </td>
            <td style="width:1px;padding:0"><div style="width:1px;height:16px;background:#D1D5DB"></div></td>
            <td style="padding:0 12px;vertical-align:middle">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3B82F6;vertical-align:middle"></span>
              <span style="font-size:13px;font-weight:600;color:#1E40AF;margin-left:6px;vertical-align:middle">${lowAlerts.length + autoResolved.length} FYI</span>
            </td>
          </tr></table>
        </td>
      </tr>
    </table>`;

  const alertSection = (alerts.length === 0 && autoResolved.length === 0)
    ? `<div style="text-align:center;padding:32px 0 28px">
         <div style="font-size:36px">✅</div>
         <div style="font-size:16px;font-weight:600;color:#1e293b;margin-top:10px">You're all clear!</div>
         <div style="font-size:14px;color:#94a3b8;margin-top:4px">No active alerts for your household.</div>
       </div>`
    : `${statsBar}
       ${renderSection('Urgent', highAlerts, 'high')}
       ${renderSection('Needs Attention', mediumAlerts, 'medium')}
       ${renderSection('For Your Awareness', [...lowAlerts, ...autoResolved], 'low')}
       ${alerts.length > 15 ? `<div style="font-size:13px;color:#94a3b8;margin-top:4px">+${alerts.length - 15} more — open Calvin to see all</div>` : ''}`;

  const calendarSection = weekBuckets.length === 0 ? '' : `
    <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-bottom:8px">
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
    <div style="text-align:center;margin:28px 0 12px">
      <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:999px;box-shadow:0 4px 14px rgba(88,101,242,0.4)">
        Go to Calvin →
      </a>
      <div style="font-size:12px;color:#9CA3AF;margin-top:12px">Dismiss, resolve, or chat with Calvin about any alert</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;color:#F3F4F6">${previewText}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>
  <div style="max-width:640px;margin:32px auto 48px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB">

    <!-- Body -->
    <div style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#3730a3;margin-bottom:6px">Good morning, ${firstName} 👋</div>
      <div style="font-size:14px;color:#94a3b8;margin-bottom:24px">Here's what needs your attention today.</div>
      ${alertSection}
      ${calendarSection}
      ${ctaButton}
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #E5E7EB;margin-top:8px">
      <div style="font-size:11px;color:#9CA3AF;text-align:center">
        Calvin — Family HQ · Your family coordination assistant
      </div>
      <div style="font-size:11px;color:#D1D5DB;text-align:center;margin-top:4px">
        This is your ${type === 'weekly' ? 'weekly' : 'daily'} morning briefing. Manage notification preferences in Settings.
      </div>
    </div>

  </div>
</body>
</html>`;
}

async function sendDigestEmail(householdId, type = 'daily') {
  if (SHUTDOWN) { blocked('digest email'); return { blocked: true }; }
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
  if (SHUTDOWN) { blocked('welcome email'); return { blocked: true }; }
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

async function sendFeatureUpdateEmail({ email, firstName }) {
  if (SHUTDOWN) { blocked('feature-update email'); return { blocked: true }; }
  if (!email) throw new Error('email is required');
  const resend = getClient();
  const templatePath = path.join(__dirname, '../emails/feature-update-june-2026.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  if (firstName) {
    html = html.replace('Calvin just got a lot more capable.', `${firstName}, Calvin just got a lot more capable.`);
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>';
  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: "What's new in Calvin — June 2026",
    html,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id };
}

function buildReengagementHtml({ firstName }) {
  const name = firstName ? `Hi ${firstName},` : 'Hi there,';

  const steps = [
    {
      icon: '🔗',
      heading: 'Connect (60 seconds)',
      body: 'Sign in to Calvin and link your Google account. Calvin reads your calendar and inbox — it never modifies anything without your approval.',
    },
    {
      icon: '🛡️',
      heading: 'Encrypted and private',
      body: 'Your tokens are AES-256 encrypted at rest. Calvin scans for scheduling conflicts and deadlines — it never reads personal messages.',
    },
    {
      icon: '📋',
      heading: 'Start getting alerts',
      body: 'Once connected, Calvin begins analyzing both partners\' calendars and inboxes, surfacing conflicts and missed commitments before they become problems.',
    },
  ];

  const stepCards = steps.map((s) => `
    <tr>
      <td style="padding:0 0 12px">
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;overflow:hidden">
          <tr>
            <td style="width:48px;padding:14px 0 14px 14px;vertical-align:top">
              <div style="font-size:22px;line-height:1">${s.icon}</div>
            </td>
            <td style="padding:14px 14px 14px 10px;vertical-align:top">
              <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:3px">${s.heading}</div>
              <div style="font-size:13px;color:#475569;line-height:1.5">${s.body}</div>
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
  <title>Connect Google to activate Calvin</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;color:#f1f5f9">You're one step away from Calvin — connect Google to start getting alerts.&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>
  <div style="max-width:580px;margin:32px auto 48px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px 24px">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">Calvin</div>
      <div style="font-size:13px;color:#64748b;margin-top:3px">Your family's coordination layer</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px 24px">
      <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">${name}</div>
      <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px">
        You signed up for Calvin but haven't connected your Google account yet.
        Calvin needs access to your calendar and inbox to detect scheduling conflicts,
        surface important deadlines, and keep you and your partner in sync.
      </div>

      <table style="width:100%;border-collapse:collapse">
        ${stepCards}
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin:12px 0 24px">
        <a href="${APP_URL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;letter-spacing:-.1px">
          Connect Google →
        </a>
      </div>

      <div style="font-size:13px;color:#94a3b8;text-align:center;line-height:1.5">
        Questions? Just reply to this email.
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px 24px;border-top:1px solid #f1f5f9">
      <div style="font-size:11px;color:#cbd5e1;text-align:center">
        Sent by <a href="${APP_URL}" style="color:#94a3b8;text-decoration:none">Calvin</a> · Your family coordination assistant
      </div>
    </div>

  </div>
</body>
</html>`;
}

async function sendReengagementEmail({ email, firstName }) {
  if (SHUTDOWN) { blocked('reengagement email'); return { blocked: true }; }
  if (!email) throw new Error('email is required');
  const resend = getClient();
  const html = buildReengagementHtml({ firstName });
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Calvin <hello@calvinai.co>';

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: "You're one step away from Calvin",
    html,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id };
}

module.exports = { sendDigestEmail, sendWelcomeEmail, sendFeatureUpdateEmail, sendReengagementEmail };

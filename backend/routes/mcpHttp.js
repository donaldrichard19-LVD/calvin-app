'use strict';
const express = require('express');
const router = express.Router();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');
const { sendSMS } = require('../lib/twilio');
const { sendDigestEmail } = require('../lib/email');
const { runAnalysisForHousehold } = require('../jobs/analyze');

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const bySeverity = (arr) =>
  [...arr].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

function createServer(householdId) {
  const server = new McpServer({ name: 'calvin', version: '1.0.0' });

  // ── Alerts ──────────────────────────────────────────────────────────────────

  server.tool('get_alerts', 'Get current household alerts sorted by severity.',
    {
      severity: z.enum(['high', 'medium', 'low', 'all']).optional().default('all').describe('Filter by severity'),
      status: z.enum(['active', 'snoozed', 'dismissed', 'resolved', 'all']).optional().default('active').describe('Filter by status'),
    },
    async ({ severity, status }) => {
      const now = new Date().toISOString();
      let q = supabase.from('alerts').select('*').eq('household_id', householdId);
      if (status === 'active') q = q.eq('status', 'active').or(`snoozed_until.is.null,snoozed_until.lt.${now}`);
      else if (status !== 'all') q = q.eq('status', status);
      if (severity && severity !== 'all') q = q.eq('severity', severity);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const list = bySeverity(data || []);
      if (!list.length) return { content: [{ type: 'text', text: 'No alerts.' }] };
      const lines = list.map((a) => {
        const b = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
        return `${b} [${a.id}] ${a.title}${a.body ? `\n   ${a.body}` : ''}`;
      });
      return { content: [{ type: 'text', text: `${list.length} alert(s):\n\n${lines.join('\n')}` }] };
    }
  );

  server.tool('dismiss_alert', 'Dismiss a Calvin alert by ID.',
    { alert_id: z.string().describe('Alert ID to dismiss') },
    async ({ alert_id }) => {
      const { error } = await supabase.from('alerts')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', alert_id).eq('household_id', householdId);
      if (error) throw new Error(error.message);
      return { content: [{ type: 'text', text: `Alert ${alert_id} dismissed.` }] };
    }
  );

  server.tool('snooze_alert', 'Snooze a Calvin alert for a number of hours.',
    {
      alert_id: z.string().describe('Alert ID to snooze'),
      hours: z.number().min(1).max(168).optional().default(24).describe('Hours to snooze'),
    },
    async ({ alert_id, hours }) => {
      const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
      const { error } = await supabase.from('alerts')
        .update({ status: 'snoozed', snoozed_until: snoozedUntil, updated_at: new Date().toISOString() })
        .eq('id', alert_id).eq('household_id', householdId);
      if (error) throw new Error(error.message);
      return { content: [{ type: 'text', text: `Alert ${alert_id} snoozed until ${new Date(snoozedUntil).toLocaleString()}.` }] };
    }
  );

  server.tool('resolve_alert', 'Mark a Calvin alert as resolved.',
    { alert_id: z.string().describe('Alert ID to resolve') },
    async ({ alert_id }) => {
      const { error } = await supabase.from('alerts')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', alert_id).eq('household_id', householdId);
      if (error) throw new Error(error.message);
      return { content: [{ type: 'text', text: `Alert ${alert_id} resolved.` }] };
    }
  );

  // ── Calendar ─────────────────────────────────────────────────────────────────

  server.tool('get_calendar', 'Get upcoming calendar events for both household partners.', {},
    async () => {
      const { data: integrations } = await supabase.from('integrations').select('*')
        .eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null);
      const { data: partners } = await supabase.from('partners').select('id, display_name').eq('household_id', householdId);
      const [evA, evB] = await Promise.all([
        integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
        integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
      ]);
      const fmt = (name, events) => {
        if (!events.length) return `${name}: no upcoming events`;
        return `${name}:\n${events.slice(0, 10).map((e) => {
          const t = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : e.start?.date;
          return `  • ${e.summary || '(no title)'} — ${t}`;
        }).join('\n')}`;
      };
      return { content: [{ type: 'text', text: `📅 Upcoming events:\n\n${fmt(partners?.[0]?.display_name || 'Partner 1', evA)}\n\n${fmt(partners?.[1]?.display_name || 'Partner 2', evB)}` }] };
    }
  );

  server.tool('create_calendar_event', 'Create a Google Calendar event for a household partner.',
    {
      title: z.string().describe('Event title'),
      start: z.string().describe('Start time in ISO 8601'),
      end: z.string().describe('End time in ISO 8601'),
      description: z.string().optional().describe('Event description'),
      attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
      timezone: z.string().optional().default('America/New_York').describe('Timezone'),
      partner_index: z.number().int().min(0).max(1).optional().default(0).describe('0 = first partner, 1 = second'),
    },
    async ({ title, start, end, description, attendees, timezone, partner_index }) => {
      const { data: integrations } = await supabase.from('integrations').select('*')
        .eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null);
      const intg = integrations?.[partner_index] ?? integrations?.[0];
      if (!intg) throw new Error('No Google Calendar connected');
      const event = await createCalendarEvent(intg, { title, start, end, description, attendees, timezone });
      const link = event?.htmlLink ? `\nView: ${event.htmlLink}` : '';
      return { content: [{ type: 'text', text: `✅ Created "${title}" starting ${start}${link}` }] };
    }
  );

  // ── Household ────────────────────────────────────────────────────────────────

  server.tool('get_household', 'Get household info, partner names, phones, and Google Calendar connection status.', {},
    async () => {
      const [{ data: household }, { data: partners }, { data: integrations }] = await Promise.all([
        supabase.from('households').select('id, name, context').eq('id', householdId).single(),
        supabase.from('partners').select('id, display_name, phone').eq('household_id', householdId),
        supabase.from('integrations').select('partner_id, is_active, account_email').eq('household_id', householdId),
      ]);
      const lines = [`🏠 ${household?.name || 'Household'}`];
      for (const p of (partners || [])) {
        const intg = (integrations || []).find((i) => i.partner_id === p.id);
        const cal = intg?.is_active ? `✅ Google (${intg.account_email || 'connected'})` : '❌ No Google Calendar';
        lines.push(`  👤 ${p.display_name || 'Unknown'}${p.phone ? ` · ${p.phone}` : ''} — ${cal}`);
      }
      const members = household?.context?.members || [];
      if (members.length) {
        lines.push('\n👨‍👩‍👧 Household members:');
        for (const m of members) {
          const age = m.age ? `, age ${m.age}` : '';
          const notes = m.notes ? ` — ${m.notes}` : '';
          lines.push(`  • ${m.name} (${m.role}${age})${notes}`);
        }
      }
      if (household?.context?.notes) {
        lines.push(`\n📝 Notes: ${household.context.notes}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool('trigger_analysis', 'Trigger a fresh Calvin analysis to detect new conflicts and gaps.', {},
    async () => {
      runAnalysisForHousehold(householdId).catch((e) => console.error('[mcp-http] analysis error:', e.message));
      return { content: [{ type: 'text', text: '🔄 Analysis started. New alerts will appear within a minute.' }] };
    }
  );

  // ── Digest ───────────────────────────────────────────────────────────────────

  server.tool('get_digest', 'Generate a formatted daily or weekly household digest.',
    { type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type') },
    async ({ type }) => {
      const now = new Date();
      const [{ data: alerts }, { data: partners }, { data: integrations }] = await Promise.all([
        supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('partners').select('id, display_name').eq('household_id', householdId),
        supabase.from('integrations').select('*').eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
      ]);
      const [evA, evB] = await Promise.all([
        integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
        integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
      ]);
      const nameA = partners?.[0]?.display_name || 'Partner 1';
      const nameB = partners?.[1]?.display_name || 'Partner 2';
      const active = bySeverity(alerts || []);
      const high = active.filter((a) => a.severity === 'high');
      const dateStr = type === 'weekly'
        ? `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        : now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      let text = `Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'} — ${dateStr}\n\n`;
      if (!active.length) {
        text += `✅ No active alerts — you're all clear!\n\n`;
      } else {
        text += `🚨 ${active.length} alert${active.length !== 1 ? 's' : ''}${high.length ? ` (${high.length} high priority)` : ''}\n`;
        for (const a of active.slice(0, 6)) {
          const b = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
          text += `${b} ${a.title}${a.body ? `\n   ${a.body}` : ''}\n`;
        }
        if (active.length > 6) text += `   ...and ${active.length - 6} more\n`;
        text += '\n';
      }
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const isToday = (e) => { const s = new Date(e.start?.dateTime || e.start?.date); return s >= todayStart && s <= todayEnd; };
      const todayA = evA.filter(isToday); const todayB = evB.filter(isToday);
      if (todayA.length || todayB.length) {
        text += `📅 Today's schedule:\n`;
        if (todayA.length) text += `${nameA}: ${todayA.map((e) => e.summary || 'Event').join(', ')}\n`;
        if (todayB.length) text += `${nameB}: ${todayB.map((e) => e.summary || 'Event').join(', ')}\n`;
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  // ── SMS ──────────────────────────────────────────────────────────────────────

  server.tool('send_sms', 'Send an SMS to one or both household partners.',
    {
      message: z.string().max(1600).describe('SMS message text'),
      partner_id: z.string().optional().describe('Target a specific partner by ID; omit to send to all'),
    },
    async ({ message, partner_id }) => {
      let q = supabase.from('partners').select('id, display_name, phone').eq('household_id', householdId).not('phone', 'is', null);
      if (partner_id) q = q.eq('id', partner_id);
      const { data: targets } = await q;
      if (!targets?.length) throw new Error('No phone number found for this household');
      const results = await Promise.all(targets.map((p) =>
        sendSMS(p.phone, message).then(() => `✅ ${p.display_name}`).catch((e) => `❌ ${p.display_name}: ${e.message}`)
      ));
      return { content: [{ type: 'text', text: `SMS sent:\n${results.join('\n')}` }] };
    }
  );

  server.tool('send_digest_sms', 'Generate the daily or weekly digest and SMS it to household partners.',
    {
      type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type'),
      partner_id: z.string().optional().describe('Target a specific partner; omit for all'),
    },
    async ({ type, partner_id }) => {
      // Re-use get_digest logic inline via tool call result would be circular — call the logic directly
      // (digest text generation is duplicated here for simplicity)
      const now = new Date();
      const [{ data: alerts }, { data: integrations }] = await Promise.all([
        supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'active'),
        supabase.from('integrations').select('*').eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
      ]);
      const active = bySeverity(alerts || []);
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      let text = `Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'} — ${dateStr}\n`;
      if (!active.length) {
        text += `✅ No active alerts — you're all clear!`;
      } else {
        text += `🚨 ${active.length} alert${active.length !== 1 ? 's' : ''}\n`;
        for (const a of active.slice(0, 4)) {
          const b = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
          text += `${b} ${a.title}\n`;
        }
        if (active.length > 4) text += `...and ${active.length - 4} more`;
      }
      let q = supabase.from('partners').select('id, display_name, phone').eq('household_id', householdId).not('phone', 'is', null);
      if (partner_id) q = q.eq('id', partner_id);
      const { data: targets } = await q;
      if (!targets?.length) throw new Error('No phone number found');
      const results = await Promise.all(targets.map((p) =>
        sendSMS(p.phone, text).then(() => `✅ ${p.display_name}`).catch((e) => `❌ ${p.display_name}: ${e.message}`)
      ));
      return { content: [{ type: 'text', text: `Digest SMS sent:\n${results.join('\n')}` }] };
    }
  );

  server.tool('send_email_digest',
    'Generate and email the daily or weekly Calvin digest to all connected household partners.',
    { type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type') },
    async ({ type }) => {
      const result = await sendDigestEmail(householdId, type);
      return { content: [{ type: 'text', text: `📧 ${type === 'weekly' ? 'Weekly digest' : 'Daily briefing'} emailed to: ${result.to.join(', ')}` }] };
    }
  );

  return server;
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

async function handleMcp(req, res, householdId) {
  try {
    const mcpServer = createServer(householdId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp-http]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}

// Token-based auth — per-household URL for Cowork / remote connectors
router.all('/:token', async (req, res) => {
  const { data: household } = await supabase
    .from('households')
    .select('id')
    .eq('mcp_token', req.params.token)
    .single();

  if (!household) return res.status(401).json({ error: 'Invalid token' });
  supabase.from('households')
    .update({ claude_last_seen_at: new Date().toISOString() })
    .eq('id', household.id)
    .then(() => {}).catch(() => {});
  await handleMcp(req, res, household.id);
});

// API-key auth — backward compat for env-var-configured Claude Code setup
router.all('/', async (req, res) => {
  const authHeader = req.headers.authorization;
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.key;
  if (!process.env.CALVIN_MCP_API_KEY || key !== process.env.CALVIN_MCP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const householdId = process.env.CALVIN_MCP_HOUSEHOLD_ID;
  if (!householdId) return res.status(500).json({ error: 'CALVIN_MCP_HOUSEHOLD_ID not configured' });
  await handleMcp(req, res, householdId);
});

module.exports = router;

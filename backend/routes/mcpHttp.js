'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');
const { sendSMS } = require('../lib/twilio');
const { sendDigestEmail } = require('../lib/email');
const { runAnalysisForHousehold } = require('../jobs/analyze');
const { generateContextCard } = require('../lib/contextCard');

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const bySeverity = (arr) =>
  [...arr].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));

function createServer(householdId) {
  const server = new McpServer({ name: 'calvin', version: '1.0.0' });

  // ── Alerts ──────────────────────────────────────────────────────────────────

  server.registerTool('get_alerts', {
    title: 'Get Alerts',
    description: 'Get current household alerts sorted by severity.',
    inputSchema: {
      severity: z.enum(['high', 'medium', 'low', 'all']).optional().default('all').describe('Filter by severity'),
      status: z.enum(['active', 'snoozed', 'dismissed', 'resolved', 'all']).optional().default('active').describe('Filter by status'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ severity, status }) => {
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
      return `${b} [${a.id}] ${a.title}${a.summary ? `\n   ${a.summary}` : ''}`;
    });
    return { content: [{ type: 'text', text: `${list.length} alert(s):\n\n${lines.join('\n')}` }] };
  });

  server.registerTool('dismiss_alert', {
    title: 'Dismiss Alert',
    description: 'Dismiss a Calvin alert by ID.',
    inputSchema: { alert_id: z.string().describe('Alert ID to dismiss') },
    annotations: { destructiveHint: true },
  }, async ({ alert_id }) => {
    const { error } = await supabase.from('alerts')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', alert_id).eq('household_id', householdId);
    if (error) throw new Error(error.message);
    return { content: [{ type: 'text', text: `Alert ${alert_id} dismissed.` }] };
  });

  server.registerTool('snooze_alert', {
    title: 'Snooze Alert',
    description: 'Snooze a Calvin alert for a number of hours.',
    inputSchema: {
      alert_id: z.string().describe('Alert ID to snooze'),
      hours: z.number().min(1).max(168).optional().default(24).describe('Hours to snooze'),
    },
    annotations: { destructiveHint: false },
  }, async ({ alert_id, hours }) => {
    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    const { error } = await supabase.from('alerts')
      .update({ status: 'snoozed', snoozed_until: snoozedUntil, updated_at: new Date().toISOString() })
      .eq('id', alert_id).eq('household_id', householdId);
    if (error) throw new Error(error.message);
    return { content: [{ type: 'text', text: `Alert ${alert_id} snoozed until ${new Date(snoozedUntil).toLocaleString()}.` }] };
  });

  server.registerTool('resolve_alert', {
    title: 'Resolve Alert',
    description: 'Mark a Calvin alert as resolved.',
    inputSchema: { alert_id: z.string().describe('Alert ID to resolve') },
    annotations: { destructiveHint: true },
  }, async ({ alert_id }) => {
    const { error } = await supabase.from('alerts')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', alert_id).eq('household_id', householdId);
    if (error) throw new Error(error.message);
    return { content: [{ type: 'text', text: `Alert ${alert_id} resolved.` }] };
  });

  // ── Calendar ─────────────────────────────────────────────────────────────────

  server.registerTool('get_calendar', {
    title: 'Get Calendar',
    description: 'Get upcoming calendar events for both household partners.',
    annotations: { readOnlyHint: true },
  }, async () => {
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
  });

  server.registerTool('create_calendar_event', {
    title: 'Create Calendar Event',
    description: 'Create a Google Calendar event for a household partner.',
    inputSchema: {
      title: z.string().describe('Event title'),
      start: z.string().describe('Start time in ISO 8601'),
      end: z.string().describe('End time in ISO 8601'),
      description: z.string().optional().describe('Event description'),
      attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
      timezone: z.string().optional().default('America/New_York').describe('Timezone'),
      partner_index: z.number().int().min(0).max(1).optional().default(0).describe('0 = first partner, 1 = second'),
    },
    annotations: { destructiveHint: false },
  }, async ({ title, start, end, description, attendees, timezone, partner_index }) => {
    const { data: integrations } = await supabase.from('integrations').select('*')
      .eq('household_id', householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null);
    const intg = integrations?.[partner_index] ?? integrations?.[0];
    if (!intg) throw new Error('No Google Calendar connected');
    const event = await createCalendarEvent(intg, { title, start, end, description, attendees, timezone });
    const link = event?.htmlLink ? `\nView: ${event.htmlLink}` : '';
    return { content: [{ type: 'text', text: `✅ Created "${title}" starting ${start}${link}` }] };
  });

  // ── Household ────────────────────────────────────────────────────────────────

  server.registerTool('get_household', {
    title: 'Get Household',
    description: 'Get household info, partner names, phones, Google Calendar connection status, and full context wallet (routines, preferences, logistics, active orders).',
    annotations: { readOnlyHint: true },
  }, async () => {
    const [{ data: household }, { data: partners }, { data: integrations }, { data: orders }] = await Promise.all([
      supabase.from('households').select('id, name, context, context_sharing').eq('id', householdId).single(),
      supabase.from('partners').select('id, display_name, phone').eq('household_id', householdId),
      supabase.from('integrations').select('partner_id, is_active, account_email').eq('household_id', householdId),
      supabase.from('household_orders').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(10),
    ]);
    const lines = [`🏠 ${household?.name || 'Household'}`];
    for (const p of (partners || [])) {
      const intg = (integrations || []).find((i) => i.partner_id === p.id);
      const cal = intg?.is_active ? `✅ Google (${intg.account_email || 'connected'})` : '❌ No Google Calendar';
      lines.push(`  👤 ${p.display_name || 'Unknown'}${p.phone ? ` · ${p.phone}` : ''} — ${cal}`);
    }
    const card = generateContextCard(household?.context, partners, household?.context_sharing, orders || []);
    if (card) lines.push('', card);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  server.registerTool('trigger_analysis', {
    title: 'Trigger Analysis',
    description: 'Trigger a fresh Calvin analysis to detect new conflicts and gaps.',
    annotations: { destructiveHint: false },
  }, async () => {
    runAnalysisForHousehold(householdId).catch((e) => console.error('[mcp-http] analysis error:', e.message));
    return { content: [{ type: 'text', text: '🔄 Analysis started. New alerts will appear within a minute.' }] };
  });

  // ── Digest ───────────────────────────────────────────────────────────────────

  server.registerTool('get_digest', {
    title: 'Get Digest',
    description: 'Generate a formatted daily or weekly household digest.',
    inputSchema: { type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type') },
    annotations: { readOnlyHint: true },
  }, async ({ type }) => {
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
        text += `${b} ${a.title}${a.summary ? `\n   ${a.summary}` : ''}\n`;
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
  });

  // ── SMS ──────────────────────────────────────────────────────────────────────

  server.registerTool('send_sms', {
    title: 'Send SMS',
    description: 'Send an SMS to one or both household partners.',
    inputSchema: {
      message: z.string().max(1600).describe('SMS message text'),
      partner_id: z.string().optional().describe('Target a specific partner by ID; omit to send to all'),
    },
    annotations: { destructiveHint: false },
  }, async ({ message, partner_id }) => {
    let q = supabase.from('partners').select('id, display_name, phone').eq('household_id', householdId).not('phone', 'is', null);
    if (partner_id) q = q.eq('id', partner_id);
    const { data: targets } = await q;
    if (!targets?.length) throw new Error('No phone number found for this household');
    const results = await Promise.all(targets.map((p) =>
      sendSMS(p.phone, message).then(() => `✅ ${p.display_name}`).catch((e) => `❌ ${p.display_name}: ${e.message}`)
    ));
    return { content: [{ type: 'text', text: `SMS sent:\n${results.join('\n')}` }] };
  });

  server.registerTool('send_digest_sms', {
    title: 'Send Digest SMS',
    description: 'Generate the daily or weekly digest and SMS it to household partners.',
    inputSchema: {
      type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type'),
      partner_id: z.string().optional().describe('Target a specific partner; omit for all'),
    },
    annotations: { destructiveHint: false },
  }, async ({ type, partner_id }) => {
    const now = new Date();
    const { data: alerts } = await supabase.from('alerts').select('*').eq('household_id', householdId).eq('status', 'active');
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
  });

  server.registerTool('send_email_digest', {
    title: 'Send Email Digest',
    description: 'Generate and email the daily or weekly Calvin digest to all connected household partners.',
    inputSchema: { type: z.enum(['daily', 'weekly']).optional().default('daily').describe('Digest type') },
    annotations: { destructiveHint: false },
  }, async ({ type }) => {
    const result = await sendDigestEmail(householdId, type);
    return { content: [{ type: 'text', text: `📧 ${type === 'weekly' ? 'Weekly digest' : 'Daily briefing'} emailed to: ${result.to.join(', ')}` }] };
  });

  // ── Context ──────────────────────────────────────────────────────────────────

  server.registerTool('update_household_notes', {
    title: 'Update Household Notes',
    description: 'Save or update freeform notes in the household context — captures decisions, preferences, and reminders so Calvin remembers them.',
    inputSchema: {
      notes: z.string().describe('The notes to save. Replaces existing notes unless append is true.'),
      append: z.boolean().optional().default(false).describe('If true, appends to existing notes rather than replacing them.'),
    },
    annotations: { destructiveHint: false },
  }, async ({ notes, append }) => {
    const { data: household, error } = await supabase.from('households').select('context').eq('id', householdId).single();
    if (error) throw new Error(error.message);
    const existing = household?.context || {};
    const updatedNotes = append && existing.notes ? `${existing.notes}\n\n${notes}` : notes;
    const { error: updateError } = await supabase.from('households')
      .update({ context: { ...existing, notes: updatedNotes } }).eq('id', householdId);
    if (updateError) throw new Error(updateError.message);
    return { content: [{ type: 'text', text: `✅ Household notes ${append ? 'updated' : 'saved'} to Calvin.` }] };
  });

  server.registerTool('add_household_member', {
    title: 'Add Household Member',
    description: 'Add a new person or pet to the household context.',
    inputSchema: {
      name: z.string().describe('Name of the person or pet'),
      role: z.enum(['child', 'pet', 'grandparent', 'parent', 'sibling', 'other']).describe('Their role in the household'),
      age: z.string().optional().describe('Age (optional)'),
      notes: z.string().optional().describe('Relevant notes — allergies, preferences, schedule, etc.'),
    },
    annotations: { destructiveHint: false },
  }, async ({ name, role, age, notes }) => {
    const { data: household, error } = await supabase.from('households').select('context').eq('id', householdId).single();
    if (error) throw new Error(error.message);
    const existing = household?.context || {};
    const members = existing.members || [];
    const duplicate = members.find((m) => m.name?.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return { content: [{ type: 'text', text: `⚠️ A member named "${name}" already exists in Calvin. Use update_household_notes to add details instead.` }] };
    }
    const newMember = { id: require('crypto').randomUUID(), name, role, age: age || '', notes: notes || '' };
    const { error: updateError } = await supabase.from('households')
      .update({ context: { ...existing, members: [...members, newMember] } }).eq('id', householdId);
    if (updateError) throw new Error(updateError.message);
    return { content: [{ type: 'text', text: `✅ Added ${name} (${role}) to Calvin household context.` }] };
  });

  // ── Context Wallet Write-back ────────────────────────────────────────────────

  async function addContextEntry(category, entry) {
    const { data: household, error } = await supabase.from('households').select('context').eq('id', householdId).single();
    if (error) throw new Error(error.message);
    const existing = household?.context || {};
    const arr = existing[category] || [];
    const newEntry = { id: require('crypto').randomUUID(), ...entry };
    const { error: updateError } = await supabase.from('households')
      .update({ context: { ...existing, [category]: [...arr, newEntry] } }).eq('id', householdId);
    if (updateError) throw new Error(updateError.message);
    return newEntry;
  }

  async function createContextAlert(title, body, metadata) {
    await supabase.from('alerts').insert({
      household_id: householdId,
      title,
      body,
      severity: 'low',
      status: 'active',
      type: 'context_update',
      source: 'ai_agent',
      metadata,
    });
  }

  server.registerTool('add_routine', {
    title: 'Add Routine',
    description: 'Add a recurring routine or schedule to the household context wallet (e.g. "School pickup Mon-Fri 3:15pm").',
    inputSchema: {
      label: z.string().describe('Short name for the routine'),
      details: z.string().optional().describe('When/where/how details'),
      who: z.string().optional().describe('Which partner handles this'),
    },
  }, async ({ label, details, who }) => {
    const entry = await addContextEntry('routines', { label, details: details || '', who: who || '' });
    await createContextAlert(
      'AI added a routine to your context wallet',
      `${label}${details ? ': ' + details : ''}${who ? ' (' + who + ')' : ''}`,
      { category: 'routines', entry_id: entry.id, action: 'add' }
    );
    return { content: [{ type: 'text', text: `✅ Added routine "${label}" to Calvin context wallet.` }] };
  });

  server.registerTool('add_preference', {
    title: 'Add Preference',
    description: 'Add a household preference to the context wallet (e.g. dietary restrictions, lifestyle choices).',
    inputSchema: {
      label: z.string().describe('Category (e.g. "Dietary", "Bedtime")'),
      value: z.string().describe('The preference details'),
    },
  }, async ({ label, value }) => {
    const entry = await addContextEntry('preferences', { label, value });
    await createContextAlert(
      'AI added a preference to your context wallet',
      `${label}: ${value}`,
      { category: 'preferences', entry_id: entry.id, action: 'add' }
    );
    return { content: [{ type: 'text', text: `✅ Added preference "${label}: ${value}" to Calvin context wallet.` }] };
  });

  server.registerTool('add_logistics', {
    title: 'Add Logistics Entry',
    description: 'Add a logistics or contact entry to the context wallet (e.g. pediatrician name/phone, school address).',
    inputSchema: {
      label: z.string().describe('Label (e.g. "Pediatrician", "School")'),
      value: z.string().describe('Contact info, address, or details'),
    },
  }, async ({ label, value }) => {
    const entry = await addContextEntry('logistics', { label, value });
    await createContextAlert(
      'AI added a logistics entry to your context wallet',
      `${label}: ${value}`,
      { category: 'logistics', entry_id: entry.id, action: 'add' }
    );
    return { content: [{ type: 'text', text: `✅ Added logistics "${label}" to Calvin context wallet.` }] };
  });

  server.registerTool('add_order', {
    title: 'Add Order',
    description: 'Log a delivery or service order (DoorDash, UberEats, Instacart, Amazon, etc.) so both partners are aware.',
    inputSchema: {
      source: z.string().describe('Service name (e.g. "doordash", "instacart", "ubereats", "amazon")'),
      description: z.string().describe('What was ordered'),
      items: z.array(z.object({
        name: z.string(),
        qty: z.number().optional(),
        price: z.number().optional(),
      })).optional().describe('Itemized list (optional)'),
      total: z.number().optional().describe('Order total (optional)'),
      eta: z.string().optional().describe('Expected delivery time in ISO 8601'),
      placed_by: z.string().optional().describe('Who placed the order'),
      notes: z.string().optional().describe('Delivery instructions or notes'),
    },
  }, async ({ source, description, items, total, eta, placed_by, notes }) => {
    const { data: order, error } = await supabase.from('household_orders').insert({
      household_id: householdId,
      source,
      description,
      items: items || [],
      total: total || null,
      eta: eta || null,
      placed_by: placed_by || null,
      notes: notes || null,
    }).select().single();
    if (error) throw new Error(error.message);

    const etaText = eta ? `, ETA ${new Date(eta).toLocaleString()}` : '';
    await createContextAlert(
      `${placed_by || 'Someone'} placed a ${source} order`,
      `${description}${etaText}`,
      { category: 'orders', order_id: order.id, action: 'add', source }
    );
    return { content: [{ type: 'text', text: `✅ Logged ${source} order: ${description}${etaText}` }] };
  });

  server.registerTool('update_order_status', {
    title: 'Update Order Status',
    description: 'Update the status of an existing order (placed → in_progress → delivered → completed).',
    inputSchema: {
      order_id: z.string().describe('Order ID'),
      status: z.enum(['placed', 'in_progress', 'delivered', 'completed']).describe('New status'),
    },
  }, async ({ order_id, status }) => {
    const update = { status, updated_at: new Date().toISOString() };

    const { data: order, error } = await supabase.from('household_orders')
      .update(update).eq('id', order_id).eq('household_id', householdId).select().single();
    if (error) throw new Error(error.message);
    if (!order) throw new Error('Order not found');

    if (status === 'delivered') {
      await createContextAlert(
        `${order.source} order delivered`,
        order.description || 'Your order has arrived',
        { category: 'orders', order_id: order.id, action: 'status_update', status }
      );
    }
    return { content: [{ type: 'text', text: `✅ Order ${order_id} updated to "${status}".` }] };
  });

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
  const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 16);
  supabase.from('share_access_log')
    .insert({ household_id: household.id, ip_hash: ipHash, user_agent: (req.headers['user-agent'] || '').slice(0, 500), assistant_name: 'Claude', access_source: 'mcp' })
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

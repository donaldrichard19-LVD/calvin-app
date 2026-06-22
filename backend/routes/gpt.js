'use strict';
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');
const { generateContextCard } = require('../lib/contextCard');

async function requireGptAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization: Bearer <token> required' });

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .eq('mcp_token', token)
    .single();

  if (!household) return res.status(401).json({ error: 'Invalid token' });
  req.householdId = household.id;
  supabase.from('households')
    .update({ chatgpt_last_seen_at: new Date().toISOString() })
    .eq('id', household.id)
    .then(() => {}).catch(() => {});
  next();
}

// OpenAPI spec — public, no auth required
router.get('/openapi.json', (req, res) => {
  const base = (process.env.BACKEND_URL || `https://${req.get('host')}`).replace(/\/$/, '');
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Calvin Family HQ',
      description: 'Access household alerts, calendar events, and family context from Calvin. Get your API key from calvinai.co → Settings → Calvin AI.',
      version: '1.0.0',
    },
    servers: [{ url: `${base}/api/gpt` }],
    security: [{ BearerAuth: [] }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Calvin API key from Settings → Calvin AI',
        },
      },
      schemas: {
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string', nullable: true },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            status: { type: 'string' },
            type: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        CalendarEvent: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
            location: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
          },
        },
      },
    },
    paths: {
      '/alerts': {
        get: {
          operationId: 'getAlerts',
          summary: 'Get active household alerts',
          description: 'Returns current alerts sorted by severity (high → medium → low). Use this to check what\'s on the family\'s radar.',
          parameters: [
            {
              name: 'severity',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['high', 'medium', 'low', 'all'] },
              description: 'Filter by severity. Omit or use "all" for everything.',
            },
          ],
          responses: {
            '200': {
              description: 'Alerts list with counts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      alerts: { type: 'array', items: { '$ref': '#/components/schemas/Alert' } },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          high_count: { type: 'integer' },
                          medium_count: { type: 'integer' },
                          low_count: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/alerts/{alertId}/dismiss': {
        patch: {
          operationId: 'dismissAlert',
          summary: 'Dismiss an alert',
          description: 'Marks an alert as dismissed. Use the alert id from getAlerts.',
          parameters: [{ name: 'alertId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
      '/alerts/{alertId}/snooze': {
        patch: {
          operationId: 'snoozeAlert',
          summary: 'Snooze an alert for a number of hours',
          parameters: [{ name: 'alertId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { hours: { type: 'integer', description: 'Hours to snooze (default 24)', default: 24 } },
                },
              },
            },
          },
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, snoozed_until: { type: 'string', format: 'date-time' } } } } } } },
        },
      },
      '/alerts/{alertId}/resolve': {
        patch: {
          operationId: 'resolveAlert',
          summary: 'Mark an alert as resolved',
          parameters: [{ name: 'alertId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
      '/calendar': {
        get: {
          operationId: 'getCalendar',
          summary: 'Get upcoming calendar events for both partners',
          description: 'Returns the next ~15 events for each household partner from Google Calendar.',
          responses: {
            '200': {
              description: 'Events grouped by partner',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      partners: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            events: { type: 'array', items: { '$ref': '#/components/schemas/CalendarEvent' } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/calendar/events': {
        post: {
          operationId: 'createCalendarEvent',
          summary: 'Create a Google Calendar event for a household partner',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'start', 'end'],
                  properties: {
                    title: { type: 'string', description: 'Event title' },
                    start: { type: 'string', format: 'date-time', description: 'ISO 8601 start time' },
                    end: { type: 'string', format: 'date-time', description: 'ISO 8601 end time' },
                    description: { type: 'string' },
                    timezone: { type: 'string', default: 'America/New_York' },
                    partner_index: { type: 'integer', enum: [0, 1], default: 0, description: '0 = first partner, 1 = second' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Event created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      event_link: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/household': {
        get: {
          operationId: 'getHousehold',
          summary: 'Get household info, context wallet, and active orders',
          description: 'Returns partner names, household members, routines, preferences, logistics, notes, a formatted context card, and active orders.',
          responses: {
            '200': {
              description: 'Household details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      household_name: { type: 'string' },
                      partners: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            google_connected: { type: 'boolean' },
                          },
                        },
                      },
                      members: {
                        type: 'array',
                        description: 'Children, pets, grandparents, etc.',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            role: { type: 'string' },
                            age: { type: 'string', nullable: true },
                            notes: { type: 'string', nullable: true },
                          },
                        },
                      },
                      routines: {
                        type: 'array',
                        description: 'Recurring schedules and routines',
                        items: {
                          type: 'object',
                          properties: {
                            label: { type: 'string' },
                            details: { type: 'string', nullable: true },
                            who: { type: 'string', nullable: true },
                          },
                        },
                      },
                      preferences: {
                        type: 'array',
                        description: 'Household preferences (dietary, lifestyle, etc.)',
                        items: {
                          type: 'object',
                          properties: {
                            label: { type: 'string' },
                            value: { type: 'string' },
                          },
                        },
                      },
                      logistics: {
                        type: 'array',
                        description: 'Key contacts and logistics info',
                        items: {
                          type: 'object',
                          properties: {
                            label: { type: 'string' },
                            value: { type: 'string' },
                          },
                        },
                      },
                      notes: { type: 'string', description: 'Household notes' },
                      context_card: { type: 'string', nullable: true, description: 'Formatted context card with all shared household context' },
                      active_orders: {
                        type: 'array',
                        description: 'Active delivery/service orders',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            source: { type: 'string' },
                            description: { type: 'string', nullable: true },
                            items: { type: 'array', items: { type: 'object' } },
                            total: { type: 'number', nullable: true },
                            status: { type: 'string', enum: ['placed', 'in_progress', 'delivered', 'completed'] },
                            eta: { type: 'string', format: 'date-time', nullable: true },
                            placed_by: { type: 'string', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/context/routines': {
        post: {
          operationId: 'addRoutine',
          summary: 'Add a routine to the household context wallet',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['label'], properties: {
            label: { type: 'string' }, details: { type: 'string' }, who: { type: 'string' },
          } } } } },
          responses: { '200': { description: 'Routine added', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
      '/context/preferences': {
        post: {
          operationId: 'addPreference',
          summary: 'Add a preference to the household context wallet',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['label', 'value'], properties: {
            label: { type: 'string' }, value: { type: 'string' },
          } } } } },
          responses: { '200': { description: 'Preference added', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
      '/context/logistics': {
        post: {
          operationId: 'addLogistics',
          summary: 'Add a logistics entry to the household context wallet',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['label', 'value'], properties: {
            label: { type: 'string' }, value: { type: 'string' },
          } } } } },
          responses: { '200': { description: 'Logistics entry added', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
      '/orders': {
        post: {
          operationId: 'addOrder',
          summary: 'Log a delivery or service order (DoorDash, Instacart, etc.)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['source', 'description'], properties: {
            source: { type: 'string', description: 'Service name (doordash, instacart, ubereats, amazon)' },
            description: { type: 'string' },
            items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, price: { type: 'number' } } } },
            total: { type: 'number' },
            eta: { type: 'string', format: 'date-time' },
            placed_by: { type: 'string' },
            notes: { type: 'string' },
          } } } } },
          responses: { '200': { description: 'Order logged', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, order: { type: 'object' } } } } } } },
        },
      },
      '/orders/{orderId}': {
        patch: {
          operationId: 'updateOrderStatus',
          summary: 'Update order status (placed → in_progress → delivered → completed)',
          parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: {
            status: { type: 'string', enum: ['placed', 'in_progress', 'delivered', 'completed'] },
          } } } } },
          responses: { '200': { description: 'Order updated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
        },
      },
    },
  });
});

router.use(requireGptAuth);

router.get('/alerts', async (req, res) => {
  try {
    const now = new Date().toISOString();
    let q = supabase
      .from('alerts')
      .select('id, title, body, severity, status, type, created_at')
      .eq('household_id', req.householdId)
      .eq('status', 'active')
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false });

    const { severity } = req.query;
    if (severity && severity !== 'all') q = q.eq('severity', severity);

    const { data: alerts, error } = await q;
    if (error) throw error;

    const order = { high: 0, medium: 1, low: 2 };
    const sorted = (alerts || []).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json({
      alerts: sorted,
      meta: {
        total: sorted.length,
        high_count: sorted.filter((a) => a.severity === 'high').length,
        medium_count: sorted.filter((a) => a.severity === 'medium').length,
        low_count: sorted.filter((a) => a.severity === 'low').length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/alerts/:alertId/dismiss', async (req, res) => {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', req.householdId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/alerts/:alertId/snooze', async (req, res) => {
  try {
    const { hours = 24 } = req.body;
    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'snoozed', snoozed_until: snoozedUntil, updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', req.householdId);
    if (error) throw error;
    res.json({ success: true, snoozed_until: snoozedUntil });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .eq('household_id', req.householdId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar', async (req, res) => {
  try {
    const [{ data: integrations }, { data: partners }] = await Promise.all([
      supabase.from('integrations').select('*').eq('household_id', req.householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
      supabase.from('partners').select('id, display_name').eq('household_id', req.householdId),
    ]);

    const [evA, evB] = await Promise.all([
      integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
      integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
    ]);

    const fmt = (events) =>
      (events || []).slice(0, 15).map((e) => ({
        title: e.summary || '(no title)',
        start: e.start?.dateTime || e.start?.date || null,
        end: e.end?.dateTime || e.end?.date || null,
        location: e.location || null,
        description: e.description || null,
      }));

    res.json({
      partners: [
        { name: partners?.[0]?.display_name || 'Partner 1', events: fmt(evA) },
        { name: partners?.[1]?.display_name || 'Partner 2', events: fmt(evB) },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/events', async (req, res) => {
  try {
    const { title, start, end, description, timezone = 'America/New_York', partner_index = 0 } = req.body;
    if (!title || !start || !end) return res.status(400).json({ error: 'title, start, and end are required' });

    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('household_id', req.householdId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null);

    const intg = integrations?.[partner_index] ?? integrations?.[0];
    if (!intg) return res.status(400).json({ error: 'No Google Calendar connected for this household' });

    const event = await createCalendarEvent(intg, { title, start, end, description, timezone });
    res.json({ success: true, event_link: event?.htmlLink || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/household', async (req, res) => {
  try {
    const [{ data: household }, { data: partners }, { data: integrations }, { data: orders }] = await Promise.all([
      supabase.from('households').select('id, name, context, context_sharing').eq('id', req.householdId).single(),
      supabase.from('partners').select('id, display_name').eq('household_id', req.householdId),
      supabase.from('integrations').select('partner_id, is_active').eq('household_id', req.householdId),
      supabase.from('household_orders').select('*').eq('household_id', req.householdId).is('archived_at', null),
    ]);

    const ctx = household?.context || {};
    const card = generateContextCard(ctx, partners, household?.context_sharing, orders || []);

    res.json({
      household_name: household?.name || 'Our Household',
      partners: (partners || []).map((p) => {
        const intg = (integrations || []).find((i) => i.partner_id === p.id);
        return { name: p.display_name, google_connected: intg?.is_active ?? false };
      }),
      members: ctx.members || [],
      routines: ctx.routines || [],
      preferences: ctx.preferences || [],
      logistics: ctx.logistics || [],
      notes: ctx.notes || '',
      context_card: card,
      active_orders: orders || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Context Wallet Write-back ────────────────────────────────────────────────

async function addContextEntry(householdId, category, entry) {
  const { data: household, error } = await supabase.from('households').select('context').eq('id', householdId).single();
  if (error) throw error;
  const existing = household?.context || {};
  const arr = existing[category] || [];
  const newEntry = { id: require('crypto').randomUUID(), ...entry };
  const { error: updateError } = await supabase.from('households')
    .update({ context: { ...existing, [category]: [...arr, newEntry] } }).eq('id', householdId);
  if (updateError) throw updateError;
  return newEntry;
}

async function createContextAlert(householdId, title, body, metadata) {
  await supabase.from('alerts').insert({
    household_id: householdId,
    title, body,
    severity: 'low',
    status: 'active',
    type: 'context_update',
    source: 'ai_agent',
    metadata,
  });
}

router.post('/context/routines', async (req, res) => {
  try {
    const { label, details, who } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });
    const entry = await addContextEntry(req.householdId, 'routines', { label, details: details || '', who: who || '' });
    await createContextAlert(req.householdId, 'AI added a routine to your context wallet',
      `${label}${details ? ': ' + details : ''}`, { category: 'routines', entry_id: entry.id, action: 'add' });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/context/preferences', async (req, res) => {
  try {
    const { label, value } = req.body;
    if (!label || !value) return res.status(400).json({ error: 'label and value are required' });
    const entry = await addContextEntry(req.householdId, 'preferences', { label, value });
    await createContextAlert(req.householdId, 'AI added a preference to your context wallet',
      `${label}: ${value}`, { category: 'preferences', entry_id: entry.id, action: 'add' });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/context/logistics', async (req, res) => {
  try {
    const { label, value } = req.body;
    if (!label || !value) return res.status(400).json({ error: 'label and value are required' });
    const entry = await addContextEntry(req.householdId, 'logistics', { label, value });
    await createContextAlert(req.householdId, 'AI added a logistics entry to your context wallet',
      `${label}: ${value}`, { category: 'logistics', entry_id: entry.id, action: 'add' });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const { source, description, items, total, eta, placed_by, notes } = req.body;
    if (!source || !description) return res.status(400).json({ error: 'source and description are required' });
    const { data: order, error } = await supabase.from('household_orders').insert({
      household_id: req.householdId,
      source, description,
      items: items || [],
      total: total || null,
      eta: eta || null,
      placed_by: placed_by || null,
      notes: notes || null,
    }).select().single();
    if (error) throw error;
    const etaText = eta ? `, ETA ${new Date(eta).toLocaleString()}` : '';
    await createContextAlert(req.householdId, `${placed_by || 'Someone'} placed a ${source} order`,
      `${description}${etaText}`, { category: 'orders', order_id: order.id, action: 'add', source });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/orders/:orderId', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') update.archived_at = new Date().toISOString();
    const { data: order, error } = await supabase.from('household_orders')
      .update(update).eq('id', req.params.orderId).eq('household_id', req.householdId).select().single();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (status === 'delivered') {
      await createContextAlert(req.householdId, `${order.source} order delivered`,
        order.description || 'Your order has arrived', { category: 'orders', order_id: order.id, action: 'status_update', status });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

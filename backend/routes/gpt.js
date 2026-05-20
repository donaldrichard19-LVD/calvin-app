'use strict';
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');

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
          summary: 'Get household info, family members, and context',
          description: 'Returns partner names, household members (kids, pets, etc.), and any household notes.',
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
                      notes: { type: 'string', description: 'Household notes (dietary, preferences, etc.)' },
                    },
                  },
                },
              },
            },
          },
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
    const [{ data: household }, { data: partners }, { data: integrations }] = await Promise.all([
      supabase.from('households').select('id, name, context').eq('id', req.householdId).single(),
      supabase.from('partners').select('id, display_name').eq('household_id', req.householdId),
      supabase.from('integrations').select('partner_id, is_active').eq('household_id', req.householdId),
    ]);

    res.json({
      household_name: household?.name || 'Our Household',
      partners: (partners || []).map((p) => {
        const intg = (integrations || []).find((i) => i.partner_id === p.id);
        return { name: p.display_name, google_connected: intg?.is_active ?? false };
      }),
      members: household?.context?.members || [],
      notes: household?.context?.notes || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

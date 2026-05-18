require('dotenv').config();
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimit');
const { supabase } = require('../lib/supabase');
const { createCalendarEvent } = require('../lib/google');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatHouseholdContext(ctx) {
  if (!ctx || (!ctx.members?.length && !ctx.notes)) return '';
  const parts = [];
  if (ctx.members?.length) {
    const list = ctx.members
      .filter((m) => m.name)
      .map((m) => {
        let s = `${m.name} (${m.role}${m.age ? `, age ${m.age}` : ''})`;
        if (m.notes) s += `: ${m.notes}`;
        return s;
      })
      .join('; ');
    if (list) parts.push(`Members: ${list}`);
  }
  if (ctx.notes) parts.push(ctx.notes);
  return parts.join('\n');
}

const TOOLS = [
  {
    name: 'create_calendar_event',
    description: 'Create a new event on the user\'s Google Calendar. Use this when the user asks to schedule, add, or create a calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Event title' },
        start:       { type: 'string', description: 'Start in ISO 8601, e.g. 2026-05-20T10:00:00 or 2026-05-20 for all-day' },
        end:         { type: 'string', description: 'End in ISO 8601, e.g. 2026-05-20T11:00:00 or 2026-05-21 for all-day' },
        description: { type: 'string', description: 'Optional notes or agenda for the event' },
        attendees:   { type: 'array', items: { type: 'string' }, description: 'Optional attendee email addresses' },
      },
      required: ['title', 'start', 'end'],
    },
  },
];

router.post('/', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { alertId, messages } = req.body;
    if (!alertId || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'alertId and messages required' });
    }

    const { data: partner } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    const [alertResult, householdResult] = await Promise.all([
      supabase.from('alerts').select('title, summary, action_hint').eq('id', alertId).eq('household_id', partner?.household_id).single(),
      supabase.from('households').select('context').eq('id', partner?.household_id).single(),
    ]);

    const alert = alertResult.data;
    if (alertResult.error || !alert) return res.status(404).json({ error: 'Alert not found' });

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
    const householdContext = formatHouseholdContext(householdResult.data?.context);

    const systemPrompt = `You are a practical family assistant. The user is asking a follow-up about this alert:

Title: ${alert.title}
Summary: ${alert.summary}
Suggested action: ${alert.action_hint}

Current date/time: ${now} (America/New_York)
${householdContext ? `\nHousehold context:\n${householdContext}\n` : ''}
Be concise and direct. Use the household context to personalise responses — reference people, pets, and preferences by name where relevant. If the user asks to create, schedule, or add a calendar event, use the create_calendar_event tool. Infer reasonable defaults (1 hour duration if not specified). Do not repeat the alert back to the user.`;

    const validMessages = messages
      .filter((m) => m.role && m.content)
      .map((m) => ({ role: m.role, content: String(m.content) }));

    let createdEvent = null;

    // First Claude call
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: validMessages,
      tools: TOOLS,
    });

    console.log('[chat] stop_reason:', response.stop_reason, '| content types:', response.content.map((b) => b.type));

    // Agentic loop: handle tool use
    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
      console.log('[chat] tool_use:', toolUseBlock?.name, JSON.stringify(toolUseBlock?.input));

      let toolResult;
      if (toolUseBlock?.name === 'create_calendar_event') {
        try {
          const { data: intg } = await supabase
            .from('integrations')
            .select('*')
            .eq('partner_id', partner.id)
            .eq('provider', 'google')
            .eq('is_active', true)
            .not('access_token', 'is', null)
            .single();

          if (!intg) {
            toolResult = { error: 'Google Calendar not connected. Go to Settings and reconnect Google.' };
          } else {
            const event = await createCalendarEvent(intg, toolUseBlock.input);
            createdEvent = event;
            toolResult = { success: true, event };
          }
        } catch (err) {
          const isScope = err.message?.includes('insufficient') || err.code === 403;
          toolResult = {
            error: isScope
              ? 'Calendar write access not granted. Go to Settings and reconnect Google to enable event creation.'
              : err.message,
          };
        }
      } else {
        toolResult = { error: 'Unknown tool' };
      }

      // Second Claude call with tool result
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...validMessages,
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(toolResult) }],
          },
        ],
        tools: TOOLS,
      });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    console.log('[chat] final text length:', textBlock?.text?.length);
    res.json({ content: textBlock?.text || '', eventCreated: createdEvent || null });
  } catch (err) {
    console.error('[chat] error:', err.message, err.status ?? '');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

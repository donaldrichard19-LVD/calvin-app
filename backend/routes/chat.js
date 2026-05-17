require('dotenv').config();
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimit');
const { supabase } = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/', requireAuth, chatLimiter, async (req, res) => {
  try {
    const { alertId, messages } = req.body;
    if (!alertId || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'alertId and messages required' });
    }

    const { data: partner } = await supabase
      .from('partners')
      .select('household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    const { data: alert, error: aErr } = await supabase
      .from('alerts')
      .select('title, summary, action_hint')
      .eq('id', alertId)
      .eq('household_id', partner?.household_id)
      .single();

    if (aErr || !alert) return res.status(404).json({ error: 'Alert not found' });

    const systemPrompt = `You are a practical family assistant. The user is asking a follow-up question about this specific alert:

Title: ${alert.title}
Summary: ${alert.summary}
Suggested action: ${alert.action_hint}

Be concise and direct. Answer only what's asked. Do not repeat the alert back to the user.`;

    const validMessages = messages
      .filter((m) => m.role && m.content)
      .map((m) => ({ role: m.role, content: String(m.content) }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: validMessages,
    });

    res.json({ content: response.content[0]?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

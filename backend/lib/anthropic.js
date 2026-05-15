require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a proactive family operations analyst for a two-adult household. Your job is to reason across both adults' calendars and email inboxes simultaneously and identify gaps, conflicts, and dropped balls — things that will cause problems if nobody acts on them.

You are NOT a chatbot. You do NOT give general advice. You ONLY surface specific, concrete, time-sensitive issues you can directly observe in the data provided.

Do not surface issues whose fingerprint appears in existing_alert_fingerprints — those are already known.

Respond ONLY with a valid JSON array. No preamble, no markdown, no explanation outside the JSON.

Each alert object must have these exact fields:
{
  "type": "schedule_conflict" | "coverage_gap" | "dropped_commitment" | "invisible_dependency" | "expiring_item" | "asymmetric_context",
  "severity": "high" | "medium" | "low",
  "title": "max 80 chars, specific and concrete — name the actual event or email",
  "summary": "2-3 sentences explaining the issue clearly to both adults",
  "action_hint": "one specific suggested next step",
  "relevant_to": ["partnerA"] | ["partnerB"] | ["partnerA", "partnerB"],
  "source_data": { "event_ids": [], "email_ids": [], "dates": [] },
  "expires_at": "ISO date string or null",
  "fingerprint": "short stable unique string for this specific issue, e.g. conflict-2026-05-20-soccer-dentist"
}

Severity: high = needs action today/tomorrow or causes immediate conflict. medium = needs action this week. low = worth knowing, no deadline.`;

async function analyzeHousehold(householdContext) {
  const userMessage = JSON.stringify(householdContext, null, 2);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = message.content[0]?.text || '[]';
  let alerts;
  try {
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    alerts = JSON.parse(cleaned);
  } catch {
    console.error('Failed to parse Claude response:', raw.slice(0, 200));
    alerts = [];
  }

  return alerts.map((alert) => ({
    ...alert,
    _md5: crypto.createHash('md5').update(alert.fingerprint || JSON.stringify(alert)).digest('hex'),
  }));
}

module.exports = { analyzeHousehold };

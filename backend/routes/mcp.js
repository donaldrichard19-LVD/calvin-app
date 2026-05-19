const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/apiKey');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');
const { sendSMS } = require('../lib/twilio');
const { sendDigestEmail } = require('../lib/email');
const { runAnalysisForHousehold } = require('../jobs/analyze');

router.use(requireApiKey);

// GET /api/mcp/alerts?severity=high&status=active
router.get('/alerts', async (req, res) => {
  try {
    const { severity, status = 'active' } = req.query;
    const now = new Date().toISOString();

    let query = supabase.from('alerts').select('*').eq('household_id', req.householdId);

    if (status === 'active') {
      query = query.eq('status', 'active').or(`snoozed_until.is.null,snoozed_until.lt.${now}`);
    } else if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (severity && severity !== 'all') query = query.eq('severity', severity);

    const { data: alerts, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const order = { high: 0, medium: 1, low: 2 };
    const sorted = (alerts || []).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

    res.json({ alerts: sorted, total: sorted.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/alerts/:id/dismiss', async (req, res) => {
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('household_id', req.householdId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.patch('/alerts/:id/snooze', async (req, res) => {
  const { hours = 24 } = req.body;
  const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'snoozed', snoozed_until: snoozedUntil, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('household_id', req.householdId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, snoozed_until: snoozedUntil });
});

router.patch('/alerts/:id/resolve', async (req, res) => {
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('household_id', req.householdId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/mcp/calendar
router.get('/calendar', async (req, res) => {
  try {
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('household_id', req.householdId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null);

    const [eventsA, eventsB] = await Promise.all([
      integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
      integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
    ]);

    const { data: partners } = await supabase
      .from('partners')
      .select('id, display_name')
      .eq('household_id', req.householdId);

    res.json({
      partnerA: { name: partners?.[0]?.display_name || 'Partner 1', events: eventsA },
      partnerB: { name: partners?.[1]?.display_name || 'Partner 2', events: eventsB },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/calendar
router.post('/calendar', async (req, res) => {
  try {
    const { title, start, end, description, attendees, timezone, partner_index = 0 } = req.body;
    if (!title || !start || !end) return res.status(400).json({ error: 'title, start, end required' });

    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('household_id', req.householdId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null);

    const intg = integrations?.[partner_index] ?? integrations?.[0];
    if (!intg) return res.status(400).json({ error: 'No Google Calendar connected for this household' });

    const event = await createCalendarEvent(intg, { title, start, end, description, attendees, timezone });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mcp/household
router.get('/household', async (req, res) => {
  try {
    const [{ data: household }, { data: partners }, { data: integrations }] = await Promise.all([
      supabase.from('households').select('id, name, invite_code, context').eq('id', req.householdId).single(),
      supabase.from('partners').select('id, display_name, phone, clerk_user_id').eq('household_id', req.householdId),
      supabase.from('integrations').select('partner_id, provider, is_active, account_email').eq('household_id', req.householdId),
    ]);
    res.json({ household, partners: partners || [], integrations: integrations || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/analyze
router.post('/analyze', async (req, res) => {
  try {
    runAnalysisForHousehold(req.householdId)
      .then(() => console.log('[mcp] analysis completed for', req.householdId))
      .catch((e) => console.error('[mcp] analysis failed:', e.message));
    res.json({ success: true, message: 'Analysis started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mcp/digest?type=daily|weekly
router.get('/digest', async (req, res) => {
  try {
    const { type = 'daily' } = req.query;
    const now = new Date();

    const [{ data: alerts }, { data: partners }, { data: integrations }] = await Promise.all([
      supabase.from('alerts').select('*').eq('household_id', req.householdId).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('partners').select('id, display_name').eq('household_id', req.householdId),
      supabase.from('integrations').select('*').eq('household_id', req.householdId).eq('provider', 'google').eq('is_active', true).not('access_token', 'is', null),
    ]);

    const [eventsA, eventsB] = await Promise.all([
      integrations?.[0] ? getCalendarEvents(integrations[0]).catch(() => []) : Promise.resolve([]),
      integrations?.[1] ? getCalendarEvents(integrations[1]).catch(() => []) : Promise.resolve([]),
    ]);

    const partnerA = partners?.[0]?.display_name || 'Partner 1';
    const partnerB = partners?.[1]?.display_name || 'Partner 2';
    const activeAlerts = alerts || [];
    const highAlerts = activeAlerts.filter((a) => a.severity === 'high');

    const dateStr = type === 'weekly'
      ? `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
      : now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let text = `Calvin ${type === 'weekly' ? 'Weekly Digest' : 'Daily Briefing'} — ${dateStr}\n\n`;

    if (activeAlerts.length === 0) {
      text += `✅ No active alerts — you're all clear!\n\n`;
    } else {
      text += `🚨 ${activeAlerts.length} active alert${activeAlerts.length !== 1 ? 's' : ''}`;
      if (highAlerts.length) text += ` (${highAlerts.length} high priority)`;
      text += '\n';
      for (const alert of activeAlerts.slice(0, 6)) {
        const badge = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🟢';
        text += `${badge} ${alert.title}\n`;
        if (alert.body) text += `   ${alert.body}\n`;
      }
      if (activeAlerts.length > 6) text += `   ...and ${activeAlerts.length - 6} more\n`;
      text += '\n';
    }

    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const isToday = (e) => { const s = new Date(e.start?.dateTime || e.start?.date); return s >= todayStart && s <= todayEnd; };

    const todayA = eventsA.filter(isToday);
    const todayB = eventsB.filter(isToday);

    if (todayA.length || todayB.length) {
      text += `📅 Today's schedule:\n`;
      if (todayA.length) text += `${partnerA}: ${todayA.map((e) => e.summary || 'Event').join(', ')}\n`;
      if (todayB.length) text += `${partnerB}: ${todayB.map((e) => e.summary || 'Event').join(', ')}\n`;
      text += '\n';
    }

    res.json({ text, type, alerts_count: activeAlerts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/digest/email?type=daily|weekly
router.post('/digest/email', async (req, res) => {
  try {
    const { type = 'daily' } = req.query;
    const result = await sendDigestEmail(req.householdId, type);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mcp/sms  { message, partner_id? }
router.post('/sms', async (req, res) => {
  try {
    const { message, partner_id } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    let query = supabase
      .from('partners')
      .select('id, phone, display_name')
      .eq('household_id', req.householdId)
      .not('phone', 'is', null);

    if (partner_id) query = query.eq('id', partner_id);

    const { data: targets } = await query;
    if (!targets?.length) return res.status(400).json({ error: 'No phone number found' });

    const results = await Promise.all(
      targets.map((p) =>
        sendSMS(p.phone, message)
          .then(() => ({ name: p.display_name, phone: p.phone, sent: true }))
          .catch((e) => ({ name: p.display_name, phone: p.phone, error: e.message }))
      )
    );

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

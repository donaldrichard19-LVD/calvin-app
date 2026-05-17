const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent } = require('../lib/google');

router.get('/events', requireAuth, async (req, res) => {
  try {
    const { data: me } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!me?.household_id) return res.json({ eventsA: [], eventsB: [] });

    const { data: allPartners } = await supabase
      .from('partners')
      .select('id, clerk_user_id')
      .eq('household_id', me.household_id);

    const other = allPartners?.find((p) => p.clerk_user_id !== req.auth.userId) || null;

    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('household_id', me.household_id)
      .eq('is_active', true)
      .eq('provider', 'google')
      .not('access_token', 'is', null);

    const myIntg    = integrations?.find((i) => i.partner_id === me.id) || null;
    const theirIntg = other ? integrations?.find((i) => i.partner_id === other.id) || null : null;
    console.log('[calendar] integrations found:', integrations?.length, '| myIntg:', !!myIntg, '| theirIntg:', !!theirIntg);
    if (myIntg) console.log('[calendar] myIntg token_expiry:', myIntg.token_expiry, '| has access_token:', !!myIntg.access_token, '| has refresh_token:', !!myIntg.refresh_token);

    const [eventsA, eventsB] = await Promise.all([
      myIntg    ? getCalendarEvents(myIntg).catch((err) => { console.error('[calendar] eventsA failed:', err.message); return []; })    : Promise.resolve([]),
      theirIntg ? getCalendarEvents(theirIntg).catch((err) => { console.error('[calendar] eventsB failed:', err.message); return []; }) : Promise.resolve([]),
    ]);

    res.json({ eventsA, eventsB });
  } catch (err) {
    console.error('[calendar] events error:', err.message);
    res.json({ eventsA: [], eventsB: [] });
  }
});

router.post('/create', requireAuth, async (req, res) => {
  try {
    const { title, start, end, description, attendees, timezone } = req.body;
    if (!title || !start || !end) return res.status(400).json({ error: 'title, start, and end are required' });

    const { data: me } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!me?.household_id) return res.status(400).json({ error: 'No household found' });

    const { data: intg } = await supabase
      .from('integrations')
      .select('*')
      .eq('partner_id', me.id)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null)
      .single();

    if (!intg) return res.status(400).json({ error: 'Google Calendar not connected. Reconnect in Settings.' });

    const event = await createCalendarEvent(intg, { title, start, end, description, attendees, timezone });
    res.json({ success: true, event });
  } catch (err) {
    console.error('[calendar/create]', err.message);
    const isScope = err.message?.includes('insufficient') || err.code === 403;
    res.status(isScope ? 403 : 500).json({
      error: isScope
        ? 'Calendar write access not granted. Go to Settings and reconnect Google.'
        : err.message,
    });
  }
});

module.exports = router;

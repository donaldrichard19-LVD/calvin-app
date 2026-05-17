const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents } = require('../lib/google');

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

module.exports = router;

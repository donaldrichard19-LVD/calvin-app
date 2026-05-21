const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../lib/supabase');
const { getCalendarEvents, createCalendarEvent, restoreCalendarEvent, refreshIfNeeded } = require('../lib/google');
const { decrypt } = require('../lib/crypto');

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

    let myIntg    = integrations?.find((i) => i.partner_id === me.id) || null;
    let theirIntg = other ? integrations?.find((i) => i.partner_id === other.id) || null : null;

    // Fallback: if myIntg not found via household_id (can happen when household_id was null at OAuth time)
    if (!myIntg) {
      const { data: fallback } = await supabase
        .from('integrations')
        .select('*')
        .eq('partner_id', me.id)
        .eq('provider', 'google')
        .eq('is_active', true)
        .not('access_token', 'is', null)
        .maybeSingle();
      if (fallback) {
        myIntg = fallback;
        // Backfill the missing household_id
        await supabase.from('integrations').update({ household_id: me.household_id }).eq('id', fallback.id);
        console.log('[calendar] Backfilled household_id for integration', fallback.id);
      }
    }

    console.log('[calendar] integrations found:', integrations?.length, '| myIntg:', !!myIntg, '| theirIntg:', !!theirIntg);
    if (myIntg) console.log('[calendar] myIntg token_expiry:', myIntg.token_expiry, '| has access_token:', !!myIntg.access_token, '| has refresh_token:', !!myIntg.refresh_token);

    const errors = [];
    const [eventsA, eventsB] = await Promise.all([
      myIntg ? getCalendarEvents(myIntg).catch((err) => {
        console.error('[calendar] eventsA failed:', err.message);
        errors.push(err.message);
        return [];
      }) : Promise.resolve([]),
      theirIntg ? getCalendarEvents(theirIntg).catch((err) => {
        console.error('[calendar] eventsB failed:', err.message);
        return [];
      }) : Promise.resolve([]),
    ]);

    res.json({ eventsA, eventsB, error: errors.length ? errors[0] : null });
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

router.post('/restore/:eventId', requireAuth, async (req, res) => {
  try {
    const { data: me } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();
    if (!me?.household_id) return res.status(400).json({ error: 'No household found' });

    const { data: action } = await supabase
      .from('calendar_actions')
      .select('*')
      .eq('household_id', me.household_id)
      .eq('event_id', req.params.eventId)
      .is('restored_at', null)
      .order('cancelled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!action) return res.status(404).json({ error: 'No cancellation record found for this event' });

    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('partner_id', action.partner_id)
      .eq('provider', 'google')
      .eq('is_active', true)
      .not('access_token', 'is', null)
      .maybeSingle();

    if (!integration) return res.status(400).json({ error: 'Google Calendar not connected for this partner' });

    await restoreCalendarEvent(integration, req.params.eventId);

    await supabase
      .from('calendar_actions')
      .update({ restored_at: new Date().toISOString() })
      .eq('id', action.id);

    if (action.alert_id) {
      await supabase
        .from('alerts')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', action.alert_id)
        .eq('household_id', me.household_id);
    }

    console.log(`[calendar] Restored event ${req.params.eventId} for household ${me.household_id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[calendar/restore]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/debug', requireAuth, async (req, res) => {
  const result = {};
  try {
    const encKey = process.env.ENCRYPTION_KEY || '';
    result.encryption_key_set = !!encKey && encKey !== '0'.repeat(64);

    const { data: me } = await supabase
      .from('partners')
      .select('id, household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    result.partner_id = me?.id;
    result.household_id = me?.household_id;

    const { data: intg } = await supabase
      .from('integrations')
      .select('id, partner_id, household_id, is_active, token_expiry, account_email, scope')
      .eq('partner_id', me?.id)
      .eq('provider', 'google')
      .maybeSingle();

    result.integration_found = !!intg;
    result.integration = intg
      ? {
          id: intg.id,
          is_active: intg.is_active,
          household_id: intg.household_id,
          household_id_matches: intg.household_id === me?.household_id,
          token_expiry: intg.token_expiry,
          account_email: intg.account_email,
          scope: intg.scope,
        }
      : null;

    if (intg) {
      const { data: fullIntg } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', intg.id)
        .single();

      result.has_access_token = !!fullIntg?.access_token;
      result.has_refresh_token = !!fullIntg?.refresh_token;

      try {
        const decrypted = decrypt(fullIntg?.access_token);
        result.decrypt_access_token = !!decrypted ? 'ok' : 'null_result';
      } catch (err) {
        result.decrypt_access_token = `FAILED: ${err.message}`;
      }

      try {
        const token = await refreshIfNeeded(fullIntg);
        result.token_refresh = token ? 'ok' : 'null';
      } catch (err) {
        result.token_refresh = `FAILED: ${err.message}`;
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ ...result, fatal_error: err.message });
  }
});

module.exports = router;

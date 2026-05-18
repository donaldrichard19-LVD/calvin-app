const express    = require('express');
const router     = express.Router();
const cors       = require('cors');
const { requireAuth } = require('../middleware/auth');
const { supabase }    = require('../lib/supabase');

const SAMPLE_ALERTS = [
  {
    type: 'schedule_conflict',
    severity: 'high',
    title: "Dentist (Ollie) overlaps with your 2pm work call on Thursday",
    summary: "Ollie's dentist appointment is scheduled 1:30–3pm Thursday, which directly conflicts with your standing 2pm team call. One of you needs to cover the appointment or the call needs to be moved.",
    action_hint: "Decide who takes Ollie to the dentist and block the other's calendar",
    relevant_to: ['partnerA', 'partnerB'],
    source_data: { event_ids: ['demo-evt-1', 'demo-evt-2'], email_ids: [], dates: ['2026-05-21'] },
    expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    fingerprint: 'demo-conflict-dentist-call-thu',
  },
  {
    type: 'coverage_gap',
    severity: 'high',
    title: "Ollie unscheduled Saturday morning — both calendars show conflicts",
    summary: "You both have commitments Saturday 9–11am with no childcare or coverage on the calendar for Ollie. This gap hasn't been accounted for in either schedule.",
    action_hint: "Add a coverage plan to the calendar for Saturday 9–11am",
    relevant_to: ['partnerA', 'partnerB'],
    source_data: { event_ids: [], email_ids: [], dates: ['2026-05-23'] },
    expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    fingerprint: 'demo-gap-ollie-saturday-morning',
  },
  {
    type: 'dropped_commitment',
    severity: 'medium',
    title: "Plumber follow-up email unread for 4 days — no appointment scheduled",
    summary: "The plumber sent a follow-up email Tuesday with available times to fix the leak. No response has been sent and nothing is on the calendar. This is at risk of falling through the cracks.",
    action_hint: "Reply to the plumber email and book an appointment",
    relevant_to: ['partnerA'],
    source_data: { event_ids: [], email_ids: ['demo-email-1'], dates: [] },
    expires_at: null,
    fingerprint: 'demo-dropped-plumber-followup',
  },
  {
    type: 'asymmetric_context',
    severity: 'low',
    title: "Partner has 3 back-to-back meetings Friday — no lunch break blocked",
    summary: "Friday's schedule shows three consecutive meetings from 10am–2pm with no break. Your partner may not know this and there's no food or coverage plan visible on either calendar.",
    action_hint: "Give your partner a heads up and consider ordering lunch",
    relevant_to: ['partnerB'],
    source_data: { event_ids: ['demo-evt-3'], email_ids: [], dates: ['2026-05-22'] },
    expires_at: null,
    fingerprint: 'demo-asymmetric-friday-meetings',
  },
];

// Open CORS — public endpoint for demo sign-in token
router.get('/token', cors(), async (req, res) => {
  try {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Clerk not configured' });

    const listRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=demo%40trycalvin.app`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const users = await listRes.json();
    const user  = Array.isArray(users) ? users[0] : null;
    if (!user) return res.status(404).json({ error: 'Demo user not found' });

    const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
      method:  'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: user.id, expires_in_seconds: 120 }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.token) return res.status(500).json({ error: 'Failed to create token', detail: tokenData });
    res.json({ token: tokenData.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed sample alerts for the demo household (called after onboarding)
router.post('/setup', requireAuth, async (req, res) => {
  try {
    const { data: partner } = await supabase
      .from('partners')
      .select('household_id')
      .eq('clerk_user_id', req.auth.userId)
      .single();

    if (!partner?.household_id) return res.status(400).json({ error: 'No household' });

    const householdId = partner.household_id;

    // Clear any existing alerts first
    await supabase.from('alerts').delete().eq('household_id', householdId);
    await supabase.from('alert_fingerprints').delete().eq('household_id', householdId);

    // Insert sample alerts
    for (const alert of SAMPLE_ALERTS) {
      const { data: inserted } = await supabase
        .from('alerts')
        .insert({ ...alert, household_id: householdId, status: 'active' })
        .select('id')
        .single();

      if (inserted) {
        await supabase.from('alert_fingerprints').upsert(
          { household_id: householdId, fingerprint: alert.fingerprint, alert_id: inserted.id },
          { onConflict: 'household_id,fingerprint' }
        );
      }
    }

    res.json({ success: true, alerts: SAMPLE_ALERTS.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

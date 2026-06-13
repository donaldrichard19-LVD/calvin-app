const express    = require('express');
const router     = express.Router();
const cors       = require('cors');
const { requireAuth } = require('../middleware/auth');
const { supabase }    = require('../lib/supabase');

function daysFromNow(n) {
  return new Date(Date.now() + n * 86400000).toISOString().split('T')[0];
}

const SAMPLE_ALERTS = [
  {
    type: 'schedule_conflict',
    severity: 'high',
    title: "Parent-teacher conf overlaps Emma's soccer pickup Thursday 4pm",
    summary: "Both partners are unavailable at the same time Thursday afternoon. The parent-teacher conference at Lincoln Elementary runs 4–5pm, and Emma's soccer pickup is also at 4pm at Riverside Park. No backup coverage is currently arranged.",
    action_hint: "Decide who attends the conference and arrange backup pickup for Emma",
    relevant_to: ['partnerA', 'partnerB'],
    source_data: { event_ids: [], email_ids: [], dates: [daysFromNow(3)] },
    expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    fingerprint: 'demo-conflict-parent-teacher-soccer-thu',
  },
  {
    type: 'coverage_gap',
    severity: 'high',
    title: "Emma's Wednesday school dropoff uncovered — Jordan at offsite, Alex has 7:45am call",
    summary: "Jordan is at an all-day team offsite Wednesday. Alex has a 7:45am video call that overlaps with the 8:00am school dropoff window. Neither partner has Wednesday morning dropoff covered.",
    action_hint: "Arrange backup dropoff for Wednesday morning, or reschedule Alex's 7:45am call",
    relevant_to: ['partnerA', 'partnerB'],
    source_data: { event_ids: [], email_ids: [], dates: [daysFromNow(2)] },
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    fingerprint: 'demo-gap-emma-wednesday-dropoff',
  },
  {
    type: 'dropped_commitment',
    severity: 'medium',
    title: "HOA renewal notice — $425 due in 7 days, no payment initiated",
    summary: "An email from Maplewood HOA arrived 3 days ago with annual dues of $425 due in 7 days. The email has been read but no payment or reminder has been added. Last year the late fee was $75.",
    action_hint: "Pay online at the HOA portal or add a payment reminder",
    relevant_to: ['partnerB'],
    source_data: { event_ids: [], email_ids: [], dates: [] },
    expires_at: null,
    fingerprint: 'demo-dropped-hoa-renewal',
  },
  {
    type: 'coverage_gap',
    severity: 'medium',
    title: "No childcare block added for Jordan's Friday offsite",
    summary: "Jordan has a full-day offsite on Friday (8am–6pm). There's no childcare block on either calendar for Emma's school pickup at 3:30pm or Liam's preschool pickup at 12:30pm.",
    action_hint: "Add a childcare block to the calendar for Friday 12:30–4:00pm",
    relevant_to: ['partnerA', 'partnerB'],
    source_data: { event_ids: [], email_ids: [], dates: [daysFromNow(4)] },
    expires_at: null,
    fingerprint: 'demo-gap-friday-offsite-childcare',
  },
  {
    type: 'expiring_item',
    severity: 'low',
    title: "Liam's 6-month pediatric checkup is 3 weeks overdue",
    summary: "Liam's last well-child visit was 6.5 months ago. The pediatrician's office sent a reminder email 10 days ago that hasn't been acted on. Scheduling typically takes 1–2 weeks lead time.",
    action_hint: "Call Dr. Patel's office or book online at their patient portal",
    relevant_to: ['partnerA'],
    source_data: { event_ids: [], email_ids: [], dates: [] },
    expires_at: null,
    fingerprint: 'demo-expiring-liam-pediatric-checkup',
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

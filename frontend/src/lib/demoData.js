// All dates generated relative to now so the demo always looks current
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function dt(daysOffset, h, m = 0) {
  const d = daysFromNow(daysOffset);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
}
function hoursAgo(h) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ── Partners & household ───────────────────────────────────────────────────

export const DEMO_HOUSEHOLD = {
  household:     { id: 'demo-hh', name: 'Chen Family', invite_code: 'CHEN42' },
  partner:       { id: 'demo-pa', display_name: 'Alex', phone: '+1 (555) 012-3456', clerk_user_id: 'demo' },
  other_partner: { id: 'demo-pb', display_name: 'Jordan' },
};

export const DEMO_INTEGRATIONS = [
  {
    id: 'intg-a', partner_id: 'demo-pa', provider: 'google', is_active: true,
    account_email: 'alex.chen@gmail.com', last_synced_at: hoursAgo(0.4),
  },
  {
    id: 'intg-c', partner_id: 'demo-pa', provider: 'google', is_active: true,
    account_email: 'alex.chen@work.com', last_synced_at: hoursAgo(0.5),
  },
  {
    id: 'intg-b', partner_id: 'demo-pb', provider: 'google', is_active: true,
    account_email: 'jordan.chen@gmail.com', last_synced_at: hoursAgo(0.6),
  },
];

export const DEMO_MY_INTEGRATIONS = [DEMO_INTEGRATIONS[0], DEMO_INTEGRATIONS[1]];

// ── Alerts ─────────────────────────────────────────────────────────────────

const DEMO_ALERTS_BASE = [
  {
    id: 'alert-1',
    severity: 'high',
    type: 'schedule_conflict',
    title: 'Double-booked Thursday — parent-teacher conf overlaps Emma\'s soccer pickup',
    summary:
      'Both of you are unavailable at the same time on Thursday afternoon. Alex has a board prep meeting that runs 2–4pm, and Jordan has a quarterly review until 4pm. Emma\'s soccer pickup is at 4:00pm and the parent-teacher conference is also at 4:00pm — there\'s no one to cover both.',
    action_hint: 'Decide who takes the parent-teacher conf and arrange backup pickup for Emma.',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: { dates: [dt(3, 16)] },
    created_at: hoursAgo(1.2),
    updated_at: hoursAgo(1.2),
  },
  {
    id: 'alert-2',
    severity: 'high',
    type: 'coverage_gap',
    title: 'Emma\'s school dropoff uncovered Wednesday — Jordan\'s offsite, Alex has early call',
    summary:
      'Jordan is at a two-day team offsite Tuesday and Wednesday (9am–6pm). On Wednesday morning, Alex has a 7:45am video call that conflicts with the 8:00am school dropoff window. Neither partner has Emma\'s Wednesday morning dropoff covered.',
    action_hint: 'Ask a grandparent for Wednesday morning, or reschedule Alex\'s 7:45am call.',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: { dates: [dt(2, 8)] },
    created_at: hoursAgo(1.5),
    updated_at: hoursAgo(1.5),
  },
  {
    id: 'alert-3',
    severity: 'medium',
    type: 'dropped_commitment',
    title: 'HOA renewal notice — $425 due in 7 days, no payment initiated',
    summary:
      'An email from Maplewood HOA arrived 3 days ago with an annual dues invoice of $425 due in 7 days. The email has been read but no payment or calendar reminder has been added. Last year the late fee was $75.',
    action_hint: 'Pay online at the HOA portal or add a reminder before the due date.',
    relevant_to: ['partnerB'],
    status: 'open',
    source_data: {},
    created_at: hoursAgo(3),
    updated_at: hoursAgo(3),
  },
  {
    id: 'alert-4',
    severity: 'medium',
    type: 'coverage_gap',
    title: 'Emma\'s soccer pickup gap Wednesday 4pm — Jordan at offsite until 6pm',
    summary:
      'Emma\'s soccer practice ends at 4:00pm on Wednesday. Jordan is at an all-day offsite and won\'t be back until 6pm. Alex has a team sync that ends at 12pm but no conflicts at 4pm — however this hasn\'t been confirmed as covered.',
    action_hint: 'Confirm Alex can do Wednesday pickup, or ask grandparents as backup.',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: { dates: [dt(2, 16)] },
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2),
  },
  {
    id: 'alert-5',
    severity: 'low',
    type: 'expiring_item',
    title: 'Liam\'s 6-month pediatric checkup is 3 weeks overdue',
    summary:
      'Liam\'s last well-child visit was 6.5 months ago. The pediatrician\'s office sent a reminder email 10 days ago that hasn\'t been acted on. Scheduling typically takes 1–2 weeks lead time.',
    action_hint: 'Call Dr. Patel\'s office or book online at their patient portal.',
    relevant_to: ['partnerA'],
    status: 'open',
    source_data: {},
    created_at: hoursAgo(10),
    updated_at: hoursAgo(10),
  },
  {
    id: 'alert-7',
    severity: 'medium',
    type: 'coverage_gap',
    title: 'No childcare block added for Jordan\'s Friday offsite',
    summary:
      'Jordan has a full-day offsite on Friday (8am–6pm). There\'s no childcare block on either calendar for Emma\'s school pickup at 3:30pm or Liam\'s preschool pickup at 12:30pm. Both need to be covered.',
    action_hint: 'Add a childcare block to the calendar for Friday 12:30–4:00pm.',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: { dates: [dt(4, 12, 30)], calvin_can_act: true, action_type: 'calendar_event' },
    created_at: hoursAgo(0.5),
    updated_at: hoursAgo(0.5),
  },
  {
    id: 'alert-8',
    severity: 'medium',
    type: 'dropped_commitment',
    title: 'Emma\'s soccer coach waiting on RSVP for Saturday tournament',
    summary:
      'Coach Rivera sent an email 2 days ago asking families to confirm whether Emma will attend the Saturday tournament at Riverside Park (8am–2pm). No reply has been sent. The deadline to confirm is tomorrow.',
    action_hint: 'Reply to Coach Rivera\'s email to confirm Emma\'s attendance at the Saturday tournament.',
    relevant_to: ['partnerA'],
    status: 'open',
    source_data: { email_ids: ['msg-coach-rsvp'], calvin_can_act: true, action_type: 'email_reply', email_reply_to: 'coach.rivera@soccerleague.org' },
    created_at: hoursAgo(2.5),
    updated_at: hoursAgo(2.5),
  },
  {
    id: 'alert-9',
    severity: 'medium',
    type: 'invisible_dependency',
    title: 'Liam\'s preschool flagged a nut exposure today — monitor for symptoms',
    summary:
      'Liam\'s preschool sent an alert this afternoon about a possible nut product brought in by another child. Liam has a nut allergy. The teacher monitored him during the afternoon and he appears fine, but the pediatrician recommends watching for delayed reactions over the next 72 hours. Jordan may not have seen the school email yet.',
    action_hint: 'Monitor Liam for allergy symptoms over the next 3 days and follow up with Dr. Patel if anything develops.',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: { action_type: 'reminder' },
    created_at: hoursAgo(0.3),
    updated_at: hoursAgo(0.3),
  },
  {
    id: 'alert-6',
    severity: 'low',
    type: 'unshared_context',
    title: 'Amazon Subscribe & Save order — $91 ships in 2 days, review before it locks',
    summary:
      'A recurring Amazon Subscribe & Save order for household supplies (diapers, paper towels, dish soap) is scheduled to process and ship in 48 hours. Jordan placed this order last month; Alex may not be aware. If quantities or items need adjusting, the window closes soon.',
    action_hint: 'Review the order in Amazon Subscribe & Save and adjust if needed.',
    relevant_to: ['partnerB'],
    status: 'open',
    source_data: {},
    created_at: hoursAgo(5),
    updated_at: hoursAgo(5),
  },
  {
    id: 'alert-cs-1',
    severity: 'low',
    type: 'context_suggestion',
    title: 'Add routine: Piano lessons Wednesdays',
    summary: 'Detected from recurring calendar event "Emma Piano Lesson" every Wednesday 5-6pm at Harmony Music Studio.',
    action_hint: 'Add to your Context Wallet under routines',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: {
      category: 'routines',
      entry: { label: 'Emma piano lessons', details: 'Wednesdays 5-6pm at Harmony Music Studio', who: '' },
      confidence: 'high',
      evidence: 'Recurring calendar event "Emma Piano Lesson" every Wednesday 5-6pm',
    },
    created_at: hoursAgo(0.5),
    updated_at: hoursAgo(0.5),
  },
  {
    id: 'alert-cs-2',
    severity: 'low',
    type: 'context_suggestion',
    title: 'Add preference: Frequently orders from Pad Thai Palace',
    summary: 'Found 4 DoorDash order confirmation emails from Pad Thai Palace in the last 30 days.',
    action_hint: 'Add to your Context Wallet under preferences',
    relevant_to: ['partnerA', 'partnerB'],
    status: 'open',
    source_data: {
      category: 'preferences',
      entry: { label: 'Takeout', value: 'Pad Thai Palace (DoorDash) — order "no peanuts" for Emma' },
      confidence: 'medium',
      evidence: '4 DoorDash order confirmation emails from Pad Thai Palace in last 30 days',
    },
    created_at: hoursAgo(0.5),
    updated_at: hoursAgo(0.5),
  },
];

// Mutable copy so dismiss/resolve work in-session
let demoAlerts = [...DEMO_ALERTS_BASE];

function buildMeta(alerts) {
  const active = alerts.filter((a) => a.status === 'open');
  return {
    total:             active.length,
    high_count:        active.filter((a) => a.severity === 'high').length,
    medium_count:      active.filter((a) => a.severity === 'medium').length,
    low_count:         active.filter((a) => a.severity === 'low').length,
    last_analysis_at:  hoursAgo(0.3),
  };
}

// ── Calendar events ────────────────────────────────────────────────────────

const DEMO_CALENDAR = {
  eventsA: [
    // Mon (today, day 0)
    { id: 'ea-1',  title: 'School dropoff — Emma & Liam', start: dt(0, 8, 0),  end: dt(0, 8, 30),  location: 'Lincoln Elementary' },
    { id: 'ea-2',  title: 'Team standup',                  start: dt(0, 9, 0),  end: dt(0, 9, 30)  },
    { id: 'ea-3',  title: 'Lunch with Sarah',              start: dt(0, 12, 0), end: dt(0, 13, 0),  location: 'Tartine Bakery' },
    { id: 'ea-4',  title: 'Kids pickup',                   start: dt(0, 15, 30),end: dt(0, 16, 0),  location: 'Lincoln Elementary' },
    // Tue (day 1)
    { id: 'ea-5',  title: 'Dentist appointment',           start: dt(1, 10, 0), end: dt(1, 11, 0),  location: 'Bright Smiles Dental' },
    { id: 'ea-6',  title: 'Deep work block',               start: dt(1, 13, 0), end: dt(1, 15, 0)  },
    // Wed (day 2)
    { id: 'ea-7',  title: 'Video call — 7:45am',           start: dt(2, 7, 45), end: dt(2, 8, 45)  },
    { id: 'ea-8',  title: 'Team sync',                     start: dt(2, 11, 0), end: dt(2, 12, 0)  },
    { id: 'ea-9',  title: 'Emma soccer pickup',            start: dt(2, 16, 0), end: dt(2, 16, 30), location: 'Riverside Park' },
    // Thu (day 3)
    { id: 'ea-10', title: 'All-hands meeting',             start: dt(3, 9, 0),  end: dt(3, 10, 30) },
    { id: 'ea-11', title: 'Board prep',                    start: dt(3, 14, 0), end: dt(3, 16, 0)  },
    { id: 'ea-12', title: 'Parent-teacher conference',     start: dt(3, 16, 0), end: dt(3, 17, 0),  location: 'Lincoln Elementary' },
    // Fri (day 4)
    { id: 'ea-13', title: 'Work half-day',                 start: dt(4, 9, 0),  end: dt(4, 12, 0)  },
    // Sat (day 5)
    { id: 'ea-14', title: 'Grocery run',                   start: dt(5, 9, 30), end: dt(5, 10, 30), location: 'Whole Foods' },
    { id: 'ea-15', title: 'Gym',                           start: dt(5, 11, 0), end: dt(5, 12, 30), location: 'Equinox' },
    // Sun (day 6)
    { id: 'ea-16', title: 'Meal prep',                     start: dt(6, 15, 0), end: dt(6, 17, 0)  },
  ],
  eventsB: [
    // Mon (today, day 0)
    { id: 'eb-1',  title: 'Client call',                   start: dt(0, 10, 0), end: dt(0, 11, 30) },
    { id: 'eb-2',  title: 'Project review',                start: dt(0, 14, 0), end: dt(0, 15, 30) },
    // Tue (day 1)
    { id: 'eb-3',  title: 'Team offsite — Day 1',          start: dt(1, 9, 0),  end: dt(1, 18, 0),  location: 'Hotel Emblem, SF' },
    // Wed (day 2)
    { id: 'eb-4',  title: 'Team offsite — Day 2',          start: dt(2, 9, 0),  end: dt(2, 18, 0),  location: 'Hotel Emblem, SF' },
    // Thu (day 3)
    { id: 'eb-5',  title: 'Quarterly business review',     start: dt(3, 9, 0),  end: dt(3, 11, 0)  },
    { id: 'eb-6',  title: 'Emma soccer pickup',            start: dt(3, 16, 0), end: dt(3, 16, 30), location: 'Riverside Park' },
    // Fri (day 4)
    { id: 'eb-7',  title: '1-on-1s',                       start: dt(4, 10, 0), end: dt(4, 12, 0)  },
    { id: 'eb-8',  title: 'Emma\'s school play',           start: dt(4, 15, 0), end: dt(4, 16, 30), location: 'Lincoln Elementary' },
    // Sat (day 5)
    { id: 'eb-9',  title: 'Yoga',                          start: dt(5, 8, 30), end: dt(5, 9, 30),  location: 'CorePower Yoga' },
    { id: 'eb-10', title: 'Family lunch',                  start: dt(5, 12, 0), end: dt(5, 14, 0),  location: 'Nopalito' },
    // Sun (day 6)
    { id: 'eb-11', title: 'In-laws visiting',              start: dt(6, 13, 0), end: dt(6, 18, 0)  },
  ],
};

// ── Insights / stats ───────────────────────────────────────────────────────

const DEMO_STATS = {
  active:          6,
  resolved_30d:    14,
  resolution_rate: 78,
  created_30d:     20,
  dismissed_30d:   4,
  by_type: {
    coverage_gap:         6,
    schedule_conflict:    4,
    dropped_commitment:   3,
    expiring_item:        3,
    unshared_context:     2,
    invisible_dependency: 1,
  },
  recent_resolved: [
    { id: 'r-1', title: 'Car registration renewal — paid online', type: 'dropped_commitment', updated_at: daysAgo(2) },
    { id: 'r-2', title: 'Soccer practice schedule clash resolved — Jordan taking Tuesdays', type: 'schedule_conflict', updated_at: daysAgo(4) },
    { id: 'r-3', title: 'Liam\'s preschool field trip permission slip submitted', type: 'dropped_commitment', updated_at: daysAgo(5) },
    { id: 'r-4', title: 'Babysitter booked for date night Friday', type: 'coverage_gap', updated_at: daysAgo(7) },
    { id: 'r-5', title: 'FSA deadline reminder actioned — reimbursements filed', type: 'expiring_item', updated_at: daysAgo(9) },
  ],
};

// ── Household context ──────────────────────────────────────────────────────

const DEMO_CONTEXT = {
  members: [
    { id: 'm-1', name: 'Emma',  role: 'child', age: '8', notes: 'Nut allergy · soccer Tue/Thu 3:30–4:30' },
    { id: 'm-2', name: 'Liam',  role: 'child', age: '5', notes: 'Loves dinosaurs · preschool 8:30–12:30' },
  ],
  routines: [
    { id: 'r-1', label: 'School dropoff', details: 'Mon-Fri 8:00am at Lincoln Elementary', who: 'Alex' },
    { id: 'r-2', label: 'Emma soccer practice', details: 'Tue/Thu 3:30-4:30pm at Riverside Park', who: '' },
    { id: 'r-3', label: 'Liam preschool pickup', details: 'Mon-Fri 12:30pm', who: 'Jordan' },
  ],
  preferences: [
    { id: 'p-1', label: 'Dietary', value: 'Vegetarian household, Emma is also nut-free' },
    { id: 'p-2', label: 'Groceries', value: 'Whole Foods for produce, Costco for bulk' },
  ],
  logistics: [
    { id: 'l-1', label: 'Pediatrician', value: 'Dr. Patel, 555-0199, Mon/Wed/Fri mornings' },
    { id: 'l-2', label: 'Grandparents', value: 'Pat & Chris Chen, 20 min away, available with advance notice' },
    { id: 'l-3', label: 'School', value: 'Lincoln Elementary, 555-0100, front office opens 7:30am' },
  ],
  notes: 'Vegetarian household. Grandparents (Pat & Chris) live 20 min away and are available for pickups with advance notice.',
};

const DEMO_CONTEXT_SHARING = {
  members: true, routines: true, preferences: true, logistics: true, orders: true,
};

const DEMO_ORDERS = [
  {
    id: 'order-1', source: 'instacart', description: 'Weekly grocery order — Whole Foods',
    items: [{ name: 'Organic bananas', qty: 2, price: 3.99 }, { name: 'Almond milk', qty: 1, price: 5.49 }],
    total: 87.42, status: 'delivered', eta: null, placed_by: 'Jordan', notes: 'Leave at front door',
    created_at: daysAgo(2), updated_at: daysAgo(1),
  },
  {
    id: 'order-2', source: 'doordash', description: 'Thai food from Pad Thai Palace',
    items: [{ name: 'Pad Thai (no peanuts)', qty: 2, price: 14.99 }, { name: 'Spring Rolls', qty: 1, price: 6.99 }],
    total: 42.97, status: 'delivered', eta: null, placed_by: 'Alex', notes: '',
    created_at: daysAgo(5), updated_at: daysAgo(5),
  },
  {
    id: 'order-3', source: 'amazon', description: 'Subscribe & Save — household supplies',
    items: [{ name: 'Diapers', qty: 1, price: 34.99 }, { name: 'Paper towels', qty: 1, price: 22.99 }],
    total: 91.47, status: 'placed', eta: dt(2, 14), placed_by: 'Jordan', notes: '',
    created_at: hoursAgo(6), updated_at: hoursAgo(6),
  },
];

const DEMO_SHARE_INFO = {
  share_url: 'https://calvin-app.onrender.com/api/context/card/demo-share-token-abc123',
  share_token: 'demo-share-token-abc123',
};

// ── Router ─────────────────────────────────────────────────────────────────

export function getDemoResponse(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  if (path === '/api/household/me')           return Promise.resolve(DEMO_HOUSEHOLD);
  if (path === '/api/integrations/household') return Promise.resolve(DEMO_INTEGRATIONS);
  if (path === '/api/integrations')           return Promise.resolve(DEMO_MY_INTEGRATIONS);
  if (path === '/api/calendar/events')        return Promise.resolve(DEMO_CALENDAR);
  if (path === '/api/briefing/stats')         return Promise.resolve(DEMO_STATS);
  if (path === '/api/briefing/history')       return Promise.resolve([]);
  if (path === '/api/household/context' && method === 'GET') return Promise.resolve({ context: DEMO_CONTEXT, context_sharing: DEMO_CONTEXT_SHARING });
  if (path === '/api/household/context' && method === 'PATCH') return Promise.resolve({});
  if (path === '/api/household/context/card') return Promise.resolve({
    card: `[Family Context — powered by Calvin]\nPartners: Alex, Jordan\nFamily members: Emma (child, age 8) — Nut allergy · soccer Tue/Thu 3:30–4:30; Liam (child, age 5) — Loves dinosaurs · preschool 8:30–12:30\nRoutines: School dropoff: Mon-Fri 8:00am at Lincoln Elementary (Alex); Emma soccer practice: Tue/Thu 3:30-4:30pm at Riverside Park; Liam preschool pickup: Mon-Fri 12:30pm (Jordan)\nPreferences: Dietary: Vegetarian household, Emma is also nut-free; Groceries: Whole Foods for produce, Costco for bulk\nLogistics: Pediatrician: Dr. Patel, 555-0199, Mon/Wed/Fri mornings; Grandparents: Pat & Chris Chen, 20 min away; School: Lincoln Elementary, 555-0100\nNotes: Vegetarian household. Grandparents (Pat & Chris) live 20 min away and are available for pickups with advance notice.`,
  });
  if (path === '/api/household/share-info') return Promise.resolve(DEMO_SHARE_INFO);
  if (path === '/api/household/share-token/regenerate' && method === 'POST') return Promise.resolve({
    share_url: 'https://calvin-app.onrender.com/api/context/card/demo-new-token-' + Date.now(),
    share_token: 'demo-new-token-' + Date.now(),
  });
  if (path === '/api/household/orders') return Promise.resolve({ orders: DEMO_ORDERS });
  if (path === '/api/household/mcp-info')     return Promise.resolve({
    mcp_url: 'https://calvin-app.onrender.com/mcp/demo-abc123xyz',
    digest_email_enabled: false,
    digest_email_frequency: 'weekly',
  });
  if (path === '/api/household/connections')  return Promise.resolve({
    claude: { status: 'recent', last_seen_at: hoursAgo(1.5) },
    chatgpt: { status: 'never', last_seen_at: null },
  });
  if (path === '/api/household/connections/revoke' && method === 'POST')
    return Promise.resolve({ mcp_url: 'https://calvin-app.onrender.com/mcp/demo-newtoken456' });
  if (path === '/api/household/notifications' && method === 'PATCH') return Promise.resolve({});

  if (path === '/api/briefing') {
    const open = demoAlerts.filter((a) => a.status === 'open');
    return Promise.resolve({ alerts: open, meta: buildMeta(open) });
  }

  // Mutations: dismiss / snooze / resolve
  const dismissMatch = path.match(/^\/api\/briefing\/([^/]+)\/dismiss$/);
  if (dismissMatch && method === 'PATCH') {
    demoAlerts = demoAlerts.filter((a) => a.id !== dismissMatch[1]);
    return Promise.resolve({});
  }
  const snoozeMatch = path.match(/^\/api\/briefing\/([^/]+)\/snooze$/);
  if (snoozeMatch && method === 'PATCH') {
    demoAlerts = demoAlerts.filter((a) => a.id !== snoozeMatch[1]);
    return Promise.resolve({});
  }
  const resolveMatch = path.match(/^\/api\/briefing\/([^/]+)\/resolve$/);
  if (resolveMatch && method === 'PATCH') {
    demoAlerts = demoAlerts.map((a) =>
      a.id === resolveMatch[1] ? { ...a, status: 'resolved' } : a
    );
    return Promise.resolve({});
  }
  const acceptMatch = path.match(/^\/api\/briefing\/([^/]+)\/accept-suggestion$/);
  if (acceptMatch && method === 'PATCH') {
    const alert = demoAlerts.find((a) => a.id === acceptMatch[1]);
    demoAlerts = demoAlerts.map((a) =>
      a.id === acceptMatch[1] ? { ...a, status: 'resolved' } : a
    );
    const category = alert?.source_data?.category || 'routines';
    const entry = { id: crypto.randomUUID(), ...(alert?.source_data?.entry || {}) };
    return Promise.resolve({ success: true, category, entry });
  }

  // Chat — Take Action and inline follow-up
  if (path === '/api/chat' && method === 'POST') {
    const body = options.body ? JSON.parse(options.body) : {};
    const alert = demoAlerts.find((a) => a.id === body.alertId);
    const messages = body.messages || [];
    const lastMsg = (messages[messages.length - 1]?.content || '').toLowerCase();
    const actionType = alert?.source_data?.action_type;
    const hint = (alert?.action_hint || '').toLowerCase();

    // "Take this action" — first message matches the action hint
    const isTakeAction = messages.length === 1 && messages[0]?.content === alert?.action_hint;
    if (isTakeAction) {
      const isEmail = actionType === 'email_reply' || hint.includes('reply') || hint.includes('email');
      const isCalendar = actionType === 'calendar_event' || hint.includes('calendar') || hint.includes('schedule') || hint.includes('add') || hint.includes('block');
      const isReminder = actionType === 'reminder' || hint.includes('monitor') || hint.includes('follow up') || hint.includes('check in') || hint.includes('watch for') || hint.includes('keep an eye');
      if (isEmail) {
        return new Promise((res) => setTimeout(() => res({
          content: 'I\'ve drafted a reply for you. Review it below before sending.',
          eventCreated: null,
          draftCreated: {
            to: alert?.source_data?.email_reply_to || 'contact@example.com',
            subject: 'Re: ' + (alert?.title || 'Follow-up'),
            body: `Hi,\n\nJust following up on the above — happy to confirm and let us know if you need anything else.\n\nThanks,\nAlex`,
          },
          reminderScheduled: false,
        }), 800));
      }
      if (isCalendar) {
        return new Promise((res) => setTimeout(() => res({
          content: 'Done! I\'ve added the event to your calendar.',
          eventCreated: { title: alert?.title || 'Calendar event', start: dt(2, 9, 0), end: dt(2, 10, 0) },
          draftCreated: null,
          reminderScheduled: false,
        }), 800));
      }
      if (isReminder) {
        return new Promise((res) => setTimeout(() => res({
          content: 'Reminder set. I\'ll resurface this in 3 days so you don\'t lose track of it.',
          eventCreated: null,
          draftCreated: null,
          reminderScheduled: true,
        }), 800));
      }
    }

    // Inline chat follow-up — simulate a contextual response
    const chatReplies = [
      `Good question. For "${alert?.title}", the key thing to watch is whether both partners are aligned on timing. I'd suggest confirming by end of day.`,
      `Based on what I can see, the most important next step is: ${alert?.action_hint || 'review the situation and coordinate with your partner'}.`,
      `This is a medium-priority item. If it's not resolved by tomorrow, it could escalate — I'd handle it today if possible.`,
      `You're right to flag this. The main risk is the timing overlap — I'd suggest one of you takes ownership and loops in the other.`,
    ];
    const reply = chatReplies[Math.floor(Math.random() * chatReplies.length)];
    return new Promise((res) => setTimeout(() => res({
      content: reply,
      eventCreated: null,
      draftCreated: null,
      reminderScheduled: false,
    }), 900));
  }

  // Email send — no-op in demo
  if (path === '/api/email/send' && method === 'POST') {
    return new Promise((res) => setTimeout(() => res({ success: true, messageId: 'demo-msg-1' }), 600));
  }

  // Sync trigger — no-op in demo
  if (path === '/api/analyze/trigger') return Promise.resolve({ ok: true });

  // Google connect — redirect to dashboard root (no real OAuth in demo)
  if (path === '/api/google/connect') return Promise.resolve({ url: '/' });

  return Promise.resolve({});
}

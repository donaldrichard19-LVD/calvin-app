# CLAUDE.md

Calvin — family coordination app for couples. Detects calendar/inbox conflicts, surfaces alerts, keeps partners in sync.

## Stack

**Frontend** (`frontend/`) — React 18, React Router 6, Vite, Tailwind, Clerk auth (`@clerk/clerk-react`), Supabase JS client. Auth token attached via `src/lib/api.js` → `apiFetch`.

**Backend** (`backend/`) — Express, node-cron, Clerk SDK (`middleware/auth.js`), Supabase service role (`lib/supabase.js`), Anthropic SDK (`lib/anthropic.js`), Google Calendar + Gmail OAuth (`lib/google.js`), Twilio SMS (`lib/twilio.js`), AES-256 token encryption (`lib/crypto.js`).

## Key files

| Route | File | Purpose |
|---|---|---|
| `/api/household` | `routes/household.js` | Household & partner management |
| `/api/integrations` | `routes/integrations.js` | Google OAuth token storage |
| `/api/google` | `routes/google.js` | OAuth connect/callback |
| `/api/briefing` | `routes/briefing.js` | Alerts: dismiss, snooze, resolve |
| `/api/chat` | `routes/chat.js` | Claude tool-use chat (calendar creation) |
| `/api/sms` | `routes/sms.js` | Twilio SMS |
| `/api/calendar` | `routes/calendar.js` | Calendar event reads |
| `/api/funnel` | `routes/funnel.js` | Onboarding funnel event tracking |
| `/api/analyze/trigger` | `server.js` | Manual analysis trigger |

| Component | File | Purpose |
|---|---|---|
| Dashboard | `src/pages/Dashboard.jsx` | Main view, polls every 90s |
| Onboarding | `src/pages/Onboarding.jsx` | Household creation / invite-code join |
| BriefingFeed | `src/components/BriefingFeed.jsx` | Alert cards: dismiss/snooze/resolve |
| TimelineView | `src/components/TimelineView.jsx` | Calendar timeline, both partners |
| InsightsView | `src/components/InsightsView.jsx` | Stats tab |
| SettingsView | `src/components/SettingsView.jsx` | Settings tab |
| ChatDrawer | `src/components/ChatDrawer.jsx` | Claude chat with tool use |

## Deployment

- **Frontend**: Vercel, domain `calvinai.co`. Deploy: `cd ~/family-hq && vercel --prod`
- **Backend**: Render, URL `calvin-app.onrender.com`. Deploy: push to `main` on GitHub.

## Data model (Supabase)

- `households` — `name`, `invite_code`
- `partners` — `clerk_user_id`, `household_id`, `display_name`, `phone`
- `integrations` — `partner_id`, `provider` (google), encrypted tokens, `is_active`
- `alerts` — `household_id`, `severity` (high/medium/low), `title`, `body`, `status`, `source`, `metadata`
- `calendar_actions` — `event_id`, `event_title`, `trigger_email_subject`, `cancelled_at`, `household_id`, `restored_at`
- `funnel_events` — `partner_id`, `household_id`, `event`, `metadata`, `created_at`

## System Requirements

### Alert deduplication & completion detection
- Fingerprint every alert (type + date + participants hash). On each analysis run, skip inserting if a matching fingerprint is already `open`/`snoozed` — update `updated_at` instead.
- Auto-resolve an active alert when the recommended action is complete (e.g. calendar event now exists, pickup confirmed by email).
- Dismissal personalisation: 3+ dismissals of a type → skip medium/low for that type; 6+ → skip the type entirely unless urgent. High-severity genuine conflicts are never suppressed.
- Analysis reads both partners' calendars and emails for the full lookahead window.

## Backlog

See [BACKLOG.md](./BACKLOG.md).

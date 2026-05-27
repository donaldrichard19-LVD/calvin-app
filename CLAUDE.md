# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

- Platform: ChromeOS Linux (Crostini) running on a Debian-based container
- Shell: bash

## Active Project: Calvin (Family HQ)

A family coordination app for couples. Detects calendar/inbox conflicts and gaps, surfaces actionable alerts, and lets partners stay in sync.

### Directory layout

```
~/family-hq/
  backend/    — Express API, deployed to Railway
  frontend/   — React SPA, deployed to Vercel
```

### Tech stack

**Frontend** (`frontend/`)
- React 18 + React Router 6
- Vite + Tailwind CSS
- Clerk (`@clerk/clerk-react`) for auth
- Supabase JS client for direct DB reads
- `src/lib/api.js` — `apiFetch` wrapper that attaches Clerk JWT

**Backend** (`backend/`)
- Express + node-cron
- Clerk SDK (`@clerk/clerk-sdk-node`) — JWT verification via `middleware/auth.js`
- Supabase (service role) — `lib/supabase.js`
- Anthropic SDK (`claude-sonnet-4-6`) — AI briefing analysis in `jobs/analyze.js`
- Google APIs (Calendar + Gmail OAuth) — `lib/google.js`, `routes/google.js`
- Twilio SMS — `lib/twilio.js`, `routes/sms.js`
- AES-256 encryption for stored OAuth tokens — `lib/crypto.js`

### Key backend routes

| Route | File | Purpose |
|---|---|---|
| `/api/household` | `routes/household.js` | Household & partner management |
| `/api/integrations` | `routes/integrations.js` | Google OAuth token storage |
| `/api/google` | `routes/google.js` | OAuth connect/callback |
| `/api/briefing` | `routes/briefing.js` | Alerts: dismiss, snooze, resolve |
| `/api/chat` | `routes/chat.js` | Claude tool-use chat (can create calendar events) |
| `/api/sms` | `routes/sms.js` | Twilio SMS sending |
| `/api/calendar` | `routes/calendar.js` | Calendar event reads |
| `/api/analyze/trigger` | `server.js` | Manual analysis trigger |

### Key frontend pages & components

- `src/pages/Dashboard.jsx` — main view; polls every 90s; manages briefing, calendar, household state
- `src/pages/Onboarding.jsx` — household creation / invite-code join flow
- `src/components/BriefingFeed.jsx` — alert cards with dismiss/snooze/resolve
- `src/components/TimelineView.jsx` — calendar timeline for both partners
- `src/components/InsightsView.jsx` — stats tab
- `src/components/SettingsView.jsx` — settings tab
- `src/components/ChatDrawer.jsx` — Claude chat with tool use (calendar creation)
- `src/components/PartnerStatus.jsx` — partner avatars + connection status
- `src/components/BottomNav.jsx` — tab navigation (briefings / calendar / insights / settings)

### Dev commands

```bash
# Backend
cd ~/family-hq/backend && npm run dev   # nodemon on port 3001

# Frontend
cd ~/family-hq/frontend && npm run dev  # Vite on port 5173
npm run build                           # production build
```

### Deployment

- **Frontend**: Vercel — `vercel.json` rewrites all routes to `index.html`; domain: **calvinai.co**
- **Backend**: Render — `Procfile` runs `node server.js`; `trust proxy` enabled; URL: `calvin-app.onrender.com`

### Environment variables

Backend (`.env`): `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ENCRYPTION_KEY`, `FRONTEND_URL`, `ANALYSIS_INTERVAL_MINUTES`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CALVIN_MCP_API_KEY`, `CALVIN_MCP_HOUSEHOLD_ID`

Frontend (`.env`): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`

### Data model (Supabase)

- `households` — name, invite_code
- `partners` — clerk_user_id, household_id, display_name, phone
- `integrations` — partner_id, provider (google), encrypted tokens, is_active
- `alerts` — household_id, severity (high/medium/low), title, body, status, source

## System Requirements

### Action tracking & alert deduplication
Calvin must detect when recommended actions have already been completed and suppress the corresponding alert.

**Action completion detection:**
- Before surfacing a new alert, check whether the recommended action already exists (e.g. calendar event already created)
- If the user acts on a recommendation (e.g. creates a calendar event), Calvin should detect that on the next analysis cycle and auto-resolve the alert
- `jobs/analyze.js` must query current calendar events and compare against pending alerts before writing new ones

**Deduplication:**
- No two active alerts should describe the same issue for the same household
- On each analysis run, match candidate alerts against existing `open`/`snoozed` alerts by a stable fingerprint (e.g. hash of type + date + participants) before inserting
- Prefer updating `updated_at` on a duplicate rather than inserting a new row

**Dismissal-based personalisation:**
- `analyze.js` fetches the last 30 days of dismissed alerts (type + title) per household and passes them to Claude as `dismissal_patterns`
- Claude uses `by_type` counts to suppress or downgrade alert types the household frequently ignores (threshold: 3+ dismissals → medium/low skipped; 6+ → type skipped unless urgent)
- Claude uses `recent_titles` to skip alerts whose content closely matches previously dismissed patterns (e.g. routine purchase receipts, subscription emails)
- High-severity genuine conflicts are never suppressed by dismissal history alone

**Bidirectional awareness:**
- Calendar reads in analysis must cover both partners' events for the full lookahead window
- When an alert recommends a specific action (e.g. "create event on Thu"), store enough metadata on the alert row to match it against a future calendar event

### Event completion detection & auto-calendar modification
Calvin must detect when a real-world activity has already occurred — signaled via email — and automatically update or cancel the corresponding calendar event.

**How it works:**
- During each analysis cycle, `jobs/analyze.js` scans recent Gmail threads (past 48 hours) for completion signals: order confirmations, pickup-ready emails, purchase receipts, booking confirmations, service completion notices, etc.
- Each detected completion signal is cross-referenced against upcoming calendar events (next 7 days) for the same household
- When a high-confidence match is found (e.g. "Your Target order is ready for pickup" email + upcoming "Target run" calendar event on the same or next day), Calvin automatically cancels the calendar event via the Google Calendar API
- A low-confidence match (ambiguous keywords, different store/venue, no clear date alignment) surfaces an alert asking the user to confirm before cancellation — it does not auto-cancel

**Matching logic (Claude-driven):**
- Claude receives: (1) a list of upcoming calendar events with titles, dates, and descriptions; (2) a list of recent email signals with subject, sender, snippet, and date
- Claude identifies pairs where the email strongly implies the calendar activity is no longer needed
- Claude returns a list of `{ eventId, confidence: "high"|"low", reason, emailSubject }` matches
- `analyze.js` auto-cancels `high` confidence matches; creates a user-facing alert for `low` confidence matches

**Calendar modification:**
- Use the Google Calendar API (`calendar.events.delete` or `calendar.events.patch` with `status: "cancelled"`) to remove matched events
- Prefer soft-cancel (`patch` to cancelled status) over hard-delete so the event remains recoverable in Google Calendar's trash
- After cancelling, create an `auto_resolved` alert: "Your [event title] was cancelled — Calvin detected you already completed this ([email subject])." Include an `event_id` in `alert.metadata` so a future "Undo" button can restore it

**Undo / restore:**
- The alert card for auto-cancelled events must show an "Undo" action in `BriefingFeed.jsx`
- Undo calls `calendar.events.patch` to restore `status: "confirmed"` on the original event
- Undo is only available while the cancelled event is within the Google Calendar trash window (30 days)

**Guardrails:**
- Never auto-cancel events more than 24 hours in the future unless confidence is extremely high (e.g. confirmed delivery for a future-dated pickup event is still fine; a vague receipt for a week-out appointment is not)
- Never auto-cancel recurring events — surface an alert instead
- Never auto-cancel events that belong to the partner's calendar without their explicit confirmation (surface alert, not auto-cancel)
- Log every auto-cancellation to a `calendar_actions` table: `event_id`, `event_title`, `trigger_email_subject`, `cancelled_at`, `household_id`, `restored_at` (nullable)

## Backlog

See [BACKLOG.md](./BACKLOG.md).

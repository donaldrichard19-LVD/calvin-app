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
- **Backend**: Railway — `Procfile` runs `node server.js`; `trust proxy` enabled

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

### Invite link referral tracking
Track how many users share the invite link and how many sign up through it.

**Scope:**
- **Supabase**: new `referrals` table — `referrer_partner_id`, `referred_clerk_user_id`, `created_at`
- **Backend**: `POST /api/referrals/record` — looks up referring partner by ID, writes a referral row
- **SettingsView**: embed partner ID in copied URL as `?ref=<partner-id>`
- **App.jsx**: on load, capture `?ref=` param and persist to `localStorage`
- **Onboarding.jsx**: after household creation completes, POST stored ref to backend then clear it
- **Viewing data**: query `referrals` table in Supabase dashboard; optionally surface count in InsightsView later

**Notes:** Referral must be recorded after the partner record exists (end of onboarding), not at signup start. Partner ID doubles as the ref code — no new ID generation needed.

### Instacart integration (food alert ordering)
Surface an "Order on Instacart" action on food-related alerts.

**Scope:**
- **Phase 1 — Deep link MVP** (1–2 days): Extract food keywords from alert titles and generate `instacart.com/store/.../start_order?product_name=X` URLs. No API key required. Adds a button to relevant alert cards in `BriefingFeed.jsx`. Low fidelity (lands on search page, not a filled cart) but shippable immediately.
- **Phase 2 — Instacart Platform API** (1–2 weeks post-approval): Apply to Instacart developer program (approval timeline varies). Once approved: product catalog lookup to map keywords → SKUs, cart creation API, return a prefilled checkout URL. Requires per-user Instacart auth.

**Notes:** Gate Phase 2 on API approval. Deep link MVP can ship independently and be replaced later.

### Kroger integration (food alert ordering)
Surface an "Add to Kroger cart" action on food-related alerts via the public Kroger Consumer API.

**Scope:**
- **Supabase**: new `kroger_tokens` column (or row in `integrations`) to store per-partner encrypted OAuth tokens
- **Backend**: Kroger OAuth connect/callback routes (same pattern as `routes/google.js`); `PUT /kroger/cart/add` proxy; product search endpoint
- **Frontend — SettingsView**: "Connect Kroger account" section with OAuth button and disconnect option
- **Frontend — BriefingFeed**: "Add to Kroger cart" button on food-related alerts; calls backend to search product + add to cart, returns checkout URL
- **Alert metadata**: food-related alerts should carry a `suggested_items` field for the cart lookup

**Notes:** Kroger developer approval is typically 1–2 days (developer.kroger.com). This is the recommended first retailer integration — public API, clear OAuth model, fits existing patterns. Build Kroger before tackling Instacart Platform API.

### Submit Calvin to Claude connector directory
Complete the remaining steps to get Calvin listed in the Claude MCP connector directory.

**What's already done:**
- OAuth 2.0 flow (authorize → consent page → code exchange → token) — tested end-to-end ✅
- MCP StreamableHTTP endpoint with all 14 tools and proper annotations ✅
- `manifest.json` served at `https://calvin-app.onrender.com/manifest.json` ✅
- Calvin logo PNG at `https://calvinai.co/calvin-logo.png` ✅
- Privacy Policy at `calvinai.co/privacy`, Terms at `calvinai.co/terms` ✅

**Remaining steps:**
1. **Screenshots** — Take 3–5 PNG screenshots (1000px+ wide, showing only app response) of Calvin in action. Best candidates: the OAuth consent screen at `calvinai.co/oauth?client_id=claude&redirect_uri=...&client_name=Claude`, the Calvin dashboard (briefing feed), the calendar view, and Claude responding to a `get_alerts` or `get_digest` call. Must be taken manually in a real browser session.
2. **Get Claude's exact redirect URI** — During Anthropic's review they will confirm the exact redirect URI Claude uses. Update `CLIENTS.claude.allowed_origins` in `backend/routes/oauth.js` to whitelist it. Currently set to `['https://claude.ai', 'https://api.claude.ai']`.
3. **Submit** — Fill out the remote MCP submission form at `https://claude.com/docs/connectors/building/submission` with: manifest URL, contact email (`donald.richard19@gmail.com`), screenshots, and description.

**Notes:** The MCP access token is the household's `mcp_token` field from Supabase — no separate token infrastructure needed. The `oauth_codes` table in Supabase stores short-lived auth codes (5 min TTL, single-use).

### Build iMessage app for Calvin
Native iOS iMessage app extension so partners can view and act on Calvin alerts directly inside the Messages app.

**Architecture:**
- `ios/CalvinApp/` — iOS container app (required by Apple); handles `calvin://` deep link to store auth token
- `ios/CalvinMessages/` — `MSMessagesAppViewController` iMessage extension; compact tray + full TabView
- `ios/CalvinShared/` — shared Swift code: `APIClient.swift`, `Models.swift`, `KeychainStore.swift`
- App Group `group.co.calvinai.shared` lets the extension read the Keychain token stored by the container app

**Auth:** Uses the existing `households.mcp_token` (same as MCP/Claude connector) — no Clerk on iOS. Web settings page generates a `calvin://connect?token=<mcp_token>&api=https://calvin-app.onrender.com` deep link the user taps on their iPhone.

**Backend additions (minimal):**
- `middleware/requireMcpToken.js` — validates Bearer token against `households.mcp_token`, sets `req.householdId`
- `routes/ios.js` — thin proxy routes using mcp_token auth: `GET /api/ios/briefing`, `PATCH /api/ios/briefing/:id/:action`, `GET /api/ios/calendar`, `GET /api/ios/household`, `POST /api/ios/apns`

**Frontend addition:** New "iMessage App" section in `SettingsView.jsx` with a deep link button and QR code.

**Phase plan:**
- Phase 1 (days 1–3): Backend middleware + ios routes; Settings deep link; Xcode scaffold + Keychain; API client
- Phase 2 (days 3–6): Compact tray (alert cards + dismiss/snooze/resolve); expanded TabView (Briefing + Calendar)
- Phase 3 (days 6–9): Interactive `MSMessage` bubbles — share an alert card into the thread; partner taps to act on it
- Phase 4 (days 9–14): APNs push notifications for high-severity alerts; skeleton loaders, haptics

**Notes:** Minimum deployment iOS 16. Compilation and TestFlight upload require Xcode on macOS. Both partners share the household mcp_token — correct access level. Build constraint: backend + Swift source files can be scaffolded in CI; actual binary build needs a Mac.

### Build ChatGPT app for Calvin
Create a Custom GPT on ChatGPT that connects to Calvin via GPT Actions.

**Scope:**
- GPT Actions backend is already live at `https://calvin-app.onrender.com/api/gpt/openapi.json`
- Create a Custom GPT in ChatGPT with: name "Calvin", description, system prompt, and Actions wired to the spec
- Set Authentication to API Key (Bearer) using the household's `mcp_token`
- System prompt should instruct the GPT to act as a family coordination assistant using Calvin data
- Optionally publish the GPT to the GPT Store

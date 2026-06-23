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
- `detected_order_emails` — `household_id`, `email_id`, `merchant_name`, `sender_domain`, `order_total`, `item_summary`, `order_date`, `partner_id`
- `order_reconciliations` — `household_id`, `email_id`, `access_log_id`, `assistant_name`, `merchant_name`, `confidence` (high/medium), `order_total`, `alert_id`
- `share_access_log` — `household_id`, `ip_hash`, `user_agent`, `assistant_name`, `merchant_domain`, `access_source` (context_card/mcp/gpt_actions)
- `household_orders.ai_attributed_to` — jsonb: `{ assistant_name, confidence, reconciliation_id, email_id }`

## System Requirements

### AI assistant context tracking & order reconciliation
- `share_access_log` records every AI assistant that accesses the context wallet (context card, MCP, GPT Actions), with `assistant_name` parsed from User-Agent.
- Analysis job runs a regex-based order confirmation email detection pass (before the Claude call). Detected orders are stored in `detected_order_emails`.
- Reconciliation matches detected orders to recent wallet accesses: 24h window for direct merchant AI matches (Ask DoorDash → DoorDash), 2h window for indirect/general AI matches (ChatGPT → Target).
- Matched orders surface as `ai_order_reconciled` alerts (severity: low) with "Add to Wallet" and "Edit first" actions.
- Adding to wallet creates/updates a `household_orders` row with `ai_attributed_to` attribution metadata.
- Dismissal personalisation applies: 3+ dismissed → suppressed.

### Alert deduplication & completion detection
- Fingerprint every alert (type + date + participants hash). On each analysis run, skip inserting if a matching fingerprint is already `open`/`snoozed` — update `updated_at` instead.
- Auto-resolve an active alert when the recommended action is complete (e.g. calendar event now exists, pickup confirmed by email).
- Dismissal personalisation: 3+ dismissals of a type → skip medium/low for that type; 6+ → skip the type entirely unless urgent. High-severity genuine conflicts are never suppressed.
- Analysis reads both partners' calendars and emails for the full lookahead window.

## Backlog

See [BACKLOG.md](./BACKLOG.md).

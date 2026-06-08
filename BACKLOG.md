# Calvin — Backlog

## SMS version of Calvin (two-way text interface)
Let partners interact with Calvin entirely over SMS — receive alerts as texts and reply to act on them or ask questions, no app required.

**Scope:**

- **Supabase**: new `sms_threads` table — `partner_id`, `household_id`, `messages` (JSONB array of `{role, content, ts}`), `last_active_at`; new `last_sms_alert_id` column on `partners` to track which alert was most recently texted so replies have context
- **Backend — inbound webhook** (`POST /api/sms/incoming`, no auth middleware): validate Twilio request signature, look up partner by `From` phone number, reject unknown numbers with a polite reply; fetch household context (recent alerts, calendar events) fresh on each turn; retrieve last N SMS turns from `sms_threads`; call Claude with SMS-adapted prompt; send response via `sendSMS`; persist both turns back to `sms_threads`
- **Backend — Twilio webhook config**: point the Twilio number's inbound message URL at the new route; set HTTP POST method
- **Claude SMS prompt**: general household assistant (not alert-specific); receives active alerts, today's calendar events, household context, and last 10 SMS turns; instructed to keep replies under 300 chars unless the user explicitly asks for more; tools: `dismiss_alert`, `snooze_alert`, `resolve_alert`, `create_calendar_event`
- **Alert reply routing**: when Calvin texts an alert notification, store `alert_id` in `last_sms_alert_id` on the partner row; if the user's next reply is a short action word ("dismiss", "snooze", "done", "ignore") with no other context, treat it as acting on that alert before passing to the general Claude loop
- **Response length management**: trim Claude output to fit SMS segments; if response exceeds ~600 chars, send as two messages with a natural break
- **`lib/twilio.js`**: update `sendAlertSMS` to store the alert ID on the partner row after sending, so inbound replies have context
- **Rate limiting**: max 20 inbound SMS per partner per hour to prevent runaway Claude calls

**Out of scope for MVP:** group SMS threads, MMS/media, proactive check-in messages (those are a separate feature)

**Effort:** 3–4 days

**Notes:** The existing `routes/chat.js` is coupled to Clerk auth and a specific `alertId` — the SMS path is a parallel system, not an extension of it. Phone number is the identity anchor; partners must have a `phone` value in the `partners` table (already collected in SettingsView).

---

## Invite link referral tracking
Track how many users share the invite link and how many sign up through it.

**Scope:**
- **Supabase**: new `referrals` table — `referrer_partner_id`, `referred_clerk_user_id`, `created_at`
- **Backend**: `POST /api/referrals/record` — looks up referring partner by ID, writes a referral row
- **SettingsView**: embed partner ID in copied URL as `?ref=<partner-id>`
- **App.jsx**: on load, capture `?ref=` param and persist to `localStorage`
- **Onboarding.jsx**: after household creation completes, POST stored ref to backend then clear it
- **Viewing data**: query `referrals` table in Supabase dashboard; optionally surface count in InsightsView later

**Notes:** Referral must be recorded after the partner record exists (end of onboarding), not at signup start. Partner ID doubles as the ref code — no new ID generation needed.

---

## Instacart integration (food alert ordering)
Surface an "Order on Instacart" action on food-related alerts.

**Scope:**
- **Phase 1 — Deep link MVP** (1–2 days): Extract food keywords from alert titles and generate `instacart.com/store/.../start_order?product_name=X` URLs. No API key required. Adds a button to relevant alert cards in `BriefingFeed.jsx`. Low fidelity (lands on search page, not a filled cart) but shippable immediately.
- **Phase 2 — Instacart Platform API** (1–2 weeks post-approval): Apply to Instacart developer program (approval timeline varies). Once approved: product catalog lookup to map keywords → SKUs, cart creation API, return a prefilled checkout URL. Requires per-user Instacart auth.

**Notes:** Gate Phase 2 on API approval. Deep link MVP can ship independently and be replaced later.

---

## Kroger integration (food alert ordering)
Surface an "Add to Kroger cart" action on food-related alerts via the public Kroger Consumer API.

**Scope:**
- **Supabase**: new `kroger_tokens` column (or row in `integrations`) to store per-partner encrypted OAuth tokens
- **Backend**: Kroger OAuth connect/callback routes (same pattern as `routes/google.js`); `PUT /kroger/cart/add` proxy; product search endpoint
- **Frontend — SettingsView**: "Connect Kroger account" section with OAuth button and disconnect option
- **Frontend — BriefingFeed**: "Add to Kroger cart" button on food-related alerts; calls backend to search product + add to cart, returns checkout URL
- **Alert metadata**: food-related alerts should carry a `suggested_items` field for the cart lookup

**Notes:** Kroger developer approval is typically 1–2 days (developer.kroger.com). This is the recommended first retailer integration — public API, clear OAuth model, fits existing patterns. Build Kroger before tackling Instacart Platform API.

---

## Submit Calvin to Claude connector directory
Complete the remaining steps to get Calvin listed in the Claude MCP connector directory.

**What's already done:**
- OAuth 2.0 flow (authorize → consent page → code exchange → token) — tested end-to-end ✅
- MCP StreamableHTTP endpoint with all 14 tools and proper annotations ✅
- `manifest.json` served at `https://calvin-app.onrender.com/manifest.json` ✅
- Calvin logo PNG at `https://calvinai.co/calvin-logo.png` ✅
- Privacy Policy at `calvinai.co/privacy`, Terms at `calvinai.co/terms` ✅

**Remaining steps:**
1. **Screenshots** — Take 3–5 PNG screenshots (1000px+ wide, showing only app response) of Calvin in action. Best candidates: the OAuth consent screen, the Calvin dashboard (briefing feed), the calendar view, and Claude responding to a `get_alerts` or `get_digest` call. Must be taken manually in a real browser session.
2. **Get Claude's exact redirect URI** — During Anthropic's review they will confirm the exact redirect URI Claude uses. Update `CLIENTS.claude.allowed_origins` in `backend/routes/oauth.js` to whitelist it. Currently set to `['https://claude.ai', 'https://api.claude.ai']`.
3. **Submit** — Fill out the remote MCP submission form with: manifest URL, contact email (`donald.richard19@gmail.com`), screenshots, and description.

**Notes:** The MCP access token is the household's `mcp_token` field from Supabase — no separate token infrastructure needed. The `oauth_codes` table stores short-lived auth codes (5 min TTL, single-use).

---

## Build ChatGPT app for Calvin
Create a Custom GPT on ChatGPT that connects to Calvin via GPT Actions.

**Scope:**
- GPT Actions backend is already live at `https://calvin-app.onrender.com/api/gpt/openapi.json`
- Create a Custom GPT in ChatGPT with: name "Calvin", description, system prompt, and Actions wired to the spec
- Set Authentication to API Key (Bearer) using the household's `mcp_token`
- System prompt should instruct the GPT to act as a family coordination assistant using Calvin data
- Optionally publish the GPT to the GPT Store

---

## Funnel view in InsightsView
Surface the onboarding funnel chart in the Insights tab.

- Query `funnel_events` table grouped by event name
- Show step-by-step drop-off (started → info → household → google → completed)

---

## Cross-account dedup for multi-account Gmail integration
The "Gmail Multi-Account Integration" feature lets each partner connect up to 3 Google accounts (email + calendar). Cross-account duplicate detection was explicitly deferred — this entry tracks that follow-up work.

**Known limitation introduced by multi-account support:**
- If a partner connects multiple Google accounts that both contain the same calendar event (e.g. a shared/duplicated invite, or the same event added to two calendars) or the same email (e.g. forwarded copies, shared inboxes), `analyze.js` will currently see them as distinct items — duplicate alerts or redundant analysis are possible.
- Per-account disconnect is also out of scope for now — `DELETE /api/integrations/:provider` disconnects ALL of a partner's accounts for that provider at once (see comment in `routes/integrations.js`).

**Scope for follow-up:**
- **Duplicate calendar event detection**: compare events across a partner's active integrations by title/start/end time/attendees; collapse matches into a single representation before sending to Claude (or flag them so Claude doesn't double-count).
- **Canonical "owning" integration**: when a duplicate is detected, decide which integration is authoritative for auto-cancel actions — ties directly into the `integration_id` tagging added to `delete_events`/`confirm_events` in this pass (see `jobs/analyze.js` `resolveIntegration`). Likely heuristic: prefer the integration where the event has attendees/is the organizer, or the most-recently-synced account.
- **Duplicate email detection** (stretch): similar matching for emails that appear in multiple connected inboxes (forwarded copies, shared distribution lists) so Claude doesn't generate redundant `dropped_commitment`/`expiring_item` alerts from the same underlying message.
- **Per-account disconnect**: add `DELETE /api/integrations/google/:integrationId` (or similar) so a user can remove a single connected account without losing the others; update `SettingsView.jsx` rows to support this.

**Notes:** Keep the existing single-issue-per-event guardrails in mind — duplicate detection should reduce noise, not introduce new alert types. Build this once real multi-account usage data shows the problem actually occurs in practice.

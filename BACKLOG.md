# Calvin — Backlog

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

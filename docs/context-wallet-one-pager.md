# Context Wallet — Product One-Pager

**Product**: Calvin (calvinai.co)
**Feature**: Context Wallet
**PM**: Donald Richard
**Ship date**: June 21, 2026
**Status**: Shipped

---

## Problem

Every time a user opens an AI assistant — Claude, ChatGPT, Gemini, Copilot, or any other — they start from zero. The AI doesn't know they have a 4-year-old with a peanut allergy, that school pickup is at 3:15, or that a DoorDash order is arriving in 20 minutes. Users re-explain their household context in every conversation, across every tool, every day.

## Solution

The **Context Wallet** is a structured, portable household profile that lives inside Calvin and can be shared with any AI assistant. Users curate their family context once; every AI they use becomes household-aware.

## How It Works

### 1. Curate (Settings > Context Wallet)

Users build their household context across five structured categories:

| Category | Examples |
|---|---|
| **People & pets** | Emma (child, age 7, peanut allergy), Buddy (golden retriever) |
| **Routines** | School pickup Mon-Fri 3:15pm (Don), Soccer practice Tuesdays 5pm |
| **Preferences** | Vegetarian household, no peanuts, bedtime 8pm |
| **Logistics** | Pediatrician Dr. Chen 555-0123, Grandparents 10 min away |
| **Active orders** | DoorDash Thai food, ETA 6:30pm (placed by Sarah) |

### 2. Share (Three distribution channels)

| Channel | How | Works with |
|---|---|---|
| **Copy context card** | One tap copies a formatted text block to clipboard | Any AI — paste into any chat window |
| **Shareable URL** | A public read-only link that returns the context card | Any AI that accepts URLs in custom instructions, system prompts, or tool configs |
| **Native connectors** | Calvin's MCP connector (Claude) and GPT Actions (ChatGPT) | Claude, ChatGPT — automatic, no pasting required |

### 3. Write back (Bidirectional flow)

AI assistants connected via MCP or GPT Actions can **push context back** to Calvin. When a user tells Claude "Emma just started ballet on Wednesdays" or "I ordered groceries on Instacart," the AI writes it to the wallet. Both partners see the update, and Calvin surfaces a confirmation alert so nothing is added silently.

---

## Universal AI Compatibility

**The Context Wallet is not limited to Claude and ChatGPT.**

The shareable URL (`/api/context/card/{token}`) is a standard HTTPS endpoint that returns plain text. It requires no SDK, no OAuth, no API key negotiation — the token in the URL *is* the credential. This means:

- **Gemini / Google AI Studio** — paste the URL into custom instructions or fetch it via a tool
- **Copilot / Microsoft 365** — include the URL in a Copilot system prompt or plugin config
- **Perplexity, Grok, Mistral, or any LLM chat** — paste the copied context card text directly
- **Custom agents / LangChain / CrewAI** — fetch the URL programmatically in any agent pipeline
- **Voice assistants** — any voice AI that accepts a system prompt can ingest the context card

The copy-to-clipboard card works with literally any text input field, anywhere. If a user can type to an AI, they can share their Calvin context with it.

**Content negotiation**: The URL returns `text/plain` by default (optimized for pasting into AI prompts). Clients that send `Accept: application/json` receive a structured JSON response instead, enabling programmatic integrations.

---

## Security Framework

### Token architecture

| Token | Scope | Access level | Independent revocation |
|---|---|---|---|
| **Clerk JWT** | Frontend + API | Full authenticated access | Managed by Clerk |
| **MCP token** | Claude / ChatGPT connectors | Read + write (context, alerts, calendar) | Revoke via Settings > Connected Apps |
| **Share token** | Context card URL only | **Read-only** — context card text only | Revoke via Settings > Context Wallet |

The three tokens are fully independent. Revoking the share link does not disconnect Claude or ChatGPT. Revoking MCP access does not invalidate the share URL.

### Data boundary controls

- The context card **never exposes** raw calendar events, email content, alert details, integration tokens, or internal IDs
- Only user-curated fields are shared — what the user explicitly typed into the wallet
- Per-category sharing toggles let users exclude specific categories (e.g., share routines but hide logistics with phone numbers)
- Toggles apply uniformly across all channels: clipboard, URL, MCP, and GPT Actions

### Rate limiting & abuse prevention

| Scenario | Limit |
|---|---|
| Valid token requests | 60/min per token |
| Invalid token probing | 10/min per IP |
| AI write-back operations | 10/min per token |

Responses include `Cache-Control: private, max-age=300` to prevent excessive polling.

### Privacy by design

- **No enumeration**: Invalid tokens return a generic `404` — no distinction between expired, invalid, or nonexistent
- **No PII in URLs**: Tokens are opaque 64-character hex strings; no household IDs, names, or emails in the URL path
- **IP hashing**: Access logs store a SHA-256 hash of the IP, never the raw address
- **Instant revocation**: Regenerating the share link immediately invalidates all previously shared URLs — no grace period, no cache leakage
- **Partner departure**: When a partner leaves the household, both MCP and share tokens are automatically regenerated

### Write-back safeguards

- Every AI-initiated context change creates a **confirmation alert** in the partner's briefing feed: "AI added a routine: 'Ballet Wednesdays 4pm' — Keep or Remove?"
- Both partners see write-back alerts — nothing is added silently
- The share URL is **permanently read-only** — write access requires the higher-privilege MCP or GPT Actions token
- Orders logged by AI include source attribution (who placed it, which service) for full traceability

---

## Order History

The Context Wallet saves a persistent history of delivery and service orders:

- **Supported sources**: DoorDash, UberEats, Instacart, Amazon, or any custom source
- **Lifecycle**: Placed > In Progress > Delivered > Completed
- **Partner alerts**: When an order is logged, the other partner gets an alert ("Sarah placed a DoorDash order: Thai food, ETA 6:30pm")
- **Delivery alerts**: A follow-up alert fires when status changes to delivered
- **Persistent history**: All orders are saved to Calvin permanently, building a household ordering record over time

---

## Key Metrics (proposed)

| Metric | What it measures |
|---|---|
| Wallet fill rate | % of households with 2+ categories populated |
| Context card copies / week | Engagement with the copy-to-clipboard flow |
| Share URL creation rate | % of households that generate a share link |
| Share URL access frequency | How often external AI tools fetch the context |
| Write-back adoption | # of context entries created by AI agents vs. manually |
| Category toggle usage | Which categories users choose to hide (privacy signal) |

---

## What's Next

- **Auto-populated context**: Calvin suggests context entries based on patterns detected in calendars and emails ("It looks like Emma has soccer on Tuesdays — add this as a routine?")
- **Per-AI-tool sharing controls**: Different sharing levels for Claude vs. ChatGPT vs. the public URL
- **Context versioning**: Track changes over time with a changelog
- **Shareable URL analytics dashboard**: Show users when and how often their context is being accessed

# Provider Harmony Hub — Architecture

**Last updated:** 2026-04-24
**Status:** Pre-demo, backend-complete, content gaps documented below

---

## Executive summary

Provider Harmony Hub is a CRM + operations platform for a Personal Injury (PI) network that coordinates medical providers, law firms, contracts, billing, and referrals. It was bootstrapped on Lovable (React + Supabase) and then extended with a thin FastAPI backend for the narrow set of operations that can't live purely in Supabase: third-party API proxying, bulk imports with background jobs, and webhook receivers.

The system supports four roles — **admin, sales_rep, provider, law_firm** — with Row-Level Security (RLS) enforcing isolation. Everything except a handful of specialized endpoints goes directly from the React client to Supabase; the React app is the primary client.

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + shadcn/ui + TanStack Query | Standard Lovable stack, good DX, production-proven |
| Database + Auth + Storage | Supabase (Postgres 15) | RLS does multi-tenant auth at DB layer → no auth code in application. Generated TypeScript types for the whole schema. Realtime via Postgres replication. |
| Backend (specialized) | FastAPI + asyncpg + uvicorn | Needed for: (1) Google Places proxy (server-side API key), (2) CSV bulk import with background jobs, (3) Webhook receivers (Stripe/DocuSign/Twilio), (4) Cross-subsystem orchestration |
| Edge Functions | Supabase Edge (Deno) | AI-powered features. Calls Gemini OpenAI-compat endpoint server-side so API key never reaches browser |
| AI | Gemini 2.5 (via OpenAI-compat endpoint at `generativelanguage.googleapis.com/v1beta/openai/chat/completions`) | Dashboard insights, health scores, contract review chat |
| Geocoding + Lead Discovery | Google Places API | Address → lat/lon for map pins; text search for lead-finder; autocomplete for address inputs |
| Map | Leaflet + OpenStreetMap tiles | No Google Maps billing; client-side clustering |

---

## Data model (high-level)

Central tables, grouped by concern:

### Network entities
- **`providers`** — medical practices. `business_name`, `contact_email`, address + `latitude/longitude`, `status` enum (prospect/in_negotiation/contracted/active/churned/suspended), `assigned_sales_rep`, `specialty_category_id`, `membership_tier_id`, `is_enterprise`, `health_score`, `search_vector` (tsvector for FTS)
- **`law_firms`** — legal partners. Similar shape; practice_areas, states_licensed, firm_size
- **`provider_locations`** — multi-location support (one-to-many off providers); has `market_id` for Major Metro / Mid-Market / Secondary / Rural categorization

### Commerce
- **`contracts`** — provider ↔ network agreements. `contract_type` enum, `deal_value`, start/end/renewal dates, `status` enum (draft/pending_review/sent/negotiating/signed/active/expired/terminated)
- **`provider_subscriptions`** — active billing records. `tier_id`, `category_id`, `monthly_amount`, `status` (active/past_due/pending/grace_period/suspended/cancelled). Drives MRR/ARR widgets
- **`sales_pipeline`** — deal tracking. `stage` enum (7 stages), `estimated_value`, `probability`, `expected_close_date`
- **`invoices`** + **`invoice_line_items`** + **`payments`** — billing
- **`rate_cards`** — pricing configuration

### Support & activity
- **`support_tickets`** — polymorphic: FK to EITHER `provider_id` OR `law_firm_id` (CHECK constraint enforces exactly one). Priority/status/category enums
- **`ticket_messages`** — reply thread
- **`activities`** — timeline per provider (call/email/meeting/note/status_change/contract_update)
- **`provider_health_scores`** — AI-computed engagement scores with `factors` jsonb breakdown

### Auth & identity
- **`profiles`** — user metadata (mirrors auth.users with 1:1 FK)
- **`user_roles`** — role assignments (enum `app_role`: admin, sales_rep, provider, law_firm)
- **`law_firm_profiles`** — link table from user_id → law_firm_id (1:1 on user_id). Auto-populated by trigger when admin creates a law_firm with matching `contact_email`

### Documents & signatures
- **`document_templates`** — contract templates (agreements, BAAs, addendums)
- **`service_packages`** — bundles of templates with tier/category applicability
- **`package_documents`** — many-to-many: packages ↔ templates
- **`signature_requests`** — one request per document send; `status` (pending/viewed/identity_verified/signed/declined/expired)
- **`signed_documents`** + **`signature_audit_log`** + **`signature_verifications`** — immutable record of every signing event

### Infrastructure
- **`background_jobs`** — CSV import job tracking
- **`audit_log`**, **`ai_logs`**, **`email_logs`** — observability

---

## Authorization (RLS)

All business tables have RLS enabled. Policies use a security-definer `has_role(user_id, role)` helper to avoid recursive policy checks.

**Pattern per role:**

| Role | Providers | Law Firms | Contracts | Support Tickets |
|---|---|---|---|---|
| admin | ALL | ALL | ALL | ALL |
| sales_rep | Assigned to them + unassigned prospects (shared pool) | Assigned | Provider-scoped | Assigned + provider-linked |
| provider | Own row (matched via `contact_email`) | ❌ | Own provider's | Own via contact_email |
| law_firm | ❌ | Own firm (via `law_firm_profiles` link) | ❌ | Own firm's (via law_firm_profiles) |

**Key design choice:** sales_rep sees unassigned prospects so they can claim them — an explicit "shared prospect pool" over strict "see only assigned." Switching to strict is one RLS policy change.

---

## Core service architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         React (Vite)                         │
│  TanStack Query cache → calls go to:                         │
│    (1) Supabase client    — 90% of ops (CRUD, FTS, realtime) │
│    (2) FastAPI backend    — Places proxy, CSV bulk, webhooks │
│    (3) Edge Functions     — AI tasks (Gemini-called)         │
└──────────────────────────────────────────────────────────────┘
           │                      │                    │
           ▼                      ▼                    ▼
    ┌──────────────┐      ┌──────────────┐     ┌──────────────┐
    │   Supabase   │      │   FastAPI    │     │ Edge Functions│
    │   Postgres   │      │   (port 8000)│     │    (Deno)     │
    │   + Auth     │      │              │     │               │
    │   + RLS      │      │ • Places API │     │ • Gemini      │
    │   + Storage  │      │   proxy      │     │   dashboard   │
    │   + Realtime │      │ • CSV import │     │   insights    │
    └──────────────┘      │   jobs       │     │ • Health score│
                          │ • Webhook    │     │ • Contract    │
                          │   receivers  │     │   review chat │
                          └──────────────┘     └──────────────┘
                                 │                      │
                                 ▼                      ▼
                          ┌──────────────┐     ┌──────────────┐
                          │ Google Places│     │  Gemini 2.5  │
                          │   API        │     │ (OpenAI-     │
                          │              │     │  compat)     │
                          └──────────────┘     └──────────────┘
```

**Why split FastAPI and Edge Functions:**
- FastAPI holds long-lived connections + LRU caches (Google Places results cached in-process). Good for chatty upstream APIs.
- Edge Functions are serverless; cold-starts are fine for user-triggered AI calls. Keep API keys out of the browser.
- CSV import runs on FastAPI because Edge Functions time out after 150s; background jobs with polling is cleaner.

---

## Key design decisions

### 1. **Supabase for 90% of operations**
Every CRUD, list, search, and realtime subscription goes directly from React to Supabase via `@supabase/supabase-js`. RLS handles auth at the DB layer, so there's no application-layer authorization to maintain. Generated TypeScript types from the schema mean the frontend knows every column, enum, and relationship.

### 2. **FTS via `search_vector` tsvector**
`providers.search_vector` is a generated tsvector column (`business_name` + `city` + `state` + `provider_type` with weights). Global Search uses `.textSearch("search_vector", q, { type: "websearch" })`. Fast, works up to ~500K rows without issue.

### 3. **Polymorphic support_tickets**
Tickets can belong to EITHER a provider OR a law firm. Implemented as two nullable FKs (`provider_id`, `law_firm_id`) with a CHECK constraint enforcing exactly one is set. Alternative (STI, JSON, separate tables) were considered; this is the simplest and preserves the admin's "one inbox" view.

### 4. **Auto-linking law_firm users via email**
When admin creates a law firm with a `contact_email` that matches an existing user's profile email, a DB trigger (`link_law_firm_user_by_email`) automatically creates the `law_firm_profiles` link. No manual wiring. Same pattern could extend to providers if needed (providers currently match by `contact_email` directly, no link table).

### 5. **Views for complex aggregation**
`v_provider_list` joins providers + subscriptions + tiers + categories + contracts + activities + documents into a single queryable view. Frontend hits one view, not 6 tables. Uses `SECURITY INVOKER` so RLS still enforces — the view has no special privileges.

### 6. **Health score as dual source**
`providers.health_score` (cached column) for fast list rendering; `provider_health_scores` (table with full factor breakdown + AI summary) for detail views. Trigger/background job keeps them in sync. List reads the column; detail reads the table.

### 7. **Background jobs via polling, not WebSocket**
CSV imports run on FastAPI with a job ID returned immediately. Frontend polls `background_jobs` table every 2s via Supabase (not via FastAPI). This keeps the long-running work off the client's HTTP connection and lets any tab watch progress.

### 8. **Google Places proxy pattern**
Direct browser → Google would leak the API key. FastAPI proxy adds: (a) server-side API key, (b) in-process LRU cache for repeat geocodes, (c) request shaping (e.g., bias results to US). Same pattern applies to future Stripe, DocuSign, Twilio webhook receivers.

### 9. **Monorepo layout**
```
frontend/    — Vite React app
backend/     — FastAPI service
supabase/    — migrations, Edge Function source
docs/        — architecture, manual test guide, ADRs
scripts/     — one-off setup (test users, etc.)
test-data/   — CSV fixtures for manual testing
```

---

## Scalability analysis

Honest assessment. Scale tiers below assume a single-tenant deploy (one network of providers).

### Tier 1 — 100 to 500 providers (current demo, typical MVP)
**Status:** ✅ Works without any changes.
- Providers list (`v_provider_list`): <50ms query time
- FTS: instant (tsvector scan under 1K rows)
- Map: Leaflet client-side clustering, fine
- Dashboard aggregations: trivial
- RLS policy evaluation: negligible cost

### Tier 2 — 1K to 5K providers (realistic early-stage network)
**Status:** ✅ Works, one consideration.
- Cursor pagination is already implemented (`usePagination` with page/pageSize)
- `v_provider_list` view may cross 200ms; add indexes on `(assigned_sales_rep)`, `(state)`, `(status)` — already present
- FTS still fast
- Map needs server-side coordinate filtering (by viewport) to avoid rendering 5K pins in DOM — **not yet implemented** (currently loads all)

### Tier 3 — 10K to 50K providers (Series A scale)
**Status:** ⚠️ Needs 3 specific changes.
1. **Map**: switch Leaflet cluster plugin to server-side clustering (Supercluster + bbox queries) OR use vector tiles. Current `MapView.tsx` loads all rows into memory.
2. **`v_provider_list`**: consider materialized view refreshed every 5 min, or denormalize `active_contract_count` / `last_activity_at` onto the providers table via triggers.
3. **RLS policies with EXISTS clauses**: `sales_rep_select_providers` uses `EXISTS (SELECT 1 FROM providers WHERE id=X AND assigned_sales_rep=auth.uid())` — at 50K rows, this is still fast but starts showing in EXPLAIN. Flatten to JWT claims (put `assigned_sales_rep` into `auth.jwt()`) or cache in a session table.

### Tier 4 — 100K+ providers (post Series B)
**Status:** ⚠️ Needs architectural work.
- **Dedicated search service**: Typesense or Meilisearch. Supabase FTS works but full-text + trigram + fuzzy + geo-filter in one query gets slow.
- **Read replicas**: split reads (list/search) from writes (CRUD). Supabase Pro supports this.
- **Realtime**: Postgres-replication-based realtime is capped around 10K concurrent subscriptions. For a 100K-provider deployment with 5K concurrent admin+rep users, move to a dedicated pub/sub (NATS/Redis) for notifications.
- **Background jobs**: single-process FastAPI worker won't scale. Move to a queue (RQ, Dramatiq) with multiple workers.
- **Geocoding**: current in-process LRU cache (~1K entries) needs to become Redis-backed + eventually a Google Places Enterprise contract.

### Cross-cutting bottlenecks
- **Gemini rate limits**: 429/503 under load. Not a scale problem per se; add retry + circuit breaker + fallback to cached responses.
- **Google Places pricing**: $7/1K for Text Search, $5/1K for Geocoding. At 100K providers with 10% monthly churn = 10K geocodes/month = $50. Fine.
- **Edge Function cold starts**: 200-800ms. Keep warm via cron ping or accept the latency for non-blocking flows.
- **TanStack Query cache invalidation**: React app keeps ~5-50MB of cached data per session. At scale, need per-query cache limits.

---

## Design-time scaling decisions already baked in

✅ **Cursor pagination everywhere** (`usePagination` hook, `.range()` queries)
✅ **Server-side filtering** — filters, sort, search all happen in SQL, not in JS
✅ **Generated indexes** on every FK, `search_vector`, `(status)`, `(assigned_sales_rep)`, `(contact_email)`
✅ **Views (`SECURITY INVOKER`) for aggregation** — pushes join cost to Postgres query planner
✅ **FastAPI httpx client is singleton** — connection pooling to Google Places
✅ **LRU cache on Places API** — repeat geocodes are free
✅ **CORS regex for dev** — no production bleed; strict allowlist in prod
✅ **ES256 JWT verification via JWKS** — auth validates tokens without DB round-trips

---

## Known gaps & deferred work

### Content-level gaps (not code bugs)
| Gap | Impact | Fix effort |
|---|---|---|
| No Provider service packages | `/billing` shows $0 MRR; "Set Package" dropdown empty on Provider Detail | ~10 min admin UI work (documented in MANUAL_TEST_GUIDE.md) |
| No Provider document templates with PDF uploads | E-signature round-trip can't be demoed end-to-end | 30-90 min: create 2-3 templates, upload placeholder PDFs, build a package, position signing fields |
| No seeded `onboarding_templates` | Onboarding workflows kick in on status change but have no checklist | Config data, ~15 min |

### Observational gaps
- **Gemini rate-limit handling**: Currently shows "Unable to generate insights right now" — no retry, no fallback. Not a bug; a known caveat.
- **Real-time subscriptions**: Not all tables have realtime wired. Works on tickets and notifications; dashboard doesn't live-update.
- **Onboarding workflow triggers**: Fire on status change but don't have UI for admin to advance stages.

### Intentionally deferred
- **E-signature document signing page** (`/sign/:requestId`): complex PDF + signature field overlay. Works for law firm documents that have PDFs; provider side blocked by template gap above.
- **Campaigns module**: out of demo scope.
- **Churn prediction AI**: exists as a table + Edge Function stub; not producing signals yet.

---

## Bugs fixed during manual testing (iterations 1-3)

All via code changes — permanent fixes in the codebase.

| # | Bug | Fix | Type |
|---|---|---|---|
| 1 | Dev CORS blocking when Vite port drifts | Regex allowlist for dev in `backend/app/main.py` | Config |
| 2 | LF user not auto-linked when admin creates law firm with matching email | DB trigger `link_law_firm_user_by_email` | Migration |
| 3 | `support_tickets.provider_id` FK rejected law_firm UUID inserts | Added `law_firm_id` column + CHECK constraint + RLS policies for law_firm role; updated `LFSupport.tsx` insert path | Migration + code |
| 4 | Admin Help Desk didn't show law firm name for LF tickets | Updated query + display fallback in `HelpDesk.tsx` | Code |
| 5 | LF dashboard "Open Support Tickets" counter always showed 0 | Changed `.eq("provider_id", ...)` → `.eq("law_firm_id", ...)` in `LawFirmDashboard.tsx` | Code |
| 6 | `Support.tsx` crashed on missing profile | `.single()` → `.maybeSingle()` | Code |
| 7 | Provider/Contract Detail pages crashed on deleted-ID URLs | `.single()` → `.maybeSingle()` in `ProviderDetail.tsx` + `ContractDetail.tsx` | Code |

---

## File reference

Key files for onboarding a new engineer:

| Concern | File |
|---|---|
| Supabase client | `frontend/src/integrations/supabase/client.ts` |
| Generated TS types | `frontend/src/integrations/supabase/types.ts` |
| Auth context | `frontend/src/contexts/AuthContext.tsx` |
| Role-based routing | `frontend/src/App.tsx` + `frontend/src/components/layouts/` |
| FastAPI entrypoint | `backend/app/main.py` |
| JWT middleware | `backend/app/middleware/auth.py` |
| Places proxy | `backend/app/services/places.py` |
| Lead finder service | `backend/app/services/lead_finder.py` |
| CSV import route | `backend/app/routes/imports.py` |
| DB migrations | `supabase/migrations/` |
| Edge Functions | `supabase/functions/*` |
| Manual test guide | `docs/MANUAL_TEST_GUIDE.md` |
| Test fixtures | `test-data/*.csv` |

---

## Contact / escalation

- **DB schema changes**: Always via `supabase/migrations/` — never manual DDL in production
- **New Edge Function**: deploy with `supabase functions deploy <name>` + add to Supabase Dashboard secrets if it needs external API keys
- **FastAPI deploy**: stateless, can run behind any reverse proxy. Health check at `/health`

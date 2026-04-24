# Provider Harmony Hub

DocuSign-for-medical-providers. A provider network management platform for the personal-injury industry: contracts + e-signatures, onboarding, billing, pipeline, lead finder, analytics.

---

## Architecture at a glance

```
                  ┌─────────────────────┐
 Browser / User → │  React SPA (Vercel) │
                  └──────────┬──────────┘
                             │
             ┌───────────────┼───────────────────────┐
             │               │                       │
             ▼               ▼                       ▼
     ┌────────────┐  ┌──────────────┐   ┌────────────────────┐
     │ Supabase   │  │ Supabase     │   │  FastAPI backend   │
     │ Postgres   │  │ Edge Funcs   │   │  (Cloud Run)       │
     │ + Auth     │  │ (Deno)       │   │                    │
     │ + Storage  │  │              │   │  - Bulk CSV import │
     │ + Realtime │  │ - AI actions │   │  - Webhooks        │
     │ + RLS      │  │   (Claude)   │   │  - Google Places   │
     └────────────┘  └──────────────┘   │    proxy           │
                                         └────────────────────┘
```

**Design principle:** **thin backend, fat client, strong database.** The React client talks directly to Supabase for ~90% of traffic (CRUD, Realtime, Auth, Storage). Postgres RLS enforces permissions at the database layer. Server-only work (API key secrecy, long-running jobs, inbound webhooks, AI prompts) lives in Supabase Edge Functions or a narrow FastAPI service.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, TanStack Query, shadcn/ui, Tailwind, react-pdf, pdf-lib |
| Data / Auth | Supabase (Postgres 15, PostgREST, RLS, Auth, Realtime, Storage) |
| Edge compute | Supabase Edge Functions (Deno, TypeScript) |
| AI | Anthropic Claude Opus 4.7 (`@anthropic-ai/sdk`) via Edge Functions |
| Backend service | FastAPI (Python 3.11), Uvicorn, asyncio |
| Deploy | Vercel (frontend), Cloud Run (backend), Supabase cloud (DB + edge) |
| Observability | Supabase logs, Vercel analytics, Cloud Run logs |

---

## Repo layout

```
frontend/          React SPA — all UI, direct Supabase calls, signing flow
backend/           FastAPI service — webhooks, bulk imports, Google Places
  app/routes/      Route handlers grouped by domain
  app/services/    Business logic / external API wrappers
  app/middleware/  CORS, request-id, JWT verification
scripts/           Helper scripts (demo PDF generator, seed data)
demo-pdfs/         Branded sample contract PDFs for demos
docs/              Design docs and architecture notes
test-data/         Fixtures and seed data
```

Each top-level package has its own README with detailed responsibilities:
- [`frontend/`](./frontend) — components, routing, TanStack Query keys
- [`backend/`](./backend/README.md) — endpoints, middleware, deploy

---

## How the pieces fit

### What lives in Supabase (most of the system)

- **Database:** providers, law firms, contracts, signature_requests, invoices, pipeline, campaigns, activities, tickets, onboarding workflows, etc. (30+ tables).
- **RLS:** every table is row-level-secured. `admin_all_*`, `sales_rep_select_*`, `provider_select_own_*`, `law_firm_select_own_*` policies enforce access at the DB layer — the client never receives rows it shouldn't see.
- **Auth:** email/password + role-based (`admin`, `sales_rep`, `provider`, `law_firm`) via `user_roles` table. JWT includes the role claim; Edge Functions and FastAPI verify it.
- **Storage buckets:**
  - `contracts` (private) — uploaded contract PDFs, signed PDFs — accessed via on-demand signed URLs
  - `signatures` (private) — merged final PDFs after signing
  - `documents` (public) — onboarding template PDFs and one-off uploads
  - `brand-assets` (public) — logos, email headers
- **Edge Functions (Deno, TypeScript):**
  - AI-powered: `ai-features`, `ai-assistant`, `predict-churn`, `contract-review`, `calculate-health-scores`, `dashboard-insights`, `lead-finder`
  - Workflow automation: `check-renewals`, `onboarding-auto-send`, `document-reminders`, `run-dunning`, `generate-invoices`

### What lives in the FastAPI service

Only concerns that **can't or shouldn't** live in Supabase:

- **Third-party API proxying** — Google Places (geocoding + autocomplete) keeps the API key server-side and enables LRU caching.
- **Long-running jobs** — CSV bulk imports return a `job_id` immediately and run asyncio in the background. Client polls the `background_jobs` table.
- **Inbound webhooks** — Stripe, DocuSign, Twilio. Signature verification + event dispatch into Supabase. (Stubs today.)

### What lives in the React client

- All CRUD (`supabase.from(...).insert/update/delete`)
- Realtime subscriptions (`supabase.channel(...)`)
- Auth session management (`supabase.auth`)
- Signing flow rendering, PDF field placement, signature capture, pdf-lib client-side PDF merge
- TanStack Query cache as the primary state layer

---

## Signing flow (the flagship feature)

1. **Admin creates contract** — uploads PDF to private `contracts` bucket (stored as storage path, not URL)
2. **Admin sends for signature** — inserts `signature_requests` row with `signer_token` (UUID). Writes activity + notification.
3. **Signer opens tokenized link** — `/sign/:id?token=<uuid>`. Public route; token validates instead of auth.
4. **PDF renders** — client generates signed URL from private bucket, renders with `react-pdf`
5. **Fields overlay** — `contract_signing_fields` (signature/date/text/checkbox) rendered as draggable-less overlays at percentage coordinates
6. **Identity verification** — OTP (email) + knowledge-based challenge
7. **Signature captured** — drawn (canvas) / typed / uploaded; saved to `signatures` bucket
8. **PDF merged client-side** — `pdf-lib` draws signature images + field values onto the original PDF, uploads merged version
9. **Status flip** — `signature_requests.status = 'signed'`, `final_document_url` set
10. **Admin downloads** — `ContractDetail` shows "Download Signed PDF" via signed URL

Works for both **provider contracts** (FK `provider_id`) and **law firm contracts** (FK `law_firm_id`) — XOR CHECK constraint ensures exactly one owner.

---

## Scalability

**Current baseline:** ~35 providers, ~20 law firms, ~60 invoices, 1.5 MB total DB size. All measurements and thresholds below derive from that.

### Capacity by user count

| User scale | Verdict | What's needed |
|---|---|---|
| **0 – 500** | **Works today, feels fast** | Ship as-is. Optionally add the ~40 missing FK indexes (15 min, zero risk) as a light performance pass. |
| **500 – 2,000** | Noticeable slowness on list pages + analytics | Add indexes + server-side pagination on the 4 heaviest list pages (providers, contracts, signatures, invoices). Roughly 1 day. |
| **2,000 – 10,000** | Needs real perf work | Indexes + pagination + materialized views for analytics + Redis-layer caching on hot reads. 2–3 weeks. |
| **10,000+** | Architectural call | Move heavy aggregations off Postgres to a data warehouse (BigQuery, Snowflake, ClickHouse). Analytics becomes async. |

### What scales effortlessly

| Layer | Why | Headroom |
|---|---|---|
| **Frontend (Vercel)** | Static SPA, CDN-delivered | Tens of thousands of users |
| **Supabase Auth** | Pro tier = 100k MAU included | 500 users = 0.5% of included |
| **Postgres (Supabase Pro 8 GB)** | Current DB is 1.5 MB; at 500 users × 10× data volume, ~15 MB | ~500× headroom |
| **Storage (100 GB)** | PDFs ~10 KB each; 50k PDFs = 500 MB | ~200× headroom |
| **Edge Functions (2M invocations/mo)** | | Enough for 500 users × 130 actions/day each |

### What will bite at scale (real caveats)

1. **Missing indexes on FK columns** — ~40 heavily-queried columns lack indexes: `invoices.subscription_id`, `signature_requests.contract_id`, `signature_requests.law_firm_id`, `provider_locations.provider_id`, `law_firm_pipeline.law_firm_id`, `activities.user_id`, `signature_audit_log.signature_request_id`, etc. At 500 users with 10k+ rows per table, filter queries go from sub-100 ms to 1–3 s. **Fix:** single migration with ~40 `CREATE INDEX CONCURRENTLY` statements. Non-blocking, zero risk.

2. **No pagination on list pages** — Only 6 `.limit()` / `.range()` calls across the entire frontend. Pages like `/providers`, `/contracts`, `/signatures`, `/invoices` fetch all rows. At 500 providers × 3 contracts × 36 monthly invoices = 54k rows on one page load. Paints, but slowly.

3. **Analytics computed client-side** — MRR-by-state, revenue-by-market, etc. pull all subscriptions + locations + markets and aggregate in JS. Fine at 50 rows, noticeable at 5k, unusable at 50k. **Fix:** materialize as SQL views or server-side functions.

4. **RLS policies with nested joins** — Some policies walk `profiles → providers → subscriptions`. Each row evaluates the policy. At 500 users × 100 rows/query, this adds latency that creeps rather than spikes. **Fix:** `SECURITY DEFINER` helper functions for common role checks.

5. **Client-side PDF merge (pdf-lib)** — Signing step merges signatures in the browser. Fine for small PDFs; slow past ~20 pages. Per-transaction latency, not per-user — matters for tenant UX but not for total capacity.

### Recommended order of operations

Before 100 paying users: ship.
Before 500 paying users: add the 40 missing indexes.
Before 1,000: add pagination to heavy list pages.
Before 5,000: materialize analytics + server-side aggregates.

---

## Environment variables

### Frontend (Vercel)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_BACKEND_URL` | FastAPI base URL (for bulk imports) |

### Supabase Edge Functions (project secrets)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key — powers all AI features |
| `SUPABASE_URL` | Auto-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected — used by Edge Functions for privileged queries |
| `SUPABASE_ANON_KEY` | Auto-injected |

### FastAPI backend (Cloud Run)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For privileged DB access (bulk imports) |
| `SUPABASE_JWT_SECRET` | For JWT verification on protected routes |
| `GOOGLE_PLACES_API_KEY` | Geocoding + autocomplete |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |

---

## Deployment

- **Frontend** auto-deploys to Vercel on push to `master`.
- **Backend** auto-deploys to Cloud Run on push to `master` via GitHub Actions.
- **Edge Functions** deploy via Supabase CLI or MCP (currently via MCP during development).
- **Database migrations** applied via Supabase CLI / dashboard or MCP `apply_migration`.

---

## Development

```sh
# Frontend
cd frontend
npm install
npm run dev          # Vite dev server on :8080

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Edge Functions (requires Supabase CLI)
supabase functions serve --env-file .env.local
```

The frontend dev server proxies to your hosted Supabase project — no need to run Postgres locally unless you want to.

---

## Known limitations

- Law-firm-initiated signing logs activities with null `provider_id` (column is nullable, so no crash — but the activity doesn't surface in the law firm's feed without a follow-up to `law_firm_activities`).
- `pdf-lib` client-side merge slows on PDFs > 20 pages.
- Analytics heatmap and churn dashboard fetch all rows; not paginated.
- Provider onboarding "activation" flips DB status but doesn't auto-create an auth user, send welcome email, or generate first invoice (planned follow-up).

---

## License

Proprietary — all rights reserved.

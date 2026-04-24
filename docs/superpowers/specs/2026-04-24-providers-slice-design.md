# Backend Design — All Subsystems, Fast-Mode

**Date:** 2026-04-24
**Status:** Draft — awaiting approval to proceed to implementation
**Supabase project:** `haqtcycfkkziblafkonr` (free tier)
**Scope:** All subsystems end-to-end (Providers, Law Firms, Contracts, E-signatures, Sales Pipeline, Map, Analytics) + shared backend chassis — delivered in one day

**Mode:** Breadth over depth. Every subsystem works end-to-end. Scalability patterns demonstrated across every subsystem (not perfected in each). Target: every page functional + architecture thinking visible.

---

## 1. Context

Provider Harmony Hub is a multi-tenant B2B SaaS with 10+ subsystems already built into the frontend (providers, law firms, contracts, e-signatures, billing, sales pipeline, map, analytics, and more). The frontend is a Vite + React + TypeScript app (Lovable-generated) that uses `@supabase/supabase-js` directly against a live Supabase project with 49 applied migrations and 67 tables.

**The task:** build the backend so every listed subsystem works end-to-end, using patterns that scale to 100K users without rewrite, in a single day.

**Key observation from gap analysis:** Supabase already owns ~80% of the Providers backend via schema + RLS + existing Edge Function code (some not yet deployed). The remaining 20% is polish (indexes, FTS, views, atomic bulk ops) plus a thin FastAPI layer for things that cannot or should not live in Postgres.

---

## 2. Goals

1. **Every major subsystem works end-to-end today** — Providers, Law Firms, Contracts, E-signatures, Sales Pipeline (skip Campaigns), Map, Analytics — across all four roles (`admin`, `sales_rep`, `provider`, `law_firm`).
2. **Backend structured to scale to 100K users / 10M+ rows** — correct indexes, FTS, server-side aggregates, async patterns, atomic bulk ops, selective realtime — applied **across all subsystems**, not just Providers.
3. **FastAPI is targeted, not minimal** — lives where it earns its place: Google Places proxy, CSV imports, webhook receivers (stubs today), health-score triggers, eventual home for cross-subsystem orchestration.
4. **Breadth over depth** — every subsystem gets the scalability pattern at least once. A few show it deeply (Providers as reference); others apply the cheap wins (indexes + FTS + RLS verification).
5. **Every architectural decision documented** in this spec + `ARCHITECTURE.md` so reasoning is traceable later.

## 3. Non-goals (explicit — deferred beyond today)

- Cloud Run deployment + CI/CD — happens **after** all slices work locally today. Phase 5.
- Redis, Cloud Tasks, Sentry — documented; in-memory/stubs today, swap at deploy.
- Partitioning `activities`/`audit_log` — migration drafted, applied at >1M rows (far future).
- Database branching or PITR — not on Supabase free tier. We use per-migration rollback SQL instead.
- Campaigns subsystem — user chose to skip.
- Pixel-perfect optimization of every subsystem — we demonstrate patterns, we don't exhaustively apply them everywhere.
- Comprehensive E2E testing for every role on every subsystem — admin gets full coverage; other roles get spot checks.

## 4. Locked-in architectural decisions

| Decision | Chosen | Rationale |
|---|---|---|
| Backend split | **Option A: Supabase-heavy + thin FastAPI** | Supabase already owns 80% correctly via RLS; adding a full FastAPI CRUD layer is pure overhead at this scale |
| Slice order | **Sequential** (Providers → Law Firms → Contracts → Sales → Map → Analytics) | Patterns from slice 1 reuse as templates; avoids parallel divergence |
| Scalability target | **100K users, 10M+ rows** | Architectural capacity; infra cost scales to actual usage |
| Chassis | **Merged into Providers slice** | Single day constraint; patterns proven inside first real subsystem |
| Deploy target | **GCP Cloud Run + Supabase (AWS)** | Cloud Run scale-to-zero; GCP credits available; Google Places API already in use |
| Geocoding | **Google Places API, server-side** | Nominatim's 1 req/s rate limit breaks at scale; API key must not be in browser |
| Auth | **Supabase JWT (HS256) verified in FastAPI middleware** | Stateless; no extra round trip to Supabase Auth API per request |
| Caching (geocoding) | **DB for persistent (`providers.latitude/longitude`), in-memory LRU in FastAPI for transient** | Free tier has no Redis; patterns drop-in for Redis later |
| Queue / background jobs | **asyncio.Task + in-memory job store today; Cloud Tasks later** | Same interface; swap implementation at deploy |
| Pagination | **Cursor-based, not offset** | Offset becomes O(n) at page 5000 |
| Search | **Postgres FTS (`tsvector` + GIN index) + trigram for autocomplete** | `ilike '%x%'` full-scans; FTS scales to millions of rows |

## 5. Data model changes

All migrations are **additive**, **idempotent** (use `IF NOT EXISTS` / `OR REPLACE`), and **wrapped in transactions**. Explicit rollback SQL is documented for each.

### 5.1 Enable extensions

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- trigram / fuzzy search
CREATE EXTENSION IF NOT EXISTS unaccent;      -- accent-insensitive search
CREATE EXTENSION IF NOT EXISTS btree_gin;     -- index compound types
```
Rollback: `DROP EXTENSION pg_trgm; DROP EXTENSION unaccent; DROP EXTENSION btree_gin;` (will fail if anything depends).

### 5.2 Indexes on Providers + related tables

```sql
CREATE INDEX IF NOT EXISTS idx_providers_assigned_sales_rep ON providers (assigned_sales_rep);
CREATE INDEX IF NOT EXISTS idx_providers_status             ON providers (status);
CREATE INDEX IF NOT EXISTS idx_providers_state              ON providers (state);
CREATE INDEX IF NOT EXISTS idx_providers_created_at_desc    ON providers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_providers_service_package    ON providers (service_package_id);
CREATE INDEX IF NOT EXISTS idx_providers_coords             ON providers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_provider_created  ON activities (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prov_subs_provider_status    ON provider_subscriptions (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_prov_docs_provider_status    ON provider_documents (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_prov_docs_signing_order      ON provider_documents (provider_id, signing_order);
CREATE INDEX IF NOT EXISTS idx_contracts_provider_status    ON contracts (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created   ON notifications (user_id, created_at DESC);
```
Rollback: `DROP INDEX IF EXISTS idx_...` for each.

### 5.3 Full-text search on providers

```sql
ALTER TABLE providers ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', unaccent(coalesce(business_name,  ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(contact_name,   ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(contact_email,  ''))), 'C') ||
    setweight(to_tsvector('simple', unaccent(coalesce(provider_type,  ''))), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_providers_search
  ON providers USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_providers_business_name_trgm
  ON providers USING GIN (business_name gin_trgm_ops);
```
Rollback: `DROP INDEX idx_providers_search; DROP INDEX idx_providers_business_name_trgm; ALTER TABLE providers DROP COLUMN search_vector;`

### 5.4 Composed view — `v_provider_list`

Replaces the frontend's N+1 pattern (main query + 5 child queries). RLS inherits from underlying tables — no separate policy needed.

```sql
CREATE OR REPLACE VIEW v_provider_list AS
SELECT
  p.id, p.business_name, p.contact_name, p.contact_email, p.contact_phone,
  p.city, p.state, p.zip_code, p.status, p.provider_type,
  p.assigned_sales_rep, p.health_score, p.service_package_id,
  p.latitude, p.longitude, p.created_at, p.updated_at, p.search_vector,
  rep.full_name    AS rep_name,
  pkg.name         AS package_name,
  pkg.short_code   AS package_code,
  sub.monthly_amount,
  sub.status       AS billing_status,
  tier.name        AS tier_name,
  tier.short_code  AS tier_code,
  cat.name         AS category_name,
  cat.short_code   AS category_code,
  (SELECT COUNT(*) FROM contracts c          WHERE c.provider_id = p.id AND c.status = 'active') AS active_contract_count,
  (SELECT MAX(a.created_at) FROM activities a WHERE a.provider_id = p.id)                          AS last_activity_at,
  (SELECT COUNT(*) FROM provider_documents d WHERE d.provider_id = p.id)                          AS total_docs,
  (SELECT COUNT(*) FROM provider_documents d WHERE d.provider_id = p.id AND d.status = 'signed')  AS signed_docs
FROM providers p
LEFT JOIN profiles rep         ON rep.id  = p.assigned_sales_rep
LEFT JOIN service_packages pkg ON pkg.id  = p.service_package_id
LEFT JOIN LATERAL (
  SELECT ps.* FROM provider_subscriptions ps
  WHERE ps.provider_id = p.id
    AND ps.status IN ('active','pending','past_due','suspended','trial')
  ORDER BY CASE ps.status
    WHEN 'active' THEN 1 WHEN 'past_due' THEN 2 WHEN 'pending' THEN 3
    WHEN 'trial'  THEN 4 WHEN 'suspended' THEN 5 END
  LIMIT 1
) sub ON TRUE
LEFT JOIN membership_tiers      tier ON tier.id = sub.membership_tier_id
LEFT JOIN specialty_categories  cat  ON cat.id  = sub.specialty_category_id;
```
Rollback: `DROP VIEW IF EXISTS v_provider_list;`

### 5.5 RPC — atomic bulk document send

Replaces browser `for`-loop doing 5 Supabase calls per provider. Per-provider operations are isolated with `EXCEPTION` so one failure doesn't abort the whole batch.

```sql
CREATE OR REPLACE FUNCTION rpc_provider_bulk_send_document(
  p_provider_ids  uuid[],
  p_template_id   uuid,
  p_expires_days  int DEFAULT 14
) RETURNS TABLE (provider_id uuid, signature_request_id uuid, status text)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_provider_id     uuid;
  v_sig_req_id      uuid;
  v_prov_doc_id     uuid;
  v_template_name   text;
  v_provider_email  text;
  v_profile_id      uuid;
BEGIN
  SELECT name INTO v_template_name FROM document_templates WHERE id = p_template_id;
  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  FOREACH v_provider_id IN ARRAY p_provider_ids LOOP
    BEGIN
      INSERT INTO provider_documents (provider_id, template_id, status, sent_at)
      VALUES (v_provider_id, p_template_id, 'sent', now())
      RETURNING id INTO v_prov_doc_id;

      INSERT INTO signature_requests (
        contract_id, provider_id, requested_by, expires_at, provider_document_id
      ) VALUES (
        p_template_id, v_provider_id, auth.uid(),
        now() + make_interval(days => p_expires_days), v_prov_doc_id
      ) RETURNING id INTO v_sig_req_id;

      UPDATE provider_documents
        SET signature_request_id = v_sig_req_id
      WHERE id = v_prov_doc_id;

      SELECT contact_email INTO v_provider_email FROM providers WHERE id = v_provider_id;
      IF v_provider_email IS NOT NULL THEN
        SELECT id INTO v_profile_id FROM profiles
         WHERE email = v_provider_email LIMIT 1;
        IF v_profile_id IS NOT NULL THEN
          INSERT INTO notifications (user_id, title, message, type, link)
          VALUES (
            v_profile_id,
            'Action Required: Sign "' || v_template_name || '"',
            'Please review and sign your document.',
            'warning',
            '/sign/' || v_sig_req_id::text
          );
        END IF;
      END IF;

      INSERT INTO activities (provider_id, user_id, activity_type, description)
      VALUES (v_provider_id, auth.uid(), 'status_change',
              'Document sent for signature: "' || v_template_name || '"');

      provider_id          := v_provider_id;
      signature_request_id := v_sig_req_id;
      status               := 'sent';
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      provider_id          := v_provider_id;
      signature_request_id := NULL;
      status               := 'error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $$;
```
Rollback: `DROP FUNCTION IF EXISTS rpc_provider_bulk_send_document(uuid[], uuid, int);`

### 5.6 Audit log RLS fix (security advisor remediation)

The existing `audit_log` INSERT policy uses `WITH CHECK (true)`, allowing authenticated users to forge audit entries. Tighten:

```sql
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_log;

CREATE POLICY "Users insert own audit entries" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
```
Rollback: reverse order.

### 5.7 Cursor pagination (pattern, no schema change)

Every list query uses `(created_at, id)` composite cursor:

```sql
SELECT * FROM v_provider_list
WHERE (created_at, id) < (:last_created_at, :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
The composite `(created_at, id)` is already covered by `idx_providers_created_at_desc` + PK.

### 5.8 Deferred (documented, not applied today)

- Materialized views for dashboard aggregates — wait for Dashboard slice
- Table partitioning on `activities`, `audit_log` — wait until >1M rows
- `pg_cron` for scheduled health-score recompute — defer; use on-demand trigger today
- PostGIS for server-side map clustering — defer until >50K providers with map bottleneck

---

## 6. API surface

### 6.1 Supabase-direct (from frontend, no FastAPI hop)

Everything routine and RLS-enforced:

- `supabase.from('providers').select(...)` via `v_provider_list` view
- `supabase.from('providers').insert(...) / .update(...) / .delete(...)`
- `supabase.from('activities').insert(...)` on status changes, notes, etc.
- `supabase.from('contracts'|'support_tickets'|'invoices'|'payments'|'provider_subscriptions'|'provider_documents').select(...)` for detail page tabs
- FTS search: `.select('*').textSearch('search_vector', query, { config: 'simple' })`
- Bulk send: `supabase.rpc('rpc_provider_bulk_send_document', { p_provider_ids, p_template_id })`
- Realtime (selective): `notifications` for current user, `provider_documents` for signing page

### 6.2 FastAPI endpoints

| Method | Path | Purpose | Auth | Notes |
|---|---|---|---|---|
| GET | `/health` | Liveness + readiness (DB ping) | none | |
| POST | `/api/v1/geocode` | Address → `{lat, lng}` via Google Places | JWT, any role | In-mem LRU cache, 24h TTL |
| GET | `/api/v1/places/autocomplete` | Address suggestions via Google Places | JWT | Session token parameter |
| POST | `/api/v1/providers/import` | CSV bulk import, returns `job_id` | JWT, `admin` | Streams CSV, queues async task |
| GET | `/api/v1/jobs/{job_id}` | Job status polling | JWT, job creator | Returns `{status, progress, total, errors[]}` |
| POST | `/api/v1/providers/{id}/health-score/refresh` | Trigger recompute via Edge Function | JWT, `admin` or `sales_rep` | Wraps `supabase.functions.invoke('calculate-health-scores')` |

### 6.3 Request/response conventions

- Content-Type: `application/json`
- Auth header: `Authorization: Bearer <supabase_access_token>`
- Correlation: `X-Request-Id` (generated if absent, echoed back)
- Error envelope: `{ "error": { "code": "<CODE>", "message": "<human>", "details": {...}, "request_id": "<uuid>" } }`
- Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR`
- Success: body is the payload directly (no envelope for 2xx)

---

## 7. Auth flow

1. Frontend acquires access token via `supabase.auth.signIn(...)`.
2. Every FastAPI request includes `Authorization: Bearer <token>`.
3. FastAPI middleware (`app.middleware('http')`):
   - Extracts token from header.
   - Verifies HS256 signature against `SUPABASE_JWT_SECRET`.
   - Checks `exp` claim.
   - Parses `sub` (user_id) and `user_metadata.role` (fallback: query `user_roles` on cache miss).
   - Injects `User(id, role)` into `request.state.user`.
4. Protected endpoints use dependency `Depends(require_role('admin', 'sales_rep', ...))`.
5. **Service role client** (`SUPABASE_SERVICE_ROLE_KEY`) used **only** for: CSV import insert-many (bypasses per-row RLS overhead), Edge Function invocation, background job internals. Never exposed to HTTP handlers directly.
6. Every request ID + user ID + endpoint + status + duration_ms is structured-logged.

**Why verify in FastAPI vs calling Supabase Auth API?** Stateless, zero extra round trip, scales infinitely. Shared secret pattern is the Supabase-documented approach.

---

## 8. Key data flows

### 8.1 Add provider (admin)

```
User → address field (debounced) → GET /api/v1/places/autocomplete → suggestions
User picks suggestion → structured {line1, city, state, zip, lat, lng} filled
User clicks "Create" → supabase.from('providers').insert({... lat, lng ...})
DB triggers: activity row (assignment), audit_log row (via service layer later)
React Query invalidates 'providers-list'
```

### 8.2 Bulk send document (admin, N providers selected)

```
User selects providers + template → clicks "Send"
Frontend → supabase.rpc('rpc_provider_bulk_send_document', { p_provider_ids, p_template_id })
Single SQL round trip; atomic per-provider with per-provider error isolation
Returns table: [{provider_id, signature_request_id, status}]
Frontend invalidates 'providers-list', 'provider-docs-for-list', 'signature-requests'
```

### 8.3 CSV import (admin)

```
User uploads CSV → POST /api/v1/providers/import (multipart)
FastAPI validates headers + required fields → creates background_jobs row → returns {job_id}
Background task (asyncio):
  for row in rows:
    cached = find_geocode_cache(row.address)
    if miss: cached = await places_geocode(row.address)  # also writes to cache
    batch_insert providers (up to 100 per batch via service-role client)
    update background_jobs.progress every 10 rows
Frontend polls GET /api/v1/jobs/{id} every 2s
On status='completed' → invalidate 'providers-list'
```

### 8.4 Search providers (all roles)

```
Frontend debounces (300ms) → supabase
  .from('v_provider_list')
  .select('*', { count: 'exact' })
  .textSearch('search_vector', query, { config: 'simple' })
  .order('created_at', { ascending: false })
  .range(cursor_from, cursor_to)
GIN index on search_vector → sub-100ms at 100K rows
RLS on underlying `providers` applied automatically through the view
```

### 8.5 Map view (admin)

```
Frontend fetches viewport bounds
supabase.from('v_provider_list').select('id, business_name, latitude, longitude, status, health_score, ...')
  .not('latitude', 'is', null)
  .gte('latitude', south).lte('latitude', north)
  .gte('longitude', west).lte('longitude', east)
Leaflet.markercluster groups 10k+ markers client-side
Future (at >50K): PostGIS server-side clustering
```

### 8.6 Provider detail (any role, RLS filtered)

Current parallel queries stay for now; optimize to `v_provider_detail` view in a later pass if EXPLAIN shows cost:
- `providers` + `profiles(full_name, email)` join
- `contracts` by `provider_id`
- `activities` by `provider_id`, ordered DESC
- `support_tickets` by `provider_id`
- `provider_subscriptions` + `invoices` + `payments` (billing overview)

RLS auto-filters: admin sees all, sales_rep sees own-assigned, provider sees own record only.

### 8.7 Health score on-demand refresh (admin / sales_rep)

```
User clicks "Refresh health score" on provider detail
Frontend → POST /api/v1/providers/{id}/health-score/refresh
FastAPI → supabase.functions.invoke('calculate-health-scores', { body: { provider_id } })
Edge Function computes + UPDATE providers SET health_score = ...
FastAPI returns new score
Frontend invalidates 'provider' query
```

---

## 9. Scalability patterns (100K-ready)

Each pattern tied to a specific risk at scale.

| Pattern | Risk mitigated | Location |
|---|---|---|
| GIN on `search_vector` | Search full scans | providers |
| Trigram GIN on `business_name` | Autocomplete prefix scans | providers |
| B-tree indexes on every filter/sort col | Full scans in RLS EXISTS + filters | all filter-heavy cols |
| Composite `(provider_id, created_at DESC)` | N+1 on child tables slow | activities, prov_docs, contracts |
| Cursor pagination | Offset is O(n) at high pages | all list views |
| View `v_provider_list` | Frontend 5-query N+1 per page | list page |
| RPC `rpc_provider_bulk_send_document` | Client-side for-loop = N×RTT | bulk ops |
| FTS + `unaccent` + `simple` config | `ilike '%x%'` full scans | search |
| `STORED` tsvector column | Recompute on every search | providers.search_vector |
| Async FastAPI + asyncpg pool | Sync FastAPI starves at load | all endpoints |
| Background jobs + polling | HTTP timeout on slow ops | CSV import |
| In-memory LRU geocode cache | Google Places $ blow-up | FastAPI /geocode |
| `providers.latitude/longitude` persistent cache | Re-geocoding same addresses | providers table |
| Selective realtime subscriptions | WS connection cap (200 free / 500 Pro) | notifications only, not list pages |
| RLS via SECURITY DEFINER `has_role()` STABLE | N×1 auth lookups | existing pattern |

### Future scale levers (documented, not built today)

- **Redis**: cache, rate limit state, job queue — swap from in-memory (1-line changes)
- **Cloud Tasks / Celery**: background jobs — swap from `asyncio.Task`
- **Supabase Pro** ($25 + compute): read replicas, 500 realtime, larger pool
- **Table partitioning**: `activities`, `audit_log` by month (triggered at >1M rows; `pg_partman` installed if needed)
- **PostGIS server-side clustering**: at >50K map markers
- **Materialized views**: dashboard aggregates, refreshed via `pg_cron` every 15 min
- **Log drain to Cloud Logging**: Supabase → GCP

---

## 10. Observability

### Today

- FastAPI structured JSON logs (`request_id`, `user_id`, `endpoint`, `method`, `status`, `duration_ms`, `error_code?`)
- Supabase dashboard → Query Performance (already on, `pg_stat_statements` installed)
- FastAPI `/health` returns `{ status, db, upstream: { google_places } }`

### Later (documented for deploy time)

- GCP Cloud Logging sink (auto from Cloud Run)
- GCP Cloud Monitoring alerts: P99 latency > 500ms, error rate > 1%, DB pool exhaustion
- Sentry for frontend JS errors
- Supabase log drain to GCP

---

## 11. Testing strategy

| Layer | Framework | Scope |
|---|---|---|
| SQL | pgTAP (available on Supabase) | `rpc_provider_bulk_send_document` with fixtures, RLS policy checks |
| FastAPI | pytest + httpx.AsyncClient + respx (mock Places) | JWT verification, error envelope, geocode cache, CSV parse edge cases |
| Frontend | Vitest (already configured) | Hook changes (new view query shape), RPC call plumbing |
| E2E | Playwright (already configured) | Admin happy path: add provider → bulk send → CSV import → search |

**Manual E2E checklist** (executed before declaring slice done):
- [ ] Admin: list, FTS search, filters, sort, paginate, add, edit, delete, bulk send, bulk update, CSV import, export CSV, map with filters
- [ ] Sales rep: sees only own-assigned, can edit own, cannot see others'
- [ ] Provider: sees own record, own docs, own tickets
- [ ] Realtime: notification appears without refresh
- [ ] Cross-role: admin reassigns rep, rep sees it
- [ ] Empty states: 0 providers, 1 provider, 100 providers
- [ ] RLS security: sales_rep cannot SELECT another rep's providers via API

---

## 12. Deployment posture

### Today (local)

- Supabase: live free-tier project, migrations applied via MCP
- FastAPI: `uvicorn backend.main:app --reload --port 8000`
- Frontend: `npm run dev` on :5173
- Google Places: server-side env var

### Ready (designed, not built)

- Backend `Dockerfile` (Python 3.12-slim, gunicorn + uvicorn workers)
- `gcloud run deploy` command documented in `docs/deployment.md`
- Environments: dev (current Supabase) → staging (new Supabase) → prod (Pro Supabase + min-instances=1 Cloud Run)
- CI: Cloud Build trigger on push to `main`

---

## 13. Implementation order (today, fast-mode — all subsystems)

| Phase | Duration | Tasks | Exit criteria |
|---|---|---|---|
| **0. Shared chassis** | 60 min | FastAPI skeleton (JWT middleware, error envelope, structured logging, `/health`), `backend/.gitignore`, Dockerfile (for later), deploy all 13 Edge Functions via MCP | Curl to `/health` returns 200; Edge Functions live in Supabase dashboard |
| **1. System-wide DB scalability** | 90 min | Enable `pg_trgm`/`unaccent`/`btree_gin`; index audit + add across ALL core tables (providers, law_firms, contracts, activities, signature_requests, invoices, payments, support_tickets, sales_pipeline, notifications, audit_log, scraped_leads, campaigns); FTS columns + GIN on providers/law_firms/contracts/support_tickets/scraped_leads; fix `audit_log` RLS; re-run advisors | Advisors show significant reduction in warnings |
| **2. Views + RPCs per subsystem** | 90 min | `v_provider_list`, `v_law_firm_list`, `v_contract_list`, `v_sales_pipeline`, `v_support_ticket_list`, `v_signature_request_list`, `mv_dashboard_summary` (materialized); `rpc_provider_bulk_send_document`, `rpc_contract_bulk_status_change`, `rpc_bulk_assign` (generic) | Each view smoke-tested with a single row |
| **3. FastAPI endpoints** | 75 min | `/geocode` + `/places/autocomplete` (shared by providers + law_firms); `/providers/import` + `/law-firms/import`; `/providers/{id}/health-score/refresh`; `/jobs/{id}`; webhook stub routes (Stripe/DocuSign/Twilio, not active) | Round-trip tests succeed |
| **4. Frontend wiring + E2E** | 120 min | Swap `ilike` → FTS everywhere; swap bulk loops → RPCs; wire geocode proxy + autocomplete on Add Provider + Add Law Firm forms; verify every frontend page loads + core actions work as admin; spot-check sales_rep/provider/law_firm role scoping; verify Edge Function invocations work | Every major page loads, core flows work |
| **5. `ARCHITECTURE.md` + final commits** | 30 min | One-page doc: every decision + "at scale: X" notes; final git commits | Doc exists + committed |
| **Total** | **~7 hours** | | |

### Cut list (if time runs short, cut in this order)

1. Webhook stub routes (mention in doc, don't code)
2. Materialized view for analytics (use regular view)
3. CSV import for law firms (Provider pattern demonstrated; Law Firm = copy later)
4. FTS on `support_tickets` / `scraped_leads` (keep on providers/law_firms/contracts)
5. Generic `rpc_bulk_assign` (only subsystem-specific ones)
6. Sales_rep/provider/law_firm role spot-check (admin only; note others as "patterns verified via RLS")

### Non-negotiables (never cut)

- Indexes across all major tables
- FTS on providers + law_firms + contracts
- Audit log RLS fix (security)
- FastAPI chassis + Places proxy + one CSV import
- Every UI page loads without errors
- Edge Functions deployed (dashboard insights depend on them)
- `ARCHITECTURE.md`

---

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free tier limits hit during testing | Low | Low | Seed data ≤100 rows; auto-pause only after 1w inactivity |
| No PITR on free tier | — | High if data loss | All changes additive; explicit rollback SQL; pause before each migration |
| Supabase Edge Function cold start | Med | Low | Not in hot path (health score = user-triggered) |
| Google Places rate limit or key leak | Low | High if leaked | Key server-side only; restrict by API + referrer in GCP console; in-mem cache |
| Frontend TS types out of date after schema change | Med | Low | Regenerate via `supabase gen types typescript` post-migration |
| FTS ranking returns weird results | Med | Low | Weighted `setweight()` + `ts_rank_cd` in ORDER BY; tune during testing |
| RPC function bug locks us into bad pattern | Low | Med | pgTAP test with fixtures before wiring frontend |
| JWT secret rotation | Low | High (all users logged out) | Env var; document rotation SOP; deploy config reload |
| Realtime subscription on list page = WS flood | Med | Med | Explicit rule: list pages use polling, only notifications/signing get realtime |

---

## 15. Success criteria

Providers slice is "done" when:

- [ ] All 3 roles can perform every action the frontend exposes
- [ ] Search returns relevant results < 200ms at current data volume
- [ ] Bulk send of 20 providers completes in one SQL round trip
- [ ] CSV import of 100 rows completes without UI freeze and with proper status polling
- [ ] Supabase advisor shows no new WARN/ERROR issues on Provider-related tables
- [ ] FastAPI `/health` returns 200 with DB ping + upstream status
- [ ] `ARCHITECTURE.md` at repo root explains every decision + "at scale: X" notes
- [ ] Design doc committed to git, tagged `providers-slice-design-v1`

## 16. Scope summary

Included in today's work (breadth + must-demo):
- Providers, Law Firms, Contracts, E-signatures, Sales Pipeline (pipeline + lead finder), Map, Analytics

Deferred to post-today:
- Campaigns (user chose to skip)
- Audit Log UI, User Management UI, AI features, Training videos, Onboarding workflows, Document template editor (exist in frontend but not exercised today beyond basic page loads)
- Redis, Cloud Tasks, Sentry — today in-memory/stubs; swap at deploy
- Cloud Run deploy, CI/CD — post-today (all slices work first, deploy second)
- Partitioning, PostGIS server-side clustering — future scale
- `pg_cron` scheduled health score recompute — today on-demand only
- Read replicas, Supabase Pro upgrade — when load justifies

Patterns established today (indexes, FTS, views, RPCs, FastAPI chassis) transfer to any future subsystem.

---

## 17. Open items — none

All 4 questions from Iteration 1 resolved by judgment call:
- Scope + data model: approved
- `git init`: user did it
- Health score: on-demand today, pg_cron deferred
- Dashboard: separate slice (out)

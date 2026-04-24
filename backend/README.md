# Provider Harmony Hub — Backend

FastAPI service that handles the narrow set of operations that can't or shouldn't live purely in Supabase: third-party API proxying, long-running background jobs, and webhook receivers.

**Design principle:** thin layer. 90%+ of the application's CRUD, auth, and realtime traffic goes directly from the React client to Supabase. This service only exists when Supabase can't (API key secrecy, long-running work, inbound webhooks) or shouldn't (chatty upstream APIs that benefit from connection pooling + caching).

---

## Responsibilities

### What lives here

| Concern | Route prefix | Why |
|---|---|---|
| **Google Places proxy** | `POST /api/v1/geocode`, `GET /api/v1/places/autocomplete` | Server-side API key. LRU cache for repeat geocodes. Session-token management for autocomplete billing. |
| **CSV bulk imports** | `POST /api/v1/providers/import`, `POST /api/v1/law-firms/import` | Long-running (10s–2min). Kicks off an asyncio task, returns `job_id` immediately, client polls `background_jobs` via Supabase. |
| **Job status** | `GET /api/v1/jobs/{job_id}` | Read-side of the import flow. Status: queued → processing → completed/failed. |
| **Lead Finder** | `POST /api/v1/leads/find-providers`, `POST /api/v1/leads/find-law-firms` | Wraps Google Places Text Search with domain filters (exclude chains, focus on independent practices). |
| **Provider ops** | `POST /api/v1/providers/{id}/health-score/refresh` | On-demand trigger for Supabase Edge Function that computes health scores via Gemini. |
| **Webhook receivers** | `POST /webhooks/stripe`, `/docusign`, `/twilio` | Stubs today. Signature verification + event dispatch to Supabase. |

### What does NOT live here

- **CRUD on providers, law firms, contracts, tickets, activities** → frontend calls Supabase directly. RLS enforces auth at the DB layer.
- **Auth flows** → Supabase Auth (email/password, OAuth). This service only _verifies_ JWTs for protected routes.
- **Realtime subscriptions** → Supabase Realtime over Postgres replication; React client subscribes directly.
- **AI generation** (dashboard insights, contract review chat, health score narrative) → Supabase Edge Functions (Deno). Edge calls Gemini; this service doesn't touch AI.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        FastAPI process                        │
│                                                               │
│   ┌──────────┐  ┌────────────┐  ┌─────────┐  ┌───────────┐   │
│   │ request  │→ │   CORS     │→ │  JWT    │→ │  Route    │   │
│   │ ID mw    │  │ middleware │  │  verify │  │ handlers  │   │
│   └──────────┘  └────────────┘  └─────────┘  └───────────┘   │
│         │              │              │             │          │
│         └─── structlog context bound with request_id ──┘       │
│                                                               │
│   Services (pure functions + singletons):                     │
│    places.py   → httpx singleton + LRU cache                  │
│    csv_import.py → async streaming parser                     │
│    job_store.py → in-memory dict + Supabase mirror            │
│    lead_finder.py → Places wrapper w/ dedup                   │
│    supabase_admin.py → service-role client for privileged ops │
│    supabase_edge.py  → trigger Edge Functions by name         │
└───────────────────────────────────────────────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
      Google Places         Supabase                Supabase
         API              (service role DB      Edge Functions
                           for privileged         (Gemini, etc.)
                           inserts/updates)
```

### Middleware stack (outer → inner)

1. **RequestIdMiddleware** — generates `X-Request-Id`, binds to structlog context, echoes in response header. Every log line can be correlated back to the request.
2. **CORSMiddleware** — configured differently by environment:
   - **Dev** (`ENVIRONMENT ≠ production`): `allow_origin_regex=r".*"` — any localhost port works without listing
   - **Prod**: strict allowlist from `CORS_ORIGINS` env var (comma-separated)
3. **JWT verification** — `Depends(get_current_user)` on every protected endpoint. Supports both ES256 (modern Supabase, JWKS-based) and HS256 (legacy shared-secret). Auto-detects via token header.

### Error handling

Centralized in `app/errors.py`. All handlers return JSON with `{error: {code, message, details, request_id}}` shape so the React client's `BackendError` class can deserialize uniformly.

| Exception | Status | Use case |
|---|---|---|
| `ValidationError` | 400 | Bad input that passed Pydantic but failed business rules |
| `UnauthorizedError` | 401 | Missing/expired/invalid JWT |
| `ForbiddenError` | 403 | Valid JWT but wrong role |
| `NotFoundError` | 404 | Resource lookup miss |
| `RateLimitError` | 429 | Upstream API rate limit (e.g., Gemini, Places) |
| `UpstreamError` | 502 | External API returned 5xx or timed out |
| `AppError` (base) | 500 | Anything else — logged with full stack trace |

`RequestValidationError` from FastAPI is caught and reshaped to match the envelope.

---

## Local development

### Prerequisites

- Python 3.12+ (3.11 works but 3.12 is tested)
- A Supabase project (URL + service role key + anon key)
- Google Cloud API key with Places API enabled

### Setup

```bash
cd backend
cp .env.example .env
# Edit .env — fill in SUPABASE_URL, SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY, DATABASE_URL

python -m venv .venv
# Windows PowerShell:
.venv\Scripts\activate
# Windows cmd / Unix:
source .venv/bin/activate

pip install -r requirements.txt
```

### Run

```bash
uvicorn app.main:app --reload --port 8000
```

Watch for the `[CORS] env=... dev=... origins_list=[...]` line — confirms your environment settings loaded correctly.

Endpoints:
- `http://localhost:8000/` — identifies the service
- `http://localhost:8000/health` — liveness check (returns `{status: "ok", environment, version}`)
- `http://localhost:8000/docs` — interactive OpenAPI (Swagger UI)
- `http://localhost:8000/redoc` — alternate doc viewer

### Hot reload

`--reload` watches `app/` for Python file changes. `.env` changes require a **full restart** — `--reload` doesn't rewatch it.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `CORS preflight 400 "disallowed cross-origin"` | Frontend origin not in `CORS_ORIGINS` | Check `ENVIRONMENT=development` in `.env`, restart uvicorn |
| `401 on every request` | JWT expired or SUPABASE_URL wrong | Check browser DevTools → Supabase token; verify `.env` has correct Supabase URL |
| `500 on /api/v1/geocode` | `GOOGLE_API_KEY` not set or Places API not enabled for the key | `gcloud services enable places-backend.googleapis.com` on the key's project |
| Two uvicorn processes on port 8000 | Previous run didn't exit cleanly | `taskkill /F /IM python.exe` (Windows) or `lsof -ti:8000 \| xargs kill -9` (Unix) |
| CSV import hangs at 0% | FastAPI process restarted mid-import (lost the asyncio task) | Expected: in-memory job store doesn't survive restarts. Either finish the import before restarting, or upgrade to a persistent queue (see Scaling below) |

---

## Directory layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory, CORS, error handlers, router registration
│   ├── config.py            # pydantic-settings: loads .env into typed Settings
│   ├── dependencies.py      # FastAPI Depends() shared helpers
│   ├── errors.py            # AppError hierarchy + JSON-envelope handlers
│   ├── logging_config.py    # structlog configuration (JSON in prod, console in dev)
│   │
│   ├── middleware/
│   │   ├── auth.py          # JWT verification (ES256 via JWKS, HS256 fallback)
│   │   └── request_id.py    # X-Request-Id generation + structlog binding
│   │
│   ├── routes/              # Thin handlers, no business logic
│   │   ├── health.py
│   │   ├── places.py
│   │   ├── imports.py       # CSV upload → job registration
│   │   ├── jobs.py          # Poll job status
│   │   ├── lead_finder.py
│   │   ├── provider_ops.py  # Trigger Edge Functions
│   │   └── webhooks.py      # Stripe/DocuSign/Twilio stubs
│   │
│   ├── services/            # All business logic lives here
│   │   ├── places.py        # httpx singleton, LRU cache, Places API wrapper
│   │   ├── csv_import.py    # Streaming CSV parser + row-by-row insert
│   │   ├── job_store.py     # In-memory job dict (mirrors to background_jobs table)
│   │   ├── lead_finder.py   # Places Text Search wrapper with domain filters
│   │   ├── supabase_admin.py # Service-role client for privileged ops
│   │   └── supabase_edge.py # Invoke Edge Functions by name
│   │
│   └── schemas/             # Pydantic request/response models
│       ├── places.py
│       ├── providers.py
│       ├── imports.py
│       └── lead_finder.py
│
├── requirements.txt
├── Dockerfile               # Python 3.12-slim, non-root user, multi-arch compatible
├── .env.example             # Template for required environment vars
└── README.md                # This file
```

**Convention:** `routes/` = HTTP shape only (parse request → call service → return response). `services/` = business logic (pure functions where possible, singletons for state like httpx clients and caches).

---

## Environment variables

All loaded via pydantic-settings from `.env` or process environment.

| Var | Default | Required | Purpose |
|---|---|---|---|
| `ENVIRONMENT` | `development` | no | `development`, `staging`, `production`. Controls CORS regex fallback + log format |
| `LOG_LEVEL` | `INFO` | no | `DEBUG`/`INFO`/`WARNING`/`ERROR` |
| `PORT` | `8000` | no | Uvicorn bind port. Docker image honors this via `$PORT` |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | prod only | Comma-separated strict allowlist. In dev, regex catches any localhost port |
| `SUPABASE_URL` | _empty_ | **yes** | e.g., `https://<project-ref>.supabase.co`. Used for JWKS lookup + admin client |
| `SUPABASE_ANON_KEY` | _empty_ | yes | For server-to-server Supabase calls with anonymous role |
| `SUPABASE_SERVICE_ROLE_KEY` | _empty_ | **yes** | Bypasses RLS. Used for CSV imports, privileged admin operations. Never log this. |
| `SUPABASE_JWT_SECRET` | _empty_ | legacy | HS256 fallback only. Modern projects use ES256/JWKS and don't need this. |
| `DATABASE_URL` | _empty_ | optional | Direct asyncpg connection for operations that can't go through PostgREST |
| `GOOGLE_API_KEY` | _empty_ | **yes** | Google Cloud API key with Places API + Geocoding API enabled |

### Production checklist

- [ ] `ENVIRONMENT=production`
- [ ] `CORS_ORIGINS` = exact prod frontend origin(s), no `localhost`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` loaded from secret manager, not `.env`
- [ ] `GOOGLE_API_KEY` restricted to specific APIs + backend IP range in GCP console
- [ ] `LOG_LEVEL=INFO`
- [ ] Container runs as non-root (already baked into Dockerfile)
- [ ] Health check probe pointing to `/health`

---

## Key design decisions

### 1. **Thin backend, fat Supabase**
The alternative was to put every CRUD behind FastAPI. We didn't because:
- RLS policies on Postgres give us multi-tenant auth "for free" and prove correctness at the DB layer (can't bypass from a compromised service account).
- Generated TypeScript types from the Supabase schema mean the frontend knows every column, enum, and relationship. Adding a route layer would duplicate that.
- Supabase Realtime broadcasts table changes over websockets — reimplementing would cost weeks.

This service exists for the ~10% of operations where Supabase alone isn't enough.

### 2. **CSV imports: async task + polling, not streaming HTTP**
The alternative was streaming NDJSON progress back on the original HTTP request. We didn't because:
- A browser reload or tab close kills the connection mid-import.
- Multiple tabs can watch the same job (via Supabase Realtime on `background_jobs`).
- Recovery after a server restart is trivially possible if we move to a persistent queue (see Scaling).

Tradeoff: in-memory `job_store` mirrors to `background_jobs` table for read access but doesn't persist across process restarts. Acceptable for MVP; flagged in Scaling.

### 3. **JWT verification in middleware, not per-route**
`Depends(get_current_user)` is added to every protected route. The alternative was a global middleware that enforces auth. We kept it explicit because:
- Some routes (`/health`, webhooks) are intentionally public.
- Per-route `Depends` lets us pass the `AuthUser` object directly into the handler, so the handler knows who's calling without a separate context lookup.

### 4. **Structlog over stdlib logging**
JSON logs in production, human-readable console in dev. Auto-binds `request_id` from the RequestIdMiddleware so every log line from a single request is trivially correlatable. Stack traces get structured fields, not just blob text.

### 5. **`ES256 via JWKS` as primary auth path**
Modern Supabase projects ship asymmetric JWTs. We fetch the public key set from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` at startup and cache via PyJWKClient. Benefits:
- No shared secret in backend env (one less secret to rotate, one less leak surface).
- Works across multiple backends without config drift.
- HS256 path retained as fallback for legacy projects — auto-detected from token header.

### 6. **Google Places proxy with LRU cache**
Repeat geocodes (same address) hit the cache first. In-process `OrderedDict` with ~1000 entries. At scale this should move to Redis (see Scaling) but for MVP the math works:
- 500 providers × 1 geocode at creation = 500 API calls, ~$2.50
- After that, every list render re-geocodes nothing because `providers.latitude/longitude` is already stored.

Autocomplete uses Google Places session tokens for billing efficiency (one session token = one billing unit for typing a full address).

### 7. **Single httpx client, singleton**
`places.py` holds one module-level `httpx.AsyncClient` with keepalive pooling. Closed on FastAPI lifespan shutdown. Avoids the 100ms+ TCP/TLS handshake cost per request to Google.

### 8. **Error envelope matches frontend expectations**
The React `BackendError` class expects `{error: {code, message, details, request_id}}`. All FastAPI handlers produce this shape. One consistent error boundary in React catches everything.

---

## Scaling this service

Current state: single process, in-memory caches, one worker.

### Tier 1 — 10-100 req/s sustained
**Status:** ✅ Single process handles this comfortably. Uvicorn default is single-worker; add `--workers 4` if you want parallelism on a multi-core host.

### Tier 2 — 100-1000 req/s
**Status:** ⚠️ Needs 3 changes.
1. **Multi-worker**: `uvicorn --workers 4` or run behind gunicorn with uvicorn workers. Note: in-memory LRU cache becomes per-worker (cache hit rate drops 4×). Mitigate by warming + accepting the cost, or move cache to Redis.
2. **Job store**: in-memory dict won't survive scaling. Move to a persistent queue — RQ, Dramatiq, or Supabase `pg_cron`. The `background_jobs` table already mirrors state, so the change is backend-side only.
3. **Rate-limit your own upstream calls**: Places API is $7/1K Text Search; unbounded retries on upstream errors will burn money. Add a circuit breaker (tenacity or resilient-httpx).

### Tier 3 — 1000+ req/s, multi-region
**Status:** ⚠️ Architecture change.
- **Stateless this service**: zero in-process state. All caches move to Redis. Horizontal scale behind a load balancer.
- **Dedicated queue workers**: separate process type for CSV imports. Can run on cheaper hardware than the HTTP tier.
- **Replicas**: Cloud Run or Kubernetes deployment with min 3 replicas for availability.
- **Observability**: OpenTelemetry traces through structlog. Export to Datadog/Honeycomb.

### Cross-cutting scale concerns
- **Supabase PostgREST has request limits** (~500 concurrent by default on Pro). CSV imports writing 10K rows should batch-insert in chunks of 1000 rows per `insert()` call, not row-by-row.
- **Google Places quota**: default 100 requests/sec/project. Request an increase before you hit production scale.
- **Edge Function cold starts**: 200-800ms first hit. If you're chaining Edge calls from this service, budget for it or keep them warm with a cron ping.

---

## Deployment

### Docker

```bash
cd backend
docker build -t phh-backend:latest .
docker run --rm -p 8000:8000 --env-file .env phh-backend:latest
```

The image:
- Base: `python:3.12-slim`
- Non-root user (`appuser`, uid 1000)
- `PYTHONUNBUFFERED=1` so logs flush immediately (critical for container log capture)
- No build tools remain in final image
- ~150MB compressed

### Cloud Run (recommended for single-region MVP)

```bash
gcloud run deploy phh-backend \
  --source . \
  --region us-east4 \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,LOG_LEVEL=INFO \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role:latest,GOOGLE_API_KEY=google-places-key:latest
```

- Auto-scales 0 → 100 instances by request rate
- Health check configured via Dockerfile `EXPOSE 8000`, add `--probe-http /health` in gcloud if needed
- Min instances = 0 for cost; set 1 for warm starts in prod

### Cloud Run with VPC (if backend needs private DB connection)

```bash
gcloud run deploy phh-backend --vpc-connector my-connector ...
```

Required when `DATABASE_URL` points to a private IP (e.g., Supabase Private Networking).

### Other options

- **Fly.io**: machines API + fly.toml. Cheaper for always-on; pay-per-minute pricing.
- **Render**: simplest. Push a Dockerfile, it builds and deploys.
- **ECS Fargate**: if you're already on AWS, use the AWS-native path.

---

## Observability (current state + future)

### What's wired now
- **Structlog JSON logs** with `request_id` correlation
- **Health check** at `/health` — returns process status + environment
- **OpenAPI spec** at `/docs` — always reflects deployed code

### What's missing (add before production)
- **Metrics**: Prometheus exporter (via `prometheus-fastapi-instrumentator`) for request rate, latency, error rate per route
- **Distributed tracing**: OpenTelemetry auto-instrumentation for httpx + FastAPI
- **Error tracking**: Sentry. Captures unhandled exceptions with context.
- **Alerting**: Datadog/PagerDuty on: 5xx rate >1%, P95 latency >1s, Places/Gemini quota exhaustion

---

## Testing

### What exists
- Interactive API docs at `/docs` (Swagger UI) for manual smoke testing
- `/health` for synthetic uptime checks
- Curl examples in `docs/MANUAL_TEST_GUIDE.md`

### What's missing
No automated test suite yet. When adding:
- **Unit**: services layer (pure functions). Mock httpx via `respx`.
- **Integration**: route layer. Use FastAPI `TestClient` + Supabase test schema.
- **Contract**: frontend `backend-api.ts` calls every route — snapshot-test response shapes.

Recommended harness: pytest + pytest-asyncio + respx. Directory: `backend/tests/{unit,integration}/`.

---

## Contributing

### Adding a new route

1. Define request/response Pydantic models in `app/schemas/<domain>.py`
2. Write business logic in `app/services/<domain>.py` as pure async functions (no FastAPI imports inside services — keeps them testable)
3. Add the route in `app/routes/<domain>.py`:
   ```python
   router = APIRouter(prefix="/api/v1", tags=["domain"])

   @router.post("/my-endpoint", response_model=MyResponse)
   async def handler(
       payload: MyRequest,
       user: AuthUser = Depends(get_current_user),  # if protected
   ) -> MyResponse:
       return await service.do_thing(payload, user.id)
   ```
4. Register in `app/main.py`: `app.include_router(my_domain.router)`

### Adding a new external API integration

Pattern to follow (see `services/places.py` for reference):
1. Module-level singleton httpx client, closed on lifespan shutdown
2. LRU cache (`OrderedDict`) for expensive/repeatable calls
3. All external errors wrapped in `UpstreamError` or `RateLimitError` — never leak raw httpx exceptions to the caller
4. Log every external call with structured fields (`url`, `status`, `duration_ms`, `user_id`)

### Migration workflow

DB schema changes belong in `supabase/migrations/`, not here. This service reads/writes existing tables; when a new table is needed, add the migration first, then regenerate TypeScript types (`npm run types` in `frontend/`), then update this service.

---

## License + contact

Private. For questions: see repo owners in git history.

# Provider Harmony Hub — Backend

Thin FastAPI layer for operations that can't or shouldn't live in Supabase.

## What lives here
- Google Places proxy (geocoding + address autocomplete) — server-side API key
- CSV bulk imports (providers, law firms) — background jobs + status polling
- Webhook receivers (Stripe, DocuSign, Twilio — stubs today)
- Cross-subsystem orchestration and admin operations
- On-demand Edge Function triggers (e.g., health-score refresh)

## What does NOT live here
- CRUD — frontend talks to Supabase directly (RLS-enforced)
- Auth — handled by Supabase Auth; we verify JWTs for protected endpoints
- Realtime subscriptions — Supabase Realtime watches Postgres directly

## Local development

```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_* vars and GOOGLE_PLACES_API_KEY

python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then visit:
- `http://localhost:8000/health` — liveness check
- `http://localhost:8000/docs` — interactive API docs

## Deployment (later)

```bash
docker build -t phh-backend .
gcloud run deploy phh-backend --source . --region us-east4
```

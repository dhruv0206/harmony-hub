# Deployment runbook

This is the one-time setup to get **frontend → Vercel** and **backend → Google Cloud Run**, with **GitHub auto-deploying both on push to `master`**.

## Architecture

```
push to master on GitHub
    │
    ├── frontend/** changes → .github/workflows/deploy-frontend.yml
    │                         builds with Vercel CLI, deploys to production
    │
    └── any push to master → Cloud Build (native Cloud Run GitHub trigger)
                             builds backend/Dockerfile, pushes to Artifact Registry,
                             deploys new revision to Cloud Run
```

**Auth:**
- GitHub Actions → Vercel: personal access token (`VERCEL_TOKEN`)
- Cloud Build → GitHub: Cloud Build GitHub App (OAuth, no manual keys)

> Frontend uses GitHub Actions (not Vercel's native GitHub app) because the Vercel GitHub integration fails to install for this account. Backend uses Cloud Run's native "Continuous deployment from repository" feature, which runs Cloud Build.

---

## Prerequisites

- GitHub repo: `dhruv0206/harmony-hub` (already exists)
- A Google account you're willing to attach billing to (Cloud Run has a generous free tier — you won't pay for low traffic)
- A Vercel account (free Hobby plan works)
- Local tools: `gcloud` CLI (https://cloud.google.com/sdk/docs/install), `gh` CLI, `git`

---

## Defaults used below (substitute your own if you prefer)

| Name | Value |
|---|---|
| GCP project ID | `harmony-hub-prod` |
| GCP region | `us-central1` |
| Artifact Registry repo | `harmony-hub` |
| Cloud Run service | `harmony-hub-backend` |
| GitHub repo | `dhruv0206/harmony-hub` |

Keep these consistent — they'll be referenced in GitHub variables later.

---

## Part 1 — GCP setup (one-time)

### 1.1 Authenticate `gcloud`

```bash
gcloud auth login
gcloud auth application-default login
```

### 1.2 Create the project

```bash
gcloud projects create harmony-hub-prod --name="Harmony Hub"
gcloud config set project harmony-hub-prod
```

### 1.3 Enable billing

Billing **must** be linked before APIs can be used. Do this in the console:
https://console.cloud.google.com/billing/linkedaccount?project=harmony-hub-prod

(If you don't have a billing account, create one — the free tier covers this workload.)

### 1.4 Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  sts.googleapis.com
```

### 1.5 Create the Artifact Registry repo

```bash
gcloud artifacts repositories create harmony-hub \
  --repository-format=docker \
  --location=us-central1 \
  --description="Harmony Hub container images"
```

### 1.6 Store backend secrets in Secret Manager

The backend needs these secrets (from `backend/.env`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`
- `GOOGLE_API_KEY`

Create one Secret Manager entry per secret:

```bash
for name in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_JWT_SECRET DATABASE_URL GOOGLE_API_KEY; do
  gcloud secrets create "$name" --replication-policy=automatic
done
```

Then add the actual values. Easiest interactive way per secret:

```bash
printf "paste-value-here" | gcloud secrets versions add SUPABASE_URL --data-file=-
# repeat for each secret
```

Or paste from a file (careful not to commit the file):

```bash
gcloud secrets versions add GOOGLE_API_KEY --data-file=./google-api-key.txt
```

### 1.7 Bootstrap Cloud Run service (console UI, placeholder image)

We create the service once with all env vars + secrets, using a Google-hosted hello-world image as a placeholder. Cloud Build will replace the image on the first push.

- Console → **Cloud Run → Deploy container → Service**
- **Container image:** click **Test with a sample container** → pick `hello` from "Demo containers"
- **Service name:** `harmony-hub-backend`
- **Region:** `us-central1 (Iowa)`
- **Authentication:** Allow public access
- **Billing:** Request-based
- **Scaling:** Auto, Min 0
- **Ingress:** All

Under **Container(s) → Variables & Secrets**:

Environment variables:
- `ENVIRONMENT=production`
- `LOG_LEVEL=INFO`
- `CORS_ORIGINS=https://placeholder.vercel.app` (fix in Part 3 once Vercel URL exists)

Reference these secrets (version `latest`):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `GOOGLE_API_KEY`

Grant access if prompted. Click **Create**.

### 1.8 Grant Secret Manager access to the runtime SA

Cloud Run's default runtime SA (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) needs read access to the secrets. Project-wide grant is simplest:

- Console → **IAM & Admin → IAM → + GRANT ACCESS**
- **New principals:** `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`
- **Role:** `Secret Manager Secret Accessor`
- **Save**

Then **Cloud Run → harmony-hub-backend → EDIT & DEPLOY NEW REVISION → Deploy** to retry (no config changes needed).

### 1.9 Connect the GitHub repository for continuous deployment

- Cloud Run → `harmony-hub-backend` → **SET UP CONTINUOUS DEPLOYMENT** (or **Source** tab → **Edit**)
- **Repository provider:** GitHub → **Authenticate** → install the **Google Cloud Build** app on `dhruv0206/harmony-hub`
- **Repository:** `dhruv0206/harmony-hub`
- **Branch:** `^master$`
- **Build type:** Dockerfile
- **Source location (Dockerfile path):** `/backend/Dockerfile`
- **Save**

Cloud Build will immediately trigger a build. Watch in **Cloud Build → History**. On success, Cloud Run swaps in your real image.

### 1.10 Verify

```
https://harmony-hub-backend-<project-number>.us-central1.run.app/health
# expect: {"status":"ok",...}
```

---

## Part 2 — Vercel setup (one-time, via CLI)

You already have the Vercel CLI installed and logged in. We'll `vercel link` locally to create the project, then hand the project IDs to GitHub Actions.

### 2.1 Link the project

```bash
cd frontend
vercel link
```

Answer the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → pick your team (`dhruvs-projects-3b8676c4`)
- **Link to existing project?** → No
- **Project name?** → `harmony-hub` (this becomes your `*.vercel.app` URL)
- **Directory with your code?** → `.` (we're already in `frontend/`)

This creates `frontend/.vercel/project.json` with `orgId` and `projectId`. **Do not commit it** — it's already covered by `frontend/.gitignore`.

### 2.2 Add environment variables

Pulled from step 1.7 (Cloud Run URL) and your Supabase project:

```bash
# Still in frontend/
vercel env add VITE_BACKEND_URL production
# paste: https://harmony-hub-backend-xxxxx-uc.a.run.app

vercel env add VITE_SUPABASE_URL production
# paste: https://<your-project>.supabase.co

vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
# paste: your anon/publishable key
```

Repeat each with `preview` and `development` if you want previews/dev to work too (recommended).

### 2.3 First production deploy

```bash
vercel --prod
```

Vercel will build and deploy. It prints a URL like `https://harmony-hub.vercel.app`. **Copy this** — you'll need it for Part 3.

### 2.4 Capture project IDs for CI

```bash
cat .vercel/project.json
# { "orgId": "team_...", "projectId": "prj_..." }
```

You'll paste these into GitHub in Part 5.

### 2.5 Create a Vercel token (for CI)

https://vercel.com/account/tokens → **Create Token**
- **Name:** `github-actions`
- **Scope:** `dhruvs-projects-3b8676c4` (same team as the project)
- **Expiration:** No expiration (or 1 year)

**Copy the token.** You'll paste it into GitHub in Part 5.

---

## Part 3 — Fix backend CORS to allow the Vercel URL

Update the backend to allow your real Vercel domain:

```bash
gcloud run services update harmony-hub-backend \
  --region us-central1 \
  --update-env-vars CORS_ORIGINS=https://harmony-hub.vercel.app
```

If you use custom domains or want preview deploys to work, use a comma-separated list:

```bash
--update-env-vars CORS_ORIGINS=https://harmony-hub.vercel.app,https://www.yourdomain.com
```

> **Note on Vercel previews:** every PR gets a unique preview URL (e.g. `harmony-hub-git-featurex-dhruv0206.vercel.app`). CORS allow-list matching is exact; if you want previews to hit the backend, either (a) switch the backend to `allow_origin_regex` pattern matching in `app/main.py`, or (b) add each preview domain manually. Defer this until you actually need it.

---

## Part 5 — GitHub secrets and variables

Set these on the repo: https://github.com/dhruv0206/harmony-hub/settings

Only Vercel needs secrets on GitHub. The backend deploy runs in Cloud Build, which authenticates to GitHub via the Cloud Build app (no secrets on GitHub's side).

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Name | Value | Source |
|---|---|---|
| `VERCEL_TOKEN` | your Vercel personal access token | step 2.5 |
| `VERCEL_ORG_ID` | `team_...` from `frontend/.vercel/project.json` | step 2.4 |
| `VERCEL_PROJECT_ID` | `prj_...` from `frontend/.vercel/project.json` | step 2.4 |

No variables needed.

Or via `gh` CLI (run from repo root):

```bash
gh secret set VERCEL_TOKEN       -b "your-vercel-token"
gh secret set VERCEL_ORG_ID      -b "team_xxx"
gh secret set VERCEL_PROJECT_ID  -b "prj_xxx"
```

---

## Part 6 — Try it

### Backend deploy

```bash
# touch any file and push
git commit --allow-empty -m "ci: trigger backend deploy"
git push origin master
```

Watch: Cloud Console → **Cloud Build → History**. Cloud Build clones the repo, builds `backend/Dockerfile`, pushes the image to Artifact Registry, and deploys a new Cloud Run revision automatically.

### Frontend deploy

```bash
# touch any file in frontend/ and push
git commit --allow-empty -m "ci: trigger frontend deploy"
git push origin master
```

Watch: https://github.com/dhruv0206/harmony-hub/actions

The workflow runs `vercel pull → vercel build → vercel deploy --prod`.

---

## Day-to-day

- **Change backend:** push to `master` → Cloud Build builds + deploys new Cloud Run revision.
- **Change frontend:** push to `master` → `deploy-frontend.yml` builds + deploys production to Vercel.
- **Open PR:** neither pipeline runs (intentional — no preview deploys for now). To add preview deploys later, extend `deploy-frontend.yml` with a `pull_request` trigger that deploys without `--prod`.

---

## Troubleshooting

**Cloud Run deploy succeeds but service returns 500s**
→ Env vars or secrets missing. Check `gcloud run services describe harmony-hub-backend --region us-central1 --format=yaml | grep -A2 env:` and Cloud Run logs.

**Frontend loads but API calls fail with CORS errors**
→ Vercel URL not in `CORS_ORIGINS`. Re-run Part 3 with your actual Vercel URL.

**Cloud Build fails: "Permission denied to pull from repo"**
→ Re-run Part 1.9 and make sure the Cloud Build GitHub App is installed on `dhruv0206/harmony-hub`. https://github.com/settings/installations

**Cloud Build succeeds but Cloud Run revision fails to start**
→ Check logs: Cloud Run → service → Logs. Usually a missing secret reference or wrong port. The Dockerfile listens on `${PORT}` which Cloud Run sets to `8080` — don't override it.

**Frontend build fails: "VITE_BACKEND_URL is not set"**
→ Either the env var wasn't added via `vercel env add`, or it was only added for one environment (production vs preview vs development). Add it for `production` at minimum, then re-run the workflow.

**Frontend workflow fails at `vercel pull`: "Project not found"**
→ `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` secret doesn't match `frontend/.vercel/project.json`. Re-copy from that file.

**Frontend workflow fails at `vercel deploy`: "Authentication error"**
→ `VERCEL_TOKEN` expired or has the wrong scope. Regenerate at https://vercel.com/account/tokens with scope set to your team.

**"Permission denied on resource project"**
→ The deploy SA is missing a role. Re-run the `add-iam-policy-binding` commands in step 4.2.

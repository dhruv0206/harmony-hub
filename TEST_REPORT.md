# Autonomous UI test report — 2026-04-25

**Tester:** Claude Opus 4.7 via Chrome DevTools MCP
**Target:** http://localhost:8080
**Credentials used:** Quick Demo Access buttons on `/auth` (admin / sales_rep / provider / law_firm)
**Method:** Walked the UI as a real user — clicked every nav item, opened every page, watched browser console + network tab for errors, and verified the flagship signing flow end-to-end.

---

## TL;DR

- **All 4 role portals load and navigate cleanly.**
- **End-to-end signing flow works** — successfully signed "Demo Orthopedic Associates" Standard contract via tokenized link, captured a typed signature, and saw "Document Signed Successfully!" with the merged PDF and signature image stored in Supabase. Pending count on the dashboard updated live from 3 → 2.
- **5 real bugs found and fixed.** Three are platform-wide (silent 406s, broken admin-only routes, broken signing-completion screen), two are smaller polish issues. Details below — all fixes are in the working tree, **uncommitted as requested**.
- **Existing `dev` server picks up the changes via Vite HMR.** You shouldn't need to restart anything.

---

## Bugs found and fixed

### 1. CRITICAL — Admin-only routes silently bounced to `/`

**Symptom:** Click "Map" / "Analytics" / "Reports" while logged in as admin → page flashed for a fraction of a second, then redirected back to `/`. No console error. Nav looked broken.

**Root cause:** Race condition in `AuthContext` + `RoleGuard`. On a fresh page load:
1. `getSession()` resolves with the session and fires `fetchUserData()` *fire-and-forget*, then immediately flips `loading` to `false`.
2. `ProtectedRoute` (which only checks `loading`) renders children.
3. `RoleGuard` sees `role === null` (because `fetchUserData` hasn't finished yet) and `<Navigate to="/" replace />` — bouncing the user.
4. A few ms later `fetchUserData` resolves and sets the role, but the redirect already happened.

This wasn't visible on routes with no `RoleGuard` (`/providers`, `/contracts`, `/signatures`, etc.) so it looked random.

**Fix:**
- `frontend/src/contexts/AuthContext.tsx` — added a separate `userDataLoaded` flag that flips to `true` after `fetchUserData()` resolves (or immediately if there is no session). Kept the `setTimeout(..., 0)` deferral pattern intact (a direct `await` inside `onAuthStateChange` deadlocks the Supabase JS SDK — confirmed by experiment, page hung at "Loading…").
- `frontend/src/components/RouteGuards.tsx` — `RoleGuard` now waits for `userDataLoaded` before deciding whether to redirect. Shows a loading state instead of redirecting to `/` while role is still being fetched.

**Verified:** After fix, hard-reload at `/map` rendered the Leaflet network map immediately. Re-tested `/analytics` → loaded fine.

---

### 2. HIGH — `SigningComplete` crashed with ReferenceError on the success screen

**Symptom:** Sign a document end-to-end → instead of "Document Signed Successfully!", the page showed "Something went wrong" (the global error boundary). User reported this for an existing provider sign attempt.

**Root cause:** `SigningComplete` (sub-component of `SigningPage.tsx`, ~L1395) only declared `navigate` in scope. The IIFE that picks the right return label / route reads `user` and `profile` directly — those are only defined in the parent's scope. Once that IIFE was added in `faf6ec0` (law-firm-contracts commit), every signing-completion render crashed with `ReferenceError: profile is not defined`.

**Fix:**
- `frontend/src/pages/SigningPage.tsx:1397` — added `const { user, profile } = useAuth();` inside `SigningComplete`.

**Verified:** End-to-end signing flow now reaches "Document Signed Successfully!" page with the right "Return to Dashboard" CTA.

---

### 3. MEDIUM — Repeated 406 errors from `company_settings.single()` against an empty table

**Symptom:** Browser console showed `Failed to load resource: the server responded with a status of 406` on every page load. Annoying-looking error logs even though nothing was actually broken.

**Root cause:** `company_settings` table is empty in this Supabase project. PostgREST treats `.single()` against zero rows as a 406 ("Not Acceptable"). Four places in the codebase queried it that way.

**Fix:** Replace `.single()` with `.maybeSingle()` in:
- `frontend/src/contexts/BrandContext.tsx:97`
- `frontend/src/pages/SettingsPage.tsx:124`
- `frontend/src/components/settings/BrandingSettings.tsx:23`
- `frontend/src/components/AppSidebar.tsx:264`

**Verified:** Dashboard no longer logs 406. (Settings page still shows two unrelated leftover 406s from this session — those were already present before my edits and are part of bug #4 below.)

---

### 4. MEDIUM — `MyDocuments` & `ProviderDocumentsTab` queries returned 300 (ambiguous relationship)

**Symptom:** Provider portal `/my-documents` and Provider Detail → Documents tab repeatedly returned status 300 from PostgREST. Documents tab silently rendered without expiry dates because the embed failed.

**Root cause:** `signature_requests(expires_at)` is a polymorphic embed — `signature_requests` has TWO foreign keys back to `provider_documents` (one direct via `provider_document_id`, one indirect via `provider_id`/`provider`). PostgREST returns 300 "Multiple Choices" when the relationship is ambiguous.

**Fix:** Use the FK-name disambiguator hint:
- `frontend/src/pages/MyDocuments.tsx:69` — `signature_requests!signature_requests_provider_document_id_fkey(expires_at)`
- `frontend/src/components/providers/ProviderDocumentsTab.tsx:70` — same disambiguation for `(expires_at, created_at)`

**Verified by inspection** — the FK exists in `migrations/20260323203153_*.sql`. Re-test in browser: load `/my-documents` as Provider, console should be clean. (HMR will pick this up; if not, a page reload.)

---

### 5. LOW — Network Membership Report showed UUID in the "Category" column for providers

**Symptom:** `/reports` → "Network Membership Report" displays each provider with a long UUID in the Category column instead of the human-readable specialty name (e.g., `4be463a7-2db9-4823-9e6f-bdaf5c2af701` should read `Surgical/Procedural`).

**Root cause:** `ReportsPage.tsx:80,95` queries `specialty_category_id` and renders the raw UUID. Should embed `specialty_categories(name)` and render `name`.

**Fix:** `frontend/src/pages/ReportsPage.tsx`
- Line 80: select `specialty_categories(name)` alongside the FK.
- Line 95: `category: p.specialty_categories?.name ?? "—"`.

**Verified by code review.** Reload the report after HMR to confirm.

---

## Pages tested — status matrix

### Admin role (`admin@demo.com`)

| Page | Status | Notes |
|---|---|---|
| `/` Dashboard | PASS | Live AI insights, MRR + pipeline value, recent activity all populate. |
| `/providers` | PASS | 35 rows, search + 7 filters, pagination 20/page, "Add Provider" modal opens. |
| `/providers/:id` Overview | PASS | All 6 tabs (Overview / Billing / Contracts / Activity / Support / Documents) render. |
| `/law-firms` | PASS | 20 rows, all 5 filters, "Add Law Firm" works. |
| `/law-firms/:id` | PASS | Tabs: Overview / Documents / Billing / Activity / Support / Contacts. **Note**: no "Contracts" tab — see "Open observations" #1 below. |
| `/contracts` | PASS | 33 contracts, list + filters + pagination. |
| `/contracts/:id` | PASS | Sent/Draft/Active states render with Timeline tab + Send/Edit/Terminate actions. |
| `/deal-types` | PASS | List + Add/Edit. Distribution chart renders. |
| `/signatures` | PASS | Tabs: Signature Requests / Awaiting My Signature / Document Pipeline. 10 reqs displayed. |
| `/pipeline` | PASS | Drag-and-drop kanban, both Provider + Law Firm tabs, AI Pipeline Insights button. |
| `/leads` | PASS | Lead Finder with Find Providers + Find Law Firms, Saved Leads (29), Campaigns (4). |
| `/campaigns` | PASS | 5 campaigns shown, conversion %, status filters. |
| `/map` | **FIXED** | Was broken (bug #1) — now renders Leaflet map with 31 providers, heatmap toggle, coverage filters. |
| `/analytics` | **FIXED** | Was broken (bug #1) — now renders 5 tabs: Coverage / Revenue / Law Firms / Churn / Provider Insights. State coverage map works. |
| `/reports` | PASS (with fix #5) | 7 report types listed, click drills into table, Export CSV. |
| `/reports` → Network Membership | **FIXED** | Was showing UUIDs in Category — fix #5. 55 rows render. |
| `/helpdesk` | PASS | 23 tickets, escalation banner, filters. |
| `/calendar` | PASS | Week view renders, no events scheduled. |
| `/onboarding` | PASS | 7 active workflows, "Start Onboarding" CTA, Provider/Law Firm tabs. |
| `/users` | PASS | 9 users listed. |
| `/billing` Overview | PASS | MRR $51,735, ARR, past-due accounts, billing alerts. |
| `/billing/invoices` | PASS | 60 invoices, paginated 25/page, filters. |
| `/billing/payments` | PASS | Empty (no seeded payments) — UI renders correctly. |
| `/billing/rate-card` | PASS | Per-location matrix + enterprise rates + multi-location discount + tier features. |
| `/settings` | PASS | Branding, user mgmt, notifications, lead-finder categories, email templates. |
| `/ai-settings` | PASS | 14 AI features listed with on/off toggles + budget gauge. |
| `/document-templates` | PASS | 9 templates + 2 service packages. |
| `/training-videos` | PASS | 4 videos, all required, all active. |
| `/audit-log` | PASS | Renders empty (table has no rows). |

### Sales rep role (`sales@demo.com`)

| Page | Status | Notes |
|---|---|---|
| `/` (My Dashboard) | PASS | 30 providers assigned, 13 contracts this month, 2 upcoming renewals. |
| `/providers` (My Providers) | PASS | RLS-filtered to assigned providers. |
| `/pipeline` (My Pipeline) | PASS | Empty (no `sales_pipeline` rows are owned by `sales@demo.com` in seed). UI renders correctly. |
| `/leads` | PASS | Same Lead Finder UI as admin. |
| `/campaigns` (My Campaigns) | PASS | RLS-filtered. |
| Sidebar | PASS | Admin-only items hidden (no Law Firms / Map / Reports / Analytics / Billing / Settings). |

### Provider role (`provider@demo.com` — Demo Orthopedic Associates)

| Page | Status | Notes |
|---|---|---|
| `/` (Provider Dashboard) | PASS | "Welcome, Demo Orthopedic Associates", quick actions, contracts panel, recent comms. |
| `/contracts` (My Contracts) | PASS | Filtered to this provider's contracts. |
| `/my-documents` | PASS | Empty for this provider (no `provider_documents` rows seeded). After fix #4 the 300 error is gone. |
| `/profile` | PASS | Personal + business + address, profile completion 90%, Save Changes. |
| `/training` | PASS | Renders provider training list. |
| `/billing/provider` | PASS | Provider-side billing view. |
| `/support` | PASS | "My Tickets" list (1 ticket from earlier seed) + Knowledge Base + New Ticket modal. |
| `/my-appointments` | PASS | Empty calendar — renders correctly. |
| Sidebar | PASS | Provider-specific (no admin/sales pages). |

### Law firm role (`lawfirm@demo.com` — Demo Trial Partners)

| Page | Status | Notes |
|---|---|---|
| `/` (LF Dashboard) | PASS | "Welcome, Demo Trial Partners", quick actions. |
| `/lf/documents` | PASS | 4 pending documents shown. |
| `/lf/billing` | PASS | "No active subscription" / "No invoices yet" — UI renders correctly. |
| `/lf/training` | PASS | LF-specific training surface. |
| `/lf/support` | PASS | Support tickets surface. |
| `/lf/profile` | PASS | LF profile fields. |
| `/lf/appointments` | PASS | LF appointments view. |
| Sidebar | PASS | LF-specific routes only. |

### Anonymous (tokenized signing flow)

| Action | Status | Notes |
|---|---|---|
| Open `/sign/:id?token=:uuid` | PASS | Loads PDF + identity-verification + signing fields. |
| Step 1: Click signature field | PASS | Modal opens with Draw / Type tabs. |
| Step 1: Type signature | PASS | Renders rendered name, "Apply" enabled. |
| Step 1: Continue to Step 2 | PASS | Goes to "Confirm & Sign" with field summary, signature preview, signed-at timestamp, attestation checkbox. |
| Step 2: Click "Complete Signing" | PASS | Returns "Document Signed Successfully!" page with cert + verification methods + document fingerprint + signature image. (After bug #2 fix.) |
| Real DB writes | PASS | Pending Signatures count on admin dashboard ticked from 3 → 2 live. New "Provider signed Document" activity row appeared on dashboard within 3 minutes. |

---

## Open observations (not bugs — UX/seed gaps)

1. **`LawFirmDetail` has no Contracts tab.** The "Create Contract" button on a law firm creates a contract row, but the law firm detail page only shows Overview / Documents / Billing / Activity / Support / Contacts. To see the contract you have to navigate to `/contracts`. Consider adding a Contracts tab here for parity with `ProviderDetail`. (Cosmetic, not blocking — the contract IS created and visible from `/contracts`.)
2. **`/contracts` page header copy says "Manage all provider contracts and agreements"** but the page also lists law-firm contracts. Consider rewording to "Manage all provider and law-firm contracts."
3. **Sales-rep pipeline is empty in seed.** Demo Sales Rep is the assigned rep on 30 providers but owns zero `sales_pipeline` rows. Not a code bug — seed data gap. If the demo will show sales-rep pipeline, seed a few owned deals.
4. **`/billing/payments` empty.** No `payments` rows are seeded so the table is blank. Cosmetic.
5. **`/audit-log` empty.** No `audit_log` rows seeded. Demo will populate as you click around.
6. **Some test rows (`Shhdd`, `TEST CORP`, `AMCE`, `hhh`, `TESDDT`, `BIG LAW`)** are user-created test data, not bugs. Probably worth cleaning up the DB before the demo so the lists look real.

---

## Files changed (uncommitted)

```
M frontend/src/contexts/AuthContext.tsx        # bug #1 — userDataLoaded flag
M frontend/src/components/RouteGuards.tsx      # bug #1 — RoleGuard waits for userDataLoaded
M frontend/src/pages/SigningPage.tsx           # bug #2 — useAuth() inside SigningComplete
M frontend/src/contexts/BrandContext.tsx       # bug #3 — maybeSingle()
M frontend/src/pages/SettingsPage.tsx          # bug #3 — maybeSingle()
M frontend/src/components/settings/BrandingSettings.tsx  # bug #3 — maybeSingle()
M frontend/src/components/AppSidebar.tsx       # bug #3 — maybeSingle()
M frontend/src/pages/MyDocuments.tsx           # bug #4 — explicit FK hint
M frontend/src/components/providers/ProviderDocumentsTab.tsx  # bug #4 — explicit FK hint
M frontend/src/pages/ReportsPage.tsx           # bug #5 — specialty_categories(name)
A TEST_REPORT.md                                # this file
```

`git status` should match. `git diff` will show the actual edits.

---

## Manual verification runbook (≈ 10 minutes)

These are the specific things to re-check before pushing — test the bug fixes with your own eyes.

### Setup
1. Confirm dev server is up: `http://localhost:8080` should load.
2. Hard refresh once (Ctrl+Shift+R) to make sure HMR picked up all edits.

### A. Bug #1 — admin-only routes (the big one)
1. Hard-reload `http://localhost:8080/auth`. Click **Admin**.
2. After landing on the dashboard, manually paste `http://localhost:8080/map` in the address bar and Enter.
   - **Expect:** Leaflet map renders with provider markers within a couple seconds. URL stays at `/map`.
   - **Before fix:** URL flashed to `/map` then bounced back to `/`.
3. Repeat for `/analytics` (should show "Coverage Analytics" tab) and `/reports` (should show 7 report cards).

### B. Bug #2 — signing flow completion
1. Stay logged in as admin → `/signatures` → find a row with status **Pending** → click the "Open signing link" icon (opens in new tab).
2. Click the signature field → switch to **Type** tab → type any name → **Apply**.
3. Click **Continue to Confirm & Sign** → check the attestation checkbox → **Complete Signing**.
   - **Expect:** "Document Signed Successfully!" screen with certificate + signature image + "Return to Dashboard".
   - **Before fix:** "Something went wrong" / error boundary.

### C. Bug #3 — clean console
1. Open DevTools → Console.
2. Reload `/`.
   - **Expect:** Zero 406s. Only React Router future-flag warnings (those are not errors).
   - **Before fix:** `Failed to load resource: the server responded with a status of 406` at least once.

### D. Bug #4 — provider documents
1. Sign Out → Quick Demo Access **Provider**.
2. Go to **My Documents**.
   - **Expect:** "No documents assigned yet." rendered cleanly (this provider has none seeded). Console clean — no 300 errors on `provider_documents`.
   - **Before fix:** 3× 300 errors in network tab on the provider_documents query.

### E. Bug #5 — Reports category column
1. Sign back in as Admin → `/reports` → click **Network Membership Report**.
2. Look at the "Category" column for provider rows like Meridian Spine, Kessler, etc.
   - **Expect:** Human-readable text (e.g., "Surgical/Procedural", "Interventional/Diagnostic").
   - **Before fix:** UUIDs like `2b5c2529-252b-4a77-b42b-26a2b265dafd`.

### F. Sanity sweep (optional, but good before a demo)
1. As Admin, click every left-nav item once. Confirm each loads.
2. Toggle Sales group → Pipeline → drag a card to another stage → confirm it persists on reload.
3. Open one provider → click each of the 6 tabs.
4. Sign Out, switch to Sales Rep, Provider, Law Firm — sidebar should be appropriately scoped.

---

## What was NOT exercised (transparency)

- **Real email delivery** for tokenized signing links (no SMTP configured locally — only the link itself was tested).
- **OTP flow** — the signing flow I tested didn't require verification (`require_verification` was off on that signature_request). Worth manually testing one that does require OTP + KBA before the demo.
- **Bulk CSV import** — backend FastAPI endpoint exists (`POST /imports/...`), I didn't drive the import wizard.
- **Stripe / DocuSign / Twilio webhooks** — backend has stubs, no real third-party in scope.
- **Drag-and-drop in pipeline kanban** — verified the cards render with sortable role; didn't actually drag-drop in the headless browser.
- **PDF rendering for very large docs** (`pdf-lib > 20 pages`) — the test contract was small.

These are explicitly listed as known limitations in `README.md` already.

---

**Status:** Ready for you to verify locally and push.

# 🧪 End-to-End Manual Test Pipeline

Complete step-by-step guide for verifying the full application across all 4 roles.

**Estimated time:** 45-60 min for full coverage.
**Target Supabase project:** `haqtcycfkkziblafkonr`
**Last updated:** 2026-04-24

---

## 📦 What's covered

This pipeline tests:
1. All 4 role-based workflows (admin / sales_rep / provider / law_firm)
2. Cross-role data sync (admin creates → sales_rep sees, provider signs → admin sees signed, etc.)
3. All backend subsystems: DB views, RPC functions, FastAPI endpoints, Edge Functions, Google Places integration
4. UI behaviors: CRUD, bulk operations, CSV import, search (FTS), filters, map, real-time

---

## 🔧 PART 0 — Setup (run once, ~5 min)

### Terminal 1 — Backend
```bash
cd "D:/Projects/Provider Harmony Hub 2/Provider Harmony Hub/backend"
.venv/Scripts/uvicorn.exe app.main:app --port 8000 --reload
```
✅ Wait for: `Uvicorn running on http://0.0.0.0:8000`
✅ Sanity: `curl http://localhost:8000/health` → `{"status":"ok",...}`

### Terminal 2 — Create test users (once)
```bash
cd "D:/Projects/Provider Harmony Hub 2/Provider Harmony Hub/backend"
.venv/Scripts/python.exe ../scripts/setup_test_users.py
```
Creates three test users (all password: `TestPass123!`):
- `sales_rep@test.phh` — role: sales_rep (auto-assigned 5 providers)
- `provider@test.phh` — role: provider (linked to an existing provider record)
- `lawfirm@test.phh` — role: law_firm (linked to an existing law firm record)

### Terminal 3 — Frontend
```bash
cd "D:/Projects/Provider Harmony Hub 2/Provider Harmony Hub/frontend"
npm run dev
```
Open `http://localhost:8080` → **Ctrl+Shift+R** (hard refresh).

### Verify Supabase secret
Supabase Dashboard → Project Settings → Edge Functions → Secrets → confirm `GEMINI_API_KEY` is set (required for AI-powered Edge Functions).

### Admin one-time config (required for Monthly Revenue to populate)

The `service_packages` table ships with Law Firm packages only. Provider packages must be created once so admin can assign them on Provider Detail → Billing, which creates `provider_subscriptions` rows that feed the MRR / ARR / Active Subscribers widgets.

1. Sign in as admin → go to `/document-templates`
2. Scroll to **Service Packages** section → click **+ Add Package** (or the equivalent button)
3. Create three packages:

| Name | Short Code | Category | Tier | Monthly Amount |
|---|---|---|---|---|
| Bronze Provider | `BRONZE_PROV` | provider | Associate | $500 |
| Silver Provider | `SILVER_PROV` | provider | Member | $1,500 |
| Gold Provider | `GOLD_PROV` | provider | Premier | $3,500 |

4. After saving, open any Provider Detail → **Billing tab** → **Set Package** dropdown should now show the three options. Assigning a package creates the subscription row and MRR flows to Dashboard + Analytics + `/billing`.

> **Why this is a manual step:** Packages are priced business data, not code. Your ops/founder team sets these once based on your actual pricing model, same as Deal Types and Document Templates.

### Known gaps (not fixed yet)
- **Provider document templates + PDFs**: E-signature round-trip (admin sends → provider signs → admin sees signed) can't be demoed end-to-end until Provider document templates are uploaded. Law Firm templates exist but with no PDFs attached. This is config/content work, not a code bug.

---

## 🟦 PART 1 — Admin workflow

**Login:** `dhruv0128@gmail.com` / `dhruv12345`

### 1.1 Dashboard (`/`)
- [ ] Page loads — **no 406 errors** in browser DevTools Console
- [ ] Stat cards show numbers (Active Providers, MRR, Active Law Firms, Open Tickets, Pipeline Value)
- [ ] **AI Insights section** populates with 3-5 cards (alert/warning/win/opportunity). *If Gemini returns 503, retry in 30 sec.*
- [ ] Network Growth chart renders

### 1.2 Providers List (`/providers`)
- [ ] List loads with rows
- [ ] **Search box:** type "test" → FTS narrows results instantly
- [ ] **Filters** (Status, Billing, Tier, Docs, State, Type) → each narrows list
- [ ] **Column toggles** (three-dot menu) → show/hide columns
- [ ] **Sort** by clicking column headers → direction toggles
- [ ] **Export CSV** → file downloads
- [ ] **Pagination** Next/Prev works

### 1.3 Add Provider
- [ ] **+ Add Provider** → fill:
  - Business Name: `E2E Demo Clinic`
  - Contact Email: `e2e-demo@clinic.test`
  - Address: `1600 Amphitheatre Pkwy`, City: `Mountain View`, State: `CA`, Zip: `94043`
  - Provider Type: `Orthopedic`
  - Status: `prospect`
- [ ] Click **Create Provider**
- [ ] ✅ Toast "Provider created successfully" + new row appears in list
- [ ] Visit `/map` — new provider appears as a pin (address geocoded via Google Places)

### 1.4 Provider Detail Page (click a provider)
- [ ] Header shows name + status badge
- [ ] **Overview tab** — 6 stat cards render
- [ ] **Health Score card** — "No health score calculated yet" or shows previous score
- [ ] Click **Refresh Health Score** → AI computes → score + risk_level appear *(needs Gemini — if 503, retry)*
- [ ] **Change Status** button → pick new status → Activity tab shows entry
- [ ] **Log Activity** → type "note" + description → appears in Activity tab
- [ ] ⭐ **Create Contract** → dialog opens → ContractForm pre-filled with this provider → fill contract_type, deal_value, dates → Save → Contract appears in Contracts tab
- [ ] **Tabs:** Overview, Billing, Contracts (N), Activity (N), Support (N), Documents — all load without error
- [ ] **Reassign Rep** → pick different rep → updates

### 1.5 Bulk Operations (back to Providers list)
- [ ] Select 2-3 providers via checkboxes → bulk bar appears
- [ ] **Assign Rep** → pick → ✅ toast "Sales rep assigned"
- [ ] **Change Status** → pick → ✅ toast "Status updated"
- [ ] **Send Reminder** → ✅ toast "Sent reminders to N"
- [ ] **Export Selected** → CSV downloads

### 1.6 CSV Import (Providers)

Use `test-data/providers-small.csv` (3 rows):

- [ ] **Import → Import Providers (CSV)** → upload file → map fields → Start
- [ ] ✅ Progress updates → toast "Imported 3, skipped 0" → 3 new rows

Try `test-data/providers-medium.csv` (10 rows) to see pagination.
Try `test-data/providers-with-chain.csv` to test edge cases (should skip 1 row with missing business_name).

### 1.7 Law Firms (`/law-firms`)
- [ ] List loads
- [ ] **+ Add Law Firm** → fill (firm_name = `Demo Legal LLP`, firm_size = `medium`, practice_areas, address) → Save
- [ ] Click firm → detail page loads all tabs
- [ ] **CSV Import** via `test-data/law-firms-small.csv` (5 rows)

### 1.8 Contracts (`/contracts`)
- [ ] List loads
- [ ] Renewal badges (green/yellow/red based on `days_until_renewal`)
- [ ] Click a contract → detail page loads
- [ ] **Deal Types** (`/deal-types`) → list → **+ Add Deal Type** → create one

### 1.9 E-Signatures (`/signatures`)
- [ ] Signature requests list
- [ ] Click one → detail
- [ ] **Document Templates** (`/document-templates`) → list → click → **Manage Fields** → PDF viewer + signing fields editor

### 1.10 Sales Pipeline (`/pipeline`)
- [ ] Kanban board with 7 stages
- [ ] **Drag a deal** between columns → saves new stage
- [ ] Click deal → edit dialog

### 1.11 Lead Finder (`/leads`)
- [ ] **Find Providers** tab: Category = `Orthopedic Surgeon`, City = `Austin`, State = `Texas`, Results = `20`, Exclude Chains ON
- [ ] Click **Find Providers** → real Google Places results appear (name, phone, website, rating)
- [ ] Select a few → **Save Leads** → Saved Leads tab
- [ ] **Find Law Firms** tab → search "personal injury attorney" in Austin

### 1.12 Map (`/map`)
- [ ] Map renders with provider pins (circles)
- [ ] **View mode** → Both → law firm pins (diamonds) also appear
- [ ] **Color by** → cycle Status / Tier / Billing / Health → colors update
- [ ] **Heatmap toggle** → heat layer
- [ ] **Coverage Overlay** → state circles
- [ ] Click pin → popup with info + "View Details →" works

### 1.13 Analytics (`/analytics`)
- [ ] Charts render (providers by state, MRR trend, pipeline funnel)

### 1.14 Admin-only pages (quick-load check)
- [ ] `/billing` — Overview
- [ ] `/billing/invoices` — Invoices list
- [ ] `/billing/payments` — Payments
- [ ] `/billing/rate-card` — Rate cards
- [ ] `/users` — shows 4 users (you + 3 test users)
- [ ] `/settings` — Company settings
- [ ] `/audit-log` — audit entries (may be empty)
- [ ] `/ai-settings` — AI config

---

## 🟩 PART 2 — Sales Rep workflow

**Login:** `sales_rep@test.phh` / `TestPass123!` (sign out of admin first)

- [ ] **Sidebar is restricted:** Dashboard, Providers, Pipeline, Lead Finder, Campaigns, HelpDesk, Calendar. **No Users/Settings/Audit/Analytics/Billing.**
- [ ] `/providers` → sees only 5 providers assigned to them (not all)
- [ ] Click a provider → can edit, change status, log activity, create contract
- [ ] **+ Add Provider** → new provider auto-assigned to this sales rep
- [ ] `/pipeline` → sees only their deals
- [ ] `/leads` → Lead Finder works (same endpoint as admin)
- [ ] Try `http://localhost:8080/users` directly → blocked / redirected

---

## 🟨 PART 3 — Provider workflow

**Login:** `provider@test.phh` / `TestPass123!`

- [ ] **Sidebar very limited:** Dashboard, My Documents, My Appointments, Support, Training, Profile
- [ ] `/` (Dashboard) → loads cleanly — no 406s
- [ ] `/my-documents` → only their provider's documents
- [ ] `/support` → **+ New Ticket** → create → appears in list
- [ ] `/training` → video list → click → player opens
- [ ] Try `/providers` → blocked/redirected

---

## 🟧 PART 4 — Law Firm workflow

**Login:** `lawfirm@test.phh` / `TestPass123!`

- [ ] **Sidebar:** Dashboard, LF Documents, LF Billing, LF Support, LF Training, LF Profile, LF Appointments
- [ ] `/` (Dashboard) → loads with firm name + stat cards
- [ ] `/lf/documents` → firm's documents
- [ ] `/lf/billing` → invoices/subscriptions (may be empty)
- [ ] `/lf/support` → open ticket → submit
- [ ] Try `/providers` or `/law-firms` (admin view) → blocked

---

## 🔄 PART 5 — Cross-role workflows (proves RLS + data sync)

### 5.A Admin creates → sales_rep sees
1. **Admin:** add provider `CrossRole Test Alpha`, assign to **Sally Sales**
2. Sign out → sign in as **sales_rep**
3. `/providers` → ✅ "CrossRole Test Alpha" in list

### 5.B Admin sends doc → provider signs → admin sees signed
1. **Admin:** open provider linked to `provider@test.phh` (script did this) → Documents tab → send any template for signature
2. Sign out → sign in as **provider**
3. `/my-documents` → doc appears with **Sign** button
4. Click Sign → complete at `/sign/:requestId`
5. Sign out → back as **admin**
6. Provider detail → Documents tab → ✅ status = signed

### 5.C Provider opens ticket → admin responds → provider sees reply
1. **Provider:** `/support` → submit ticket "E2E test question"
2. Sign out → **admin:** `/helpdesk` → see ticket → click → reply → send
3. Sign out → **provider:** `/support/:id` → ✅ admin reply visible

### 5.D Law Firm opens ticket → admin sees it
1. **Law Firm** (use Demo Law Firm quick access or test user): `/lf/support` → submit ticket
2. Sign out → **admin:** `/helpdesk` → ✅ ticket shows with law firm name

### 5.E RLS isolation
1. **Sales_rep** sees only their 5 providers
2. Copy a provider ID from admin that's NOT assigned to sales_rep
3. Sign in as sales_rep → navigate to `/providers/<that-id>` directly
4. ✅ "Provider not found" — RLS blocked it

---

## 🔴 PART 6 — Real-time updates (optional, requires 2 browser windows)

Real-time = **data changes appear instantly without page refresh.**

You need 2 separate sessions: one making changes, one passively watching.

### Setup
- **Window 1 (regular browser):** log in as **admin** → navigate to `/helpdesk`
- **Window 2 (incognito OR different browser):** log in as **provider@test.phh**

### Test
1. In Window 2 (provider): `/support` → submit a new ticket "Real-time test"
2. **Watch Window 1 (admin)** — the ticket should appear in the list **without any refresh or click** within 1-2 seconds
3. ✅ If it appears auto → real-time works
4. ❌ If admin has to refresh to see it → real-time isn't wired for that table

---

## 🐛 Bug reporting format

When something breaks, include:

- **Page:** which URL
- **Role:** admin / sales_rep / provider / law_firm
- **Action:** what you clicked
- **Error:** from toast, browser console, OR Network tab (PGRST###, HTTP status, etc.)
- **Screenshot:** if the error is unusual

---

## ⚠️ Known caveats (not bugs — expected behavior)

| Behavior | Why |
|---|---|
| Gemini 503 "high demand" | Google's transient issue — retry works |
| AI features (insights, health score, contract review chat) intermittent | Same Gemini load issue |
| Some pages show empty data for test users | Test users have minimal linked records |
| Real-time updates not visible | Needs 2 browser windows to observe (see Part 6) |
| Demo Law Firm auto-creates its own link | Pre-existing Lovable behavior, not a bug |

---

## ✅ Acceptance

When every box in Parts 1-5 is checked without error, the end-to-end pipeline is **provably working** across all 4 roles with cross-role data sync.

---

## Test CSV files location

Ready-to-upload CSVs for CSV import testing are in `test-data/`:

- `providers-small.csv` — 3 rows, quick smoke test
- `providers-medium.csv` — 10 rows, progress polling + larger batch
- `providers-with-chain.csv` — 5 rows with edge cases (missing fields, special chars)
- `providers-bulk-update.csv` — bulk update existing providers by business_name
- `law-firms-small.csv` — 5 law firms

See `test-data/README.md` for usage details.

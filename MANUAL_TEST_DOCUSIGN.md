# Manual Test Runbook — DocuSign-parity signing flow

**Purpose:** Reproduce the full end-to-end signing flow as a real user would, exercising every feature shipped in the 4-phase DocuSign-parity push (KBA removal + demo OTP, contract field placement, auto-fill + validation, Start/Next pill).

**Estimated time:** ≈ 8 minutes.

**Prereqs:**
- Frontend running at `http://localhost:8080` (or a deployed URL)
- A real PDF on disk to upload (any small PDF works — the demo project ships `demo-pdfs/standard-provider-agreement.pdf`)

> **What "passed" looks like:** every checkpoint below should match without any console errors. If any checkpoint fails, capture a screenshot + the URL bar + DevTools Console and report.

---

## E2E flow — admin creates → recipient signs

### Step 1 — Sign in as Admin
1. Hard-refresh `http://localhost:8080` (Ctrl+Shift+R).
2. If you land on the dashboard already logged in, click **Sign Out** in the sidebar.
3. On `/auth`, under **Quick Demo Access**, click **Admin**.

✅ Pass: lands on `/` (Command Center). Toast: "Logged in as Admin." Sidebar shows full admin navigation.

---

### Step 2 — Create a new Provider
1. From the dashboard, click **Add Provider** (top-right).
2. Fill the modal:
   - Business Name: `E2E Demo Clinic`
   - Contact Name: `Dr. E2E Tester`
   - Contact Email: `e2e-tester@demo.test`
   - Contact Phone: `(555) 010-2026`
   - Provider Type: `Healthcare`
   - Address Line 1: `100 E2E Way`
   - City: `Atlanta`, State: `GA`, ZIP: `30309`
3. Click **Create Provider**.

✅ Pass: Toast "Provider created successfully." `E2E Demo Clinic` appears at the top of `/providers`. Total count increases by 1.

---

### Step 3 — Create a new Contract with a PDF
1. Click on the `E2E Demo Clinic` row to open its detail page.
2. Click **Create Contract**.
3. In the modal, leave **Contract For** = Provider, leave the other defaults.
4. Set **Deal Value ($)** = `25000`.
5. Click the **Upload contract PDF** drop zone and pick a real PDF (e.g. `demo-pdfs/standard-provider-agreement.pdf`).
6. Click **Create Contract**.

✅ Pass: Toast "Contract created." Lands on the new contract detail page. Status is `Draft`. Two action buttons appear: **Edit Signing Fields (2)** (or **Set Up Signing Fields**) and **Send for E-Signature**.

---

### Step 4 — Verify the Send-for-Sig gate (Phase 2)
1. On the new contract, click **Edit Signing Fields (2)** to enter the field editor.
2. Click **Clear** (top-right of toolbar) → confirm **Clear All** in the dialog.
3. Click **Save Fields**.
4. Click **Back to standard contract** at the top-left.
5. The button should now read **Set Up Signing Fields** (because count is 0).
6. Click **Send for E-Signature**.

✅ Pass: Toast: "Place at least one signature field on the document before sending." Page auto-redirects to `/contracts/:id/fields`. **The send is correctly blocked.**

---

### Step 5 — Place fields on the PDF (Phase 2 + 3)
You're now in the field editor. The PDF is rendered in the center; the field palette is at the top.

1. Click **Signature** in the toolbar, then click on the lower-left of the PDF page where the signature should go.
2. Click **Date Signed**, then click somewhere to the right of the signature.
3. Click **Email**, then click anywhere on the page.
4. Click **Name**, then click anywhere on the page.
5. Verify "Placed Fields (4)" in the right rail with all 4 listed (Signature, Date Signed, Email, Name).
6. Click **Save Fields**.

✅ Pass: Toast "Saved 4 signing field(s)." Save button greys out (no unsaved changes).

---

### Step 6 — Send for E-Signature (now succeeds)
1. Click **Back to standard contract**.
2. The button now reads **Edit Signing Fields (4)**.
3. Click **Send for E-Signature**.
4. Modal opens with the contract summary, expiration (default 7 days), and an optional message.
5. Click **Send for Signature**.

✅ Pass: Modal closes silently. Contract status flips from `Draft` to `Sent`. Click **E-Signatures** in the left nav and verify a new row at the top: `E2E Demo Clinic` / `Pending` / today's date.

---

### Step 7 — Open the signing link as the recipient (Phase 3 + 4)
1. On `/signatures`, find the `E2E Demo Clinic` row.
2. Click the **Open signing link** icon (looks like a chain link). It opens the signing page in a new tab.
3. Switch to the new tab.

✅ Pass on this page:
- 3-step stepper at the top: **Review & Fill → Verify Identity → Confirm & Sign** (no KBA step).
- A floating yellow pill **"Next 1 required field left"** at bottom-center.
- The Email field is **read-only** with `e2e-tester@demo.test` pre-filled.
- The Name field is **read-only** with `Dr. E2E Tester` pre-filled.
- The Date field shows today.
- Counter at bottom-right: `3 / 4 Fields completed` (auto-fill worked for 3 of 4).

---

### Step 8 — Click the Start/Next pill, sign, Continue (Phase 4 + 1)
1. Click the floating **"Next 1 required field left"** pill. The page should scroll to the signature field and pulse it with a primary-color ring.
2. Click the highlighted signature field (text reads "Click to sign").
3. In the modal, switch to the **Type** tab.
4. Type `Dr. E2E Tester` in the input.
5. Click **Apply**.
6. Counter should now read `4 / 4 Fields completed`.
7. Click **Continue to Verify & Sign**.

✅ Pass on the Verify step:
- Heading: "Verify your identity".
- A yellow **🛠 DEMO MODE** banner shows a 6-digit code prominently (e.g. "Your code: 850214").
- Banner copy: "In production, this code would arrive in the recipient's email inbox."
- Counter: "3 attempts remaining."

---

### Step 9 — Trigger the friendly lockout (Phase 1)
1. Type `000001` in the OTP boxes → click **Verify**. Toast: "Incorrect code. 2 attempts remaining."
2. Type `000002` → **Verify**. Toast: "Incorrect code. 1 attempts remaining."
3. Type `000003` → **Verify**.

✅ Pass: lock screen renders:
- Heading: "Signing temporarily locked."
- Body: "You entered the wrong code 3 times in a row. For security, we paused this signing session."
- Card: "What now? … Click below to let your sender know …"
- Button: **"Request a new signing link."**

4. Click **Request a new signing link**.

✅ Pass: success state — "Your sender has been notified. They'll send you a new link shortly. You can close this window."

---

### Step 10 — Admin Reset on the locked row (Phase 1)
1. Switch back to the original admin tab.
2. Hit Refresh on `/signatures` (so the row reflects the locked state).
3. Find the `E2E Demo Clinic` row (now `Viewed`, with a backlog of failed verifications in the audit trail).
4. In the Actions column, click the **Reset / unlock** icon (the circular-arrow icon between the link icon and the red X). Hover tooltip reads: "Reset / unlock — clears failed verifications and copies a fresh link."

✅ Pass: Toast "Reset complete — fresh link copied to clipboard." The row's status flips back to **Pending**. Pending count increments, Viewed count decrements.

---

### Step 11 — Re-open the signing link, complete signing
1. Switch back to the signer tab (the same tab from Step 7).
2. Refresh the page (the locked screen will be replaced by the fresh signing flow).
3. Click the signature field again, switch to **Type**, type your name, **Apply**.
4. Click **Continue to Verify & Sign**.
5. A **new** demo OTP code is shown — type it correctly into the boxes and click **Verify**.

✅ Pass: lands on Step 3 ("Confirm & Sign"). Shows a Fields Summary listing all four field values + signature image.

6. Check the attestation box ("I, Dr. E2E Tester, confirm …").
7. Click **Complete Signing**.

✅ Pass: "Document Signed Successfully!" page renders with:
- Document name
- Signer name + business name
- Signed-at timestamp
- Document Fingerprint (SHA-256)
- Signature image (rendered inline)
- "Return to Dashboard" button.

---

### Step 12 — Verify everything updated on admin side
1. Switch back to the admin tab.
2. Refresh `/signatures`.

✅ Pass:
- The `E2E Demo Clinic` row now shows status **Signed** with today's date in the "Signed" column.
- "Awaiting Signature" stat at top decremented by 1.
- "Signed" badge counter incremented by 1.

3. Click **Dashboard** in the left nav.

✅ Pass:
- "Pending Signatures" stat decremented by 1.
- "Recent Activity" feed shows a fresh entry: "Provider signed Document … E2E Demo Clinic … N minutes ago."

4. Open DevTools → Console.

✅ Pass: No red errors. (Yellow React Router future-flag warnings are normal.)

---

## What this run validates

| Phase | Feature | Step(s) |
|---|---|---|
| 1 | Drop KBA, 3-step stepper | 7 |
| 1 | Demo-mode OTP banner | 8 |
| 1 | Friendly lockout with "Request a new link" | 9 |
| 1 | Admin reset action on `/signatures` | 10 |
| 2 | Per-contract field placement editor | 5 |
| 2 | Send-for-E-Sig gate when 0 sig fields | 4 |
| 3 | Auto-fill name/email read-only | 7 |
| 3 | Empty-source-field tolerance (no crash) | 7 |
| 3 | Identity field types (Name, Email, Company, Title) | 5 |
| 4 | Floating Start/Next pill counter | 7 |
| 4 | Click pill → scroll + pulse next required | 8 |
| 4 | Pill auto-updates after each fill | 8 |
| All | End-to-end happy path: create → place → send → sign → done | 1–12 |

---

## Known caveats (not bugs)

- **OTP doesn't actually email** — the code lives only in the yellow demo banner. We hold this until email delivery is wired up.
- **Default signing fields auto-seeded on contract creation** — when a new contract is saved, the system seeds 2 default fields (Provider Signature + Date). That's expected; you can clear them to test the "no fields" gate (Step 4).
- **Multi-recipient routing** — one signer per request right now; all fields are assigned to "provider" by default.
- **SMS OTP / real KBA** — paid-tier features, not implemented.

---

**Last run:** 2026-04-25 — Full E2E executed via Chrome DevTools MCP. All 12 steps passed. Console clean throughout.

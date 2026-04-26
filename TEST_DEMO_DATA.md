# Demo Data — Manual Test Runbook

The DB has been flushed and reseeded with realistic data on **2026-04-25**.
This runbook walks the platform end-to-end so you can replay every flow as a
real human user.

---

## What's in the database now

| Entity                      | Count | Notes                                                           |
| --------------------------- | ----- | --------------------------------------------------------------- |
| Providers                   | **82**¹  | 17 US metros, geocoded, mix of statuses                          |
| Law firms                   | **33**¹  | PI focus across major metros, 6 sizes (5-10 → 50+)               |
| Provider locations          | 82    | One primary per provider, mapped to a market                    |
| Provider subscriptions      | 58    | Active/Contracted/Churned only, $250–$1500/mo by tier          |
| Law-firm subscriptions      | 18    | $600–$2500/mo by firm size                                      |
| Contracts                   | 86    | 61 provider + 25 law-firm, mix of statuses                       |
| Sales pipeline (providers)  | 23    | Spread across 5 stages                                          |
| Sales pipeline (law firms)  | 14    | Spread across 5 stages                                          |
| Invoices                    | 208   | 4 months of history; 172 paid / 20 pending / 16 past_due        |
| Activities (providers)      | 162   | Calls/emails/notes/meetings within last 60d                     |
| Activities (law firms)      | 64    | Same                                                            |
| Support tickets             | 37    | Mix of open/resolved across categories                           |
| Calendar events             | 12    | Discovery calls scheduled in next 14d                           |
| Onboarding workflows        | 11    | All `contracted` accounts have one in progress                  |
| Provider health scores      | 81    | Healthy / monitor / at_risk / critical                          |

¹ Counts include the two records the E2E UI test created.

**Login as admin:**
- Email: `admin@demo.com`
- (Whatever password you use locally — same one)

---

## 1 · Dashboard sanity check

1. Log in → land on `/`.
2. Verify the top stat tiles:
   - Network Members: **113** (81 providers + 32 law firms; 82+33 if you keep the E2E records)
   - Monthly Revenue: ~**$71,250**
   - Active Onboardings: **11**
   - Open Tickets: ~**4–17**
   - Pipeline Value: ~**$405k** total
3. Scroll down — you should see:
   - **Needs Attention** card with past-due invoices
   - **Recent Activity** feed populated with notes/calls
   - **Provider Pipeline** + **Law Firm Pipeline** stage breakdowns
   - **Network Growth** + **Revenue Breakdown** charts

---

## 2 · Map view

1. Click **Map** in the sidebar.
2. You should see clustered markers across all major metros.
3. Toggle **Color By → Tier** to recolor.
4. Toggle **Heatmap** on/off.
5. Click any cluster → it splits into individual marker pins.
6. Click a marker → mini-card with provider summary appears.

---

## 3 · Providers list & filters

1. Click **Providers**. You should see 82 in your network, paginated 20/page.
2. Use the **Status** filter → pick **Active** → list reduces.
3. Use the **State** filter → pick **CA** → only LA-area providers visible.
4. Use **Search** → type "Manhattan" → narrows to 1 hit.
5. Click any provider name → opens **/providers/:id**.

---

## 4 · End-to-end e-signature: PROVIDER

**Goal:** create a brand-new provider, attach a PDF, send for signature, sign as
the recipient, confirm status flips to "Signed".

### A · Create the provider

1. **Providers** → top-right **Add Provider**.
2. Fill in:
   - Business Name: `Demo Heart & Vascular`
   - Contact Name: `Dr. Avery Pham`
   - Contact Email: `apham@demoheart.test`
   - Phone: `404-555-0001`
   - Provider Type: `Cardiology`
   - Address: `100 Northside Dr NE`
   - City: `Atlanta`, State: `GA`, Zip: `30309`
   - Notes: `Manual test`
3. Click **Create Provider** → toast "Provider created successfully".
4. The new row appears at the top of the list with **Demo Admin** as the rep.

### B · Create the contract

1. Click into the new provider.
2. Auto-geocoded lat/lng appears next to the address.
3. Top-right **Create Contract**.
4. Fill:
   - Contract Type: `standard`
   - Status: `draft`
   - Deal Value: `9000`
   - Start: today, End: today+180d, Renewal: end-30d
   - Terms: `Annual standard membership.`
5. Click the dotted PDF area → upload `demo-pdfs/standard-provider-agreement.pdf`.
6. **Create Contract** → toast "Contract created", routes to **/contracts/:id**.

### C · Confirm fields exist

1. On the contract page you should see **Edit Signing Fields (2)** — the
   template's default Signature + Date fields auto-applied.
2. (Optional) click in to verify, then click ← **Back to standard contract**.

### D · Send for e-signature

1. Click **Send for E-Signature**.
2. Modal preloads provider + email + value, shows a "Preview attached PDF" link.
3. Expiration: leave at **7** days. Optional: type a personal message.
4. **Send for Signature** → toast "Contract sent for e-signature!" → status
   badge flips to **Sent**.

### E · Sign as the recipient

1. Open **E-Signatures** in the sidebar — your new sig request is at the top.
2. Right-click → copy link, or grab the token from the URL after clicking
   "Open Signing Link".
3. Open the link in a private/incognito window (recipient's view).
4. **Step 1 — Review & Fill**:
   - Click **Click to sign** → choose **Type** → enter the recipient's name →
     **Apply**. Date is auto-filled to today.
   - "2/2 Fields completed" appears at bottom.
   - Click **Continue to Verify & Sign**.
5. **Step 2 — Verify Identity** (DEMO MODE):
   - Banner shows the 6-digit code on screen (in production it would email).
   - Type the code → **Verify** → toast "Identity verified!".
6. **Step 3 — Confirm & Sign**:
   - Review fields summary (signature image + date).
   - Tick the legal-name confirmation checkbox.
   - **Complete Signing** → "Document Signed Successfully!" page with SHA-256
     fingerprint and signature image.

### F · Verify the admin side

1. Go back to the admin tab.
2. Refresh the contract page → status badge now reads **Signed**.
3. **Download Signed PDF** link appears next to "View Contract PDF".
4. **E-Signatures** page shows the request with status **Signed**.
5. Provider detail → **Activity** tab shows "Provider signed …" entry.

---

## 5 · End-to-end e-signature: LAW FIRM

Repeat the flow above on the law-firm side.

1. **Law Firms** → **Add Law Firm**.
2. Fill in: name, contact, email (must be valid), phone, firm size, address,
   pick FL or any state, tick a **Personal Injury** practice area.
3. **Add Law Firm** → toast "Law firm added".
4. Click into the new firm → **Create Contract**.
5. Switch toggle to **Law Firm** at the top of the dialog.
6. Fill deal value + dates + terms.
7. Upload `demo-pdfs/law-firm-participation-agreement.pdf`.
8. **Create Contract** → routes to contract page with 2 default fields.
9. **Send for E-Signature** → modal labels read **Law Firm: …** correctly.
10. Send, copy signing link, sign in a private window same as above.
11. After completion: contract status flips to **Signed** and Download Signed
    PDF appears.

---

## 6 · Sales Pipeline

1. **Sales → Pipeline** in sidebar.
2. You should see two boards: **Provider Pipeline** ($259k) and
   **Law Firm Pipeline** ($146k), each with cards spread across stages.
3. Drag any card from one column to the next — value rolls up automatically.
4. Click any card → side-panel with deal info.

---

## 7 · Lead Finder & Campaigns

1. **Sales → Lead Finder** — empty list (cleared during flush, ready to scrape).
2. **Sales → Campaigns** — also empty; create a new campaign and see the
   workflow build (no leads yet, but all controls work).

---

## 8 · Billing

1. **Billing → Overview** — total MRR, breakdown by tier, past-due summary.
2. **Billing → Invoices** — 208 invoices listed; filter by **Past Due**.
3. Click into any past-due invoice → detail page with line items.
4. **Billing → Payments** — payment register (empty unless you record one).
5. **Billing → Rate Card** — 48 rate-card entries × geographic markets.

---

## 9 · Onboarding queue

1. **Onboarding** in sidebar.
2. 11 in-progress workflows, each at step 2/5 ("documents" stage).
3. Click into any one → step checklist with toggles.

---

## 10 · Help Desk & Calendar

1. **Help Desk** — 37 tickets, mix of open/resolved.
2. **Calendar** — 12 discovery calls in next 14 days, host = sales rep.

---

## 11 · Reports & Analytics

1. **Analytics** — multi-chart dashboard powered by the seeded data.
2. **Reports** — pick "Network Membership Report" and tick to export PDF.

---

## Notes

- The two E2E test records (`E2E Test — Sarasota Orthopedic Surgery` and
  `E2E Test — Jacksonville Personal Injury Law`) are real, signed contracts
  exercising the full flow. Feel free to delete them or leave them as audit
  evidence.
- The DEMO MODE OTP banner is hardcoded in the signing page — in production
  the code would be emailed. To turn off the banner, edit `SigningPage.tsx`.
- All map pins are real geocoded addresses; the Sarasota provider was
  auto-geocoded by the create form (lat 27.3175, lng -82.5318).

---

## Bug found and fixed during E2E pass

**Symptom:** After a recipient completed signing, `signature_requests.status`
correctly became `signed` and the signed PDF was uploaded, but
`contracts.status` stayed at `sent` — so the admin contract page kept showing
the **Sent** badge instead of **Signed**.

**Root cause:** `SigningPage.tsx` updated `signature_requests`,
`provider_documents`, audit log, notifications, and activities, but never
flipped the parent contract row.

**Fix:** added a single update call after the provider_documents update:

```ts
if (sigRequest!.contract_id) {
  await supabase.from("contracts").update({ status: "signed" })
    .eq("id", sigRequest!.contract_id);
}
```

Verified by signing the law-firm contract after the patch — status moved
`draft → sent → signed` automatically.

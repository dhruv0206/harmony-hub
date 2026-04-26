# Provider Harmony Hub vs DocuSign — Feature Parity Report

**Date:** 2026-04-25
**Method:** Multi-agent research — one agent deep-dove DocuSign's product surface (web docs, developer reference, support center, third-party reviews), another mapped Provider Harmony Hub's current implementation file-by-file. This report synthesizes both into a side-by-side comparison.

**Goal:** Be brutally honest about what we have, what we're missing, and what's worth building toward "DocuSign for medical providers."

---

## TL;DR

**We have a credible signing core** — token-based public links, drag-drop field placement on uploaded PDFs, 9 field types with auto-fill, audit trail, certificate of completion, friendly lockout flow, admin reset, demo-mode OTP banner. End-to-end signing works.

**We are not yet "DocuSign-equivalent"** in five major areas:
1. **Multi-recipient routing** — single signer per envelope today; no Editor / Agent / In-Person Signer / Witness / Notary roles.
2. **Authentication tiers** — only Email OTP (demo-mode). DocuSign offers Access Code, SMS, Phone, KBA, ID Verify.
3. **Workflow automation** — no conditional fields, no conditional routing, no Maestro-style visual workflow builder, no Web Forms, no anchor-text auto-placement.
4. **Real delivery** — no email/SMS yet. Notifications are in-app only; OTP shown on screen via demo banner.
5. **Healthcare-specific compliance** — no HIPAA BAA, no 21 CFR Part 11 module, no EHR (Epic/Cerner) integration, no pre-loaded compliant template library.

**We have a few things DocuSign does NOT** that lean into the medical-provider vertical:
- Built-in CRM (providers, law firms, pipeline, lead finder, analytics, billing, onboarding, help desk, calendar) — DocuSign sells eSignature; we sell the whole operations platform.
- Multi-role portals (admin / sales rep / provider / law firm) baked in.
- AI features integrated into contract review, churn prediction, pipeline analysis, outreach planning.
- Geographic coverage analytics + map view + state-by-state revenue.
- Commission tracking + rate card + tier-based pricing.

The strategic positioning isn't "match DocuSign's eSignature feature for feature" — it's **"the operations platform PI medical networks need, with DocuSign-grade signing built in."**

---

## Side-by-side comparison

### 1. Envelope concept

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| Envelope = container of N docs + N recipients + 1 audit trail | One envelope can carry many docs/recipients | One `signature_request` = one document, one recipient | **MEDIUM** — we need an "envelope" concept if we want multi-doc routing |
| Statuses | Created / Sent / Delivered / Signed / Completed / Declined / Voided / TimedOut | pending / viewed / identity_verified / signed / fully_executed / declined / expired / voided | ✅ Equivalent |
| Reminders | First reminder + recurring | `document-reminders` Edge Function fires at 3/5/7 days | ✅ Equivalent |
| Expiration | Default 120 days, configurable | Default 7 days, configurable per request | ✅ Equivalent |
| Correct sent envelope | Edit recipients/fields after send (without resigning previously-signed tabs) | Not supported — must void + recreate | **MEDIUM** — useful for typo fixes |
| Void with reason | Free-text reason, logged + emailed | Status flips to "voided", logged in audit_log | ✅ |
| Resend | Re-emails link without state change | Admin Reset button (RotateCcw icon) clears verifications, copies fresh link | ✅ Equivalent (better in some ways — clipboard ready) |

### 2. Recipient types and routing

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| **Signer** (standard) | ✅ | ✅ provider / law_firm / admin | — |
| **In-Person Signer** | ✅ Host facilitates on their device | ❌ | **LOW** — niche use |
| **Carbon Copy** | ✅ Receives final PDF, can't sign | ❌ | **LOW** — we have notifications instead |
| **Certified Delivery** | ✅ Must open, can't sign | ❌ | **LOW** |
| **Editor** | ✅ Can move/add/delete fields before forwarding | ❌ | **MEDIUM** — useful for legal review |
| **Agent / Intermediary** | ✅ Specifies next recipient | ❌ | **LOW** |
| **Witness** | ✅ Co-signs as witness, attached to a specific signer | 🟡 enum value exists, no UI | **LOW** for medical |
| **Notary** | ✅ DocuSign Notary RON service | ❌ | **LOW** — paid service anyway |
| **Sequential routing** | ✅ Routing numbers `1, 2, 3` | 🟡 Service packages have `signing_order` for multi-doc, but not within one envelope | **MEDIUM** |
| **Parallel routing** | ✅ Same routing number `1, 1, 1` | ❌ | **MEDIUM** |
| **Hybrid routing** | ✅ Mixed | ❌ | **LOW** (enterprise tier in DocuSign too) |
| **Conditional routing** | ✅ "If amount > $10k route to legal" | ❌ | **MEDIUM** for compliance workflows |
| **Counter-signature** | Built into routing | ✅ Dedicated `CounterSignPage`, admin signs after provider, status → fully_executed | ✅ Equivalent |

### 3. Field types ("Tabs" in DocuSign)

| Field type | DocuSign | Us | Gap |
|---|---|---|---|
| Sign Here | ✅ | ✅ `signature` | — |
| Initial Here | ✅ | ✅ `initials` | — |
| Date Signed (auto) | ✅ | ✅ `date` with `auto_fill_date` | — |
| Full Name (auto-fill) | ✅ | ✅ `name` | — |
| Email (auto-fill, validated) | ✅ | ✅ `email` w/ regex validation | — |
| Title (auto-fill) | ✅ | 🟡 `title` exists; no source field on provider | **LOW** — easy to add |
| Company (auto-fill) | ✅ | ✅ `company` | — |
| Text (with regex) | ✅ | ✅ `text` w/ validation_rule (email/phone/ZIP/SSN/NPI/EIN/number/custom regex) | — |
| Number | ✅ | 🟡 via `text` + validation_rule="number" | ✅ Equivalent |
| Date (free entry) | ✅ | ✅ `date` (no auto-fill mode) | — |
| SSN | ✅ pattern-formatted | 🟡 via `text` + validation_rule="ssn" | ✅ Equivalent |
| Zip | ✅ | 🟡 via `text` + validation_rule="zip" | ✅ Equivalent |
| Phone | ✅ | 🟡 via `text` + validation_rule="phone" | ✅ Equivalent |
| **Checkbox** | ✅ | ✅ | — |
| **Radio Group** | ✅ exclusive choice | ❌ | **MEDIUM** — common on consent forms |
| **Dropdown / List** | ✅ | ❌ | **MEDIUM** — common on intake forms |
| **Approve / Decline buttons** | ✅ | ❌ (decline is a separate action, not a tab) | **LOW** |
| **Formula** | ✅ `[Quantity] * [Price]` | ❌ | **LOW** |
| **Attachment** | ✅ recipient uploads (e.g., insurance card) | ❌ | **HIGH** — patient consent flows often need a photo of insurance card |
| **Payment** | ✅ Stripe at signing | ❌ | **MEDIUM** — could matter for telehealth copay |
| **Hyperlink / View / Note** | ✅ | ❌ | **LOW** |
| Required toggle | ✅ | ✅ | — |
| Tooltip / placeholder | ✅ | ✅ `placeholder_text` | — |
| Custom regex validation | ✅ | ✅ unknown `validation_rule` strings tried as regex | — |
| **Anchor text auto-placement** | ✅ Tabs follow text in re-edited docs | ❌ | **HIGH** — saves admins from re-tagging every contract |
| Conditional show/hide | ✅ | ❌ | **MEDIUM** |

### 4. Authentication

| Tier | DocuSign | Us | Gap |
|---|---|---|---|
| Email link only | ✅ default | ✅ `signer_token` UUID in URL | — |
| Email OTP | ✅ at extra cost on some plans | ✅ via demo-mode banner (real email TBD) | **HIGH** for production — need real email |
| Access Code | ✅ sender-shared OOB code | ❌ | **MEDIUM** — easy to add, no third party |
| SMS OTP | ✅ paid per-use | ❌ | **MEDIUM** — Twilio integration |
| Phone Auth | ✅ voice or SMS | ❌ | **LOW** |
| KBA | ✅ LexisNexis | ❌ removed last commit | **LOW** — was fragile, real KBA is paid |
| ID Verify (selfie + ID) | ✅ Persona-style | ❌ | **MEDIUM** — useful for high-value contracts |
| SSO (SAML) | ✅ | ❌ | **LOW** — Supabase Auth handles for now |
| Sender 2FA | ✅ via SAML or DS-native | ❌ | **MEDIUM** — useful for admin accounts |
| Encryption at rest | ✅ AES-256 | ✅ Supabase default (AES-256) | — |
| Tamper-evident PDF | ✅ PKI digital seal | 🟡 we hash + sign with pdf-lib but no third-party trust seal | **MEDIUM** — matters for legal admissibility |

### 5. Signing experience

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| Adopt Your Signature: Style/Draw/Upload | ✅ all three | ✅ Draw + Type. Upload not implemented. | **LOW** — easy to add |
| Start tooltip → first required field | ✅ | ✅ Floating "Next N required fields left" pill | — |
| Finish gating | ✅ disabled until all required filled | ✅ Continue button + Complete Signing both gated | — |
| Decline to Sign with reason | ✅ | ✅ Modal with `declineReason` state | — |
| Save & Finish Later | ✅ | ❌ field values are React state only | **MEDIUM** — useful for long forms |
| Comments / Notes during signing | ✅ | ❌ | **LOW** |
| Print & Sign fallback | ✅ | ❌ | **LOW** — niche |
| Mobile-optimized | ✅ responsive HTML5 + iOS/Android apps | ✅ responsive HTML5 only (no native app) | **LOW** for now |
| Accessibility (WCAG 2.1 AA) | ✅ | 🟡 no formal audit | **MEDIUM** — important for HIPAA + ADA |

### 6. Templates and reusable assets

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| Templates (saved doc + fields + recipients + routing) | ✅ | ✅ `document_templates` + `template_signing_fields` | — |
| Template Roles (placeholders) | ✅ | 🟡 `assigned_to` exists but only provider/admin/witness | **LOW** |
| Bulk Send (CSV-driven) | ✅ | ✅ `BatchSendPage.tsx` 4-step wizard | — |
| PowerForms (public self-service link) | ✅ | ❌ — token must be pre-created | **HIGH** — patient intake forms need this |
| Web Forms (HTML form replaces PDF) | ✅ newer offering | ❌ | **MEDIUM** |
| Branding (logo, colors, custom email) | ✅ Sending Brand + Signing Brand | ✅ company_settings (logo, brand color, etc.) | — |
| Multiple brands per account | ✅ enterprise | ❌ single brand only | **LOW** |

### 7. Audit trail and compliance

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| Certificate of Completion (PDF appended) | ✅ | 🟡 `certificate_data` JSONB stored, rendered on success page; no separate downloadable PDF | **MEDIUM** — should generate a CoC PDF |
| Audit trail event types | 11+ events | ✅ 11 events: request_created / email_sent / document_viewed / identity_check_started / passed / failed / signed / declined / voided / expired / downloaded + counter_signed | — |
| ESIGN Act / UETA language | ✅ disclosed | ✅ "This document was electronically signed in accordance with the ESIGN Act and UETA" on success page | — |
| eIDAS (EU SES/AES/QES) | ✅ | ❌ | **LOW** for US-focused product |
| **21 CFR Part 11** (FDA / life sciences) | ✅ Part 11 module: signature manifestation, reason-for-signing, mandatory auth per signature, validation kit | ❌ | **HIGH for life sciences customers** — standard ask in pharma/clinical |
| **HIPAA BAA available** | ✅ Enterprise / IAM plans | ❌ no BAA process documented | **HIGH** for healthcare positioning |
| Tamper-evident PKI seal | ✅ | 🟡 SHA-256 doc hash stored on certificate; no PKI seal | **MEDIUM** |
| **SOC 2 Type 2** | ✅ | ❌ — Supabase has SOC 2; we don't | **HIGH** for enterprise sales |
| ISO 27001 | ✅ | ❌ | **MEDIUM** |
| FedRAMP | ✅ Moderate + DoD IL4 | ❌ | **LOW** (gov't customers only) |

### 8. Healthcare-specific features

| Feature | DocuSign Healthcare | Us | Gap |
|---|---|---|---|
| Pre-built templates: HIPAA auth, telehealth consent, advance directives | ✅ template gallery | ❌ generic templates only | **HIGH** — fastest path to "ready out of box" |
| Provider credentialing workflow | ✅ multi-doc sequential routing pattern | 🟡 service packages do similar thing for onboarding | ✅ Roughly equivalent |
| Patient consent forms with KBA / IDV | ✅ | ❌ no patient-side surface yet | **HIGH** if we want patient-facing flows |
| Clinical trial / IRB workflows | ✅ | ❌ | **LOW** — different vertical (life sci) |
| Vendor BAA workflow (provider issues BAA to their vendor) | 🟡 just templates | ❌ | **MEDIUM** — distinct from getting a BAA from us |
| EHR (Epic, Cerner) integration | ✅ via HL7 FHIR (Cloverleaf middleware) | ❌ | **HIGH** for clinical adoption |
| NPI / license state / DEA storage on provider profile | ❌ DocuSign doesn't track this; it's signing only | ❌ we also don't (only specialty + state) | **HIGH** — credentialing requires NPI |
| Specialty / geographic coverage analytics | ❌ DocuSign doesn't have | ✅ Coverage map, state rankings, priority call list | **WIN for us** |
| Provider/firm onboarding pipeline | ❌ | ✅ 7-stage workflow (Docs → Billing → Training → Call → Portal → Go Live) | **WIN for us** |

### 9. Workflow automation

| Feature | DocuSign | Us | Gap |
|---|---|---|---|
| Conditional fields (show/hide) | ✅ | ❌ | **MEDIUM** — common on intake forms |
| Conditional routing | ✅ | ❌ | **MEDIUM** |
| **Maestro** — visual workflow builder | ✅ no-code, 32+ templates, 47+ extensions | ❌ | **LOW for now** — we have purpose-built workflows instead |
| **Web Forms** (HTML replaces PDF) | ✅ | ❌ | **MEDIUM** for patient-facing intake |
| Document reminders / dunning | ✅ | ✅ `document-reminders` + `run-dunning` Edge Functions | — |
| Auto-renew on contract end | ✅ on enterprise | ✅ `check-renewals` Edge Function | — |
| AI features: clause extraction, summary, risk score | ✅ Agreement AI | ✅ Claude-powered: `contract-review`, `predict-churn`, `dashboard-insights`, `lead-finder` | ✅ Roughly equivalent |
| Send for Signature gate (no fields → block) | DocuSign warns on empty envelopes | ✅ blocks send if zero signature fields placed | ✅ Equivalent |

### 10. Integrations

| Integration | DocuSign | Us | Gap |
|---|---|---|---|
| Salesforce | ✅ native managed package | ❌ | **MEDIUM** — common ask |
| Microsoft 365 (Outlook/Word/SharePoint/Teams) | ✅ | ❌ | **LOW** |
| Google Workspace | ✅ Gmail / Drive / Docs | ❌ | **LOW** |
| EHR (Epic / Cerner via HL7 FHIR) | ✅ | ❌ | **HIGH for healthcare** |
| Storage (Box, Dropbox, OneDrive) | ✅ auto-store | ❌ Supabase Storage only | **LOW** |
| Stripe (payment-at-signing) | ✅ via Payment tab | 🟡 we have Stripe webhooks stubs in `backend/`, no payment-at-signing | **MEDIUM** for telehealth copay |
| Twilio (SMS) | ✅ for SMS auth | 🟡 stub in `backend/` | **MEDIUM** |
| **Webhooks (outbound)** | ✅ Connect — account + per-envelope, HMAC signed | ❌ no webhook surface for our customers | **MEDIUM** — needed if anyone wants to integrate with us |
| Embedded signing (iframe in your app) | ✅ `recipientView` API | ❌ | **MEDIUM** — useful for white-label customers |
| Zapier / Make | ✅ | ❌ | **LOW** |
| **REST API** | ✅ extensive | 🟡 Supabase REST + thin FastAPI; no public API doc | **HIGH** if we want partners |
| **Per-envelope event webhooks** | ✅ | ❌ | **MEDIUM** |

### 11. Pricing positioning

| | DocuSign | Provider Harmony Hub |
|---|---|---|
| Personal | $10/mo, 5 envelopes | n/a |
| Standard | $25/user/mo, 100/yr | n/a |
| Business Pro | $40-65/user/mo, adds Bulk/PowerForms/Payments | n/a |
| Enterprise / IAM | Custom, includes SSO + Maestro + AI | n/a |
| HIPAA BAA | Enterprise/IAM only — typically $$$ | We need to define this |
| 21 CFR Part 11 | Custom-priced add-on (Life Sciences Pro) | We need to define this |
| Per-use add-ons | KBA $1-3, SMS $0.50, ID Verify $2-3 | We don't bill these yet |

---

## Where we win against DocuSign

Don't let the gap list above overshadow what we have that DocuSign doesn't:

1. **Built-in CRM** — providers, law firms, deals, pipeline, lead finder, campaigns, calendar, support tickets, billing, invoices. DocuSign sells eSignature; you'd glue it together with Salesforce + Stripe + ZenDesk + a calendar app + a CRM. We're vertically integrated for the PI/medical use case.
2. **Multi-role portals** — admin / sales rep / provider / law firm. DocuSign has ONE persona (sender) with optional CC roles.
3. **Geographic intelligence** — coverage analytics, state rankings, priority call list, map view with heatmap + coverage overlay. DocuSign has zero geo.
4. **Onboarding command center** — 7-stage workflow tracking from documents → billing → training → go-live. DocuSign has nothing equivalent.
5. **AI integrated across the platform** — pipeline health, churn prediction, contract review, outreach plans, dashboard insights — all Claude-powered. DocuSign just shipped IAM AI but it's an add-on.
6. **Medical-vertical opinionation** — provider + law-firm contracts, PI-focused law firms, medical specialty categories, medical contract types. Generic in DocuSign.

---

## Recommended attack order

If the goal is "DocuSign for medical providers" with the budget for a focused 3-month push, here's what I'd build, ranked by **value × ease**:

### Tier 1 — Build now (high value, low effort, ≈ 1–2 weeks each)
1. **Real email delivery** (Resend or SendGrid) — turn off the demo banner, ship actual OTP and signing-link emails. Without this we can't go to production.
2. **Anchor-text auto-placement** — admin types `\sig1\` in a Word doc, fields snap to it. Saves hours per template re-tag.
3. **Save & Finish Later** — persist `fieldValues` to DB, signer can resume. Important for long medical intake forms.
4. **Pre-loaded HIPAA + telehealth consent template gallery** — 8–10 templates ready to send. Single biggest "out of box" wow factor.
5. **Generate Certificate of Completion as a separate downloadable PDF** (we have the data already).
6. **NPI + license state + DEA fields on provider profile** — credentialing prerequisite.
7. **Radio Group + Dropdown field types** — common on consent forms.
8. **Attachment field type** — patient uploads photo of insurance card.

### Tier 2 — Build next (medium value/effort, 2–4 weeks each)
9. **Multi-recipient routing** — true sequential routing within one envelope (Provider signs → Law firm reviews → Admin counter-signs all in one envelope, not three separate requests).
10. **Conditional fields** (show/hide based on other field values) + **conditional routing**.
11. **PowerForms** (public self-service link) — for patient intake.
12. **Access Code authentication** — sender-shared code, no third party.
13. **HIPAA BAA workflow** — both directions: customer signs ours, customer can issue to their vendors.
14. **Outbound webhook surface** for customers' integrations.
15. **Embedded signing** (iframe support) for white-label customers.

### Tier 3 — Strategic, but heavier lifts
16. **Real KBA via LexisNexis** — paid feature, adds $1-3/use.
17. **ID Verify** via Persona / Stripe Identity / Veriff — paid feature.
18. **SMS OTP via Twilio**.
19. **EHR integration (Epic / Cerner via FHIR)** — multi-quarter project, but the killer differentiator for healthcare.
20. **21 CFR Part 11 module** (signature meaning, reason-for-signing, validation kit) — opens life sciences customers.
21. **SOC 2 Type 2 audit** — enterprise procurement requirement.
22. **Native in-browser redlining** — DocuSign doesn't have this either, big differentiator.
23. **AI medical-form intelligence** — auto-extract NPI, ICD-10, CPT codes from uploaded forms.

---

## What NOT to build

Don't try to match these — they're either niche, expensive, or DocuSign's competitive moats:

- **DocuSign Maestro** (visual workflow builder) — we have purpose-built workflows for our vertical, no-code Lego doesn't fit our positioning.
- **In-Person Signer** / **Notary** — niche use cases, paid services.
- **Editor / Agent / Intermediary recipient roles** — power-user features that <5% of envelopes use.
- **eIDAS QES / EU compliance** — US-focused product.
- **FedRAMP** — only matters if you sell to federal government.
- **Native mobile apps (iOS/Android)** — responsive web is enough for both signer and admin, given how rare DocuSign's native apps are actually used vs the web flow.

---

## Sources

- DocuSign feature research compiled from docusign.com, developer.docusign.com, support.docusign.com, and third-party reviews (Signeasy, Eversign, Juro, IntuitionLabs).
- Provider Harmony Hub feature inventory compiled from direct codebase exploration: migrations under `frontend/supabase/migrations/`, components under `frontend/src/components/`, pages under `frontend/src/pages/`, Edge Functions under `frontend/supabase/functions/`.
- Validations and end-to-end flow validated via Chrome DevTools MCP runs on 2026-04-25.

**Bottom line:** we have a working DocuSign-shaped signing core inside a vertically integrated CRM. The biggest value-multiplier missing today is **real email delivery + a HIPAA BAA + a curated medical template library**. That's a 3-week sprint that flips us from "demo-ready" to "first paying healthcare customer-ready."

// Generates realistic demo contract PDFs for Provider Harmony Hub.
// Run: npm install && npm run generate
// Output: ../../demo-pdfs/*.pdf
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../demo-pdfs");

// ── Page helpers ────────────────────────────────────────────────────────────
const LEFT = 50;
const RIGHT = 545;
const TOP = 790;
const BOTTOM = 50;

function makeWriter(page, fonts) {
  let y = TOP;

  return {
    get y() { return y; },
    set y(v) { y = v; },
    space(n = 12) { y -= n; },
    line(y0 = y, y1 = y, color = rgb(0.7, 0.7, 0.7)) {
      page.drawLine({ start: { x: LEFT, y: y0 }, end: { x: RIGHT, y: y1 }, color, thickness: 0.5 });
    },
    heading(text, size = 16) {
      y -= size + 4;
      page.drawText(text, { x: LEFT, y, size, font: fonts.bold, color: rgb(0.1, 0.1, 0.2) });
      y -= 4;
    },
    subhead(text, size = 11) {
      y -= size + 6;
      page.drawText(text, { x: LEFT, y, size, font: fonts.bold, color: rgb(0.15, 0.15, 0.3) });
      y -= 2;
    },
    body(text, size = 10, font = fonts.regular) {
      const maxChars = 95;
      const words = text.split(/\s+/);
      let line = "";
      const lines = [];
      for (const w of words) {
        if ((line + " " + w).trim().length > maxChars) {
          lines.push(line.trim());
          line = w;
        } else {
          line += " " + w;
        }
      }
      if (line.trim()) lines.push(line.trim());
      for (const l of lines) {
        y -= size + 3;
        page.drawText(l, { x: LEFT, y, size, font, color: rgb(0.2, 0.2, 0.2) });
      }
    },
    kv(label, value) {
      y -= 13;
      page.drawText(label, { x: LEFT, y, size: 10, font: fonts.bold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(value, { x: LEFT + 140, y, size: 10, font: fonts.regular, color: rgb(0.1, 0.1, 0.1) });
    },
    signBlock(label1, label2) {
      y -= 50;
      // Two signature blocks side by side
      page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + 220, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });
      page.drawLine({ start: { x: LEFT + 275, y }, end: { x: RIGHT, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      page.drawText(label1, { x: LEFT, y, size: 9, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(label2, { x: LEFT + 275, y, size: 9, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
      y -= 15;
      page.drawText("Date: _______________", { x: LEFT, y, size: 9, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText("Date: _______________", { x: LEFT + 275, y, size: 9, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
    },
    pageBreak() { y = BOTTOM; },
    spaceLeft() { return y - BOTTOM; },
  };
}

function drawHeader(page, fonts, title, subtitle) {
  // Branded header band
  page.drawRectangle({ x: 0, y: 810, width: 595, height: 32, color: rgb(0.12, 0.25, 0.55) });
  page.drawText("PROVIDER HARMONY HUB", { x: LEFT, y: 820, size: 12, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText("Provider Network Services Platform", { x: 370, y: 820, size: 9, font: fonts.regular, color: rgb(0.85, 0.9, 1) });
}

function drawFooter(page, fonts, contractId, pageNum, totalPages) {
  page.drawLine({ start: { x: LEFT, y: 35 }, end: { x: RIGHT, y: 35 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText(`Contract ID: ${contractId}`, { x: LEFT, y: 22, size: 8, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(`Page ${pageNum} of ${totalPages}`, { x: RIGHT - 60, y: 22, size: 8, font: fonts.regular, color: rgb(0.5, 0.5, 0.5) });
}

// ── Contract generators ─────────────────────────────────────────────────────

async function generateProviderServicesAgreement() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contractId = "PHH-PSA-2026-0047";

  const page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts, "PROVIDER SERVICES AGREEMENT");
  const w = makeWriter(page, fonts);

  w.y = 770;
  w.heading("PROVIDER SERVICES AGREEMENT", 18);
  w.space(2);
  w.body("This Provider Services Agreement (\"Agreement\") is entered into between Provider Harmony Hub, Inc. (\"PHH\") and the undersigned healthcare provider (\"Provider\") as of the Effective Date set forth below.");

  w.subhead("1. PARTIES");
  w.kv("PHH:", "Provider Harmony Hub, Inc.");
  w.kv("PHH Address:", "200 Congress Ave, Suite 450, Austin, TX 78701");
  w.kv("Provider:", "[Provider Business Name]");
  w.kv("Provider Address:", "[Provider Address]");
  w.kv("Effective Date:", "[Start Date]");

  w.subhead("2. SCOPE OF SERVICES");
  w.body("Provider agrees to deliver healthcare services to patients referred through the PHH network in accordance with applicable state and federal regulations. PHH will provide network inclusion, case management tools, secure portal access, automated billing coordination, and integration with participating law firms for personal injury cases.");

  w.subhead("3. TERM AND TERMINATION");
  w.body("This Agreement shall remain in effect for twelve (12) months from the Effective Date and shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior to the renewal date. Either party may terminate for material breach with fifteen (15) days' written notice and opportunity to cure.");

  w.subhead("4. FEES AND PAYMENT");
  w.body("Provider shall pay the monthly subscription fee associated with the selected service tier as reflected on the active rate card for Provider's specialty category and market. Fees are billed on the first of each month and payable within net-15 terms. Delinquent balances over thirty (30) days may result in suspension of network access.");

  w.subhead("5. CONFIDENTIALITY");
  w.body("Both parties shall maintain the confidentiality of all non-public information exchanged under this Agreement, including but not limited to patient data, pricing, referral volumes, and business operations. This obligation survives termination.");

  w.subhead("6. COMPLIANCE");
  w.body("Provider warrants compliance with HIPAA, state licensure requirements, and all applicable anti-kickback and self-referral laws. Provider shall maintain current malpractice insurance of no less than $1,000,000 per occurrence and $3,000,000 aggregate.");

  w.subhead("7. INDEMNIFICATION");
  w.body("Each party shall indemnify and hold harmless the other for claims arising from that party's negligent acts or omissions, subject to the limits of applicable insurance coverage.");

  w.subhead("8. SIGNATURES");
  w.body("By signing below, each party acknowledges that they have read, understood, and agree to be bound by the terms of this Agreement.");
  w.signBlock("PHH Authorized Signatory", "Provider Authorized Signatory");

  drawFooter(page, fonts, contractId, 1, 1);

  return { bytes: await pdfDoc.save(), filename: "provider-services-agreement.pdf" };
}

async function generateEnterpriseAgreement() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contractId = "PHH-ENT-2026-0012";

  // Page 1
  let page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  let w = makeWriter(page, fonts);
  w.y = 770;
  w.heading("ENTERPRISE PROVIDER AGREEMENT", 18);
  w.space(2);
  w.body("This Enterprise Provider Agreement (\"Agreement\") establishes the terms under which a multi-location healthcare organization (\"Enterprise Provider\") participates in the Provider Harmony Hub network. This Agreement governs all locations listed in Exhibit A and supersedes any prior location-level agreements.");

  w.subhead("1. ENTERPRISE PARTIES");
  w.kv("PHH:", "Provider Harmony Hub, Inc.");
  w.kv("Enterprise Provider:", "[Enterprise Name]");
  w.kv("Headquarters:", "[HQ Address]");
  w.kv("Locations:", "See Exhibit A (minimum 5 locations required)");
  w.kv("Effective Date:", "[Start Date]");
  w.kv("Initial Term:", "Twelve (12) months with auto-renewal");

  w.subhead("2. ENTERPRISE PRICING");
  w.body("Enterprise Provider qualifies for tiered volume pricing based on total active locations and aggregate monthly case volume. Rates are fixed for the initial twelve-month term and may be adjusted with ninety (90) days' written notice at renewal. Enterprise Provider agrees to a minimum monthly commitment as reflected on the active enterprise rate schedule.");

  w.subhead("3. DEDICATED SUPPORT");
  w.body("PHH will assign a dedicated Account Director and technical implementation lead during onboarding. Enterprise Providers receive priority support queue access, quarterly business reviews, and first access to new platform features during beta periods.");

  w.subhead("4. SERVICE LEVEL AGREEMENT");
  w.body("PHH guarantees 99.5% platform uptime measured monthly, with service credits issued for qualifying downtime events. Response times for critical support issues shall not exceed one (1) business hour during business hours (8am-6pm local time).");

  w.subhead("5. DATA AND INTEGRATIONS");
  w.body("Enterprise Providers are entitled to API access, SFTP data export, and custom integration support with the Enterprise Provider's existing EHR, practice management, or billing systems. PHH commits to reasonable engineering effort to support such integrations at no additional cost within the first ninety (90) days.");

  drawFooter(page, fonts, contractId, 1, 2);

  // Page 2
  page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  w = makeWriter(page, fonts);
  w.y = 770;
  w.heading("ENTERPRISE PROVIDER AGREEMENT (cont.)", 14);

  w.subhead("6. COMPLIANCE AND AUDIT");
  w.body("Enterprise Provider warrants that each participating location maintains all required state licensure, accreditation, and liability insurance. PHH reserves the right to conduct annual compliance audits with thirty (30) days' advance notice and reasonable cooperation from Enterprise Provider.");

  w.subhead("7. BUSINESS ASSOCIATE AGREEMENT");
  w.body("The parties shall execute a separate Business Associate Agreement (BAA) in accordance with HIPAA requirements. The BAA is incorporated herein by reference and forms an integral part of this Agreement.");

  w.subhead("8. TERMINATION");
  w.body("Either party may terminate this Agreement at renewal by providing ninety (90) days' written notice. Early termination by Enterprise Provider requires payment of remaining contract minimum. Termination for cause requires thirty (30) days' written notice and a cure period.");

  w.subhead("9. GOVERNING LAW");
  w.body("This Agreement shall be governed by the laws of the State of Texas, without regard to conflict-of-law principles. The parties submit to the exclusive jurisdiction of the state and federal courts located in Travis County, Texas.");

  w.subhead("10. ENTIRE AGREEMENT");
  w.body("This Agreement, including all exhibits and addenda, constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements, whether oral or written.");

  w.subhead("11. EXECUTION");
  w.body("Each party represents that the individual executing this Agreement has full authority to bind their respective organization.");
  w.signBlock("PHH Authorized Signatory", "Enterprise Provider Signatory");

  drawFooter(page, fonts, contractId, 2, 2);

  return { bytes: await pdfDoc.save(), filename: "enterprise-provider-agreement.pdf" };
}

async function generatePremiumAddendum() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contractId = "PHH-ADD-2026-0091";

  const page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  const w = makeWriter(page, fonts);

  w.y = 770;
  w.heading("PREMIUM SERVICES ADDENDUM", 18);
  w.space(2);
  w.body("This Premium Services Addendum (\"Addendum\") modifies and supplements the underlying Provider Services Agreement between Provider Harmony Hub, Inc. and the undersigned Provider. By executing this Addendum, Provider upgrades to the Premium service tier.");

  w.subhead("1. PREMIUM TIER INCLUSIONS");
  w.body("Premium tier Providers receive all Standard tier benefits plus: priority case routing, AI-assisted contract review (unlimited), predictive churn analytics, health score monitoring with monthly reports, enhanced portal branding, and dedicated onboarding specialist access.");

  w.subhead("2. CASE PRIORITY");
  w.body("Premium Providers are surfaced preferentially in law firm search results within their specialty category and geographic market. Cases meeting Premium-tier criteria are routed to Premium Providers before Standard tier Providers, subject to specialty match and capacity availability.");

  w.subhead("3. MONTHLY FEE ADJUSTMENT");
  w.body("The Premium tier monthly fee replaces the existing Standard tier fee and takes effect on the next billing cycle following execution of this Addendum. No proration or credit will be issued for the partial month preceding the tier change.");

  w.subhead("4. DOWNGRADE");
  w.body("Provider may downgrade to a lower service tier by providing thirty (30) days' written notice. Downgrade takes effect on the next billing cycle. Any remaining Premium-tier benefits active at the time of downgrade may be forfeited.");

  w.subhead("5. INTEGRATION WITH UNDERLYING AGREEMENT");
  w.body("All other terms of the Provider Services Agreement remain in full force and effect. In the event of conflict between this Addendum and the underlying Agreement, this Addendum controls only with respect to Premium tier benefits and fees.");

  w.subhead("6. EXECUTION");
  w.body("By signing below, Provider confirms upgrade to the Premium service tier effective as of the next billing cycle.");
  w.signBlock("PHH Authorized Signatory", "Provider Signatory");

  drawFooter(page, fonts, contractId, 1, 1);

  return { bytes: await pdfDoc.save(), filename: "premium-services-addendum.pdf" };
}

async function generateLawFirmAgreement() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contractId = "PHH-LAW-2026-0034";

  // Page 1
  let page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  let w = makeWriter(page, fonts);
  w.y = 770;
  w.heading("LAW FIRM PARTICIPATION AGREEMENT", 17);
  w.space(2);
  w.body("This Law Firm Participation Agreement (\"Agreement\") governs the terms under which a personal injury law firm (\"Firm\") accesses the Provider Harmony Hub network to connect with participating healthcare providers for the purpose of client treatment coordination.");

  w.subhead("1. PARTIES");
  w.kv("PHH:", "Provider Harmony Hub, Inc.");
  w.kv("Firm:", "[Law Firm Name]");
  w.kv("Primary Contact:", "[Partner/Associate Name]");
  w.kv("Firm Address:", "[Firm Address]");
  w.kv("Bar Admissions:", "[State Bar Numbers]");
  w.kv("Effective Date:", "[Start Date]");

  w.subhead("2. SCOPE OF PARTICIPATION");
  w.body("Firm is granted access to search and connect with healthcare providers in the PHH network for the purpose of coordinating medical treatment for personal injury clients. PHH does not provide legal services, case management, or medical advice. All attorney-client relationships remain solely between Firm and Firm's clients.");

  w.subhead("3. REFERRAL PROTOCOL");
  w.body("Firm agrees to use the PHH platform exclusively for medical referral coordination. Firm shall not directly solicit providers outside the platform for clients referred through PHH. Any provider-firm relationships pre-dating this Agreement are exempt and shall be disclosed in writing.");

  w.subhead("4. FEES");
  w.body("Firm shall pay the monthly platform access fee associated with the selected membership tier. Additional per-case fees may apply for specialty provider searches, priority routing, or enhanced client coordination features as detailed on the active rate card.");

  w.subhead("5. CLIENT DATA AND CONFIDENTIALITY");
  w.body("Firm is responsible for obtaining all required authorizations from clients prior to sharing protected health information or personal data with PHH or participating providers. PHH shall treat all such data in accordance with HIPAA, applicable state privacy laws, and the Business Associate Agreement executed concurrently herewith.");

  drawFooter(page, fonts, contractId, 1, 2);

  // Page 2
  page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  w = makeWriter(page, fonts);
  w.y = 770;
  w.heading("LAW FIRM PARTICIPATION AGREEMENT (cont.)", 13);

  w.subhead("6. NO FEE SPLITTING");
  w.body("Nothing in this Agreement constitutes fee splitting, referral compensation, or any arrangement prohibited by applicable rules of professional conduct. PHH's fees are for platform access and services only, unrelated to the outcome or value of any client matter.");

  w.subhead("7. COMPLIANCE WITH PROFESSIONAL RULES");
  w.body("Firm warrants compliance with the Rules of Professional Conduct applicable in each jurisdiction where Firm is admitted to practice. Firm shall immediately notify PHH of any disciplinary action, suspension, or license restriction that materially affects Firm's ability to participate in the network.");

  w.subhead("8. TERM AND TERMINATION");
  w.body("This Agreement continues for an initial term of twelve (12) months with automatic one-year renewals. Either party may terminate with sixty (60) days' written notice at renewal or for material breach with a fifteen (15) day cure period.");

  w.subhead("9. LIMITATION OF LIABILITY");
  w.body("In no event shall PHH be liable for consequential, incidental, or punitive damages arising from Firm's use of the platform. PHH's aggregate liability is limited to the total fees paid by Firm in the twelve (12) months preceding any claim.");

  w.subhead("10. EXECUTION");
  w.body("Each party represents that the individual executing this Agreement has authority to bind their respective organization.");
  w.signBlock("PHH Authorized Signatory", "Law Firm Signatory");

  drawFooter(page, fonts, contractId, 2, 2);

  return { bytes: await pdfDoc.save(), filename: "law-firm-participation-agreement.pdf" };
}

async function generateStandardContract() {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const contractId = "PHH-STD-2026-0158";

  const page = pdfDoc.addPage([595, 842]);
  drawHeader(page, fonts);
  const w = makeWriter(page, fonts);

  w.y = 770;
  w.heading("STANDARD PROVIDER AGREEMENT", 18);
  w.space(2);
  w.body("This Standard Provider Agreement (\"Agreement\") is entered into between Provider Harmony Hub, Inc. (\"PHH\") and the undersigned healthcare provider (\"Provider\").");

  w.subhead("1. PARTIES AND EFFECTIVE DATE");
  w.kv("PHH:", "Provider Harmony Hub, Inc.");
  w.kv("Provider:", "[Provider Business Name]");
  w.kv("Effective Date:", "[Start Date]");
  w.kv("Initial Term:", "12 months");
  w.kv("Service Tier:", "Standard (Associate/Member)");

  w.subhead("2. SERVICES");
  w.body("PHH will provide Provider with network inclusion, patient referral routing from participating law firms, secure portal access, electronic document execution, and monthly reporting. Provider retains full clinical and operational independence.");

  w.subhead("3. MONTHLY FEE");
  w.body("Provider shall pay a monthly subscription fee based on Provider's specialty category and geographic market, as detailed on the active rate card. Fees are due on the first business day of each month. PHH may adjust published rates with sixty (60) days' written notice, effective at the start of the next billing cycle.");

  w.subhead("4. TERM AND RENEWAL");
  w.body("The initial term is twelve (12) months from the Effective Date. This Agreement automatically renews for successive one-year terms unless terminated in writing at least thirty (30) days before renewal.");

  w.subhead("5. TERMINATION");
  w.body("Either party may terminate for material breach with fifteen (15) days' written notice and opportunity to cure. Upon termination, Provider will complete treatment for any in-progress cases referred through PHH prior to the effective termination date.");

  w.subhead("6. INSURANCE");
  w.body("Provider shall maintain professional liability insurance of not less than $1,000,000 per occurrence and $3,000,000 aggregate, with certificate of insurance available to PHH upon request.");

  w.subhead("7. CONFIDENTIALITY AND HIPAA");
  w.body("Both parties shall protect all non-public information shared under this Agreement. A separate Business Associate Agreement (BAA) governs handling of protected health information and is incorporated herein by reference.");

  w.subhead("8. SIGNATURES");
  w.body("By signing below, each party agrees to be bound by the terms of this Agreement.");
  w.signBlock("PHH Authorized Signatory", "Provider Signatory");

  drawFooter(page, fonts, contractId, 1, 1);

  return { bytes: await pdfDoc.save(), filename: "standard-provider-agreement.pdf" };
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const docs = [
    await generateProviderServicesAgreement(),
    await generateEnterpriseAgreement(),
    await generatePremiumAddendum(),
    await generateLawFirmAgreement(),
    await generateStandardContract(),
  ];

  for (const { bytes, filename } of docs) {
    const out = path.join(OUT_DIR, filename);
    await fs.writeFile(out, bytes);
    console.log(`✓ ${filename} (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\n${docs.length} PDFs written to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

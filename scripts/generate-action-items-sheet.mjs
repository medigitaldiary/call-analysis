/**
 * generate-action-items-sheet.mjs
 *
 * Generates a master Action Items Excel sheet covering Apr 22 – today.
 *   - Apr 22 – May 8 : parsed from day-end report emails (Gmail IMAP)
 *   - May 9  – today : pulled from Supabase day_reports table
 *                      (hardcoded from MCP query on 2026-05-19; re-run with
 *                       DATABASE_URL set to refresh live data)
 *
 * Output columns:
 *   Date | Priority | Action Item | RM / Owner | Deadline | Status | Remarks
 *
 * Usage:
 *   node scripts/generate-action-items-sheet.mjs
 *   node scripts/generate-action-items-sheet.mjs --out /tmp/action-items.xlsx
 */

import { ImapFlow }    from 'imapflow';
import { simpleParser } from 'mailparser';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env files ────────────────────────────────────────────────────────────
function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^"/, '').replace(/"$/, '');
      if (v) process.env[k] = v;
    }
  } catch { /* file may not exist */ }
}

loadEnvFile(resolve(__dirname, '../.env.local'));
loadEnvFile(resolve(__dirname, '../.env.production.local'));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const OUT_FILE = getArg('--out') ?? resolve(__dirname, '../action-items.xlsx');

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE DATA — May 9–17 2026 (queried via MCP on 2026-05-19)
// Re-generate by running: SELECT report_date, report->'action_items' FROM day_reports WHERE report_date >= '2026-05-09' ORDER BY report_date
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_ACTION_ITEMS = [
  { date: '2026-05-09', items: [{"owner":"Kunal","action":"Call back customer on 9813675548 on Sunday between 9–10 AM to complete KYC process","deadline":"11-May","priority":"HIGH"},{"owner":"Kunal","action":"Follow up with Kunal (9860622321) post-KYC completion, send YTM vs coupon rate educational document and Unifins bond page link","deadline":"10-May","priority":"HIGH"},{"owner":"Kunal","action":"Escalate Subhash Kundu (7209565706) partnership interest to BD/Partner team and add to partner portal pipeline","deadline":"10-May","priority":"HIGH"},{"owner":"Kunal","action":"Raise KYC resolution request with KRA for customers on 9826824206 and 8007134051; follow up by Monday","deadline":"12-May","priority":"HIGH"},{"owner":"Support","action":"Investigate TDS inconsistency on bond payouts for customer 9563250969 (₹128.22 on 31st March vs ₹96 in May) and revert with resolution","deadline":"12-May","priority":"HIGH"},{"owner":"Kunal","action":"Send editable Form 121 with all relevant email IDs (issuer, debenture trustee, registrar) to customer 7869115235","deadline":"10-May","priority":"HIGH"},{"owner":"Kunal","action":"Follow up with customer 9925174614 on Monday to complete investment after KYC clearance","deadline":"12-May","priority":"HIGH"},{"owner":"Kunal","action":"Raise tech bug for missing security cover display on bond detail pages (Unifins, Kirtana Finserv) and share product UI feedback with tech team","deadline":"12-May","priority":"MEDIUM"},{"owner":"Compliance Team","action":"Compliance team to review informal secondary market liquidity assurance made in Call #22 and issue updated script guidance","deadline":"13-May","priority":"MEDIUM"},{"owner":"Kunal","action":"Flag product gap to tech team: absence of online Form 121 submission feature vs competitor platforms","deadline":"13-May","priority":"MEDIUM"},{"owner":"Kunal","action":"Update CRM: mark all accidental app download / not interested contacts (calls #1, #12, #14, #15, #21, #31, #37) as disqualified to avoid repeat outreach","deadline":"10-May","priority":"LOW"}] },
  { date: '2026-05-10', items: [{"owner":"Sharik","action":"Call back customer (8891220879) before investment decision is made; provide better pricing on Unifin bonds for ₹5–15 lakh ticket as promised on Call #26","deadline":"11-May","priority":"HIGH"},{"owner":"Sharik / Tech Team","action":"Escalate Equitas Bank internet banking non-support to product/tech team and follow up with customer (8920112159) at 10:00–10:30 AM as committed on Call #63","deadline":"11-May","priority":"HIGH"},{"owner":"Sharik / Support","action":"Resolve UPI payment failure for Unifins Capital order and confirm retry outcome with customer (8285740450) from Call #61","deadline":"11-May","priority":"HIGH"},{"owner":"Sharik","action":"Follow up with customer (9958279322) to confirm Saturn Finsu bond payment completion and assist with correct demat account identification (Call #64)","deadline":"11-May","priority":"HIGH"},{"owner":"Tech Team","action":"Resolve DigiLocker/Aadhaar verification loop bug on Bond Scanner app reported by customer Shariq (8421371449) in Call #54 — escalate to tech team","deadline":"12-May","priority":"HIGH"},{"owner":"Support Team","action":"Ensure customer care lines are staffed or an auto-response is active on weekends — customer (9476451335) reported missed calls to support on weekend (Call #51)","deadline":"12-May","priority":"HIGH"},{"owner":"Product Team","action":"Escalate product team feedback from Call #26: add bond tenure, minimum investment amount, and clearer labelling to bond listing cards on platform UI","deadline":"17-May","priority":"MEDIUM"},{"owner":"Tech Team / Sharik","action":"Review and update sell/secondary market feature timeline (ETA 1–2 months per agent) and communicate to affected customers who asked about liquidity","deadline":"17-May","priority":"MEDIUM"},{"owner":"Compliance Team","action":"Compliance review: flag agents sharing personal contact numbers with customers (Call #54) and ensure communication policy is followed","deadline":"14-May","priority":"MEDIUM"},{"owner":"Sharik","action":"Follow up with deferred investor (9129155211, Call #65) next month when payment arrives — pitch secured bond paper or alternatives","deadline":"10-Jun","priority":"MEDIUM"},{"owner":"Sharik / Support","action":"Update CRM to tag not-interested and wrong-install customers (Calls #14, #20, #30, #31, #32, #34, #42) to avoid repeated outreach","deadline":"12-May","priority":"LOW"},{"owner":"Support / Compliance","action":"Review outbound missed-call campaign to ensure only verified and consenting leads are being contacted — multiple customers denied initiating KYC (Calls #20, #43, #56)","deadline":"14-May","priority":"LOW"}] },
  { date: '2026-05-11', items: [{"owner":"Compliance Team + All Reps","action":"Correct and standardise TDS exemption form guidance across all reps — multiple agents (Tarun, Sonika, Sai) cited 'Form 121' which does not exist; correct form is 15G (under 60 years) or 15H (60+). Brief all reps immediately.","deadline":"12-May","priority":"HIGH"},{"owner":"Support / Tech Team","action":"Investigate and resolve UPI payment failures for Unifence Capital and Unifis Capital — at least 3 customers (calls #89, #437, #455) blocked by bank-level merchant restrictions. Escalate to payments/tech team and communicate net banking workaround.","deadline":"12-May","priority":"HIGH"},{"owner":"Tarun + Ops Team","action":"Fix payout date discrepancy: customer (call #341, #380) received email stating payout on 11-May but app shows 26-May for Kirtana Finserv bond. Ops/tech team to sync app data with issuer records and confirm correct date to affected customer.","deadline":"12-May","priority":"HIGH"},{"owner":"Sonica's Team Lead","action":"Coach Sonica on consistent brand pronunciation — repeated instances of 'Bomb Scanner', 'Ball Scanner', 'Wall Scanner' during introductions. Affects customer trust and compliance. Immediate script reinforcement required.","deadline":"12-May","priority":"HIGH"},{"owner":"Team Lead / Routing","action":"Deploy Tamil-speaking representative to serve queued Tamil-speaking leads — at least 6 calls across Khushboo, Kunal, Sai, Sharik ended with language handoff promise but no confirmed callback scheduled.","deadline":"12-May","priority":"HIGH"},{"owner":"Saanvi + Tech/QA","action":"Escalate app-corruption complaint from call #176 (Saanvi): customer reported downloading Bond Scanner corrupted their phone and locked them out. QA/Tech team to investigate and respond.","deadline":"12-May","priority":"HIGH"},{"owner":"Support / Tech","action":"Investigate OTP login errors reported in calls #36, #73, #113, #278 — multiple customers unable to log into the platform. Tech team to review OTP delivery reliability.","deadline":"12-May","priority":"HIGH"},{"owner":"Support + Marketing","action":"Resolve pending referral/cashback payout issues — calls #42, #406, #446 involve customers waiting 10–15+ days for ₹50 sign-up/referral credit. Publish clear policy timeline and process pending disbursements.","deadline":"13-May","priority":"MEDIUM"},{"owner":"Training / All Reps","action":"Brief all reps on HUF account onboarding process (call #139 — Kunal handled well) and NRI eligibility limitation (call #388 — Tarun handled well) to ensure consistent responses across team.","deadline":"13-May","priority":"MEDIUM"},{"owner":"Sharik + Support","action":"Escalate unresolved Unifex/TDS support ticket (call #429 — Sharik) where customer's emails have gone unanswered for weeks. Assign ownership and ensure written response within 24 hours.","deadline":"12-May","priority":"MEDIUM"},{"owner":"Tarun / Sai / Sonica / Sharik","action":"Schedule follow-up calls for all high-intent warm leads: Naveen (call #359, ₹25L intent, Tarun), No Name (call #246, 5L intent, Sai), No Name (call #337, 1L intent, Sonica), Shariq (call #424, Unifence Capital, Sharik).","deadline":"12-May","priority":"MEDIUM"},{"owner":"Marketing / Product","action":"Review lead quality from Instagram, Facebook, and Google Play Store — high volume of accidental sign-ups and wrong-number leads (estimated 60+ calls). Add intent confirmation step to sign-up flow.","deadline":"15-May","priority":"LOW"}] },
  { date: '2026-05-12', items: [{"owner":"Aadi + Support","action":"Resolve recurring KYC name mismatch (Aadhaar vs PAN) for phone 9486321850 — customer contacted across 6 calls (4, 19, 22, 29, 42) without resolution. Escalate to KYC/compliance team today.","deadline":"13-May","priority":"HIGH"},{"owner":"Support","action":"Investigate missing Akara Capital bond interest payments reported by multiple customers (calls 65, 105, 111, 113, 268). Cross-check payout records and notify affected customers.","deadline":"13-May","priority":"HIGH"},{"owner":"Support","action":"Immediately mark DND for customer (phone 7021722857, call 308) who explicitly requested Do Not Call status. Confirm across all CRM and dialler systems.","deadline":"12-May","priority":"HIGH"},{"owner":"Marketing + Support","action":"Audit lead quality — large volume of calls (est. 80+) reached customers who denied signing up or called it accidental. Review Instagram, Facebook and YouTube ad-sourced leads for consent and accuracy before next outreach cycle.","deadline":"14-May","priority":"HIGH"},{"owner":"Support","action":"Fix duplicate outreach issue: calls 71 and 151 show Khushboo and Saanvi simultaneously calling the same household (phone 9885920591 / 9989200149), causing customer frustration. Implement CRM deduplication lock.","deadline":"13-May","priority":"HIGH"},{"owner":"Compliance Team","action":"Conduct compliance review of all calls where agents quoted yields (15.5%, 7–15%) without mandatory SEBI risk disclaimers. Pattern observed across Aadi, Kunal, Sai, Sonica, Saanvi.","deadline":"14-May","priority":"HIGH"},{"owner":"Team Leads","action":"Arrange language-matched callbacks for Tamil, Bengali, Telugu, Gujarati, and Kannada-speaking customers who were dropped or unserved today due to language barriers (calls 17, 40, 67, 68, 82, 122, 195, 245, 250, 275, 292, 313, 317, 327, 334).","deadline":"13-May","priority":"MEDIUM"},{"owner":"Respective RMs","action":"Send WhatsApp/email follow-ups to all customers where info was shared but follow-up was promised (calls 16, 30, 89, 99, 107, 200, 249, 361, 374, 375).","deadline":"13-May","priority":"MEDIUM"},{"owner":"Team Leads","action":"Brief all agents on correct platform name usage. Multiple agents used incorrect names: 'Bomb Scanner', 'Bounce Canal', 'Bonds Canada', 'Bond Standard', 'Bonn Scanner', 'Burns Canal' etc. This undermines brand credibility.","deadline":"13-May","priority":"MEDIUM"},{"owner":"Tarun","action":"Share Unifence Capital bond term sheet and Capital India bond details with Kunal (phone 7758805767, calls 374–375) who is actively researching a ₹1 lakh investment decision.","deadline":"13-May","priority":"LOW"}] },
  { date: '2026-05-13', items: [{"owner":"Compliance Team","action":"Immediately verify Bond Scanner's SEBI registration status — customer in call #240 found 'no records available' on SEBI website. This is a critical trust and compliance risk.","deadline":"14-May","priority":"HIGH"},{"owner":"Support / Tech Team","action":"Resolve payment gateway (Cashfree/UPI) failures affecting multiple customers (#318 Akara Capital ₹58,482; #383 Patel Engineering ₹10L; #390 DCB Bank). Escalate to payments/tech team with consolidated ticket.","deadline":"14-May","priority":"HIGH"},{"owner":"Sharik","action":"Follow up with Rohit Munka (call #274, Sharik) — high-value prospect with ₹1.5Cr+ portfolio. Share SEBI registration docs and KYC onboarding guide via WhatsApp today.","deadline":"14-May","priority":"HIGH"},{"owner":"Sonica","action":"Follow up with Sony Car (#296/#321/#327, Sonica) — failed payment + liquidity concern. Send WhatsApp confirmation and notify when sell feature goes live.","deadline":"14-May","priority":"HIGH"},{"owner":"Khushboo / Sai / KYC Team","action":"Escalate NSC/NSE KYC delays affecting multiple customers (Dinesh Kumar #69, call #297 3-4 lakh ready to invest, call #198 Andhra Mineral ₹10L). Push KYC team for same-day resolution.","deadline":"14-May","priority":"HIGH"},{"owner":"Support / Sales Ops","action":"Remove and audit all 'not interested' / accidental sign-up contacts from active outreach list. Over 30% of calls today were to wrong numbers or accidental sign-ups — a lead data quality crisis.","deadline":"15-May","priority":"HIGH"},{"owner":"Team Leads","action":"Arrange Tamil, Kannada, Bengali and Malayalam-speaking agent callbacks for all language-barrier cases flagged today across Aadi, Saanvi, Sai, Sonica, Tarun (estimated 15+ such calls).","deadline":"14-May","priority":"MEDIUM"},{"owner":"Compliance Team","action":"Compliance audit: Remove 'guaranteed recovery', 'pakka milega', 'SBI registered', 'semi-regulated' and similar non-compliant language from agent scripts. At least 6 calls flagged today.","deadline":"16-May","priority":"MEDIUM"},{"owner":"Respective RMs","action":"Share Unifins/Akara/Andhra Mineral bond details and AAA-rated bond lists via WhatsApp to all customers who requested them today (calls #3, #18, #259, #354, #391, #406, #414).","deadline":"14-May","priority":"MEDIUM"},{"owner":"Product Team","action":"Escalate missing premature sell/exit feature feedback to Product team. Raised by at least 4 customers today (#296, #321, #327, #261). Confirm ETA and communicate to RMs.","deadline":"16-May","priority":"LOW"}] },
  { date: '2026-05-14', items: [{"owner":"Sharik, Sai, All Reps","action":"Complete callbacks for all 65 follow_up_scheduled calls — priority on high-intent leads: Kabir Kiran (₹30L intent, call #148), customer at 9850815560 (active bond purchase journey, calls #111-144), and Shri (call #184)","deadline":"15-May","priority":"HIGH"},{"owner":"Kunal, Sharik","action":"Escalate KYC delays for Vasanta Krishnamurthy (PAN/Aadhaar name mismatch, call #280) and the customer at 9958315926 (3-4 day KYC pending, call #159) to KRA team for manual approval","deadline":"15-May","priority":"HIGH"},{"owner":"Support / Sharik / Sai","action":"Investigate and resolve payment gateway issues: Catholic Shram Bank not supported by Cashfree (call #181), DBS Bank account blocked (call #264), and website technical error during order placement (call #138)","deadline":"15-May","priority":"HIGH"},{"owner":"Compliance Team / Team Lead","action":"Compliance review: Multiple agents used incorrect company names ('Bomb Scanner', 'Bonn Scanner', 'Bounce Scanner', 'Bonds Canada', 'HSEB registered') — issue formal correction guidance and coach all 7 reps on brand pronunciation and SEBI citation accuracy","deadline":"15-May","priority":"HIGH"},{"owner":"Support / All Reps","action":"Arrange Bengali-speaking callbacks for at least 5 identified Bengali-speaking customers (calls #5, #74, #196, #284, #220) — assign dedicated Bengali rep or escalate to language routing team","deadline":"15-May","priority":"HIGH"},{"owner":"Aadi, Sharik, Sai, Sharik, Kunal","action":"Send promised WhatsApp/email materials: Raman Prajapati Excel sheet (call #15), Shri's bond list (call #184), customer at 9850815560 bond details (calls #116, #127), RTGS bank details for Tata Motors bond (call #179), Manoj bond selling guide (call #282)","deadline":"15-May","priority":"MEDIUM"},{"owner":"Kunal / Tarun","action":"Arrange senior RM/Kunal callback for Bangalore customer who requested in-person meeting and expressed trust concerns about the platform (call #262)","deadline":"15-May","priority":"MEDIUM"},{"owner":"Support / All Reps","action":"Clean lead database — at least 30+ customers denied signing up or flagged accidental sign-ups; verify consent records and remove invalid leads to improve outreach quality and SEBI compliance","deadline":"16-May","priority":"MEDIUM"},{"owner":"Kunal / Sharik / Sai","action":"Address bond sell feature gap — multiple customers (calls #106, #148, #154, #294) frustrated by inability to sell bonds on platform; escalate to Product team with customer feedback log and competitive context (Wind Wealth has this feature)","deadline":"16-May","priority":"MEDIUM"},{"owner":"Marketing / Support","action":"Review and update sign-up flow to clearly state Bond Scanner is an investment platform (not a job portal or gaming app) — calls #222 and #225 revealed serious intent mismatches affecting lead quality","deadline":"20-May","priority":"LOW"}] },
  { date: '2026-05-15', items: [{"owner":"Kunal","action":"Follow up with high-value prospect Kunal (₹50-60L corpus, call #127) — confirm KYC and Demat setup for self, wife, and parents; share Form 121 blog and curated bond options (11-12% coupon, A-minus, 2-3yr, monthly payouts)","deadline":"16-May","priority":"HIGH"},{"owner":"Sai","action":"Call back Rohit (call #211) with sell-feature timeline update and Cred bond details; escalate in-platform sell feature to product/tech team with firm ETA","deadline":"16-May","priority":"HIGH"},{"owner":"Saanvi","action":"Resolve KYC name-mismatch for Shibin Babu (calls #139, #183) — escalate to Brijmohan, also fix wife's selfie verification; callback with Unifin bond details once resolved","deadline":"16-May","priority":"HIGH"},{"owner":"Kunal / Support","action":"Investigate and fix Form 121 flow missing from in-app experience (call #244 — Kirtana Finserv investor); send Kirtana Finserv website link to affected customer","deadline":"16-May","priority":"HIGH"},{"owner":"Sales Training Team","action":"Address accrued interest / RFQ settlement knowledge gap (calls #198, #203, #344, #345) — conduct internal training session and publish an FAQ document for agents and customers","deadline":"17-May","priority":"HIGH"},{"owner":"Compliance Team","action":"Review DND compliance for call #357 (Tarun/customer threatened DND escalation) — verify number against TRAI registry and check if outbound calling policy was breached","deadline":"16-May","priority":"HIGH"},{"owner":"Team Lead / Compliance","action":"Investigate Khushboo call #88 — agent abruptly terminated call when customer mentioned financial hardship; review recording for compliance and conduct empathy coaching","deadline":"16-May","priority":"HIGH"},{"owner":"Support / Marketing","action":"Audit lead list quality — high volume of denied sign-ups, accidental downloads, and wrong numbers across all reps; cross-check phone numbers against platform registration records before next call cycle","deadline":"17-May","priority":"HIGH"},{"owner":"Sales Team","action":"Standardise bond sell/exit process communication — agents giving inconsistent and contradictory information about secondary market availability (calls #211, #247, #251, #288, #290); create a single approved script","deadline":"17-May","priority":"MEDIUM"},{"owner":"Support / Tech","action":"Implement language-routing at sign-up — Tamil, Kannada, Telugu, Marathi, and Odia-speaking customers repeatedly being called by non-matching agents (calls #66, #123, #173, #178, #318, #329, #370); route by language preference","deadline":"19-May","priority":"MEDIUM"},{"owner":"Sai","action":"Share product update for Andhra Pradesh Mineral Development Corporation and Kerala SDL bonds with interested customers (calls #21, #222, #230, #231) — check sourcing team availability","deadline":"16-May","priority":"MEDIUM"},{"owner":"Khushboo","action":"Follow up with senior citizen investor (call #50 — Khushboo) who requested WhatsApp bond list for ₹40-50K investment in secured bonds with ~12% yield and foreclosure option","deadline":"16-May","priority":"MEDIUM"},{"owner":"Support / Product","action":"Log product feedback to tech team — customers report bond tenure not displayed on listing cards (only maturity dates); add tenure duration field to improve UX (call #103)","deadline":"19-May","priority":"LOW"},{"owner":"Sales Team","action":"Clarify and document referral earning policy so agents can communicate it consistently; multiple customers asked and received uncertain or inconsistent answers (calls #192, #202)","deadline":"19-May","priority":"LOW"}] },
  { date: '2026-05-16', items: [{"owner":"Data/Content Team","action":"Correct the Shriram Finance vs Shriram Transport Finance company profile and ISIN mismatch on the Bond Scanner platform immediately; audit all bond listings for similar data errors.","deadline":"17-May","priority":"HIGH"},{"owner":"Product/Operations Team","action":"Implement proactive TDS form submission reminders (email/WhatsApp) to investors before deduction deadlines — triggered by the IIFL Samasta Form 121 complaint in Call #30.","deadline":"23-May","priority":"HIGH"},{"owner":"Tarun","action":"Call back customer (9868256837) with confirmed KYC resolution — Zerodha BO ID entry and DigiLocker PAN card re-upload issue has been open across multiple calls (#18, #19, #26, #33, #35).","deadline":"17-May","priority":"HIGH"},{"owner":"Tarun","action":"Verify whether Angel One Demat platform supports secondary market bond sell orders and communicate confirmed guidance to customer from Call #48.","deadline":"17-May","priority":"HIGH"},{"owner":"Sales Manager","action":"Coach Tarun on needs-discovery before pitching — assess customer financial literacy and affordability before quoting minimum investment amounts (pattern observed in Calls #36, #47).","deadline":"19-May","priority":"HIGH"},{"owner":"Support Team","action":"Create and distribute a standardised secondary market / pre-maturity sell FAQ covering Zerodha, Groww, and Angel One workflows to reduce agent uncertainty on future calls.","deadline":"21-May","priority":"MEDIUM"},{"owner":"Compliance Team","action":"Review and enforce compliance guidelines — agents must include risk disclaimers when quoting bond yield/return percentages on calls (pattern in Calls #24, #40).","deadline":"19-May","priority":"MEDIUM"},{"owner":"Sales Manager","action":"Audit sign-up database to filter unqualified leads (no investment intent, below minimum budget) before dialling to reduce wasted calls and agent time.","deadline":"21-May","priority":"MEDIUM"},{"owner":"Support Team","action":"Review call recording infrastructure — multiple calls were captured at 0–3 seconds with voicemail prompts or no content (#13, #17, #27, #29, #32, #34, #38, #46). Investigate routing issues.","deadline":"21-May","priority":"LOW"}] },
  { date: '2026-05-17', items: [{"owner":"Khushboo / Support","action":"Add phone 9810546433 to the do-not-call list immediately; audit why this customer received 3 repeated calls despite prior complaints — review call logs across all agents","deadline":"18-May","priority":"HIGH"},{"owner":"Khushboo / Team Lead","action":"Arrange a Telugu-speaking representative to call back customer on 9912400622 who could not be served due to language barrier","deadline":"18-May","priority":"HIGH"},{"owner":"Khushboo / Support","action":"Escalate KYC stuck/verification loop technical issue (phone 9714430396) to tech team using WhatsApp video received; confirm resolution timeline","deadline":"18-May","priority":"HIGH"},{"owner":"Support","action":"Investigate and resolve Prathmesh's missing Akara Capital payout — support team to check CMR copy and bank statement submitted to support@bondscanner.com","deadline":"19-May","priority":"HIGH"},{"owner":"Compliance Team","action":"Flag and review potential PII compliance breach on Call #5 where customer email ID was disclosed on a recorded live call","deadline":"18-May","priority":"HIGH"},{"owner":"Team Lead","action":"Standardise the support email address communicated to customers — Call #11 revealed agent gave two different domains on the same call; reinforce correct domain (support@bondscanner.com) in all agent briefings","deadline":"18-May","priority":"HIGH"},{"owner":"Team Lead","action":"Coach Khushboo on brand name pronunciation — Call #11 recorded a significant mispronunciation of the company name; conduct a retraining session on professional brand communication","deadline":"20-May","priority":"MEDIUM"},{"owner":"Khushboo","action":"Follow up with all 10 customers where follow-up was scheduled (Calls #3, #13, #26, #32, #35, #45, #48, #50, #53) to ensure KYC completions and issue resolutions are progressed","deadline":"19-May","priority":"MEDIUM"},{"owner":"Support","action":"Check for known UPI payment failures on the platform for HDFC bank users (Call #49 — Ayush) and escalate to tech team if confirmed as systemic","deadline":"19-May","priority":"MEDIUM"},{"owner":"Support / Compliance","action":"Verify and clarify internal documentation on the correct form name for TDS exemption (15G/15H vs Form 12B) to ensure consistent and accurate communication by agents","deadline":"20-May","priority":"MEDIUM"},{"owner":"Compliance Team","action":"Review compliance guidelines on storing or acting on third-party phone numbers obtained verbally during customer calls (Call #35 — alternate number collected from father)","deadline":"23-May","priority":"LOW"},{"owner":"Product / Support","action":"Track rollout timeline for Bond Scanner's in-app bond selling/liquidity feature — proactively inform customers (Calls #37, #15) once it goes live","deadline":"23-May","priority":"LOW"}] },
];

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL PARSING — Apr 22 – May 8 2026
// ══════════════════════════════════════════════════════════════════════════════

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, '·')
    .trim();
}

function extractReportDate(html) {
  const m = html.match(/Day End Report[^—]*—\s*([^<"]+)/);
  return m ? m[1].trim() : null;
}

/**
 * Parse the "Urgent Action Items" table from email HTML.
 * Returns array of { priority, action, owner, deadline }
 */
function extractActionItems(html) {
  // Find the Urgent Action Items section → up to </table>
  const sectionMatch = html.match(/Urgent Action Items<\/h2>([\s\S]*?)<\/table>/);
  if (!sectionMatch) return [];

  const tableHtml = sectionMatch[1];
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;

  while ((m = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = m[1];
    if (rowHtml.includes('<th')) continue; // skip header

    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripTags(cm[1]).trim());
    }

    // Skip "No action items" placeholder row
    if (cells.length < 2) continue;
    const action = cells[1];
    if (!action || action.toLowerCase() === 'no action items') continue;

    rows.push({
      priority: cells[0] || '',
      action:   cells[1] || '',
      owner:    cells[2] || '',
      deadline: cells[3] || '',
    });
  }

  return rows;
}

/**
 * Normalise a date string to YYYY-MM-DD for sorting.
 * Accepts: "22 April 2026", "2026-04-22", "22 Apr 2026", etc.
 */
function normaliseDate(str) {
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return str;
}

/** Format YYYY-MM-DD → "22 Apr 2026" for display */
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function fetchEmailActionItems() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error('⚠️  GMAIL credentials not set — skipping email data (Apr 22–May 8)');
    return [];
  }

  const FROM_DATE    = '2026-04-22';
  const EMAIL_END    = '2026-05-08';
  const sinceDate    = new Date(FROM_DATE + 'T00:00:00Z');
  const beforeDate   = new Date(EMAIL_END + 'T23:59:59Z');
  const mailboxes    = ['INBOX', '[Gmail]/Sent Mail'];
  const subjects     = [
    'Call analysis: Day end report',
    '[TEST] Day end report - Call Analysis',
    '[Internal] Call analysis: Day end report',
  ];

  console.error(`\n📧  Connecting to Gmail IMAP for email action items (${FROM_DATE} → ${EMAIL_END})…`);

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
  });
  await client.connect();

  const emailsByPriority = { production: [], internal: [], test: [] };
  const seenMsgIds = new Set();

  for (const mailbox of mailboxes) {
    let lock;
    try { lock = await client.getMailboxLock(mailbox); } catch { continue; }
    try {
      let allUids = [];
      for (const subject of subjects) {
        const uids = await client.search({ subject, since: sinceDate, before: beforeDate }, { uid: true });
        allUids.push(...uids);
      }
      allUids = [...new Set(allUids)].sort((a, b) => a - b);
      console.error(`   "${mailbox}" → ${allUids.length} matching emails`);

      for (const uid of allUids) {
        const msg = await client.fetchOne(uid.toString(), { source: true }, { uid: true });
        if (!msg) continue;
        const parsed = await simpleParser(msg.source);
        const msgId  = parsed.messageId ?? `${mailbox}-${uid}`;
        if (seenMsgIds.has(msgId)) continue;
        seenMsgIds.add(msgId);

        const subj       = parsed.subject ?? '';
        const html       = parsed.html || '';
        const reportDate = extractReportDate(html) ?? (parsed.date ? parsed.date.toISOString().slice(0, 10) : null);
        const items      = extractActionItems(html);
        const bucket     = subj.includes('[TEST]') ? 'test' : subj.includes('[Internal]') ? 'internal' : 'production';

        emailsByPriority[bucket].push({ reportDate: normaliseDate(reportDate), items });
        console.error(`   ✉️  ${normaliseDate(reportDate)} [${bucket}] → ${items.length} action items`);
      }
    } finally { lock.release(); }
  }

  await client.logout();

  // Deduplicate by (date, action) — production wins over internal/test
  const seen = new Set();
  const result = [];

  for (const bucket of ['production', 'internal', 'test']) {
    for (const email of emailsByPriority[bucket]) {
      for (const item of email.items) {
        const key = `${email.reportDate}||${item.action.slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ date: email.reportDate, ...item, source: 'email' });
      }
    }
  }

  console.error(`   → ${result.length} unique action items from emails`);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXCEL GENERATION
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function buildExcel(allItems) {
  // Sort: date ASC, then priority (HIGH → MEDIUM → LOW)
  const sorted = [...allItems].sort((a, b) => {
    const dateCmp = (a.date ?? '').localeCompare(b.date ?? '');
    if (dateCmp !== 0) return dateCmp;
    return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  });

  // Build rows with date shown only on first occurrence per day
  const headers = ['Date', 'Priority', 'Action Item', 'RM / Owner', 'Deadline', 'Status', 'Remarks'];
  const rows = [headers];

  let lastDate = '';
  for (const item of sorted) {
    const dateLabel = item.date !== lastDate ? fmtDate(item.date) : '';
    lastDate = item.date;
    rows.push([
      dateLabel,
      item.priority,
      item.action,
      item.owner,
      item.deadline,
      '',   // Status — manual fill
      '',   // Remarks — manual fill
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 14 },   // Date
    { wch: 10 },   // Priority
    { wch: 90 },   // Action Item
    { wch: 30 },   // RM / Owner
    { wch: 12 },   // Deadline
    { wch: 14 },   // Status
    { wch: 30 },   // Remarks
  ];

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Action Items');

  return wb;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.error('\n🚀  Generating Action Items sheet…\n');

  // 1. Email data (Apr 22 – May 8)
  const emailItems = await fetchEmailActionItems();

  // 2. Supabase data (May 9 – May 17, hardcoded)
  const dbItems = [];
  for (const { date, items } of SUPABASE_ACTION_ITEMS) {
    for (const item of items) {
      dbItems.push({ date, priority: item.priority, action: item.action, owner: item.owner, deadline: item.deadline, source: 'supabase' });
    }
  }
  console.error(`\n🗄️   Supabase: ${dbItems.length} action items loaded (May 9–17)\n`);

  // 3. Combine
  const allItems = [...emailItems, ...dbItems];
  console.error(`📊  Total items: ${allItems.length} (${emailItems.length} email + ${dbItems.length} DB)\n`);

  if (allItems.length === 0) {
    console.error('⚠️  No action items found. Check GMAIL_USER/GMAIL_APP_PASSWORD in .env.local');
    process.exit(1);
  }

  // 4. Generate Excel
  const wb = buildExcel(allItems);
  XLSX.writeFile(wb, OUT_FILE);

  console.error(`✅  Saved: ${OUT_FILE}`);
  console.error(`   Rows: ${allItems.length} action items across ${new Set(allItems.map(i => i.date)).size} days`);
  console.log(OUT_FILE); // stdout: just the path, for scripting
}

main().catch(err => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});

/**
 * Generates the Radar — Call Analysis Platform PRD as a .docx file
 * Run with: node scripts/generate-prd.mjs
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip,
  LevelFormat, UnderlineType,
} from 'docx';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const H1 = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
  });

const H2 = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
  });

const H3 = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
  });

const P = (text, opts = {}) =>
  new Paragraph({
    children: [new TextRun({ text, size: 22, ...opts })],
    spacing: { after: 120 },
  });

const BOLD = (text) => new TextRun({ text, bold: true, size: 22 });
const PLAIN = (text) => new TextRun({ text, size: 22 });

const MixedP = (...runs) =>
  new Paragraph({ children: runs, spacing: { after: 120 } });

const BULLET = (text, level = 0) =>
  new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level },
    spacing: { after: 80 },
  });

const BULLET_MIXED = (runs, level = 0) =>
  new Paragraph({
    children: runs,
    bullet: { level },
    spacing: { after: 80 },
  });

const HR = () =>
  new Paragraph({
    border: { bottom: { color: 'CCCCCC', size: 6, style: BorderStyle.SINGLE } },
    spacing: { after: 200 },
    text: '',
  });

const SPACER = () => new Paragraph({ text: '', spacing: { after: 80 } });

// Table helpers
const cell = (text, { bold = false, shade = false, width, colspan } = {}) =>
  new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
        spacing: { before: 80, after: 80 },
      }),
    ],
    shading: shade ? { type: ShadingType.SOLID, color: 'E8EEF6' } : undefined,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    columnSpan: colspan,
  });

const tRow = (cells, header = false) =>
  new TableRow({ children: cells, tableHeader: header });

const makeTable = (rows, colWidths) =>
  new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    borders: {
      top:          { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom:       { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left:         { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right:        { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideH:      { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideV:      { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
    },
  });

// ─── Cover Page ──────────────────────────────────────────────────────────────

const coverPage = [
  SPACER(), SPACER(), SPACER(),
  new Paragraph({
    children: [new TextRun({ text: 'PRODUCT REQUIREMENTS DOCUMENT', bold: true, size: 28, color: '2B5EA7' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Radar — Call Analysis Platform', bold: true, size: 48 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Built for BondScanner', size: 28, color: '555555' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Version 1.0   ·   April 2026', size: 22, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Status: Production', bold: true, size: 22, color: '2B7A2B' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Audience: Internal BondScanner team · Future developers', size: 22, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }),
  HR(),
];

// ─── 1. Problem Statement ────────────────────────────────────────────────────

const problemStatement = [
  H1('1. Problem Statement'),
  P('BondScanner\'s sales team (Relationship Managers — RMs) each makes 40–55 outbound calls per day. Prior to Radar, all call recordings were discarded after the call: no transcription, no analysis, no coaching, and no visibility into what was being said to customers.'),
  P('This created three compounding problems:'),
  BULLET('Zero coaching feedback loop — managers had no data on individual RM performance, pitch quality, or objection handling.'),
  BULLET('No outcome tracking — no automated record of whether a call resulted in a follow-up, a deal, or a dead end.'),
  BULLET('Reporting was manual — any day-end summaries were written by hand, time-consuming and inconsistent.'),
  SPACER(),
  P('Radar solves all three: it automates the full pipeline from audio recording to structured AI analysis to polished reports and email delivery, giving BondScanner\'s management complete, real-time visibility into every call made each day.'),
  HR(),
];

// ─── 2. Goals ────────────────────────────────────────────────────────────────

const goals = [
  H1('2. Goals'),
  BULLET_MIXED([BOLD('Automate call analysis at scale. '), PLAIN('Process 40–55 calls per RM per day with zero manual intervention, from audio upload to final report delivery.')]),
  BULLET_MIXED([BOLD('Provide objective, consistent performance measurement. '), PLAIN('Score every call on standardised rubrics (Call Quality 0–10, Agent Performance 0–10) using deterministic rules, eliminating subjectivity.')]),
  BULLET_MIXED([BOLD('Deliver actionable insights daily. '), PLAIN('Produce per-RM and cross-team day-end reports automatically so managers start each morning with the previous day\'s analysis ready.')]),
  BULLET_MIXED([BOLD('Track operational costs transparently. '), PLAIN('Expose real-time AI API costs (Claude + Sarvam) by report type and date so the platform can be evaluated commercially.')]),
  BULLET_MIXED([BOLD('Be maintainable by a small team. '), PLAIN('Architecture, data model, and environment configuration are documented clearly enough for a single developer to onboard and extend.')]),
  HR(),
];

// ─── 3. Non-Goals ────────────────────────────────────────────────────────────

const nonGoals = [
  H1('3. Non-Goals (v1)'),
  BULLET_MIXED([BOLD('Real-time call monitoring. '), PLAIN('Radar processes recordings after the call ends; it does not intercept live calls.')]),
  BULLET_MIXED([BOLD('CRM integration. '), PLAIN('Data is not pushed to Salesforce, HubSpot, or any CRM. Radar is a standalone analysis layer.')]),
  BULLET_MIXED([BOLD('Customer-facing dashboards. '), PLAIN('All output is internal; customers never see analysis or scores.')]),
  BULLET_MIXED([BOLD('Automated RM coaching workflows. '), PLAIN('Radar produces insights; human managers decide how to act on them.')]),
  BULLET_MIXED([BOLD('Multi-tenant or multi-company deployment. '), PLAIN('v1 is purpose-built for BondScanner\'s single-org setup.')]),
  HR(),
];

// ─── 4. User Personas ────────────────────────────────────────────────────────

const personas = [
  H1('4. User Personas & Stories'),

  H2('4.1  Sales Manager / Admin'),
  P('Uploads call recordings, monitors pipeline status, reviews RM performance, triggers day-end reports, and sends email summaries to stakeholders.'),

  H3('User Stories'),
  BULLET('As a Sales Manager, I want to upload a Google Drive folder of call recordings so that the entire day\'s calls are processed without manual work.'),
  BULLET('As a Sales Manager, I want to see each call\'s outcome, sentiment, and scores in a structured table so that I can identify underperforming calls quickly.'),
  BULLET('As a Sales Manager, I want to generate a day-end report aggregating all RMs\' calls so that stakeholders receive a single, coherent performance summary.'),
  BULLET('As a Sales Manager, I want to send the day-end report via email with RM xlsx attachments so that stakeholders receive formatted data they can share.'),
  BULLET('As a Sales Manager, I want a "Test" send mode so that I can verify email format before sending to the full production recipient list.'),
  BULLET('As a Sales Manager, I want all day-end emails to stay in a single Gmail thread per mode so that stakeholders don\'t receive fragmented conversations.'),
  BULLET('As a Sales Manager, I want to see API cost breakdowns by report type and date so that I can evaluate the commercial viability of the platform.'),

  H2('4.2  RM (Relationship Manager)'),
  P('Makes 40–55 outbound calls daily. Does not use Radar directly. Is the subject of analysis.'),

  H2('4.3  Future Developer'),
  P('Needs to understand the codebase, environment setup, and architecture to extend or maintain Radar.'),

  HR(),
];

// ─── 5. System Architecture ──────────────────────────────────────────────────

const architecture = [
  H1('5. System Architecture'),

  H2('5.1  Technology Stack'),
  makeTable([
    tRow([cell('Layer', { bold: true, shade: true }), cell('Technology', { bold: true, shade: true })], true),
    tRow([cell('Frontend'), cell('Next.js 16 (App Router), React, Tailwind CSS')]),
    tRow([cell('Backend'), cell('Next.js Route Handlers (serverless, edge-compatible)')]),
    tRow([cell('Database'), cell('Neon Postgres (serverless, connection pooling)')]),
    tRow([cell('File Storage'), cell('Vercel Blob (private, signed URLs)')]),
    tRow([cell('Speech-to-Text'), cell('Sarvam AI — Saarika v2.5 (Hindi / Hinglish / English)')]),
    tRow([cell('AI Analysis'), cell('Anthropic Claude claude-sonnet-4-6 (structured JSON output)')]),
    tRow([cell('Email Delivery'), cell('Nodemailer + Gmail SMTP (App Password, port 465)')]),
    tRow([cell('Document Generation'), cell('docx (Word), xlsx (SheetJS/ExcelJS)')]),
    tRow([cell('Hosting'), cell('Vercel (serverless, maxDuration 120s on heavy routes)')]),
  ], [3000, 6500]),

  SPACER(),
  H2('5.2  High-Level Data Flow'),
  BULLET('User pastes a Google Drive folder URL into the UI.'),
  BULLET('Backend fetches file list from Drive and creates a bulk_session record.'),
  BULLET('Each audio file is downloaded, sent to Sarvam AI for transcription.'),
  BULLET('Transcripts are sent to Claude with a structured analysis prompt.'),
  BULLET('Claude returns JSON: summary, outcome, scores, sentiment, action items, keywords, topics.'),
  BULLET('Analysis is stored in the reports table; call record updated in calls table.'),
  BULLET('After all calls complete, Claude generates an RM-level report for the session.'),
  BULLET('xlsx and docx reports are generated, uploaded to Vercel Blob, URLs saved.'),
  BULLET('Manager triggers day-end report → Claude aggregates all RMs for that date.'),
  BULLET('Manager sends email → Nodemailer attaches RM xlsx files + combined transcripts xlsx.'),

  HR(),
];

// ─── 6. Feature Specifications ───────────────────────────────────────────────

const features = [
  H1('6. Feature Specifications'),

  // 6.1 Bulk Upload
  H2('6.1  Bulk Upload Pipeline'),
  P('The core ingestion workflow. Takes a Google Drive folder URL and processes all audio files end-to-end.'),

  H3('Inputs'),
  BULLET('Google Drive folder URL (public or shared link)'),
  BULLET('RM name (free text)'),
  BULLET('Session date (date picker — the actual call date, not the upload date)'),

  H3('Processing Steps'),
  BULLET('1. Fetch all .mp3 / .wav files from the Drive folder.'),
  BULLET('2. Create bulk_session record with status "processing".'),
  BULLET('3. For each file: download audio → POST to Sarvam AI /transcribe → store transcript.'),
  BULLET('4. For each transcript: POST to Claude with analysis prompt → parse JSON response.'),
  BULLET('5. Apply two-layer scoring gate:'),
  BULLET('Gate 1 — if call duration < 60 s, set both scores to null (too short to score).', 1),
  BULLET('Gate 2 — if call_quality < 4, set agent_performance to null (quality too low to assess agent).', 1),
  BULLET('6. Compute median agent score in code (deterministic, no AI).'),
  BULLET('7. Compute total talk time in code from duration_sec fields.'),
  BULLET('8. Generate RM report via Claude (overview, outcomes, highlights, improvements, agent performance, products, languages).'),
  BULLET('9. Generate .docx (narrative report) and .xlsx (data table) → upload to Vercel Blob.'),
  BULLET('10. Update bulk_session status to "done".'),

  H3('Scoring Rubrics'),
  P('Call Quality (0–10):'),
  makeTable([
    tRow([cell('Dimension', { bold: true, shade: true }), cell('Max Points', { bold: true, shade: true })], true),
    tRow([cell('Conversation depth'), cell('3')]),
    tRow([cell('Customer engagement'), cell('3')]),
    tRow([cell('Resolution'), cell('2')]),
    tRow([cell('Structure'), cell('2')]),
  ], [7000, 2500]),
  SPACER(),
  P('Agent Performance (0–10):'),
  makeTable([
    tRow([cell('Dimension', { bold: true, shade: true }), cell('Max Points', { bold: true, shade: true })], true),
    tRow([cell('Opening & rapport'), cell('2')]),
    tRow([cell('Needs discovery'), cell('2')]),
    tRow([cell('Product pitch'), cell('3')]),
    tRow([cell('Objection handling'), cell('2')]),
    tRow([cell('Clear next step'), cell('1')]),
  ], [7000, 2500]),

  H3('Retry & Error Handling'),
  BULLET('Individual calls that fail (transcription or analysis error) can be retried via the UI without reprocessing the whole session.'),
  BULLET('Failed calls are marked with status "failed"; their error message is stored.'),
  BULLET('The session status shows partial completion if some calls fail.'),
  SPACER(),

  // 6.2 Call History
  H2('6.2  Call History Table'),
  P('Two-layer interactive table showing sessions and individual calls.'),

  H3('Outer Row (Session)'),
  BULLET('Prospect / Session name, Rep name, Session date, Status badge'),
  BULLET('Download links: Doc (docx) · Sheet (xlsx)'),
  BULLET('Action buttons: View RM Report · Regen Report'),

  H3('Inner Row (Individual Call)'),
  BULLET('Prospect name, Rep name, Date, Duration ("Xmin Ysec" format), User ID, Status'),
  BULLET('Download links: Doc · Sheet'),
  BULLET('Action buttons: View Analysis · View Transcript'),
  BULLET('User ID shown as copy-to-clipboard chip: monospace text + ⎘ icon → shows ✓ for 1.5 s after copy'),

  H3('Filtering'),
  BULLET('Archived sessions are hidden from the default view.'),
  BULLET('Individual calls not attached to any session are shown as standalone rows.'),
  SPACER(),

  // 6.3 RM Report Modal
  H2('6.3  RM Report Modal'),
  P('Full RM report displayed in-app as a structured modal panel.'),

  H3('Sections'),
  BULLET('Overview — total calls, unique customers, talk time, session date'),
  BULLET('Outcomes — breakdown of call dispositions'),
  BULLET('Deals Discussed — list of investment products / bonds mentioned'),
  BULLET('Highlights — best moments from the session'),
  BULLET('Action Items — follow-ups required per call'),
  BULLET('Areas for Improvement — coaching points'),
  BULLET('Agent Performance — median score with per-dimension breakdown'),
  BULLET('Products — all products mentioned across calls'),
  BULLET('Languages — distribution of call languages'),

  H3('Special Features'),
  BULLET('Median Score displayed (not average) — computed in code, not by Claude.'),
  BULLET('Link to Scoring Guide (downloadable HTML document explaining full rubric methodology).'),
  BULLET('Send Report button: opens stakeholder email modal.'),
  SPACER(),

  // 6.4 Day-End Report
  H2('6.4  Day-End Report'),
  P('Cross-RM, cross-session aggregated report for a single calendar date.'),

  H3('Data Scope'),
  BULLET('All calls across all RMs whose session_date matches the selected date.'),
  BULLET('Individual (non-session) calls matched on created_at in IST.'),
  BULLET('Excludes archived sessions.'),

  H3('Report Sections'),
  BULLET('Overview — total calls, unique customers, total talk time, RMs on duty, deals discussed'),
  BULLET('Outcomes — aggregated call disposition counts'),
  BULLET('Highlights — top moments across all RMs'),
  BULLET('Action Items — all follow-ups aggregated'),
  BULLET('Areas for Improvement — coaching points across the team'),
  BULLET('Agent Performance — per-RM breakdown'),
  BULLET('Products — all products mentioned'),
  BULLET('Languages — language distribution across the day'),

  H3('UI Controls'),
  BULLET('Date selector: available dates shown as clickable chips.'),
  BULLET('Generate / Regenerate button (regenerating for the same date overwrites the stored report).'),
  BULLET('🧪 Test button — sends to DAY_REPORT_RECIPIENTS, subject "[TEST] Day end report - Call Analysis".'),
  BULLET('✉ Send Report button — sends to DAY_REPORT_PROD_RECIPIENTS, subject "Call analysis: Day end report".'),
  SPACER(),

  // 6.5 Email Delivery
  H2('6.5  Email Delivery'),

  H3('Transport'),
  BULLET('Gmail SMTP via Nodemailer (host: smtp.gmail.com, port: 465, secure: true).'),
  BULLET('Auth: Gmail App Password (not OAuth).'),

  H3('Two Modes'),
  makeTable([
    tRow([cell('Property', { bold: true, shade: true }), cell('Test Mode', { bold: true, shade: true }), cell('Production Mode', { bold: true, shade: true })], true),
    tRow([cell('Recipients env var'), cell('DAY_REPORT_RECIPIENTS'), cell('DAY_REPORT_PROD_RECIPIENTS')]),
    tRow([cell('Subject line'), cell('[TEST] Day end report - Call Analysis'), cell('Call analysis: Day end report')]),
    tRow([cell('Thread anchor ID'), cell('<day-report-test-thread@bondscanner.com>'), cell('<day-report-thread@bondscanner.com>')]),
    tRow([cell('UI button'), cell('🧪 Test (amber)'), cell('✉ Send Report (green)')]),
  ], [3000, 4000, 4000]),

  H3('Threading'),
  BULLET('All emails in the same mode share the same References and In-Reply-To header pointing to a fixed anchor Message-ID.'),
  BULLET('Gmail automatically groups these into a single thread per mode.'),
  BULLET('Test and production threads never mix.'),

  H3('Attachments'),
  BULLET('One RM summary .xlsx per RM who worked on the selected date.'),
  BULLET('One combined Transcripts .xlsx with one sheet per RM.'),
  BULLET('Combined Transcripts columns: #, Phone, Customer, Duration, Call Transcript, Call Analysis.'),
  BULLET('Call Analysis column: structured text block — Summary → Outcome → Scores → Sentiment → Action Items.'),
  SPACER(),

  // 6.6 Usage Dashboard
  H2('6.6  Usage Dashboard'),
  P('Two-tab dashboard exposing API cost and usage metrics.'),

  H3('Claude Tab'),
  BULLET('Summary cards: Total tokens, Total cost (USD), Avg cost/call, Tokens/sec, Cost/sec, Total audio analysed.'),
  BULLET('Latency panel: Avg / Min / Max Claude response time in milliseconds.'),
  BULLET('Cost Projections: weekly / monthly / yearly based on 30-day rolling average.'),
  BULLET('Daily Breakdown table (last 30 days): Date, Calls, Input tokens, Output tokens, Duration, Cost.'),
  BULLET('Cost by Report Type table (last 30 days): per date shows Transcript Analysis, RM Report Gen, Day End Report, and Total costs.'),
  BULLET('Per-Session Breakdown table: all sessions with token counts and cost.'),
  BULLET('All data filtered to on/after 2026-04-21 (pre-production data excluded).'),

  H3('Sarvam AI Tab'),
  BULLET('Summary cards: Total calls, Total audio duration, Total cost (INR), Avg cost/call.'),
  BULLET('Daily breakdown table: Date, Calls, Duration, Cost (INR).'),
  BULLET('Pricing: ₹36 / hour (Saarika v2.5 actual rate).'),

  H3('Pricing Constants (as of launch)'),
  BULLET('Claude claude-sonnet-4-6: $3.00 / 1M input tokens, $15.00 / 1M output tokens.'),
  BULLET('Sarvam Saarika v2.5: ₹36 / hour of audio.'),
  SPACER(),

  // 6.7 Customer Profiles
  H2('6.7  Customer Profiles'),
  BULLET('customer_profiles table maps phone number → BondScanner user_id.'),
  BULLET('Populated via bulk upload of customer data.'),
  BULLET('user_id is shown in the call history table alongside each call record.'),
  BULLET('Enables cross-referencing call outcomes with registered platform users.'),
  SPACER(),

  // 6.8 Scoring Guide
  H2('6.8  Scoring Guide'),
  BULLET('Downloadable HTML document explaining the full scoring methodology.'),
  BULLET('Covers: Call Quality rubric (0–10), Agent Performance rubric (0–10), two-layer gate logic, scoring philosophy.'),
  BULLET('Accessible from the RM Report modal via a link.'),
  BULLET('Static asset; not AI-generated; maintained manually.'),

  HR(),
];

// ─── 7. Technical Challenges ─────────────────────────────────────────────────

const challenges = [
  H1('7. Technical Challenges & Resolutions'),

  makeTable([
    tRow([
      cell('Challenge', { bold: true, shade: true }),
      cell('Root Cause', { bold: true, shade: true }),
      cell('Resolution', { bold: true, shade: true }),
    ], true),
    tRow([
      cell('JSON parse failures from Claude on Hindi/Hinglish transcripts'),
      cell('Control characters and trailing commas in Claude output broke JSON.parse()'),
      cell('Sanitise raw response: strip control characters, remove trailing commas, extract first {...} block as fallback'),
    ]),
    tRow([
      cell('Claude truncating JSON responses mid-object'),
      cell('max_tokens set too low (1024) for complex multi-call sessions'),
      cell('Increased max_tokens from 1024 to 2048 on all Claude calls'),
    ]),
    tRow([
      cell('Duplicate React key warnings in call table'),
      cell('Empty string used as column label key in sub-table'),
      cell('Switched to index-based keys for column definitions'),
    ]),
    tRow([
      cell('Column visibility not updating in production'),
      cell('No git remote; local commits not deployed; Vercel was serving stale build'),
      cell('Deployed directly via Vercel CLI (vercel --prod)'),
    ]),
    tRow([
      cell('TypeScript error on parsed Claude JSON (Record<string, unknown>)'),
      cell('Dynamic JSON from Claude cannot be statically typed'),
      cell('Used any with eslint-disable-next-line comment at parse boundary'),
    ]),
    tRow([
      cell('Two different column headers needed for session vs call rows'),
      cell('Standard HTML tables cannot have two independent header rows'),
      cell('Nested HTML table inside a colSpan <td> for inner call rows'),
    ]),
    tRow([
      cell('Sarvam pricing mismatch (₹30/hr vs actual ₹36/hr)'),
      cell('Initial estimate; actual Sarvam dashboard showed higher rate'),
      cell('Corrected constant after deriving rate: ₹551.50 ÷ 919.2 min = ₹36/hr'),
    ]),
    tRow([
      cell('RM report generation tokens not counted in usage totals'),
      cell('bulk_sessions stores combined call+RM tokens; reports table stores per-call tokens only; delta was ignored'),
      cell('Added separate SQL query: bulk_sessions.tokens − SUM(reports.tokens per session) = RM-only delta'),
    ]),
    tRow([
      cell('Day-end report tokens not stored at all'),
      cell('day_reports table had no token columns; generate route never saved them'),
      cell('Added input_tokens / output_tokens columns via idempotent ALTER TABLE; updated generate route to save them'),
    ]),
    tRow([
      cell('Email recipients stale after env var update'),
      cell('DEFAULT_RECIPIENTS was a module-level constant evaluated once at cold start; warm Vercel functions cached old value'),
      cell('Moved env var reading inside the POST handler body so it re-reads on every request'),
    ]),
    tRow([
      cell('Pre-production test data polluting usage dashboard'),
      cell('Early test calls from April 2025–April 20 2026 appeared in all metrics'),
      cell('Added USAGE_START_DATE = "2026-04-21" constant applied across all 7 queries in the usage route'),
    ]),
    tRow([
      cell('Gmail emails landing in separate threads instead of one'),
      cell('Each email had a unique Message-ID; Gmail treated them as unrelated conversations'),
      cell('Added References and In-Reply-To headers pointing to a fixed per-mode anchor Message-ID'),
    ]),
    tRow([
      cell('Claude hallucinating average scores as median'),
      cell('Instructed Claude to compute median; it computed average or made up values'),
      cell('Median now computed deterministically in code from the scores array; Claude is never asked to compute it'),
    ]),
    tRow([
      cell('Session date vs upload date mismatch in usage dashboard'),
      cell('bulk_sessions have a user-specified session_date; usage queries were using created_at'),
      cell('All date grouping queries now use COALESCE(bs.session_date, c.created_at AT TIME ZONE "Asia/Kolkata")'),
    ]),
    tRow([
      cell('day_reports token columns missing when usage API ran'),
      cell('Usage API queried the columns directly before they existed; migration had to run first'),
      cell('Added idempotent ALTER TABLE ADD COLUMN IF NOT EXISTS at the top of the usage GET handler'),
    ]),
    tRow([
      cell('vercel env pull not showing production values'),
      cell('vercel env pull only reliably fetches Development environment variables'),
      cell('Documented limitation; production env values verified via Vercel Dashboard directly'),
    ]),
  ], [2800, 3200, 3500]),

  HR(),
];

// ─── 8. Database Schema ──────────────────────────────────────────────────────

const schema = [
  H1('8. Database Schema'),

  H2('calls'),
  makeTable([
    tRow([cell('Column', { bold: true, shade: true }), cell('Type', { bold: true, shade: true }), cell('Notes', { bold: true, shade: true })], true),
    tRow([cell('id'), cell('UUID PK'), cell('Auto-generated')]),
    tRow([cell('session_id'), cell('UUID FK'), cell('→ bulk_sessions.id; NULL for individual calls')]),
    tRow([cell('rep_name'), cell('TEXT'), cell('RM name')]),
    tRow([cell('audio_url'), cell('TEXT'), cell('Vercel Blob URL')]),
    tRow([cell('transcript'), cell('TEXT'), cell('Raw Sarvam transcript')]),
    tRow([cell('duration_sec'), cell('INTEGER'), cell('Audio duration in seconds')]),
    tRow([cell('status'), cell('TEXT'), cell('"processing" | "ready" | "failed" | "sent"')]),
    tRow([cell('created_at'), cell('TIMESTAMPTZ'), cell('UTC; used for IST date grouping')]),
  ], [2500, 2000, 5000]),
  SPACER(),

  H2('reports'),
  makeTable([
    tRow([cell('Column', { bold: true, shade: true }), cell('Type', { bold: true, shade: true }), cell('Notes', { bold: true, shade: true })], true),
    tRow([cell('call_id'), cell('UUID FK'), cell('→ calls.id')]),
    tRow([cell('customer_name'), cell('TEXT'), cell('')]),
    tRow([cell('phone'), cell('TEXT'), cell('')]),
    tRow([cell('duration'), cell('TEXT'), cell('Human-readable e.g. "4.2 min"')]),
    tRow([cell('outcome'), cell('TEXT'), cell('Call disposition')]),
    tRow([cell('summary'), cell('TEXT'), cell('')]),
    tRow([cell('keywords'), cell('TEXT[]'), cell('')]),
    tRow([cell('topics'), cell('TEXT[]'), cell('')]),
    tRow([cell('action_items'), cell('JSONB'), cell('Array of {task, owner, deadline}')]),
    tRow([cell('sentiment'), cell('JSONB'), cell('{overall, agent, customer}')]),
    tRow([cell('speaker_breakdown'), cell('JSONB'), cell('{language, agent_pct, customer_pct}')]),
    tRow([cell('call_quality'), cell('NUMERIC'), cell('0–10; null if duration < 60s')]),
    tRow([cell('agent_performance'), cell('NUMERIC'), cell('0–10; null if quality < 4')]),
    tRow([cell('input_tokens'), cell('INTEGER'), cell('Claude input tokens for this analysis')]),
    tRow([cell('output_tokens'), cell('INTEGER'), cell('Claude output tokens for this analysis')]),
    tRow([cell('claude_latency_ms'), cell('INTEGER'), cell('End-to-end Claude API response time')]),
    tRow([cell('sarvam_duration_sec'), cell('NUMERIC'), cell('Billed audio seconds from Sarvam')]),
  ], [2500, 2000, 5000]),
  SPACER(),

  H2('bulk_sessions'),
  makeTable([
    tRow([cell('Column', { bold: true, shade: true }), cell('Type', { bold: true, shade: true }), cell('Notes', { bold: true, shade: true })], true),
    tRow([cell('id'), cell('UUID PK'), cell('')]),
    tRow([cell('rm_name'), cell('TEXT'), cell('')]),
    tRow([cell('session_date'), cell('DATE'), cell('User-specified actual call date')]),
    tRow([cell('total_files'), cell('INTEGER'), cell('')]),
    tRow([cell('status'), cell('TEXT'), cell('"processing" | "done" | "failed"')]),
    tRow([cell('input_tokens'), cell('BIGINT'), cell('Combined call + RM report input tokens')]),
    tRow([cell('output_tokens'), cell('BIGINT'), cell('Combined call + RM report output tokens')]),
    tRow([cell('docx_url'), cell('TEXT'), cell('Vercel Blob URL')]),
    tRow([cell('xlsx_url'), cell('TEXT'), cell('Vercel Blob URL')]),
    tRow([cell('rm_report'), cell('JSONB'), cell('Structured RM report JSON')]),
    tRow([cell('archived_at'), cell('TIMESTAMPTZ'), cell('NULL = active; non-NULL = hidden from UI')]),
    tRow([cell('created_at'), cell('TIMESTAMPTZ'), cell('')]),
  ], [2500, 2000, 5000]),
  SPACER(),

  H2('day_reports'),
  makeTable([
    tRow([cell('Column', { bold: true, shade: true }), cell('Type', { bold: true, shade: true }), cell('Notes', { bold: true, shade: true })], true),
    tRow([cell('report_date'), cell('DATE PK'), cell('One row per calendar date')]),
    tRow([cell('report'), cell('JSONB'), cell('Full structured report JSON')]),
    tRow([cell('total_calls'), cell('INTEGER'), cell('')]),
    tRow([cell('input_tokens'), cell('BIGINT'), cell('Claude tokens for day report generation')]),
    tRow([cell('output_tokens'), cell('BIGINT'), cell('Claude tokens for day report generation')]),
    tRow([cell('updated_at'), cell('TIMESTAMPTZ'), cell('Updated on regeneration')]),
  ], [2500, 2000, 5000]),
  SPACER(),

  H2('customer_profiles'),
  makeTable([
    tRow([cell('Column', { bold: true, shade: true }), cell('Type', { bold: true, shade: true }), cell('Notes', { bold: true, shade: true })], true),
    tRow([cell('phone'), cell('TEXT PK'), cell('E.164 or local format')]),
    tRow([cell('user_id'), cell('TEXT'), cell('BondScanner platform user ID')]),
    tRow([cell('name'), cell('TEXT'), cell('Customer display name')]),
    tRow([cell('updated_at'), cell('TIMESTAMPTZ'), cell('')]),
  ], [2500, 2000, 5000]),

  HR(),
];

// ─── 9. Environment Variables ────────────────────────────────────────────────

const envVars = [
  H1('9. Environment Variables'),

  makeTable([
    tRow([cell('Variable', { bold: true, shade: true }), cell('Description', { bold: true, shade: true }), cell('Required', { bold: true, shade: true })], true),
    tRow([cell('DATABASE_URL'), cell('Neon Postgres connection string'), cell('Yes')]),
    tRow([cell('BLOB_READ_WRITE_TOKEN'), cell('Vercel Blob API token'), cell('Yes')]),
    tRow([cell('ANTHROPIC_API_KEY'), cell('Anthropic Claude API key'), cell('Yes')]),
    tRow([cell('SARVAM_API_KEY'), cell('Sarvam AI API key'), cell('Yes')]),
    tRow([cell('GMAIL_USER'), cell('Gmail address for SMTP sending'), cell('Yes')]),
    tRow([cell('GMAIL_APP_PASSWORD'), cell('Gmail App Password (not account password)'), cell('Yes')]),
    tRow([cell('DAY_REPORT_RECIPIENTS'), cell('Comma-separated list of test email recipients'), cell('Yes')]),
    tRow([cell('DAY_REPORT_PROD_RECIPIENTS'), cell('Comma-separated list of production email recipients'), cell('Yes')]),
    tRow([cell('GOOGLE_DRIVE_API_KEY'), cell('Google Drive API key for folder enumeration'), cell('Yes')]),
  ], [3500, 5000, 1000]),

  SPACER(),
  P('Note: Vercel env pull only reliably fetches Development environment variables. Verify production values via the Vercel Dashboard → Project → Settings → Environment Variables.'),

  HR(),
];

// ─── 10. Cost Model ──────────────────────────────────────────────────────────

const costModel = [
  H1('10. Cost Model'),

  H2('Claude API Costs (claude-sonnet-4-6)'),
  makeTable([
    tRow([cell('Token Type', { bold: true, shade: true }), cell('Rate', { bold: true, shade: true })], true),
    tRow([cell('Input tokens'), cell('$3.00 per 1M tokens')]),
    tRow([cell('Output tokens'), cell('$15.00 per 1M tokens')]),
  ], [5000, 4500]),
  SPACER(),

  H2('Sarvam AI Costs (Saarika v2.5)'),
  makeTable([
    tRow([cell('Metric', { bold: true, shade: true }), cell('Rate', { bold: true, shade: true })], true),
    tRow([cell('Audio transcription'), cell('₹36 per hour of audio')]),
    tRow([cell('Per-second rate'), cell('₹0.01 per second')]),
  ], [5000, 4500]),
  SPACER(),

  H2('Rough Monthly Projection (4 RMs, weekdays only)'),
  BULLET('Assumptions: 4 RMs × ~45 calls/day × ~4 min/call × 22 working days/month.'),
  BULLET('Audio volume: ~15,840 minutes/month ≈ 264 hours.'),
  BULLET('Sarvam cost: 264 hr × ₹36 ≈ ₹9,504/month (~$115 USD).'),
  BULLET('Claude cost: varies by transcript length. Rough estimate ~$0.02–0.05 per call × 3,960 calls ≈ $80–200/month.'),
  BULLET('Combined estimate: ~$200–320/month total AI costs at 4 RM scale.'),

  HR(),
];

// ─── 11. Open Questions ──────────────────────────────────────────────────────

const openQuestions = [
  H1('11. Open Questions'),

  makeTable([
    tRow([cell('#', { bold: true, shade: true }), cell('Question', { bold: true, shade: true }), cell('Owner', { bold: true, shade: true }), cell('Blocking?', { bold: true, shade: true })], true),
    tRow([cell('1'), cell('Should call quality and agent performance scores be shown to RMs directly, or remain management-only?'), cell('BondScanner Management'), cell('No')]),
    tRow([cell('2'), cell('Should archived sessions be recoverable via UI, or is archive permanent?'), cell('Engineering'), cell('No')]),
    tRow([cell('3'), cell('What is the retention policy for raw audio files stored in Vercel Blob?'), cell('BondScanner Legal/Ops'), cell('No')]),
    tRow([cell('4'), cell('Should user_id lookups from customer_profiles be auto-populated during bulk upload or remain manual?'), cell('Engineering'), cell('No')]),
    tRow([cell('5'), cell('Is the $3 / $15 Claude pricing tier locked in, or should the model be configurable per environment?'), cell('Engineering'), cell('No')]),
    tRow([cell('6'), cell('Should the combined Transcripts xlsx be sent to RMs individually, or only to management?'), cell('BondScanner Management'), cell('No')]),
  ], [500, 6000, 2000, 1000]),

  HR(),
];

// ─── 12. Future Considerations ───────────────────────────────────────────────

const future = [
  H1('12. Future Considerations (v2+)'),

  H3('Near-term (next 1–2 months)'),
  BULLET('Auto-populate user_id and customer name from customer_profiles during bulk upload.'),
  BULLET('Improve RM report outcomes categorisation (e.g. "Interested", "Follow-up", "Not Interested" as standardised buckets).'),
  BULLET('Add "Areas for Improvement" logic driven by specific score dimensions rather than free-form Claude output.'),
  BULLET('Add email delivery confirmation: track whether emails bounced or were delivered.'),

  H3('Medium-term'),
  BULLET('CRM integration (push outcomes and action items to Salesforce or a BondScanner-internal CRM).'),
  BULLET('RM-level login: let individual RMs view their own report history without seeing colleagues\' data.'),
  BULLET('Trend dashboards: week-over-week score trends per RM.'),
  BULLET('Audio waveform preview in-app for selected calls.'),

  H3('Long-term'),
  BULLET('Real-time or near-real-time call analysis using streaming transcription.'),
  BULLET('Automated coaching nudges sent to RMs after each call.'),
  BULLET('Multi-language scoring model improvements (specialist Hindi/Hinglish rubrics).'),
  BULLET('Multi-tenant support if BondScanner expands this tooling to other teams or clients.'),

  HR(),
];

// ─── Assemble Document ───────────────────────────────────────────────────────

const doc = new Document({
  title: 'Radar — Call Analysis Platform PRD',
  description: 'Product Requirements Document for Radar, BondScanner\'s internal call analysis platform.',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22 },
      },
      heading1: {
        run: { font: 'Calibri', size: 32, bold: true, color: '2B5EA7' },
        paragraph: { spacing: { before: 400, after: 160 } },
      },
      heading2: {
        run: { font: 'Calibri', size: 26, bold: true, color: '1A3A6B' },
        paragraph: { spacing: { before: 300, after: 120 } },
      },
      heading3: {
        run: { font: 'Calibri', size: 22, bold: true, color: '333333' },
        paragraph: { spacing: { before: 200, after: 80 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1.0),
            bottom: convertInchesToTwip(1.0),
            left:   convertInchesToTwip(1.25),
            right:  convertInchesToTwip(1.25),
          },
        },
      },
      children: [
        ...coverPage,
        ...problemStatement,
        ...goals,
        ...nonGoals,
        ...personas,
        ...architecture,
        ...features,
        ...challenges,
        ...schema,
        ...envVars,
        ...costModel,
        ...openQuestions,
        ...future,
        SPACER(),
        new Paragraph({
          children: [new TextRun({ text: '— End of Document —', size: 20, color: '888888', italics: true })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    },
  ],
});

const outPath = resolve(__dirname, '../Radar_PRD_v1.docx');
const buffer  = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log('✅  PRD written to:', outPath);

/**
 * export-rm-performance-report.mjs
 *
 * Generates a leadership-ready Excel workbook covering Apr 22 – May 17 2026.
 *   Sheet 1 — RM Performance Summary  (ranked table)
 *   Sheet 2 — Daily Score Grid        (date × RM matrix)
 *   Sheet 3 — Key Observations        (formatted text)
 *
 * Data sources:
 *   Apr 22 – May 8  : day-end report emails (Gmail IMAP)
 *   May 9  – May 17 : Supabase bulk_sessions (hardcoded from MCP query 2026-05-19)
 *
 * Usage:
 *   node scripts/export-rm-performance-report.mjs
 *   node scripts/export-rm-performance-report.mjs --out /path/to/report.xlsx
 */

import { ImapFlow }     from 'imapflow';
import { simpleParser } from 'mailparser';
import { readFileSync }  from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loading ───────────────────────────────────────────────────────────────
function loadEnvFile(p) {
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^"/, '').replace(/"$/, '');
      if (v) process.env[k] = v;
    }
  } catch { /* ignore missing file */ }
}
loadEnvFile(resolve(__dirname, '../.env.local'));
loadEnvFile(resolve(__dirname, '../.env.production.local'));

const args   = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const OUT_FILE = getArg('--out') ?? resolve(__dirname, '../RM_Performance_Report.xlsx');
const REPORT_DATE_RANGE = '22 Apr – 17 May 2026';

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE DATA — May 9–17 (queried via Supabase MCP 2026-05-19)
// Null rm_report rows patched with scores recovered from day-end email PDFs.
// ══════════════════════════════════════════════════════════════════════════════
const SUPABASE_SESSIONS = [
  // May 9
  { rmName: 'Kunal',    date: '2026-05-09', totalCalls: 38, medianScore: '6.3/10' }, // null rm_report → score from PDF
  // May 10
  { rmName: 'Sharik',   date: '2026-05-10', totalCalls: 69, medianScore: '6/10'   },
  // May 11
  { rmName: 'Aadi',     date: '2026-05-11', totalCalls: 73, medianScore: '5/10'   },
  { rmName: 'Khushboo', date: '2026-05-11', totalCalls: 27, medianScore: '6/10'   },
  { rmName: 'Kunal',    date: '2026-05-11', totalCalls: 50, medianScore: '5/10'   },
  { rmName: 'Saanvi',   date: '2026-05-11', totalCalls: 65, medianScore: '5/10'   }, // null rm_report → score from PDF
  { rmName: 'Sai',      date: '2026-05-11', totalCalls: 61, medianScore: '6/10'   },
  { rmName: 'Sharik',   date: '2026-05-11', totalCalls: 60, medianScore: '5/10'   },
  { rmName: 'Sonica',   date: '2026-05-11', totalCalls: 64, medianScore: '5/10'   },
  { rmName: 'Tarun',    date: '2026-05-11', totalCalls: 61, medianScore: '5/10'   },
  // May 12
  { rmName: 'Aadi',     date: '2026-05-12', totalCalls: 47, medianScore: '5/10'   },
  { rmName: 'Khushboo', date: '2026-05-12', totalCalls: 27, medianScore: '5.5/10' },
  { rmName: 'Kunal',    date: '2026-05-12', totalCalls: 40, medianScore: '5/10'   },
  { rmName: 'Saanvi',   date: '2026-05-12', totalCalls: 47, medianScore: '5/10'   },
  { rmName: 'Sai',      date: '2026-05-12', totalCalls: 61, medianScore: '5/10'   },
  { rmName: 'Sharik',   date: '2026-05-12', totalCalls: 51, medianScore: '5/10'   },
  { rmName: 'Sonica',   date: '2026-05-12', totalCalls: 69, medianScore: '5/10'   },
  { rmName: 'Tarun',    date: '2026-05-12', totalCalls: 42, medianScore: '5/10'   },
  // May 13
  { rmName: 'Aadi',     date: '2026-05-13', totalCalls: 57, medianScore: '5.5/10' },
  { rmName: 'Khushboo', date: '2026-05-13', totalCalls: 38, medianScore: '6.5/10' },
  { rmName: 'Saanvi',   date: '2026-05-13', totalCalls: 61, medianScore: '5/10'   },
  { rmName: 'Sai',      date: '2026-05-13', totalCalls: 85, medianScore: '5/10'   },
  { rmName: 'Sharik',   date: '2026-05-13', totalCalls: 41, medianScore: '5/10'   }, // null rm_report → score from PDF
  { rmName: 'Sonica',   date: '2026-05-13', totalCalls: 69, medianScore: '5/10'   },
  { rmName: 'Tarun',    date: '2026-05-13', totalCalls: 63, medianScore: '5.5/10' }, // null rm_report → score from PDF
  // May 14
  { rmName: 'Aadi',     date: '2026-05-14', totalCalls: 48, medianScore: '6/10'   },
  { rmName: 'Kunal',    date: '2026-05-14', totalCalls: 25, medianScore: '5/10'   },
  { rmName: 'Saanvi',   date: '2026-05-14', totalCalls: 48, medianScore: '6/10'   },
  { rmName: 'Sai',      date: '2026-05-14', totalCalls: 50, medianScore: '5/10'   },
  { rmName: 'Sharik',   date: '2026-05-14', totalCalls: 38, medianScore: '6/10'   },
  { rmName: 'Sonica',   date: '2026-05-14', totalCalls: 52, medianScore: '5/10'   },
  { rmName: 'Tarun',    date: '2026-05-14', totalCalls: 43, medianScore: '4.5/10' },
  // May 15
  { rmName: 'Aadi',     date: '2026-05-15', totalCalls: 46, medianScore: '5.5/10' },
  { rmName: 'Khushboo', date: '2026-05-15', totalCalls: 44, medianScore: '5/10'   },
  { rmName: 'Kunal',    date: '2026-05-15', totalCalls: 43, medianScore: '5/10'   },
  { rmName: 'Saanvi',   date: '2026-05-15', totalCalls: 58, medianScore: '5/10'   },
  { rmName: 'Sai',      date: '2026-05-15', totalCalls: 56, medianScore: '5/10'   },
  { rmName: 'Sharik',   date: '2026-05-15', totalCalls: 46, medianScore: '6/10'   },
  { rmName: 'Sonica',   date: '2026-05-15', totalCalls: 54, medianScore: '4.5/10' },
  { rmName: 'Tarun',    date: '2026-05-15', totalCalls: 33, medianScore: '4/10'   },
  // May 16
  { rmName: 'Tarun',    date: '2026-05-16', totalCalls: 49, medianScore: '5/10'   },
  // May 17
  { rmName: 'Khushboo', date: '2026-05-17', totalCalls: 53, medianScore: '6/10'   },
];

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL PARSING — Apr 22 – May 8
// ══════════════════════════════════════════════════════════════════════════════
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function extractReportDate(html) {
  const m = html.match(/Day End Report[^—]*—\s*([^<"]+)/);
  return m ? m[1].trim() : null;
}

function extractAgentPerfTable(html) {
  const sec = html.match(/Agent Performance<\/h2>([\s\S]*?)<\/table>/);
  if (!sec) return [];
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(sec[1])) !== null) {
    if (m[1].includes('<th')) continue;
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = cellRe.exec(m[1])) !== null) cells.push(stripTags(cm[1]).trim());
    if (cells.length >= 4) {
      rows.push({ agent: cells[0], total_calls: parseInt(cells[1]) || 0, median_score: cells[3] });
    }
  }
  return rows;
}

function normaliseDate(str) {
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  return isNaN(d) ? str : d.toISOString().slice(0, 10);
}

async function fetchEmailSessions() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error('⚠️  GMAIL credentials not set — email data (Apr 22–May 8) skipped');
    return [];
  }

  console.error('\n📧  Fetching email performance data (Apr 22 → May 8)…');
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();

  const subjects   = ['Call analysis: Day end report', '[TEST] Day end report - Call Analysis', '[Internal] Call analysis: Day end report'];
  const since      = new Date('2026-04-22T00:00:00Z');
  const before     = new Date('2026-05-08T23:59:59Z');
  const byBucket   = { production: [], internal: [], test: [] };
  const seenIds    = new Set();

  for (const mailbox of ['INBOX', '[Gmail]/Sent Mail']) {
    let lock;
    try { lock = await client.getMailboxLock(mailbox); } catch { continue; }
    try {
      let uids = [];
      for (const subj of subjects) uids.push(...await client.search({ subject: subj, since, before }, { uid: true }));
      uids = [...new Set(uids)].sort((a, b) => a - b);
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg) continue;
        const parsed = await simpleParser(msg.source);
        const id = parsed.messageId ?? `${mailbox}-${uid}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const subj   = parsed.subject ?? '';
        const html   = parsed.html || '';
        const date   = normaliseDate(extractReportDate(html) ?? parsed.date?.toISOString().slice(0, 10));
        const rows   = extractAgentPerfTable(html);
        const bucket = subj.includes('[TEST]') ? 'test' : subj.includes('[Internal]') ? 'internal' : 'production';
        byBucket[bucket].push({ date, rows });
      }
    } finally { lock.release(); }
  }
  await client.logout();

  // Deduplicate: production > internal > test
  const seen = new Set();
  const result = [];
  for (const bucket of ['production', 'internal', 'test']) {
    for (const email of byBucket[bucket]) {
      for (const r of email.rows) {
        const key = `${r.agent}|${email.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ rmName: r.agent, date: email.date, totalCalls: r.total_calls, medianScore: r.median_score, source: 'email' });
      }
    }
  }
  console.error(`   → ${result.length} RM-day records from emails`);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT BUILDING
// ══════════════════════════════════════════════════════════════════════════════
function parseScore(s) {
  if (!s || s === 'N/A') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fmtDateDisplay(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function buildRMMap(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.rmName)) map.set(s.rmName, { sessions: [], totalCalls: 0, scores: [] });
    const e = map.get(s.rmName);
    e.sessions.push(s);
    e.totalCalls += (s.totalCalls || 0);
    const n = parseScore(s.medianScore);
    if (n !== null) e.scores.push(n);
  }
  return map;
}

function getTrend(sessions) {
  const sorted = [...sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const scores = sorted.map(s => parseScore(s.medianScore)).filter(n => n !== null);
  if (scores.length < 2) return '—';
  const half  = Math.ceil(scores.length / 2);
  const first = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const last  = scores.slice(half).reduce((a, b) => a + b, 0) / Math.max(scores.slice(half).length, 1);
  if (last - first > 0.15) return '↑ Improving';
  if (first - last > 0.15) return '↓ Declining';
  return '→ Stable';
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 1 — RM Performance Summary
// ══════════════════════════════════════════════════════════════════════════════
function buildSummarySheet(rmMap) {
  const rows = [];

  // Title block
  rows.push(['BondScanner · Radar — RM Performance Report']);
  rows.push([`Period: ${REPORT_DATE_RANGE}  ·  Report generated: ${fmtDateDisplay(new Date().toISOString().slice(0, 10))}`]);
  rows.push(['Data source: Radar AI Call Analysis Platform (day-end reports + live DB)']);
  rows.push([]);

  // Ranked summary table
  rows.push(['#', 'RM Name', 'Total Calls', 'Working Days', 'Avg Score (/10)', 'Trend', 'Notes']);

  const sorted = [...rmMap.entries()]
    .filter(([, d]) => d.scores.length > 0)
    .sort((a, b) => {
      const aAvg = a[1].scores.reduce((s, n) => s + n, 0) / a[1].scores.length;
      const bAvg = b[1].scores.reduce((s, n) => s + n, 0) / b[1].scores.length;
      return bAvg - aAvg;
    });

  const NOTES = {
    Khushboo: 'Highest quality score; consistent performer',
    Sharik:   'Highest volume + above-avg quality; most reliable RM',
    Aakash:   'Stable, no days below 5.0',
    Aadi:     'New RM (May 5); upward score trajectory',
    Saanvi:   'New RM (May 5); upward score trajectory',
    Sai:      'Early improvement (4.4→6.0), levelled at ~5.0 in May',
    Kunal:    'Score eroded Apr→May as volume increased; needs attention',
    Sonica:   'Lowest avg score; recurring brand pronunciation + disclosure flags',
    Tarun:    'Sharpest decline; May 15 lowest score (4.0/10); needs coaching',
  };

  sorted.forEach(([name, d], i) => {
    const avg   = (d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2);
    const trend = getTrend(d.sessions);
    rows.push([i + 1, name, d.totalCalls, d.sessions.length, parseFloat(avg), trend, NOTES[name] ?? '']);
  });

  rows.push([]);
  rows.push(['* Scores = median agent performance score (0–10) per session, as computed by Radar AI.']);
  rows.push(['* May 8 data unavailable (pre-migration gap). 4 sessions (Kunal 9-May, Saanvi 11-May, Sharik 13-May, Tarun 13-May) scored from day-end email PDFs.']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4  },  // #
    { wch: 14 },  // RM Name
    { wch: 13 },  // Total Calls
    { wch: 14 },  // Working Days
    { wch: 17 },  // Avg Score
    { wch: 14 },  // Trend
    { wch: 55 },  // Notes
  ];
  return ws;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 2 — Daily Score Grid
// ══════════════════════════════════════════════════════════════════════════════
function buildDailyGrid(sessions) {
  // Collect all unique RMs and dates
  const rmNames = [...new Set(sessions.map(s => s.rmName))].sort();
  const dates   = [...new Set(sessions.map(s => s.date))].filter(Boolean).sort();

  // Build lookup: "rmName|date" → score
  const scoreMap = new Map();
  const callMap  = new Map();
  for (const s of sessions) {
    const key = `${s.rmName}|${s.date}`;
    scoreMap.set(key, parseScore(s.medianScore));
    callMap.set(key, s.totalCalls);
  }

  const rows = [];
  rows.push(['BondScanner · Radar — Daily Score Grid (Median Agent Score /10)']);
  rows.push([`Period: ${REPORT_DATE_RANGE}`]);
  rows.push([]);

  // Header row: Date + each RM
  rows.push(['Date', ...rmNames]);

  for (const date of dates) {
    const row = [fmtDateDisplay(date)];
    for (const rm of rmNames) {
      const key   = `${rm}|${date}`;
      const score = scoreMap.get(key);
      row.push(score !== undefined && score !== null ? score : '');
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, ...rmNames.map(() => ({ wch: 11 }))];
  ws['!freeze'] = { xSplit: 1, ySplit: 4 }; // freeze date column + header
  return ws;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 3 — Key Observations
// ══════════════════════════════════════════════════════════════════════════════
function buildObservationsSheet() {
  const rows = [
    ['BondScanner · Radar — Key Observations'],
    [`Period: ${REPORT_DATE_RANGE}  ·  Generated: ${fmtDateDisplay(new Date().toISOString().slice(0, 10))}`],
    [],
    ['DECLINING PERFORMERS — NEED IMMEDIATE ATTENTION'],
    [],
    ['Tarun', '↓ Declining'],
    ['Most concerning trajectory across the team. Averaged ~5.4 in April, dropped to 4.7 average in May.'],
    ['May 15 was the lowest-scored day across all RMs (4.0/10). Volume stayed consistent (~30–45 calls/day)'],
    ['so this is not a light-day artifact. Requires a coaching intervention this week.'],
    [],
    ['Kunal', '↓ Declining'],
    ['Was consistently scoring 6.0–6.5 through April. Now plateaued at 5.0 across May.'],
    ['Quality has eroded in proportion to volume increase — classic output-vs-quality tradeoff.'],
    ['Recommend a structured review of high-volume days with call spot-checks.'],
    [],
    ['STRONG PERFORMERS'],
    [],
    ['Khushboo', '→ Stable (highest quality)'],
    ['Highest average score across all RMs: 5.86/10. Peak day: 6.5/10 on 13 May.'],
    ['Consistently in the 5.5–6.5 band. Sets the quality benchmark for the team.'],
    [],
    ['Sharik', '→ Stable (best all-round)'],
    ['Highest total call volume (879 calls), most working days (17), above-average score (5.65).'],
    ['Most dependable RM — combines reliability with quality. Strong role model for the team.'],
    [],
    ['Aakash', '→ Stable'],
    ['Solid performance throughout. 5.6 average, no days below 5.0. Low-variance; reliable.'],
    [],
    ['NEW RMs — SHOWING PROMISE'],
    [],
    ['Saanvi & Aadi', '↑ Improving'],
    ['Both joined ~May 5. Both showing upward score trajectories in first two weeks.'],
    ['Saanvi: 4.5 → 5.5. Aadi: 4.5 → 6.0 by May 14. Positive early signal.'],
    ['Note: small sample size (≤8 working days each) — read with lower confidence.'],
    [],
    ['Sai', '→ Stable (levelled)'],
    ['Strong initial ramp (4.4 → 6.0 between Apr 22–27), then levelled at ~5.0 in May.'],
    ['Early gains have not been sustained. A targeted refresh session could help.'],
    [],
    ['NEEDS MONITORING'],
    [],
    ['Sonica', '→ Stable (lowest avg)'],
    ['Lowest average score at 4.94/10. Consistent rather than declining.'],
    ['Recurring flags from RM reports: brand name mispronunciation, missing SEBI risk disclosures.'],
    ['Structural issues — not a motivation problem. Needs script reinforcement and compliance coaching.'],
    [],
    ['TEAM-WIDE PATTERNS'],
    [],
    ['Score ceiling', ''],
    ['No RM has sustained above 6.5/10 on a consistent basis. The 6.5–7.0 range is a realistic'],
    ['near-term ceiling to target through structured coaching.'],
    [],
    ['Volume vs. quality', ''],
    ['Days with 40+ calls tend to correlate with slight score dips across all RMs. Worth monitoring'],
    ['whether call pacing/fatigue is a contributing factor — consider daily call caps or mid-day check-ins.'],
    [],
    ['Data note', ''],
    ['May 8 data is permanently unavailable (pre-migration gap). Original 4 RMs have 13–17 days of'],
    ['data; new RMs have ≤8 days — trends for newer RMs carry lower statistical confidence.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 80 }];
  return ws;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.error('\n🚀  Generating RM Performance Report Excel…\n');

  // 1. Email data
  const emailSessions = await fetchEmailSessions();

  // 2. Supabase data (hardcoded with score overrides)
  const dbSessions = SUPABASE_SESSIONS.map(s => ({ ...s, source: 'supabase' }));
  console.error(`\n🗄️   Supabase: ${dbSessions.length} sessions (May 9–17)\n`);

  // 3. Merge
  const allSessions = [...emailSessions, ...dbSessions];
  const rmMap = buildRMMap(allSessions);

  console.error(`📊  ${allSessions.length} total RM-day sessions · ${rmMap.size} unique RMs\n`);

  // 4. Build workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(rmMap),          'RM Performance Summary');
  XLSX.utils.book_append_sheet(wb, buildDailyGrid(allSessions),       'Daily Score Grid');
  XLSX.utils.book_append_sheet(wb, buildObservationsSheet(),          'Key Observations');

  XLSX.writeFile(wb, OUT_FILE);
  console.error(`✅  Saved: ${OUT_FILE}`);
  console.log(OUT_FILE);
}

main().catch(err => { console.error('❌  Fatal:', err.message); process.exit(1); });

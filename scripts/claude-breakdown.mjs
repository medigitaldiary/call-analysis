import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i+1).trim().replace(/^"/,'').replace(/"$/,'').replace(/\\n/g,'');
  process.env[k] = v;
}

const sql = neon(process.env.DATABASE_URL);

// Pricing
const PRICE_IN  = 3.0  / 1_000_000;   // $3.00 per 1M input tokens
const PRICE_OUT = 15.0 / 1_000_000;   // $15.00 per 1M output tokens
const USD_TO_INR = 84;                 // approx exchange rate

function cost(inp, out) { return inp * PRICE_IN + out * PRICE_OUT; }
function fmt(n) { return `$${n.toFixed(4)}`; }
function fmtInr(n) { return `₹${(n * USD_TO_INR).toFixed(2)}`; }
function fmtTok(n) { return `${(n/1000).toFixed(1)}K`; }

// ── 1. Per-day: Transcript analysis (reports table) ───────────────────────
const transcriptDaily = await sql`
  SELECT
    COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) AS day,
    COUNT(*)                          AS calls,
    SUM(r.input_tokens)               AS inp,
    SUM(r.output_tokens)              AS out,
    SUM(c.duration_sec)               AS audio_sec
  FROM reports r
  JOIN calls c ON c.id = r.call_id
  LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE (r.input_tokens > 0 OR r.output_tokens > 0)
  GROUP BY 1
  ORDER BY 1 ASC
`;

// ── 2. Per-day: RM report generation delta (bulk_sessions minus per-call) ──
const rmDaily = await sql`
  SELECT
    DATE(bs.session_date) AS day,
    SUM(bs.input_tokens  - COALESCE(r_agg.total_in,  0)) AS inp,
    SUM(bs.output_tokens - COALESCE(r_agg.total_out, 0)) AS out
  FROM bulk_sessions bs
  LEFT JOIN (
    SELECT c.session_id,
      COALESCE(SUM(r.input_tokens),  0) AS total_in,
      COALESCE(SUM(r.output_tokens), 0) AS total_out
    FROM calls c JOIN reports r ON r.call_id = c.id
    GROUP BY c.session_id
  ) r_agg ON r_agg.session_id = bs.id
  WHERE (bs.input_tokens > 0 OR bs.output_tokens > 0)
  GROUP BY 1
  ORDER BY 1 ASC
`;

// ── 3. Per-day: Day-end report ─────────────────────────────────────────────
const dayRptDaily = await sql`
  SELECT
    report_date::date AS day,
    input_tokens      AS inp,
    output_tokens     AS out
  FROM day_reports
  WHERE input_tokens > 0 OR output_tokens > 0
  ORDER BY 1 ASC
`;

// ── Build unified table ────────────────────────────────────────────────────
const allDays = new Set([
  ...transcriptDaily.map(r => String(r.day).slice(0,10)),
  ...rmDaily.map(r => String(r.day).slice(0,10)),
  ...dayRptDaily.map(r => String(r.day).slice(0,10)),
]);

const tMap  = Object.fromEntries(transcriptDaily.map(r => [String(r.day).slice(0,10), r]));
const rMap  = Object.fromEntries(rmDaily.map(r => [String(r.day).slice(0,10), r]));
const dMap  = Object.fromEntries(dayRptDaily.map(r => [String(r.day).slice(0,10), r]));

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('                   CLAUDE API — FULL COST BREAKDOWN                    ');
console.log('═══════════════════════════════════════════════════════════════════════\n');
console.log('Pricing: $3.00/1M input tokens · $15.00/1M output tokens\n');

let grandTotInp = 0, grandTotOut = 0, grandTotCalls = 0, grandTotAudio = 0;

const rows = [];

for (const day of [...allDays].sort()) {
  const t  = tMap[day]  || { calls: 0, inp: 0, out: 0, audio_sec: 0 };
  const r  = rMap[day]  || { inp: 0, out: 0 };
  const d  = dMap[day]  || { inp: 0, out: 0 };

  const tInp  = Number(t.inp  || 0), tOut  = Number(t.out  || 0);
  const rInp  = Number(r.inp  || 0), rOut  = Number(r.out  || 0);
  const dInp  = Number(d.inp  || 0), dOut  = Number(d.out  || 0);

  const totalInp = tInp + rInp + dInp;
  const totalOut = tOut + rOut + dOut;
  const totalCost = cost(totalInp, totalOut);

  grandTotInp   += totalInp;
  grandTotOut   += totalOut;
  grandTotCalls += Number(t.calls || 0);
  grandTotAudio += Number(t.audio_sec || 0);

  rows.push({
    Date:          day,
    Calls:         Number(t.calls || 0),
    'Talk Time':   t.audio_sec ? `${(Number(t.audio_sec)/3600).toFixed(1)}h` : '—',
    // Transcript
    'T·Input':     fmtTok(tInp),
    'T·Output':    fmtTok(tOut),
    'T·Cost':      fmt(cost(tInp, tOut)),
    // RM report
    'RM·Input':    rInp > 0 ? fmtTok(rInp) : '—',
    'RM·Output':   rOut > 0 ? fmtTok(rOut) : '—',
    'RM·Cost':     rInp + rOut > 0 ? fmt(cost(rInp, rOut)) : '—',
    // Day-end report
    'DR·Input':    dInp > 0 ? fmtTok(dInp) : '—',
    'DR·Output':   dOut > 0 ? fmtTok(dOut) : '—',
    'DR·Cost':     dInp + dOut > 0 ? fmt(cost(dInp, dOut)) : '—',
    // Total
    'TOTAL USD':   fmt(totalCost),
    'TOTAL INR':   fmtInr(totalCost),
  });
}

console.table(rows);

const grandCost = cost(grandTotInp, grandTotOut);
const grandHrs  = grandTotAudio / 3600;

console.log('\nGRAND TOTALS (our DB)');
console.log(`  Calls analysed   : ${grandTotCalls}`);
console.log(`  Audio processed  : ${grandHrs.toFixed(1)}h`);
console.log(`  Input tokens     : ${fmtTok(grandTotInp)} (${(grandTotInp/1_000_000).toFixed(3)}M)`);
console.log(`  Output tokens    : ${fmtTok(grandTotOut)} (${(grandTotOut/1_000_000).toFixed(3)}M)`);
console.log(`  Total cost       : ${fmt(grandCost)}  ≈  ${fmtInr(grandCost)} (@ ₹${USD_TO_INR}/USD)`);
console.log(`  Avg cost/call    : $${(grandCost/grandTotCalls).toFixed(4)}`);
console.log(`  Avg input/call   : ${fmtTok(grandTotInp/grandTotCalls)}`);
console.log(`  Avg output/call  : ${fmtTok(grandTotOut/grandTotCalls)}`);

// ── Claude dashboard totals (read from screenshot) ─────────────────────────
// Anthropic dashboard CSV (Apr 23 – May 4, call-analysis key only):
const anthropicDashboard = [
  { date: '2026-04-23', inp: 0.90,  out: 1.33 },
  { date: '2026-04-24', inp: 0.42,  out: 0.23 },
  { date: '2026-04-27', inp: 2.27,  out: 3.29 },
  { date: '2026-04-28', inp: 1.78,  out: 0.15 + 1.40 },
  { date: '2026-04-29', inp: 1.10,  out: 1.46 },
  { date: '2026-04-30', inp: 0.73,  out: 1.26 },
  { date: '2026-05-04', inp: 0.91,  out: 1.11 },
];
const dashTotal = anthropicDashboard.reduce((s, r) => s + r.inp + r.out, 0);

console.log('\n\nANTHROPIC DASHBOARD vs OUR DB (cross-check)');
console.log('─────────────────────────────────────────────────────────────────');
console.log('Anthropic dashboard shows (Apr 23 – May 4, cost_usd column):');
console.table(anthropicDashboard.map(r => ({
  Date: r.date,
  'Input $': r.inp.toFixed(2),
  'Output $': r.out.toFixed(2),
  'Total $': (r.inp + r.out).toFixed(2),
})));
console.log(`  Dashboard total  : $${dashTotal.toFixed(2)}`);
console.log(`  Our DB total     : ${fmt(grandCost)}`);
console.log(`  Gap              : $${Math.abs(grandCost - dashTotal).toFixed(2)}`);
console.log('\nNote: Gap due to Apr 22 data in our DB but not in Claude dashboard export,');
console.log('and May 1-3 in our DB but shown as May 4 in Claude (UTC vs IST timezone offset).');

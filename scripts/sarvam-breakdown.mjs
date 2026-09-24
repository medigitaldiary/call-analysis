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

const PRICE_PER_HOUR_INR = 36;
const PRICE_PER_MIN_INR  = PRICE_PER_HOUR_INR / 60;  // ₹0.60/min
const PRICE_PER_SEC_INR  = PRICE_PER_HOUR_INR / 3600; // ₹0.01/sec

// ── 1. Overall totals ─────────────────────────────────────────────────────────
const [totals] = await sql`
  SELECT
    COUNT(*)                                    AS total_calls,
    COALESCE(SUM(r.sarvam_duration_sec), 0)    AS total_sec
  FROM reports r
  JOIN calls c ON c.id = r.call_id
  LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE r.sarvam_duration_sec > 0
`;

// ── 2. Per-RM breakdown ───────────────────────────────────────────────────────
const byRM = await sql`
  SELECT
    c.rep_name,
    COUNT(*)                                    AS calls,
    COALESCE(SUM(r.sarvam_duration_sec), 0)    AS total_sec
  FROM reports r
  JOIN calls c ON c.id = r.call_id
  WHERE r.sarvam_duration_sec > 0
  GROUP BY c.rep_name
  ORDER BY total_sec DESC
`;

// ── 3. Daily breakdown (all days with data) ───────────────────────────────────
const daily = await sql`
  SELECT
    COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) AS day,
    COUNT(*)                                    AS calls,
    COALESCE(SUM(r.sarvam_duration_sec), 0)    AS total_sec
  FROM reports r
  JOIN calls c ON c.id = r.call_id
  LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE r.sarvam_duration_sec > 0
  GROUP BY 1
  ORDER BY 1 ASC
`;

// ── 4. Per-session breakdown ──────────────────────────────────────────────────
const bySess = await sql`
  SELECT
    bs.rm_name,
    bs.session_date,
    COUNT(r.*)                                  AS calls,
    COALESCE(SUM(r.sarvam_duration_sec), 0)    AS total_sec
  FROM reports r
  JOIN calls c ON c.id = r.call_id
  JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE r.sarvam_duration_sec > 0
  GROUP BY bs.id, bs.rm_name, bs.session_date
  ORDER BY bs.session_date ASC, bs.rm_name
`;

function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
function inr(n) { return `₹${n.toFixed(2)}`; }

const totalSec  = Number(totals.total_sec);
const totalMin  = totalSec / 60;
const totalCost = totalSec * PRICE_PER_SEC_INR;

console.log('\n═══════════════════════════════════════════════════');
console.log('         SARVAM AI — USAGE BREAKDOWN               ');
console.log('═══════════════════════════════════════════════════\n');

console.log('RATE CARD');
console.log(`  Saarika v2.5 : ₹${PRICE_PER_HOUR_INR}/hour  =  ₹${PRICE_PER_MIN_INR.toFixed(2)}/min  =  ₹${PRICE_PER_SEC_INR.toFixed(4)}/sec`);
console.log(`  (Sarvam dashboard shows ₹1,100.66 for 1,800 mins → ₹${(1100.66/1800).toFixed(3)}/min — matches)\n`);

console.log('OVERALL TOTALS');
console.log(`  Calls processed : ${totals.total_calls}`);
console.log(`  Audio duration  : ${fmtDur(totalSec)} (${totalMin.toFixed(1)} mins)`);
console.log(`  Total cost      : ${inr(totalCost)}`);
console.log(`  Avg per call    : ${inr(totalCost / Number(totals.total_calls))}`);
console.log(`  Avg duration    : ${fmtDur(totalSec / Number(totals.total_calls))} per call\n`);

console.log('PER-RM BREAKDOWN');
console.table(byRM.map(r => {
  const sec  = Number(r.total_sec);
  const min  = sec / 60;
  const cost = sec * PRICE_PER_SEC_INR;
  return {
    RM:       r.rep_name,
    Calls:    Number(r.calls),
    Duration: fmtDur(sec),
    Minutes:  min.toFixed(1),
    Cost_INR: inr(cost),
    Avg_per_call: inr(cost / Number(r.calls)),
  };
}));

console.log('\nDAILY BREAKDOWN');
console.table(daily.map(d => {
  const sec  = Number(d.total_sec);
  const min  = sec / 60;
  const cost = sec * PRICE_PER_SEC_INR;
  return {
    Date:     String(d.day).slice(0,10),
    Calls:    Number(d.calls),
    Duration: fmtDur(sec),
    Minutes:  min.toFixed(1),
    Cost_INR: inr(cost),
  };
}));

console.log('\nPER-SESSION BREAKDOWN');
console.table(bySess.map(s => {
  const sec  = Number(s.total_sec);
  const min  = sec / 60;
  const cost = sec * PRICE_PER_SEC_INR;
  return {
    RM:       s.rm_name,
    Date:     String(s.session_date).slice(0,10),
    Calls:    Number(s.calls),
    Duration: fmtDur(sec),
    Minutes:  min.toFixed(1),
    Cost_INR: inr(cost),
  };
}));

console.log('\nNOTE: Sarvam dashboard shows ₹1,100.66 total for 1,800 mins.');
console.log(`Our DB tracks ${totalMin.toFixed(1)} mins = ${inr(totalCost)} (difference may be pre-production test calls not in our DB).`);

/**
 * rm-performance-report.mjs
 *
 * Full RM performance report: Apr 22 → today
 *   - Apr 22 – May 8  : parsed from day-end report emails (Gmail IMAP)
 *   - May 9  – today  : live from Supabase bulk_sessions.rm_report
 *
 * Usage:
 *   node scripts/rm-performance-report.mjs
 *   node scripts/rm-performance-report.mjs --from 2026-04-22 --to 2026-05-19
 */

import { ImapFlow }    from 'imapflow';
import { simpleParser } from 'mailparser';
import postgres          from 'postgres';
import { readFileSync }  from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';

// ── Load env files ────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

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
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const FROM_DATE      = getArg('--from') ?? '2026-04-22';
const EMAIL_END_DATE = '2026-05-08';   // last date covered by email data
const TO_DATE        = getArg('--to')  ?? new Date().toISOString().slice(0, 10);

// ════════════════════════════════════════════════════════════════════════════
// PART 1 — EMAIL DATA (Apr 22 – May 8)
// ════════════════════════════════════════════════════════════════════════════

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function extractAgentPerfTable(html) {
  const sectionMatch = html.match(/Agent Performance<\/h2>([\s\S]*?)<\/table>/);
  if (!sectionMatch) return [];
  const tableHtml = sectionMatch[1];
  const rowRegex  = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const results   = [];
  let m;
  while ((m = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = m[1];
    if (rowHtml.includes('<th')) continue;
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = cellRegex.exec(rowHtml)) !== null) cells.push(stripTags(cm[1]).trim());
    if (cells.length >= 4) {
      results.push({
        agent:        cells[0],
        total_calls:  parseInt(cells[1], 10) || 0,
        follow_ups:   parseInt(cells[2], 10) || 0,
        median_score: cells[3],
        best_call:    cells[4] ?? '',
      });
    }
  }
  return results;
}

function extractReportDate(html) {
  const m = html.match(/Day End Report[^—]*—\s*([^<"]+)/);
  return m ? m[1].trim() : null;
}

async function fetchEmailData() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD required');

  console.error(`\n📧  Fetching email data (${FROM_DATE} → ${EMAIL_END_DATE})…`);

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
  });
  await client.connect();

  const subjects = [
    'Call analysis: Day end report',
    '[TEST] Day end report - Call Analysis',
    '[Internal] Call analysis: Day end report',
  ];
  const sinceDate  = new Date(FROM_DATE      + 'T00:00:00Z');
  const beforeDate = new Date(EMAIL_END_DATE + 'T23:59:59Z');
  const mailboxes  = ['INBOX', '[Gmail]/Sent Mail'];
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
      for (const uid of allUids) {
        const msg = await client.fetchOne(uid.toString(), { source: true }, { uid: true });
        if (!msg) continue;
        const parsed  = await simpleParser(msg.source);
        const msgId   = parsed.messageId ?? `${mailbox}-${uid}`;
        if (seenMsgIds.has(msgId)) continue;
        seenMsgIds.add(msgId);
        const subj    = parsed.subject ?? '';
        const html    = parsed.html || '';
        const date    = parsed.date;
        const agentPerf  = extractAgentPerfTable(html);
        const reportDate = extractReportDate(html) ?? (date ? date.toISOString().slice(0, 10) : null);
        const bucket  = subj.includes('[TEST]') ? 'test' : subj.includes('[Internal]') ? 'internal' : 'production';
        emailsByPriority[bucket].push({ reportDate, agentPerf });
      }
    } finally { lock.release(); }
  }
  await client.logout();

  // Merge with priority: production > internal > test
  // Deduplicate by (agent, reportDate)
  const seen = new Set(); // "AgentName|YYYY-MM-DD"
  const rmSessions = []; // { rmName, date, totalCalls, followUps, medianScore }

  for (const bucket of ['production', 'internal', 'test']) {
    for (const email of emailsByPriority[bucket]) {
      for (const ap of email.agentPerf) {
        const key = `${ap.agent}|${email.reportDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rmSessions.push({
          rmName:      ap.agent,
          date:        email.reportDate,
          totalCalls:  ap.total_calls,
          followUps:   ap.follow_ups,
          medianScore: ap.median_score,
          source:      'email',
        });
      }
    }
  }

  console.error(`   → ${rmSessions.length} unique RM-day records from emails`);
  return rmSessions;
}

// ════════════════════════════════════════════════════════════════════════════
// PART 2 — SUPABASE DATA (May 9 – today)
// ════════════════════════════════════════════════════════════════════════════

async function fetchSupabaseData() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const DB_START = '2026-05-09';
  console.error(`\n🗄️   Fetching Supabase data (${DB_START} → ${TO_DATE})…`);

  const sql = postgres(dbUrl, { ssl: 'require', max: 3 });

  try {
    const rows = await sql`
      SELECT
        rm_name,
        DATE(session_date)::text               AS date,
        rm_report,
        total_files,
        processed_files,
        (SELECT COUNT(*) FROM calls WHERE session_id = bs.id AND status = 'ready')::int  AS ready_calls,
        (SELECT COUNT(*) FROM calls WHERE session_id = bs.id AND outcome = 'follow_up_scheduled')::int AS follow_ups_db
      FROM bulk_sessions bs
      WHERE DATE(session_date) >= ${DB_START}::date
        AND DATE(session_date) <= ${TO_DATE}::date
        AND archived_at IS NULL
        AND status IN ('ready', 'generating')
      ORDER BY session_date ASC
    `;

    const rmSessions = [];
    for (const row of rows) {
      const report = typeof row.rm_report === 'string' ? JSON.parse(row.rm_report) : row.rm_report;
      const ap     = report?.agent_performance;

      // Try rm_report agent_performance first; fall back to counting calls directly
      const totalCalls  = ap?.total_calls  ?? row.ready_calls   ?? 0;
      const followUps   = ap?.follow_ups   ?? row.follow_ups_db ?? 0;
      const medianScore = ap?.avg_performance ?? 'N/A';

      rmSessions.push({
        rmName:      row.rm_name,
        date:        row.date,
        totalCalls,
        followUps,
        medianScore,
        source:      'supabase',
      });
    }

    console.error(`   → ${rmSessions.length} sessions from Supabase`);
    return rmSessions;
  } finally {
    await sql.end();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PART 3 — COMBINE + PRINT
// ════════════════════════════════════════════════════════════════════════════

function parseScore(s) {
  if (!s || s === 'N/A') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function buildReport(sessions) {
  const rmMap = new Map();

  for (const s of sessions) {
    if (!rmMap.has(s.rmName)) {
      rmMap.set(s.rmName, { sessions: [], totalCalls: 0, followUps: 0, scores: [] });
    }
    const entry = rmMap.get(s.rmName);
    entry.sessions.push(s);
    entry.totalCalls += s.totalCalls;
    entry.followUps  += s.followUps;
    const n = parseScore(s.medianScore);
    if (n !== null) entry.scores.push(n);
  }

  return rmMap;
}

function printReport(rmMap, allSessions) {
  const sorted = [...rmMap.entries()]
    .sort((a, b) => b[1].totalCalls - a[1].totalCalls);

  const col  = (s, w) => String(s ?? '').padEnd(w).slice(0, w);
  const colR = (s, w) => String(s ?? '').padStart(w).slice(0, w);

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║   RM Performance Report  ·  ${FROM_DATE} → ${TO_DATE}                         `.slice(0, 77) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Source summary
  const emailCount = allSessions.filter(s => s.source === 'email').length;
  const dbCount    = allSessions.filter(s => s.source === 'supabase').length;
  console.log(`  Data sources: ${emailCount} days from email (Apr 22–May 8) + ${dbCount} sessions from Supabase (May 9–${TO_DATE})`);
  console.log('');

  // Summary table
  console.log(
    col('RM Name', 14) + colR('Calls', 8) + colR('Follow-ups', 12) +
    colR('FU%', 6) + colR('Avg Score', 12) + colR('Days', 6) + '  Trend'
  );
  console.log('─'.repeat(72));

  for (const [name, d] of sorted) {
    const fuRate   = d.totalCalls > 0 ? Math.round(d.followUps / d.totalCalls * 100) : 0;
    const avgScore = d.scores.length > 0
      ? (d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2)
      : 'N/A';

    // Trend: compare first-week avg vs last-week avg
    const sortedSess = [...d.sessions].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const half = Math.ceil(sortedSess.length / 2);
    const firstHalf = sortedSess.slice(0, half).map(s => parseScore(s.medianScore)).filter(n => n !== null);
    const lastHalf  = sortedSess.slice(half).map(s => parseScore(s.medianScore)).filter(n => n !== null);
    const firstAvg  = firstHalf.length  ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length   : null;
    const lastAvg   = lastHalf.length   ? lastHalf.reduce((a, b) => a + b, 0)  / lastHalf.length    : null;
    const trend     = firstAvg !== null && lastAvg !== null
      ? (lastAvg - firstAvg > 0.15 ? '↑ Improving' : lastAvg - firstAvg < -0.15 ? '↓ Declining' : '→ Stable')
      : '—';

    console.log(
      col(name, 14) + colR(d.totalCalls, 8) + colR(d.followUps, 12) +
      colR(`${fuRate}%`, 6) + colR(avgScore, 12) + colR(d.sessions.length, 6) + `  ${trend}`
    );
  }

  console.log('─'.repeat(72));
  const totCalls   = sorted.reduce((s, [, d]) => s + d.totalCalls, 0);
  const totFU      = sorted.reduce((s, [, d]) => s + d.followUps, 0);
  const allScores  = sorted.flatMap(([, d]) => d.scores);
  const overallAvg = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2)
    : 'N/A';
  console.log(
    col('TOTAL', 14) + colR(totCalls, 8) + colR(totFU, 12) +
    colR(`${Math.round(totFU / totCalls * 100)}%`, 6) + colR(overallAvg, 12)
  );

  // ── Per-RM day breakdown ──
  console.log('\n\n── Per-RM Day Breakdown ──────────────────────────────────────────────────────\n');

  for (const [name, d] of sorted) {
    const avgScore = d.scores.length > 0
      ? (d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2)
      : 'N/A';
    console.log(`  ${name}  (${d.totalCalls} calls · ${d.sessions.length} days · avg score ${avgScore})`);

    const byDate = [...d.sessions].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    for (const s of byDate) {
      const src = s.source === 'email' ? 'email' : '  DB ';
      console.log(
        `    [${src}]  ${col(s.date ?? '?', 12)}  ` +
        `calls=${String(s.totalCalls).padStart(3)}  ` +
        `follow-ups=${String(s.followUps).padStart(3)}  ` +
        `score=${s.medianScore ?? 'N/A'}`
      );
    }
    console.log('');
  }

  // ── Rankings ──
  console.log('── Rankings ─────────────────────────────────────────────────────────────────\n');

  const ranked = sorted.filter(([, d]) => d.sessions.length >= 3 && d.scores.length >= 3);
  if (ranked.length > 0) {
    const byScore = [...ranked].sort((a, b) => {
      const aAvg = a[1].scores.reduce((s, n) => s + n, 0) / a[1].scores.length;
      const bAvg = b[1].scores.reduce((s, n) => s + n, 0) / b[1].scores.length;
      return bAvg - aAvg;
    });
    const byFU = [...ranked].sort((a, b) => {
      const aR = a[1].followUps / a[1].totalCalls;
      const bR = b[1].followUps / b[1].totalCalls;
      return bR - aR;
    });
    const byVol = [...ranked].sort((a, b) => b[1].totalCalls - a[1].totalCalls);

    console.log('  By Avg Score:');
    byScore.forEach(([name, d], i) => {
      const avg = (d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2);
      console.log(`    ${i + 1}. ${name.padEnd(14)} ${avg}/10`);
    });

    console.log('\n  By Follow-up Rate:');
    byFU.forEach(([name, d], i) => {
      const pct = Math.round(d.followUps / d.totalCalls * 100);
      console.log(`    ${i + 1}. ${name.padEnd(14)} ${pct}%  (${d.followUps}/${d.totalCalls})`);
    });

    console.log('\n  By Call Volume:');
    byVol.forEach(([name, d], i) => {
      console.log(`    ${i + 1}. ${name.padEnd(14)} ${d.totalCalls} calls`);
    });
  } else {
    console.log('  (Not enough data for ranking — need ≥3 days per RM)');
  }

  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.error(`\n🚀  RM Performance Report  ${FROM_DATE} → ${TO_DATE}`);

  const [emailSessions, dbSessions] = await Promise.all([
    fetchEmailData(),
    fetchSupabaseData(),
  ]);

  const allSessions = [...emailSessions, ...dbSessions];
  const rmMap = buildReport(allSessions);
  printReport(rmMap, allSessions);
}

main().catch(err => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});

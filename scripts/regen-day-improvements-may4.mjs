/**
 * Restores the original May 4 day report improvements (from the sent email)
 * and adds call_refs to each existing point without changing the text.
 * Run: node scripts/regen-day-improvements-may4.mjs
 */
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envText = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const k = trimmed.slice(0, eqIdx).trim();
  let v = trimmed.slice(eqIdx + 1).trim();
  v = v.replace(/^"/, '').replace(/"$/, '').replace(/\\n/g, '');
  process.env[k] = v;
}

const sql    = neon(process.env.DATABASE_URL);
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Original improvement points exactly as they appeared in the sent email
const ORIGINAL_POINTS = [
  "High volume of sub-60-second calls (approximately 70+ calls) with no outcome — implement mandatory minimum engagement protocols and pre-call SMS alerts to improve customer readiness and connection rates",
  "Inconsistent KYC follow-up process across all reps: multiple customers report the same technical issues (BO ID step missing, Aadhaar upload not clickable, bank verification not showing) — consolidate these into a known-issues FAQ and provide agents with standardised resolution scripts to reduce repeat escalations",
  "Agents are regularly making absolute statements about interest payout reliability and returns without SEBI-mandated risk disclaimers — conduct compliance training session within the week and audit all calls for regulatory adherence before further outbound campaigns are launched",
  "Multiple accidental sign-ups and wrong-number leads are consuming significant agent time (approximately 10-12 calls per day) — review the sign-up flow, add intent confirmation steps, and cleanse the CRM to improve lead quality and conversion ratios",
  "No structured callback scheduling tool appears to be in use — agents are verbally promising callbacks without logged commitments, leading to missed follow-ups (calls #10, #47, #57, #86, #116, #124); implement a CRM-integrated callback scheduler immediately",
];

function safeParseArray(text) {
  let s = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  s = s.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(s); } catch {
    const start = s.indexOf('['), end = s.lastIndexOf(']');
    if (start !== -1 && end !== -1) return JSON.parse(s.slice(start, end + 1));
    throw new Error('Could not extract JSON array');
  }
}

// Fetch the day report
const [dayReport] = await sql`SELECT id, report FROM day_reports WHERE report_date = '2026-05-04'`;
if (!dayReport) { console.log('No day report found for 2026-05-04'); process.exit(0); }

// Fetch all calls for May 4
const rows = await sql`
  SELECT c.rep_name, r.customer_name, r.phone, r.outcome, r.summary, r.call_quality, r.agent_performance
  FROM calls c
  LEFT JOIN reports r ON r.call_id = c.id
  LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE c.status IN ('ready', 'sent')
    AND (c.session_id IS NULL OR bs.archived_at IS NULL)
    AND (
      (c.session_id IS NOT NULL AND DATE(bs.session_date) = '2026-05-04'::date)
      OR
      (c.session_id IS NULL AND DATE(c.created_at AT TIME ZONE 'Asia/Kolkata') = '2026-05-04'::date)
    )
  ORDER BY c.created_at ASC
`;

const callData = rows.map((c, i) => ({
  call_number:   i + 1,
  rm_name:       c.rep_name ?? null,
  customer_name: c.customer_name ?? null,
  phone:         c.phone ?? null,
  outcome:       c.outcome ?? null,
  summary:       (c.summary ?? '').slice(0, 150), // truncate for prompt size
}));

console.log(`${callData.length} calls loaded across ${[...new Set(callData.map(c => c.rm_name).filter(Boolean))].join(', ')}`);

// Ask Claude to find which calls evidence each original point (without changing the point text)
const prompt = `You are given 5 improvement points and a list of calls. For each improvement point, identify 3–6 specific calls from the data that best evidence it.

Return ONLY a raw JSON array (no markdown, no trailing commas) — one entry per improvement point, in the same order, preserving the exact "point" text:
[
  {
    "point": "<exact text of improvement point>",
    "call_refs": [{"rm_name":"<RM>","call_number":1,"customer_name":"Name or null","phone":"phone or null"}]
  }
]

IMPROVEMENT POINTS:
${ORIGINAL_POINTS.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CALL DATA (${callData.length} calls):
${JSON.stringify(callData)}`;

let newImprovements = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  let message;
  try {
    message = await claude.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    console.error(`Claude API error (attempt ${attempt}): ${err.message}`);
    break;
  }
  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
  try {
    newImprovements = safeParseArray(rawText);
    console.log(`\nClaude matched call refs for ${newImprovements.length} points (attempt ${attempt}):`);
    newImprovements.forEach((imp, i) => {
      const refs = imp.call_refs.map(r => `${r.rm_name} · ${r.phone ?? r.customer_name ?? `#${r.call_number}`}`).join(', ');
      console.log(`  ${i + 1}. ${imp.point.slice(0, 70)}…`);
      console.log(`     refs: ${refs}`);
    });
    break;
  } catch (err) {
    console.error(`JSON parse failed (attempt ${attempt}): ${err.message}`);
    if (attempt === 3) console.error(`Raw: ${rawText.slice(0, 200)}`);
  }
}

if (!newImprovements) { console.error('Failed after 3 attempts'); process.exit(1); }

const report = dayReport.report;
report.improvements = newImprovements;

await sql`UPDATE day_reports SET report = ${JSON.stringify(report)}, updated_at = NOW() WHERE id = ${dayReport.id}`;
console.log('\nRestored original improvement text + added call refs. Open Day End Report → May 4 to review.');

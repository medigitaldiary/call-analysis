/**
 * Re-generates the "improvements" field for all May 4 2026 bulk sessions
 * using the new structured format { point, call_refs }.
 * Updates only the rm_report JSON in the DB — no new docx/xlsx generated.
 * Run: node scripts/regen-improvements-may4.mjs
 */
import { neon } from '@neondatabase/serverless';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '../.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const k = trimmed.slice(0, eqIdx).trim();
  let v = trimmed.slice(eqIdx + 1).trim();
  v = v.replace(/^"/, '').replace(/"$/, '');
  v = v.replace(/\\n/g, '');
  process.env[k] = v;
}

const sql    = neon(process.env.DATABASE_URL);
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function escapeNewlinesInStrings(text) {
  // Replaces literal newlines inside JSON string values with \n escape sequences
  let inString = false;
  let escaped  = false;
  let result   = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\') { result += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) { result += '\\n'; continue; }
    result += ch;
  }
  return result;
}

function safeParseArray(text) {
  // Strip markdown fences
  let s = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  // Escape literal newlines inside strings, then strip trailing commas
  s = escapeNewlinesInStrings(s);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(s);
  } catch {
    // Extract between first [ and last ]
    const start = s.indexOf('[');
    const end   = s.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      return JSON.parse(s.slice(start, end + 1));
    }
    throw new Error('Could not extract JSON array from response');
  }
}

// Fetch May 4 sessions
const sessions = await sql`
  SELECT id, rm_name, session_date, rm_report, status
  FROM bulk_sessions
  WHERE session_date = '2026-05-04'
    AND status = 'ready'
    AND rm_report IS NOT NULL
  ORDER BY created_at ASC
`;

if (sessions.length === 0) {
  console.log('No ready sessions found for 2026-05-04');
  process.exit(0);
}

console.log(`Found ${sessions.length} session(s) for May 4 2026:`);
sessions.forEach((s, i) => console.log(`  ${i + 1}. ${s.rm_name} (${s.id})`));

for (const session of sessions) {
  console.log(`\n── ${session.rm_name} ───────────────────────`);

  // Fetch call data
  const calls = await sql`
    SELECT c.id, r.customer_name, r.phone, r.duration, c.duration_sec,
           r.outcome, r.summary, r.call_quality, r.agent_performance
    FROM calls c
    LEFT JOIN reports r ON r.call_id = c.id
    WHERE c.session_id = ${session.id}
    ORDER BY c.created_at ASC
  `;

  const callData = calls.map((c, i) => ({
    call_number:       i + 1,
    customer_name:     c.customer_name ?? null,
    phone:             c.phone ?? null,
    duration:          c.duration ?? null,
    outcome:           c.outcome ?? null,
    summary:           c.summary ?? null,
    call_quality:      c.call_quality ?? null,
    agent_performance: c.agent_performance ?? null,
  }));

  console.log(`  ${callData.length} calls loaded`);

  const prompt = `Identify 3–5 areas for improvement for RM ${session.rm_name} on ${session.session_date}. Return ONLY a raw JSON array (no markdown fences, no trailing commas):
[{"point":"<improvement>","call_refs":[{"call_number":1,"customer_name":"Name or null","phone":"phone or null"}]}]
Use null for missing customer_name or phone. CALL DATA (${callData.length} calls): ${JSON.stringify(callData)}`;

  let newImprovements = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let message;
    try {
      message = await claude.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      console.error(`  ✗ Claude API error (attempt ${attempt}): ${err.message}`);
      break;
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    try {
      newImprovements = safeParseArray(rawText);
      break;
    } catch (err) {
      console.error(`  ✗ JSON parse failed (attempt ${attempt}): ${err.message}`);
      if (attempt === 3) console.error(`  Raw: ${rawText.slice(0, 200)}`);
    }
  }

  if (!newImprovements) { console.error(`  Skipping ${session.rm_name} after 3 failed attempts`); continue; }

  console.log(`  Claude returned ${newImprovements.length} improvements:`);
  newImprovements.forEach((imp, i) => {
    const refs = imp.call_refs.map(r => `#${r.call_number} ${r.customer_name ?? r.phone ?? ''}`).join(', ');
    console.log(`    ${i + 1}. ${imp.point.slice(0, 70)}`);
    console.log(`       refs: ${refs}`);
  });

  // Patch into existing rm_report
  const report = session.rm_report;
  report.improvements = newImprovements;

  await sql`UPDATE bulk_sessions SET rm_report = ${JSON.stringify(report)} WHERE id = ${session.id}`;

  console.log(`  Updated DB for ${session.rm_name}`);
}

console.log('\nDone. Open Call History > View RM Report to review the changes.');

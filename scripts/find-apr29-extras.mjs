/**
 * Cross-matches Sharik's Apr 30 session against Apr 29 session to find
 * recordings that were accidentally added from Apr 29.
 * Run: node scripts/find-apr29-extras.mjs
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const k = trimmed.slice(0, eqIdx).trim();
  let v = trimmed.slice(eqIdx + 1).trim().replace(/^"/, '').replace(/"$/, '').replace(/\\n/g, '');
  process.env[k] = v;
}

const sql = neon(process.env.DATABASE_URL);

const APR30_SESSION = '29821127-7e81-444d-892a-d8e1452794bb';
const APR29_SESSION = '1c5141f4-94ce-4500-8be1-3669cbab3783';

// Get all calls in both sessions with their reports (phone number stored in reports)
const apr30Calls = await sql`
  SELECT c.id, c.prospect_name, c.status, c.error_msg, r.phone, r.customer_name, r.outcome, r.call_quality
  FROM calls c
  LEFT JOIN reports r ON r.call_id = c.id
  WHERE c.session_id = ${APR30_SESSION}
  ORDER BY c.created_at ASC
`;

const apr29Calls = await sql`
  SELECT c.id, c.prospect_name, r.phone, r.customer_name
  FROM calls c
  LEFT JOIN reports r ON r.call_id = c.id
  WHERE c.session_id = ${APR29_SESSION}
`;

// Build set of Apr 29 phone numbers
const apr29Phones = new Set(apr29Calls.map(c => c.phone).filter(Boolean));

console.log(`\n=== Apr 30 session: ${apr30Calls.length} total calls ===`);
console.log(`=== Apr 29 session: ${apr29Calls.length} total calls ===\n`);

// Find calls in Apr 30 that are duplicates from Apr 29
const extras = apr30Calls.filter(c => c.phone && apr29Phones.has(c.phone));
const legitimateApr30 = apr30Calls.filter(c => !c.phone || !apr29Phones.has(c.phone));

console.log('=== EXTRA calls (Apr 29 recordings in Apr 30 folder) ===');
console.table(extras.map(c => ({
  call_id:       c.id,
  phone:         c.phone,
  customer_name: c.customer_name,
  status:        c.status,
  outcome:       c.outcome,
})));

console.log(`\n=== LEGITIMATE Apr 30 calls (not in Apr 29): ${legitimateApr30.length} ===`);
console.table(legitimateApr30.map(c => ({
  call_id:       c.id,
  phone:         c.phone ?? c.prospect_name,
  customer_name: c.customer_name,
  status:        c.status,
})));

console.log(`\nSummary: ${extras.length} extra (Apr 29) calls found in the Apr 30 session.`);
if (extras.length > 0) {
  console.log('Run with --delete flag to remove them: node scripts/find-apr29-extras.mjs --delete');
}

// If --delete flag passed, delete the extra calls
if (process.argv.includes('--delete')) {
  console.log('\nDeleting extra calls...');
  for (const c of extras) {
    await sql`DELETE FROM reports WHERE call_id = ${c.id}`;
    await sql`DELETE FROM calls WHERE id = ${c.id}`;
    console.log(`  Deleted: ${c.phone} (${c.customer_name ?? 'unknown'})`);
  }
  // Update session's total_files count
  await sql`
    UPDATE bulk_sessions
    SET total_files = total_files - ${extras.length}
    WHERE id = ${APR30_SESSION}
  `;
  console.log(`\n✅ Deleted ${extras.length} extra calls. Session total_files adjusted.`);
}

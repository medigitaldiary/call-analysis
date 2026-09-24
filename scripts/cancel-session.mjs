/**
 * Quick script to find and cancel Sharik's active session.
 * Run: node scripts/cancel-session.mjs
 */
import { neon } from '@neondatabase/serverless';
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
  // Strip surrounding quotes, literal \n sequences, and trailing quote
  let v = trimmed.slice(eqIdx + 1).trim();
  v = v.replace(/^"/, '').replace(/"$/, '');  // strip surrounding double quotes
  v = v.replace(/\\n/g, '');                   // remove literal \n sequences
  process.env[k] = v;
}

const sql = neon(process.env.DATABASE_URL);

// Find Sharik's active/processing session
const sessions = await sql`
  SELECT id, rm_name, session_date, status, total_files, processed_files, created_at
  FROM bulk_sessions
  WHERE rm_name ILIKE '%sharik%'
    AND status NOT IN ('done', 'cancelled', 'archived')
  ORDER BY created_at DESC
  LIMIT 5
`;

if (sessions.length === 0) {
  // Show all recent Sharik sessions so we can pick the right one
  const all = await sql`
    SELECT id, rm_name, session_date, status, total_files, processed_files, created_at
    FROM bulk_sessions
    WHERE rm_name ILIKE '%sharik%'
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('No active sessions found. Recent sessions:');
  console.table(all);
  process.exit(0);
}

console.log('Active/processing sessions found:');
console.table(sessions);

const target = sessions[0];
console.log(`\nCancelling session: ${target.id} (${target.rm_name}, ${target.session_date}, ${target.status})`);

// Cancel pending calls (use 'error' — the DB constraint allows it)
const cancelled = await sql`
  UPDATE calls
  SET status = 'error', error_msg = 'Cancelled by admin'
  WHERE session_id = ${target.id}
    AND status = 'uploaded'
  RETURNING id
`;

await sql`UPDATE bulk_sessions SET status = 'error' WHERE id = ${target.id}`;

console.log(`✅ Cancelled ${cancelled.length} queued call(s). Session marked cancelled.`);
console.log('Note: Any call currently mid-transcription/analysis will finish, then stop.');

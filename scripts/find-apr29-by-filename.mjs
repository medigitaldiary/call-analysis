/**
 * Re-fetches the Drive folder for Sharik's Apr 30 session and identifies
 * files whose filename contains a 20260429 timestamp (Apr 29 recordings
 * accidentally added to the Apr 30 folder).
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

// Get session folder URL
const [session] = await sql`SELECT * FROM bulk_sessions WHERE id = ${APR30_SESSION}`;
console.log(`Session: ${session.rm_name}, ${session.session_date}, folder: ${session.folder_url}`);

// Parse folder ID from URL (same as app's lib/drive.ts)
function parseFolderIdFromUrl(url) {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Could not parse folder ID from URL');
  return match[1];
}

// List all files in the Drive folder (same query as app)
async function listDriveFiles(folderId) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${apiKey}&pageSize=200`;
  const res = await fetch(url);
  if (!res.ok) { const e = await res.text(); throw new Error(`Drive API: ${e}`); }
  const data = await res.json();
  return data.files ?? [];
}

// Extract phone from filename (same logic as the app)
function stripInternationalPrefix(digits) {
  if (digits.startsWith('00') && digits.length === 14) return digits.slice(4);
  return null;
}
function extractPhoneFromFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, '');
  if (/^\d/.test(name)) {
    const raw = name.match(/^(\d+)/)?.[1] ?? '';
    if (raw.startsWith('00')) return stripInternationalPrefix(raw);
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  } else {
    const raw = name.match(/\((\d+)\)(?=[^(]*$)/)?.[1] ?? '';
    if (!raw) return null;
    if (raw.startsWith('00')) return stripInternationalPrefix(raw);
    return raw.length === 10 ? raw : null;
  }
}

const folderId = parseFolderIdFromUrl(session.folder_url);
const files = await listDriveFiles(folderId);

console.log(`\nTotal files in folder: ${files.length}`);

// Separate Apr 29 from Apr 30 by filename timestamp
const apr29Files = files.filter(f => f.name.includes('20260429'));
const apr30Files = files.filter(f => f.name.includes('20260430'));
const other      = files.filter(f => !f.name.includes('20260429') && !f.name.includes('20260430'));

console.log(`\n📅 Apr 30 files: ${apr30Files.length}`);
console.log(`📅 Apr 29 files (extra): ${apr29Files.length}`);
console.log(`❓ Other/undated files: ${other.length}`);

if (apr29Files.length > 0) {
  console.log('\n=== Apr 29 files that should NOT be in this session ===');
  for (const f of apr29Files) {
    const phone = extractPhoneFromFilename(f.name);
    console.log(`  📞 ${phone ?? '?'} | ${f.name}`);
  }
}

if (other.length > 0) {
  console.log('\n=== Undated files ===');
  for (const f of other) {
    const phone = extractPhoneFromFilename(f.name);
    console.log(`  📞 ${phone ?? '?'} | ${f.name}`);
  }
}

// Now match Apr 29 files to call records in the session by phone number
if (apr29Files.length > 0) {
  const apr29Phones = apr29Files.map(f => extractPhoneFromFilename(f.name)).filter(Boolean);
  // Also grab full filenames for ones without phone
  const apr29Names  = apr29Files.map(f => f.name.replace(/\.[^.]+$/, ''));

  const allCalls = await sql`
    SELECT c.id, c.prospect_name, c.status, c.error_msg, r.phone, r.customer_name
    FROM calls c
    LEFT JOIN reports r ON r.call_id = c.id
    WHERE c.session_id = ${APR30_SESSION}
  `;

  const toDelete = allCalls.filter(c => {
    const phoneMatch = c.phone && apr29Phones.includes(c.phone);
    const nameMatch  = apr29Names.some(n => c.prospect_name && c.prospect_name.includes(c.phone ?? ''));
    return phoneMatch || nameMatch;
  });

  console.log(`\n=== Calls to DELETE from Apr 30 session: ${toDelete.length} ===`);
  console.table(toDelete.map(c => ({
    call_id: c.id, phone: c.phone, customer: c.customer_name, status: c.status
  })));

  if (process.argv.includes('--delete') && toDelete.length > 0) {
    for (const c of toDelete) {
      await sql`DELETE FROM reports WHERE call_id = ${c.id}`;
      await sql`DELETE FROM calls WHERE id = ${c.id}`;
      console.log(`  ✅ Deleted call: ${c.phone} (${c.customer_name ?? 'unknown'})`);
    }
    await sql`
      UPDATE bulk_sessions
      SET total_files = total_files - ${toDelete.length}
      WHERE id = ${APR30_SESSION}
    `;
    console.log(`\n✅ Done. Removed ${toDelete.length} Apr 29 calls from Apr 30 session.`);
  } else if (toDelete.length > 0) {
    console.log('\nRun with --delete to remove these calls:');
    console.log('  node scripts/find-apr29-by-filename.mjs --delete');
  }
}

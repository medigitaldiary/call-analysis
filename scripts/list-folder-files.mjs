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
const [session] = await sql`SELECT * FROM bulk_sessions WHERE id = '29821127-7e81-444d-892a-d8e1452794bb'`;
const folderId = session.folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/)[1];

const res  = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&key=${process.env.GOOGLE_API_KEY}&pageSize=200`);
const data = await res.json();
const files = data.files ?? [];

console.log(`\nAll ${files.length} files in folder:\n`);
files.sort((a,b) => a.name.localeCompare(b.name));
files.forEach((f,i) => {
  // Extract date from timestamp in name: _YYYYMMDDHHMMSS
  const dateMatch = f.name.match(/_(\d{8})\d{6}/);
  const dateStr   = dateMatch ? dateMatch[1] : '????????';
  const flag      = dateStr !== '20260430' ? '  ⚠️  NOT APR 30' : '';
  console.log(`${String(i+1).padStart(2)}. [${dateStr}]  ${f.name}${flag}`);
});

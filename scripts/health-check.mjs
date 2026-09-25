#!/usr/bin/env node
// scripts/health-check.mjs
// Pings every external service call-analysis depends on and verifies the DB schema.
// Cost: ~$0.0001 (one 1-token Claude call). Everything else is metadata/list calls.
//
// Usage:
//   1. `vercel env pull .env.local` (or hand-copy env vars into your shell)
//   2. `node scripts/health-check.mjs`
//
// Exit code 0 = all green, 1 = at least one red.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const results = [];
const t0 = Date.now();

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const dot = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${dot} ${name.padEnd(28)} ${detail}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

console.log('\n── call-analysis · health check ─────────────────────────────\n');

// ── 1. Env vars present ──────────────────────────────────────────────────────
const required = [
  'DATABASE_URL', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY',
  'SARVAM_API_KEY', 'GOOGLE_API_KEY', 'RESEND_API_KEY',
];
for (const v of required) {
  record(`env · ${v}`, !!process.env[v], process.env[v] ? `set (${process.env[v].length} chars)` : 'MISSING');
}

// ── 2. Neon Postgres ─────────────────────────────────────────────────────────
await check('neon · SELECT 1', async () => {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
  const [{ one }] = await sql`SELECT 1 AS one`;
  await sql.end();
  if (one !== 1) throw new Error('unexpected result');
  return 'connected';
});

// ── 3. Neon schema — required tables + columns ───────────────────────────────
await check('neon · schema', async () => {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

  const expected = {
    calls:              ['id','created_at','prospect_name','company','rep_name','recording_url','stakeholders','status','session_id'],
    reports:            ['id','call_id','transcript','date_extracted','duration','customer_name','outcome','call_quality','agent_performance','summary','sentiment','speaker_breakdown','keywords','topics','compliance','action_items','doc_url','sheet_url','email_sent_at'],
    bulk_sessions:      ['id','rm_name','session_date','folder_url','total_files','processed_files','status','rm_report','doc_url','sheet_url','stakeholders'],
    token_usage:        ['id'],
    customer_profiles:  ['id'],
  };

  const missing = [];
  for (const [table, cols] of Object.entries(expected)) {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    const have = new Set(rows.map(r => r.column_name));
    if (have.size === 0) { missing.push(`table:${table}`); continue; }
    for (const c of cols) if (!have.has(c)) missing.push(`${table}.${c}`);
  }

  const [{ count: callCount }] = await sql`SELECT COUNT(*)::int AS count FROM calls`;
  const [{ count: sessCount }] = await sql`SELECT COUNT(*)::int AS count FROM bulk_sessions`;

  await sql.end();
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
  return `${callCount} calls, ${sessCount} sessions, all columns present`;
});

// ── 4. Anthropic Claude — cheapest possible ping ─────────────────────────────
await check('anthropic · messages', async () => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });
  return `model=${msg.model}, in=${msg.usage.input_tokens}t, out=${msg.usage.output_tokens}t`;
});

// ── 5. Sarvam STT — auth check via job creation ──────────────────────────────
// Sarvam has no /health endpoint. Creating a job costs nothing until audio is uploaded.
await check('sarvam · auth', async () => {
  const res = await fetch('https://api.sarvam.ai/speech-to-text/job/v1', {
    method: 'POST',
    headers: {
      'api-subscription-key': process.env.SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_parameters: { language_code: 'en-IN', model: 'saarika:v2.5', mode: 'transcribe', with_timestamps: true },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new Error(`auth failed: ${res.status}`);
  if (!res.ok) throw new Error(`unexpected status ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const { job_id } = await res.json();
  return `token accepted, job_id=${job_id?.slice(0, 8)}…`;
});

// ── 6. Google Drive API + folder public-share sanity ─────────────────────────
// If a folder ID is provided as HEALTH_CHECK_DRIVE_FOLDER, also test read.
await check('google-drive · api', async () => {
  const testId = process.env.HEALTH_CHECK_DRIVE_FOLDER || '1CKp3TV5pVBnWzceYTqAVbNM58mBcEniD';
  const url = `https://www.googleapis.com/drive/v3/files/${testId}?fields=id,name,mimeType&key=${process.env.GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} · ${body?.error?.message ?? 'unknown'}`);
  return `read "${body.name}" (${body.mimeType?.split('.').pop()})`;
});

// ── 7. Vercel Blob — list one blob ───────────────────────────────────────────
await check('vercel-blob · list', async () => {
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
  return `${blobs.length} blob(s) reachable`;
});

// ── 8. Resend — list domains (free) ──────────────────────────────────────────
await check('resend · domains', async () => {
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 120)}`);
  const { data } = await res.json();
  const verified = (data ?? []).filter(d => d.status === 'verified').map(d => d.name);
  if (verified.length === 0) throw new Error('no verified domain — Resend will refuse to send');
  return `verified: ${verified.join(', ')}`;
});

// ── 9. Gmail SMTP — connection + auth (optional, prod-only vars) ─────────────
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  await check('gmail · smtp auth', async () => {
    const { default: nodemailer } = await import('nodemailer');
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await t.verify();
    return `logged in as ${process.env.GMAIL_USER}`;
  });
} else {
  record('gmail · smtp auth', true, 'skipped (GMAIL_* not set locally — prod-only)');
}

// ── 10. Recent DB writes — did anything actually get saved? ──────────────────
await check('neon · recent activity', async () => {
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

  const [{ last }] = await sql`SELECT MAX(created_at) AS last FROM calls`;
  const [{ full }] = await sql`
    SELECT COUNT(*)::int AS full FROM reports
    WHERE summary IS NOT NULL AND outcome IS NOT NULL AND action_items IS NOT NULL
  `;
  const [{ empty }] = await sql`
    SELECT COUNT(*)::int AS empty FROM reports
    WHERE call_id IN (SELECT id FROM calls WHERE status = 'ready')
      AND summary IS NULL
  `;

  await sql.end();
  const lastStr = last ? new Date(last).toISOString().slice(0, 16) : 'never';
  const warn = empty > 0 ? ` · \x1b[33m${empty} ready-but-empty report(s)\x1b[0m` : '';
  return `last call ${lastStr}, ${full} fully-filled reports${warn}`;
});

// ── Summary ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
const took   = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n── ${results.length - failed.length} passed · ${failed.length} failed · ${took}s ──\n`);

if (failed.length > 0) {
  console.log('Failures:');
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.detail}`);
  console.log('');
  process.exit(1);
}

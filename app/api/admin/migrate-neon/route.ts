import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

// ONE-TIME migration: Neon (historical) → Supabase (current)
// Runs on Vercel — same AWS region as Neon, so no data-transfer quota issues.
// DELETE THIS FILE once migration is confirmed complete.
//
// Usage:
//   POST /api/admin/migrate-neon   { "secret": "radar-migrate-2026", "table": "all" | "bulk_sessions" | "calls" | "reports" | "day_reports" | "customer_profiles" }
//   Add ?dry_run=true to count rows without inserting.

export const maxDuration = 300;

const SECRET = 'radar-migrate-2026';
const BATCH  = 200; // rows per INSERT batch

function getNeon() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('NEON_DATABASE_URL not set');
  return postgres(url, { ssl: 'require', max: 3, connection: { options: '--client_min_messages=warning' } });
}

function getSupabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return postgres(url, { ssl: 'require', max: 3 });
}

async function migrateBulkSessions(neon: ReturnType<typeof postgres>, sb: ReturnType<typeof postgres>, dryRun: boolean) {
  const rows = await neon`
    SELECT id, created_at, rm_name, session_date, folder_url,
           total_files, processed_files, status, error_msg,
           rm_report, doc_url, sheet_url, stakeholders,
           COALESCE(input_tokens, 0)  AS input_tokens,
           COALESCE(output_tokens, 0) AS output_tokens,
           archived_at
    FROM bulk_sessions
    ORDER BY created_at ASC
  `;
  if (dryRun) return { table: 'bulk_sessions', found: rows.length };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sb`
      INSERT INTO bulk_sessions
        (id, created_at, rm_name, session_date, folder_url,
         total_files, processed_files, status, error_msg,
         rm_report, doc_url, sheet_url, stakeholders,
         input_tokens, output_tokens, sarvam_duration_sec, archived_at)
      SELECT
        id, created_at, rm_name, session_date, folder_url,
        total_files, processed_files, status, error_msg,
        rm_report, doc_url, sheet_url, stakeholders,
        input_tokens, output_tokens,
        0 AS sarvam_duration_sec,
        archived_at
      FROM json_populate_recordset(NULL::bulk_sessions, ${JSON.stringify(batch)})
      ON CONFLICT (id) DO NOTHING
    `;
    inserted += batch.length;
  }
  return { table: 'bulk_sessions', found: rows.length, inserted };
}

async function migrateCalls(neon: ReturnType<typeof postgres>, sb: ReturnType<typeof postgres>, dryRun: boolean) {
  const rows = await neon`
    SELECT id, created_at, prospect_name, company, rep_name,
           call_type, recording_url, drive_url, duration_sec,
           stakeholders, status, error_msg, session_id,
           COALESCE(has_transcript, false) AS has_transcript,
           user_id
    FROM calls
    ORDER BY created_at ASC
  `;
  if (dryRun) return { table: 'calls', found: rows.length };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sb`
      INSERT INTO calls
        (id, created_at, prospect_name, company, rep_name,
         call_type, recording_url, drive_url, duration_sec,
         stakeholders, status, error_msg, session_id,
         has_transcript, user_id)
      SELECT
        id, created_at, prospect_name, company, rep_name,
        call_type, recording_url, drive_url, duration_sec,
        stakeholders, status, error_msg, session_id,
        has_transcript, user_id
      FROM json_populate_recordset(NULL::calls, ${JSON.stringify(batch)})
      ON CONFLICT (id) DO NOTHING
    `;
    inserted += batch.length;
  }
  return { table: 'calls', found: rows.length, inserted };
}

async function migrateReports(neon: ReturnType<typeof postgres>, sb: ReturnType<typeof postgres>, dryRun: boolean) {
  // Fetch in batches to avoid memory issues (transcripts are large)
  const [{ n }] = await neon`SELECT COUNT(*) AS n FROM reports` as [{ n: string }];
  const total = Number(n);
  if (dryRun) return { table: 'reports', found: total };

  let inserted = 0;
  let offset = 0;
  while (offset < total) {
    const rows = await neon`
      SELECT id, call_id, created_at, transcript,
             date_extracted, time_extracted, duration, phone,
             customer_name, outcome, call_quality, agent_performance,
             summary, sentiment, speaker_breakdown, keywords, topics,
             compliance, action_items, doc_url, sheet_url,
             email_sent_at, email_recipients,
             COALESCE(input_tokens, 0)        AS input_tokens,
             COALESCE(output_tokens, 0)       AS output_tokens,
             COALESCE(sarvam_duration_sec, 0) AS sarvam_duration_sec,
             claude_latency_ms
      FROM reports
      ORDER BY created_at ASC
      LIMIT ${BATCH} OFFSET ${offset}
    `;
    if (rows.length === 0) break;

    await sb`
      INSERT INTO reports
        (id, call_id, created_at, transcript,
         date_extracted, time_extracted, duration, phone,
         customer_name, outcome, call_quality, agent_performance,
         summary, sentiment, speaker_breakdown, keywords, topics,
         compliance, action_items, doc_url, sheet_url,
         email_sent_at, email_recipients,
         input_tokens, output_tokens, sarvam_duration_sec, claude_latency_ms)
      SELECT
        id, call_id, created_at, transcript,
        date_extracted, time_extracted, duration, phone,
        customer_name, outcome, call_quality, agent_performance,
        summary, sentiment, speaker_breakdown, keywords, topics,
        compliance, action_items, doc_url, sheet_url,
        email_sent_at, email_recipients,
        input_tokens, output_tokens, sarvam_duration_sec, claude_latency_ms
      FROM json_populate_recordset(NULL::reports, ${JSON.stringify(rows)})
      ON CONFLICT (id) DO NOTHING
    `;
    inserted += rows.length;
    offset   += rows.length;
  }
  return { table: 'reports', found: total, inserted };
}

async function migrateDayReports(neon: ReturnType<typeof postgres>, sb: ReturnType<typeof postgres>, dryRun: boolean) {
  const rows = await neon`
    SELECT id, created_at, report_date, report, total_calls,
           COALESCE(input_tokens, 0)  AS input_tokens,
           COALESCE(output_tokens, 0) AS output_tokens
    FROM day_reports
    ORDER BY report_date ASC
  `;
  if (dryRun) return { table: 'day_reports', found: rows.length };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sb`
      INSERT INTO day_reports
        (id, created_at, report_date, report, total_calls, input_tokens, output_tokens)
      SELECT id, created_at, report_date, report, total_calls, input_tokens, output_tokens
      FROM json_populate_recordset(NULL::day_reports, ${JSON.stringify(batch)})
      ON CONFLICT (report_date) DO NOTHING
    `;
    inserted += batch.length;
  }
  return { table: 'day_reports', found: rows.length, inserted };
}

async function migrateCustomerProfiles(neon: ReturnType<typeof postgres>, sb: ReturnType<typeof postgres>, dryRun: boolean) {
  const rows = await neon`
    SELECT phone, user_id, name, created_at, updated_at
    FROM customer_profiles
    ORDER BY created_at ASC
  `;
  if (dryRun) return { table: 'customer_profiles', found: rows.length };
  if (rows.length === 0) return { table: 'customer_profiles', found: 0, inserted: 0 };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sb`
      INSERT INTO customer_profiles (phone, user_id, name, created_at, updated_at)
      SELECT phone, user_id, name, created_at, updated_at
      FROM json_populate_recordset(NULL::customer_profiles, ${JSON.stringify(batch)})
      ON CONFLICT (phone) DO NOTHING
    `;
    inserted += batch.length;
  }
  return { table: 'customer_profiles', found: rows.length, inserted };
}

export async function POST(req: NextRequest) {
  let neon: ReturnType<typeof postgres> | null = null;
  let sb:   ReturnType<typeof postgres> | null = null;

  try {
    const body   = await req.json();
    const secret = body.secret as string | undefined;
    const table  = (body.table as string | undefined) ?? 'all';
    const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true' || body.dry_run === true;

    if (secret !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify env vars are present before connecting
    if (!process.env.NEON_DATABASE_URL) return NextResponse.json({ error: 'NEON_DATABASE_URL not set' }, { status: 500 });
    if (!process.env.DATABASE_URL)      return NextResponse.json({ error: 'DATABASE_URL not set' },      { status: 500 });

    neon = getNeon();
    sb   = getSupabase();

    // Quick connectivity check on Neon before running full migration
    const [ping] = await neon`SELECT 1 AS ok` as [{ ok: number }];
    if (!ping) return NextResponse.json({ error: 'Neon connectivity check failed' }, { status: 500 });

    const results: Record<string, unknown>[] = [];

    if (table === 'all' || table === 'bulk_sessions') {
      results.push(await migrateBulkSessions(neon, sb, dryRun));
    }
    if (table === 'all' || table === 'calls') {
      results.push(await migrateCalls(neon, sb, dryRun));
    }
    if (table === 'all' || table === 'reports') {
      results.push(await migrateReports(neon, sb, dryRun));
    }
    if (table === 'all' || table === 'day_reports') {
      results.push(await migrateDayReports(neon, sb, dryRun));
    }
    if (table === 'all' || table === 'customer_profiles') {
      results.push(await migrateCustomerProfiles(neon, sb, dryRun));
    }

    return NextResponse.json({ ok: true, dry_run: dryRun, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await neon?.end().catch(() => {});
    await sb?.end().catch(() => {});
  }
}

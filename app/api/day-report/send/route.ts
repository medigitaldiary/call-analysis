import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendDayReportEmail, type RMAttachment, type SendMode } from '@/lib/gmail';
import { generateCombinedTranscriptXlsx, type RMTranscriptData } from '@/lib/day-report-xlsx';
import type { DayReport, RMReport } from '@/types';

export const maxDuration = 300;

// Days with more calls than this skip the combined transcript attachment.
const TRANSCRIPT_CALL_LIMIT = 200;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const date: string | undefined = body.date;
  if (!date) return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });

  const mode: SendMode = body.mode === 'production' ? 'production' : body.mode === 'internal' ? 'internal' : 'test';

  // Read recipients fresh on every request
  const recipientEnvVar =
    mode === 'production' ? (process.env.DAY_REPORT_PROD_RECIPIENTS      ?? '') :
    mode === 'internal'   ? (process.env.DAY_REPORT_INTERNAL_RECIPIENTS  ?? '') :
                            (process.env.DAY_REPORT_RECIPIENTS            ?? '');

  const recipients: string[] = body.recipients
    ?? recipientEnvVar.split(',').map((s: string) => s.trim()).filter(Boolean);

  if (!recipients.length) {
    const hint =
      mode === 'production' ? 'Set DAY_REPORT_PROD_RECIPIENTS in Vercel env vars' :
      mode === 'internal'   ? 'Set DAY_REPORT_INTERNAL_RECIPIENTS in Vercel env vars' :
                              'Set DAY_REPORT_RECIPIENTS in Vercel env vars';
    return NextResponse.json({ error: `No recipients configured for ${mode} mode. ${hint}` }, { status: 400 });
  }

  const sql = getDb();

  try {
    // 1. Load the stored day report
    const [dayRow] = await sql`SELECT * FROM day_reports WHERE report_date = ${date}`;
    if (!dayRow) {
      return NextResponse.json({ error: `No day report found for ${date}. Generate it first.` }, { status: 404 });
    }
    const rawReport = dayRow.report;
    const report = (typeof rawReport === 'string' ? JSON.parse(rawReport) : rawReport) as DayReport;

    // 2. Load all bulk sessions for that date
    const sessions = await sql`
      SELECT id, rm_name, session_date, sheet_url, rm_report
      FROM bulk_sessions
      WHERE DATE(session_date) = ${date}::date
        AND archived_at IS NULL
      ORDER BY session_date ASC
    `;

    // 3. Quick total-call count — decide upfront whether to pull transcripts.
    //    Fetching 400+ transcripts from the DB is the main source of timeouts.
    const [countRow] = await sql`
      SELECT COUNT(*) AS n
      FROM calls c
      JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE DATE(bs.session_date) = ${date}::date
        AND bs.archived_at IS NULL
    `;
    const totalCallCount = Number(countRow?.n ?? 0);
    const includeTranscripts = totalCallCount <= TRANSCRIPT_CALL_LIMIT;

    // 4. For each session: download existing RM xlsx.
    //    Also fetch call data (with or without transcripts) in parallel.
    const rmAttachments: RMAttachment[] = [];
    const rmTranscriptData: RMTranscriptData[] = [];

    await Promise.all(
      sessions.map(async (s: Record<string, unknown>) => {
        const sessionId    = s.id as string;
        const rmName       = s.rm_name as string;
        const sheetUrl     = s.sheet_url as string | null;
        const sessionDateStr = new Date(s.session_date as string).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        });

        // Download existing RM summary xlsx (if available) — always needed
        let xlsxBuffer: Buffer | undefined;
        if (sheetUrl) {
          try {
            const res = await fetch(sheetUrl, {
              headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
            });
            if (res.ok) xlsxBuffer = Buffer.from(await res.arrayBuffer());
          } catch { /* non-fatal */ }
        }

        rmAttachments.push({
          rmName,
          sessionDate: sessionDateStr,
          report: (typeof s.rm_report === 'string' ? JSON.parse(s.rm_report as string) : s.rm_report ?? {}) as RMReport,
          xlsxBuffer,
        });

        // Only fetch transcripts when the day is small enough for the xlsx attachment
        if (includeTranscripts) {
          const calls = await sql`
            SELECT
              r.phone,
              c.prospect_name    AS customer_name,
              r.duration,
              r.outcome,
              r.call_quality,
              r.agent_performance,
              r.summary,
              r.sentiment,
              r.action_items,
              r.compliance,
              r.transcript
            FROM calls c
            LEFT JOIN reports r ON r.call_id = c.id
            WHERE c.session_id = ${sessionId}
            ORDER BY c.created_at ASC
          `;

          rmTranscriptData.push({
            rmName,
            date: sessionDateStr,
            calls: calls.map((c: Record<string, unknown>) => ({
              phone:             c.phone             as string | null,
              customer_name:     c.customer_name     as string | null,
              duration:          c.duration          as string | null,
              outcome:           c.outcome           as string | null,
              call_quality:      c.call_quality      as string | null,
              agent_performance: c.agent_performance as string | null,
              summary:           c.summary           as string | null,
              sentiment:         c.sentiment         as { overall: string; agent: string; customer: string } | null,
              action_items:      c.action_items      as Array<{ priority: string; task: string; owner: string; deadline: string }> | null,
              compliance:        c.compliance        as string | null,
              transcript:        c.transcript        as string | null,
            })),
          });
        }
      })
    );

    // 5. Generate combined transcript xlsx (only for small-enough days)
    let transcriptXlsx: Buffer | undefined;
    if (includeTranscripts && rmTranscriptData.length > 0) {
      transcriptXlsx = generateCombinedTranscriptXlsx(rmTranscriptData);
    }

    // 6. Send email
    const { accepted } = await sendDayReportEmail(date, report, rmAttachments, recipients, transcriptXlsx, mode);

    return NextResponse.json({
      ok: true,
      mode,
      recipients: accepted,
      rm_reports_attached: rmAttachments.filter(a => a.xlsxBuffer).map(a => `${a.rmName} (${a.sessionDate})`),
      transcript_xlsx: transcriptXlsx ? `Transcripts_${date}.xlsx` : null,
      transcript_skipped: !includeTranscripts ? `${totalCallCount} calls — above ${TRANSCRIPT_CALL_LIMIT} limit` : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

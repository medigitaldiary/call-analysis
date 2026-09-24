import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateDayReport } from '@/lib/day-analyse';
import type { ActionItem } from '@/types';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { date } = await req.json(); // expects "YYYY-MM-DD"
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 });

  const sql = getDb();

  try {
    // ── Guard: all RM sessions for this date must be in 'ready' state ────────
    const sessions = await sql`
      SELECT rm_name, status, rm_report
      FROM bulk_sessions
      WHERE DATE(session_date) = ${date}::date
        AND archived_at IS NULL
    `;

    if (sessions.length > 0) {
      const notReady = sessions.filter(
        (s: Record<string, unknown>) => s.status !== 'ready' || !s.rm_report
      );
      if (notReady.length > 0) {
        const names = notReady
          .map((s: Record<string, unknown>) => `${s.rm_name} (${s.status})`)
          .join(', ');
        return NextResponse.json(
          { error: `Cannot generate day report — RM report(s) not ready yet: ${names}. Please wait for all sessions to finish processing.` },
          { status: 400 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch all completed calls + reports for the given date (exclude archived sessions)
    // For bulk session calls: match on session_date (the actual call date, set by the user)
    // For individual calls: match on created_at in IST
    const rows = await sql`
      SELECT
        c.rep_name,
        c.duration_sec,
        r.customer_name,
        r.phone,
        r.duration,
        r.outcome,
        r.summary,
        r.keywords,
        r.topics,
        r.action_items,
        r.sentiment,
        r.speaker_breakdown,
        r.call_quality,
        r.agent_performance
      FROM calls c
      LEFT JOIN reports r ON r.call_id = c.id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE c.status IN ('ready', 'sent')
        AND (c.session_id IS NULL OR bs.archived_at IS NULL)
        AND (
          (c.session_id IS NOT NULL AND DATE(bs.session_date) = ${date}::date)
          OR
          (c.session_id IS NULL AND DATE(c.created_at AT TIME ZONE 'Asia/Kolkata') = ${date}::date)
        )
      ORDER BY c.created_at ASC
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: `No completed calls found for ${date}` }, { status: 404 });
    }

    const callData = rows.map((c: Record<string, unknown>, i: number) => ({
      call_number:      i + 1,
      rep_name:         c.rep_name as string | null,
      customer_name:    c.customer_name as string | null,
      phone:            c.phone as string | null,
      duration:         c.duration as string | null,
      duration_sec:     c.duration_sec as number | null,
      outcome:          c.outcome as string | null,
      summary:          (c.summary as string | null)?.slice(0, 300) ?? null,
      keywords:         c.keywords as string[] | null,
      topics:           c.topics as string[] | null,
      action_items:     c.action_items as ActionItem[] | null,
      sentiment:        c.sentiment as { overall: string; agent: string; customer: string } | null,
      speaker_breakdown: c.speaker_breakdown as { language: string; agent_percentage: number; customer_percentage: number } | null,
      call_quality:     c.call_quality as string | null,
      agent_performance: c.agent_performance as string | null,
    }));

    // Compute total talk time
    const totalSec = callData.reduce((s, c) => s + (Number(c.duration_sec) || 0), 0);
    const totalMin = totalSec / 60;
    const computedTalkTime =
      totalSec === 0 ? '0 min' :
      totalMin < 1   ? `${totalSec}s` :
      totalMin < 60  ? `~${totalMin.toFixed(1)} min` :
                       `~${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}min`;

    const { report, input_tokens, output_tokens } = await generateDayReport(date, callData);

    // Override talk time with computed value
    report.overview.total_talk_time = computedTalkTime;

    // Upsert into day_reports (regenerating for same date overwrites)
    // Ensure token columns exist (idempotent migration)
    await sql`
      INSERT INTO day_reports (report_date, report, total_calls, input_tokens, output_tokens)
      VALUES (${date}, ${sql.json(report as unknown as import('postgres').JSONValue)}, ${rows.length}, ${input_tokens}, ${output_tokens})
      ON CONFLICT (report_date)
      DO UPDATE SET
        report        = ${sql.json(report as unknown as import('postgres').JSONValue)},
        total_calls   = ${rows.length},
        input_tokens  = ${input_tokens},
        output_tokens = ${output_tokens}
    `;

    return NextResponse.json({ report, date, total_calls: rows.length, input_tokens, output_tokens });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Day report generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

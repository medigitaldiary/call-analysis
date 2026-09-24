import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateRMReport } from '@/lib/rm-analyse';

export const maxDuration = 300; // Claude RM report generation can take time for large sessions
import { generateRMDocx } from '@/lib/rm-docx';
import { generateRMXlsx } from '@/lib/rm-xlsx';
import { put } from '@vercel/blob';
import type { ActionItem } from '@/types';

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  const sql = getDb();

  try {
    await sql`UPDATE bulk_sessions SET status = 'generating' WHERE id = ${sessionId}`;

    const [session] = await sql`SELECT * FROM bulk_sessions WHERE id = ${sessionId}`;
    if (!session) throw new Error('Session not found');

    // Fetch all calls + reports for this session
    const calls = await sql`SELECT c.*, r.* FROM calls c LEFT JOIN reports r ON r.call_id = c.id WHERE c.session_id = ${sessionId} ORDER BY c.created_at ASC`;

    const callData = calls.map((c: Record<string, unknown>, i: number) => {
      // Truncate large text fields to keep the Claude prompt manageable for large sessions
      const kw = Array.isArray(c.keywords) ? (c.keywords as string[]).slice(0, 5) : null;
      const tp = Array.isArray(c.topics)   ? (c.topics   as string[]).slice(0, 3) : null;
      return {
        call_number: i + 1,
        customer_name: c.customer_name as string | null,
        phone: c.phone as string | null,
        duration: c.duration as string | null,
        duration_sec: c.duration_sec as number | null,
        outcome: c.outcome as string | null,
        summary: (c.summary as string | null)?.slice(0, 300) ?? null,
        keywords: kw,
        topics: tp,
        action_items: c.action_items as ActionItem[] | null,
        sentiment: c.sentiment as { overall: string; agent: string; customer: string } | null,
        speaker_breakdown: c.speaker_breakdown as { language: string; agent_percentage: number; customer_percentage: number; description: string } | null,
        compliance: c.compliance as string | null,
        call_quality: c.call_quality as string | null,
        agent_performance: c.agent_performance as string | null,
      };
    });

    // Compute total talk time ourselves (avoids Claude adding verbose explanations)
    const totalSec = callData.reduce((sum, c) => sum + (Number(c.duration_sec) || 0), 0);
    const totalMin = totalSec / 60;
    const computedTalkTime =
      totalSec === 0 ? '0 min' :
      totalMin < 1   ? `${totalSec}s` :
      totalMin < 60  ? `~${totalMin.toFixed(1)} min` :
                       `~${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}min`;

    // Compute median agent performance score in code (excludes null/gated calls)
    const agentScores = callData
      .map(c => c.agent_performance)
      .filter((s): s is string => s !== null && s !== '')
      .map(s => parseFloat(s.split('/')[0]))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    let computedMedian = 'N/A';
    if (agentScores.length > 0) {
      const mid = Math.floor(agentScores.length / 2);
      const median = agentScores.length % 2 === 0
        ? (agentScores[mid - 1] + agentScores[mid]) / 2
        : agentScores[mid];
      computedMedian = `${median % 1 === 0 ? median.toFixed(0) : median.toFixed(1)}/10`;
    }

    // Generate RM report via Claude
    const { report: rmReport, input_tokens, output_tokens } = await generateRMReport(session.rm_name, session.session_date, callData);

    // Override Claude's values with our computed ones
    rmReport.overview.total_talk_time = computedTalkTime;
    rmReport.agent_performance.avg_performance = computedMedian;

    // Generate .docx
    const docBuffer = await generateRMDocx(session.rm_name, session.session_date, rmReport);
    const { url: docUrl } = await put(`rm-reports/${sessionId}.docx`, docBuffer, { access: 'private', allowOverwrite: true });

    // Generate .xlsx
    const xlsxBuffer = generateRMXlsx(session.rm_name, session.session_date, rmReport, callData);
    const { url: sheetUrl } = await put(`rm-reports/${sessionId}.xlsx`, xlsxBuffer, { access: 'private', allowOverwrite: true });

    // Save to session — include token usage for this RM report generation
    // Also sum up tokens from all individual call analyses in this session
    const callTokens = await sql`
      SELECT COALESCE(SUM(input_tokens),0) AS total_in, COALESCE(SUM(output_tokens),0) AS total_out
      FROM reports WHERE call_id IN (SELECT id FROM calls WHERE session_id = ${sessionId})
    `;
    const totalIn  = Number(callTokens[0]?.total_in  ?? 0) + input_tokens;
    const totalOut = Number(callTokens[0]?.total_out ?? 0) + output_tokens;

    await sql`
      UPDATE bulk_sessions SET
        status = 'ready',
        rm_report = ${sql.json(rmReport as unknown as import('postgres').JSONValue)},
        doc_url = ${docUrl},
        sheet_url = ${sheetUrl},
        input_tokens = ${totalIn},
        output_tokens = ${totalOut}
      WHERE id = ${sessionId}
    `;

    return NextResponse.json({ rmReport, docUrl, sheetUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Report generation failed';
    await sql`UPDATE bulk_sessions SET status = 'error', error_msg = ${message} WHERE id = ${sessionId}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyseTranscript } from '@/lib/analyse';

export async function POST(req: NextRequest) {
  const { callId } = await req.json();
  const sql = getDb();

  try {
    const [report] = await sql`SELECT transcript FROM reports WHERE call_id = ${callId}`;
    if (!report?.transcript) throw new Error('Transcript not found');

    await sql`UPDATE calls SET status = 'analysing' WHERE id = ${callId}`;

    const r = await analyseTranscript(report.transcript);

    await sql`
      UPDATE reports SET
        date_extracted    = ${r.date_extracted ?? null},
        time_extracted    = ${r.time_extracted ?? null},
        duration          = ${r.duration ?? null},
        phone             = ${r.phone ?? null},
        customer_name     = ${r.customer_name ?? null},
        outcome           = ${r.outcome ?? null},
        call_quality      = ${r.call_quality ?? null},
        agent_performance = ${r.agent_performance ?? null},
        summary           = ${r.summary ?? null},
        sentiment         = ${JSON.stringify(r.sentiment ?? null)},
        speaker_breakdown = ${JSON.stringify(r.speaker_breakdown ?? null)},
        keywords          = ${JSON.stringify(r.keywords ?? [])},
        topics            = ${JSON.stringify(r.topics ?? [])},
        compliance        = ${r.compliance ?? null},
        action_items      = ${JSON.stringify(r.action_items ?? [])},
        input_tokens      = ${r.input_tokens ?? 0},
        output_tokens     = ${r.output_tokens ?? 0},
        claude_latency_ms = ${r.claude_latency_ms ?? null}
      WHERE call_id = ${callId}
    `;

    await sql`UPDATE calls SET status = 'generating' WHERE id = ${callId}`;

    return NextResponse.json({ report: r });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await sql`UPDATE calls SET status = 'error', error_msg = ${message} WHERE id = ${callId}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

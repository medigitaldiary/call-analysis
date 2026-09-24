import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { transcribeAudio } from '@/lib/transcribe';
import { analyseTranscript } from '@/lib/analyse';

export const maxDuration = 300; // 5 minutes — needed for batch STT polling

export async function POST(req: NextRequest) {
  const { callId, sessionId, audioUrlOverride } = await req.json();
  const sql = getDb();

  try {
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId}`;
    if (!call) throw new Error('Call not found');

    // If this call was cancelled before processing started, skip silently
    if (call.status === 'error' && call.error_msg === 'Cancelled by admin') {
      return NextResponse.json({ skipped: true, reason: 'cancelled' });
    }

    const audioUrl = audioUrlOverride ?? call.drive_url ?? call.recording_url;
    if (!audioUrl) throw new Error('No audio URL');

    // Transcribe
    await sql`UPDATE calls SET status = 'transcribing' WHERE id = ${callId}`;
    const { text, duration } = await transcribeAudio(audioUrl);
    await sql`UPDATE calls SET status = 'analysing', duration_sec = ${Math.round(duration)} WHERE id = ${callId}`;
    await sql`UPDATE reports SET transcript = ${text}, sarvam_duration_sec = ${Math.round(duration)} WHERE call_id = ${callId}`;

    // Analyse (pass duration so the scoring gate can apply: <60s → skip scores; quality<4 → skip agent_performance)
    const analysis = await analyseTranscript(text, Math.round(duration));
    await sql`
      UPDATE reports SET
        date_extracted = ${analysis.date_extracted ?? null},
        time_extracted = ${analysis.time_extracted ?? null},
        duration = ${analysis.duration ?? null},
        phone = COALESCE(phone, ${analysis.phone ?? null}),
        customer_name = ${analysis.customer_name ?? null},
        outcome = ${analysis.outcome ?? null},
        call_quality = ${analysis.call_quality ?? null},
        agent_performance = ${analysis.agent_performance ?? null},
        summary = ${analysis.summary ?? null},
        sentiment = ${analysis.sentiment ? sql.json(analysis.sentiment as unknown as import('postgres').JSONValue) : null},
        speaker_breakdown = ${analysis.speaker_breakdown ? sql.json(analysis.speaker_breakdown as unknown as import('postgres').JSONValue) : null},
        keywords = ${analysis.keywords ? sql.json(analysis.keywords as unknown as import('postgres').JSONValue) : null},
        topics = ${analysis.topics ? sql.json(analysis.topics as unknown as import('postgres').JSONValue) : null},
        compliance = ${analysis.compliance ?? null},
        action_items = ${analysis.action_items ? sql.json(analysis.action_items as unknown as import('postgres').JSONValue) : null},
        input_tokens = ${analysis.input_tokens ?? 0},
        output_tokens = ${analysis.output_tokens ?? 0},
        claude_latency_ms = ${analysis.claude_latency_ms ?? null}
      WHERE call_id = ${callId}
    `;
    await sql`UPDATE calls SET status = 'ready' WHERE id = ${callId}`;

    // Increment session processed count
    await sql`UPDATE bulk_sessions SET processed_files = processed_files + 1 WHERE id = ${sessionId}`;

    return NextResponse.json({ success: true, analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    await sql`UPDATE calls SET status = 'error', error_msg = ${message} WHERE id = ${callId}`;
    // Still increment so we don't stall
    await sql`UPDATE bulk_sessions SET processed_files = processed_files + 1 WHERE id = ${sessionId}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { transcribeAudio } from '@/lib/transcribe';

export async function POST(req: NextRequest) {
  const { callId } = await req.json();
  const sql = getDb();

  try {
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId}`;
    if (!call) throw new Error('Call not found');

    const audioUrl = call.recording_url ?? call.drive_url;
    if (!audioUrl) throw new Error('No recording URL found for this call');

    await sql`UPDATE calls SET status = 'transcribing' WHERE id = ${callId}`;

    const { text, duration } = await transcribeAudio(audioUrl);

    await sql`UPDATE calls SET status = 'analysing', duration_sec = ${Math.round(duration)} WHERE id = ${callId}`;
    await sql`UPDATE reports SET transcript = ${text}, sarvam_duration_sec = ${Math.round(duration)} WHERE call_id = ${callId}`;

    return NextResponse.json({ text, duration });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    await sql`UPDATE calls SET status = 'error', error_msg = ${message} WHERE id = ${callId}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const maxDuration = 60; // Resetting 60+ calls can take a moment

// Extracts Drive file ID from any Drive URL format
function extractDriveFileId(url: string): string | null {
  // googleapis.com/drive/v3/files/{id}?alt=media
  const apiMatch = url.match(/\/files\/([a-zA-Z0-9_-]+)/);
  if (apiMatch) return apiMatch[1];
  // drive.google.com/uc?id={id}
  const ucMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];
  return null;
}

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const sql = getDb();

  // Find all calls in session that need retrying:
  // - status = 'error'
  // - status = 'uploaded' — never processed (browser loop died before reaching them)
  // - status stuck in intermediate state (transcribing/analysing/generating) — browser loop died mid-call
  // - status = 'ready' but transcript is empty
  const stale = await sql`
    SELECT c.id, c.drive_url
    FROM calls c
    LEFT JOIN reports r ON r.call_id = c.id
    WHERE c.session_id = ${sessionId}
      AND (
        c.status IN ('error', 'uploaded', 'transcribing', 'analysing', 'generating')
        OR (c.status = 'ready' AND (r.transcript IS NULL OR r.transcript = ''))
      )
  `;

  if (stale.length === 0) {
    return NextResponse.json({ message: 'No calls need retrying', callIds: [] });
  }

  const callIds: string[] = [];

  for (const call of stale) {
    const rawUrl = String(call.drive_url ?? '').trim();
    const fileId = extractDriveFileId(rawUrl);

    // Fix URL to public export format (avoids 403 from API key download)
    const fixedUrl = fileId
      ? `https://drive.google.com/uc?export=download&id=${fileId}&confirm=1`
      : rawUrl;

    // Reset call to 'uploaded' with fixed URL
    await sql`
      UPDATE calls
      SET status = 'uploaded', error_msg = NULL, drive_url = ${fixedUrl}
      WHERE id = ${call.id}
    `;

    // Clear stale report data but keep phone
    await sql`
      UPDATE reports
      SET transcript = NULL, summary = NULL, outcome = NULL,
          customer_name = NULL, duration = NULL, call_quality = NULL,
          agent_performance = NULL, sentiment = NULL, speaker_breakdown = NULL,
          keywords = NULL, topics = NULL, compliance = NULL, action_items = NULL,
          input_tokens = 0, output_tokens = 0, claude_latency_ms = NULL
      WHERE call_id = ${call.id}
    `;

    callIds.push(call.id);
  }

  // Reset session status so RM report can be regenerated after retry
  await sql`UPDATE bulk_sessions SET status = 'processing' WHERE id = ${sessionId}`;

  return NextResponse.json({ callIds, total: callIds.length });
}

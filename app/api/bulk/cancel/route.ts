import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/bulk/cancel  { sessionId }
// Marks all queued (uploaded) calls in the session as cancelled and sets the session status to cancelled.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  const sql = getDb();

  try {
    // Cancel only calls that haven't started yet (uploaded = waiting in queue)
    // Use 'error' status since the DB check constraint doesn't include 'cancelled'
    const cancelled = await sql`
      UPDATE calls
      SET status = 'error', error_msg = 'Cancelled by admin'
      WHERE session_id = ${sessionId}
        AND status = 'uploaded'
      RETURNING id
    `;

    // Mark the session itself as errored/cancelled
    await sql`
      UPDATE bulk_sessions
      SET status = 'error'
      WHERE id = ${sessionId}
    `;

    return NextResponse.json({
      success: true,
      cancelled_calls: cancelled.length,
      message: `Cancelled ${cancelled.length} queued call(s). Any call currently transcribing/analysing will finish naturally.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cancel failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

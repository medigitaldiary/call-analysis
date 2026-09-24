import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const sql = getDb();
  const sessions = await sql`
    SELECT
      bs.id,
      bs.rm_name,
      bs.session_date,
      bs.status,
      bs.total_files,
      bs.archived_at,
      COUNT(c.id) AS call_count
    FROM bulk_sessions bs
    LEFT JOIN calls c ON c.session_id = bs.id
    WHERE bs.archived_at IS NOT NULL
    GROUP BY bs.id
    ORDER BY bs.archived_at DESC
  `;
  return NextResponse.json({ sessions });
}

// Restore a session from archive
export async function DELETE(req: Request) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const sql = getDb();
  await sql`UPDATE bulk_sessions SET archived_at = NULL WHERE id = ${sessionId}`;
  return NextResponse.json({ ok: true });
}

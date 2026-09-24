import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const sql = getDb();
  await sql`UPDATE bulk_sessions SET archived_at = NOW() WHERE id = ${sessionId}`;
  return NextResponse.json({ ok: true });
}

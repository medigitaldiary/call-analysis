import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get('callId');
    if (!callId) return NextResponse.json({ error: 'callId required' }, { status: 400 });

    const sql = getDb();
    const [report] = await sql`SELECT * FROM reports WHERE call_id = ${callId}`;
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    return NextResponse.json({ report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

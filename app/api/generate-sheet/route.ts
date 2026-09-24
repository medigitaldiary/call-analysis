import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateXlsx } from '@/lib/xlsx';
import { put } from '@vercel/blob';
import type { Call, Report } from '@/types';

export async function POST(req: NextRequest) {
  const { callId } = await req.json();
  const sql = getDb();

  try {
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId}`;
    const [report] = await sql`SELECT * FROM reports WHERE call_id = ${callId}`;
    if (!call || !report) throw new Error('Call or report not found');

    const buffer = generateXlsx(call as unknown as Call, report as unknown as Report);
    const blob = await put(`reports/${callId}/report.xlsx`, buffer, {
      access: 'private',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await sql`UPDATE reports SET sheet_url = ${blob.url} WHERE call_id = ${callId}`;

    // Mark call as ready once sheet is done (doc may already be set)
    const [updated] = await sql`SELECT doc_url FROM reports WHERE call_id = ${callId}`;
    if (updated?.doc_url) {
      await sql`UPDATE calls SET status = 'ready' WHERE id = ${callId}`;
    }

    return NextResponse.json({ sheetUrl: blob.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sheet generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

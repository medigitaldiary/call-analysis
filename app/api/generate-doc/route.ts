import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateDocx } from '@/lib/docx';
import { put } from '@vercel/blob';
import type { Call, Report } from '@/types';

export async function POST(req: NextRequest) {
  const { callId } = await req.json();
  const sql = getDb();

  try {
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId}`;
    const [report] = await sql`SELECT * FROM reports WHERE call_id = ${callId}`;
    if (!call || !report) throw new Error('Call or report not found');

    const buffer = await generateDocx(call as unknown as Call, report as unknown as Report);
    const blob = await put(`reports/${callId}/report.docx`, buffer, {
      access: 'private',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await sql`UPDATE reports SET doc_url = ${blob.url} WHERE call_id = ${callId}`;

    return NextResponse.json({ docUrl: blob.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Doc generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

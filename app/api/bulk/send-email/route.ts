import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendRMReportEmail } from '@/lib/email';
import type { RMReport } from '@/types';

export async function POST(req: NextRequest) {
  const { sessionId, stakeholders } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  if (!stakeholders?.length) return NextResponse.json({ error: 'No stakeholder emails provided' }, { status: 400 });

  const sql = getDb();
  const [session] = await sql`SELECT * FROM bulk_sessions WHERE id = ${sessionId}`;
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (!session.rm_report) return NextResponse.json({ error: 'RM report not ready yet' }, { status: 400 });

  try {
    const rawRmReport = session.rm_report;
    const report = (typeof rawRmReport === 'string' ? JSON.parse(rawRmReport) : rawRmReport) as RMReport;
    const sessionDate = new Date(session.session_date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    let docBuffer: Buffer | undefined;
    let sheetBuffer: Buffer | undefined;

    if (session.doc_url) {
      const res = await fetch(session.doc_url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (res.ok) docBuffer = Buffer.from(await res.arrayBuffer());
    }
    if (session.sheet_url) {
      const res = await fetch(session.sheet_url, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (res.ok) sheetBuffer = Buffer.from(await res.arrayBuffer());
    }

    const messageId = await sendRMReportEmail(
      session.rm_name,
      sessionDate,
      report,
      stakeholders,
      docBuffer,
      sheetBuffer,
    );

    await sql`
      UPDATE bulk_sessions
      SET stakeholders = ${stakeholders}, status = 'ready'
      WHERE id = ${sessionId}
    `;

    return NextResponse.json({ messageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

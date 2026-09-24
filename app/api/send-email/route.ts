import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendStakeholderEmail } from '@/lib/email';
import type { Call, Report } from '@/types';

export async function POST(req: NextRequest) {
  const { callId, stakeholders: bodyStakeholders } = await req.json();
  const sql = getDb();

  try {
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId}`;
    const [report] = await sql`SELECT * FROM reports WHERE call_id = ${callId}`;
    if (!call || !report) throw new Error('Call or report not found');

    // Use stakeholders from request body if provided, else fall back to saved ones
    const stakeholders: string[] = bodyStakeholders?.length
      ? bodyStakeholders
      : call.stakeholders ?? [];

    if (!stakeholders.length) throw new Error('No stakeholders defined for this call');

    // Persist the stakeholders back to the call record
    await sql`UPDATE calls SET stakeholders = ${stakeholders} WHERE id = ${callId}`;
    call.stakeholders = stakeholders;

    let docBuffer: Buffer | undefined;
    let sheetBuffer: Buffer | undefined;

    if (report.doc_url) {
      const res = await fetch(report.doc_url);
      if (res.ok) docBuffer = Buffer.from(await res.arrayBuffer());
    }
    if (report.sheet_url) {
      const res = await fetch(report.sheet_url);
      if (res.ok) sheetBuffer = Buffer.from(await res.arrayBuffer());
    }

    const messageId = await sendStakeholderEmail(call as unknown as Call, report as unknown as Report, docBuffer, sheetBuffer);

    await sql`
      UPDATE reports
      SET email_sent_at = NOW(), email_recipients = ${call.stakeholders}
      WHERE call_id = ${callId}
    `;
    await sql`UPDATE calls SET status = 'sent' WHERE id = ${callId}`;

    return NextResponse.json({ messageId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

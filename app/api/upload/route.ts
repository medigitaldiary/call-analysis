import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { put } from '@vercel/blob';

export async function POST(req: NextRequest) {
  try {
    const sql = getDb();
    const formData = await req.formData();

    const prospectName = formData.get('prospect_name') as string;
    const company = formData.get('company') as string;
    const repName = formData.get('rep_name') as string;
    const callType = formData.get('call_type') as string;
    const stakeholdersRaw = formData.get('stakeholders') as string;
    const driveUrl = formData.get('drive_url') as string | null;
    const file = formData.get('file') as File | null;

    const stakeholders = stakeholdersRaw
      ? stakeholdersRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const [call] = await sql`
      INSERT INTO calls (prospect_name, company, rep_name, call_type, stakeholders, drive_url, status)
      VALUES (${prospectName}, ${company}, ${repName}, ${callType}, ${stakeholders}, ${driveUrl ?? null}, 'uploaded')
      RETURNING *
    `;

    let recordingUrl = driveUrl ?? null;

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const blob = await put(`recordings/${call.id}/${file.name}`, buffer, {
        access: 'private',
        contentType: file.type,
      });
      recordingUrl = blob.url;
      await sql`UPDATE calls SET recording_url = ${recordingUrl} WHERE id = ${call.id}`;
    }

    await sql`INSERT INTO reports (call_id) VALUES (${call.id})`;

    return NextResponse.json({ callId: call.id, recordingUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

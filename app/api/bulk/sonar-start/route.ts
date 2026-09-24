import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface SonarRecordingPayload {
  sonarCallId: string;
  sonarTaskId: string;
  sonarTaskName: string;
  signedUrl: string;
  durationSecs: number;
  direction: string;
  startedAt: string;
  answeredAt: string | null;
  customerPhone: string | null;
}

export async function POST(req: NextRequest) {
  const { rmName, sessionDate, recordings, stakeholders } = await req.json() as {
    rmName: string;
    sessionDate: string;
    recordings: SonarRecordingPayload[];
    stakeholders?: string[];
  };

  const sql = getDb();

  if (!recordings || recordings.length === 0)
    return NextResponse.json({ error: 'No recordings provided' }, { status: 400 });

  try {
    const [session] = await sql`
      INSERT INTO bulk_sessions (rm_name, session_date, folder_url, total_files, stakeholders, source)
      VALUES (
        ${rmName},
        ${sessionDate},
        ${'sonar://' + rmName},
        ${recordings.length},
        ${stakeholders ?? []},
        'sonar'
      )
      RETURNING *
    `;

    const callIds: string[] = [];

    for (const rec of recordings) {
      const prospectLabel = rec.customerPhone ?? rec.sonarTaskName;

      const [call] = await sql`
        INSERT INTO calls (
          prospect_name, company, rep_name, call_type,
          recording_url, stakeholders, status, session_id,
          sonar_task_id, sonar_task_name
        )
        VALUES (
          ${prospectLabel},
          'Sonar Session',
          ${rmName},
          'Sonar Call',
          ${rec.signedUrl},
          ${stakeholders ?? []},
          'uploaded',
          ${session.id},
          ${rec.sonarTaskId},
          ${rec.sonarTaskName}
        )
        RETURNING id
      `;

      await sql`INSERT INTO reports (call_id, phone) VALUES (${call.id}, ${rec.customerPhone ?? null})`;
      callIds.push(call.id);
    }

    return NextResponse.json({ sessionId: session.id, callIds, totalFiles: recordings.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start Sonar session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseFolderIdFromUrl, listDriveFiles } from '@/lib/drive';

function stripInternationalPrefix(digits: string): string | null {
  // 00 + country code 91 + 10-digit number = 14 digits total
  // Strip the leading 0091 (4 chars) to get the 10-digit number
  if (digits.startsWith('00') && digits.length === 14) {
    return digits.slice(4); // removes '0091'
  }
  return null;
}

function extractPhoneFromFilename(filename: string): string | null {
  const name = filename.replace(/\.[^.]+$/, ''); // strip extension

  if (/^\d/.test(name)) {
    // Starts with digits — grab the leading digit sequence
    const raw = name.match(/^(\d+)/)?.[1] ?? '';
    if (raw.startsWith('00')) {
      return stripInternationalPrefix(raw);
    }
    // Plain 10-digit number at the start
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  } else {
    // Starts with letters — extract number from last (...) before underscore
    const raw = name.match(/\((\d+)\)(?=[^(]*$)/)?.[1] ?? '';
    if (!raw) return null;
    if (raw.startsWith('00')) {
      return stripInternationalPrefix(raw);
    }
    return raw.length === 10 ? raw : null;
  }
}

const DAILY_CAP = Number(process.env.DAILY_CALL_LIMIT ?? 100);

export async function POST(req: NextRequest) {
  const { rmName, sessionDate, folderUrl, stakeholders, fileIds } = await req.json();
  const sql = getDb();

  try {
    const folderId  = parseFolderIdFromUrl(folderUrl);
    const allFiles  = await listDriveFiles(folderId);

    // When called from combined upload, fileIds filters to just this RM's files
    const fileIdSet = fileIds && fileIds.length > 0 ? new Set<string>(fileIds) : null;
    const files     = fileIdSet ? allFiles.filter(f => fileIdSet.has(f.id)) : allFiles;

    if (files.length === 0) {
      return NextResponse.json({ error: 'No audio files found in the folder. Make sure the folder contains audio files and is shared publicly.' }, { status: 400 });
    }

    // ── Daily cap check ───────────────────────────────────────────────────
    const [{ today_count }] = await sql`
      SELECT COUNT(*) AS today_count FROM calls
      WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'
    `;
    const usedToday  = Number(today_count);
    const remaining  = DAILY_CAP - usedToday;

    if (remaining <= 0) {
      return NextResponse.json({
        error: `Daily limit of ${DAILY_CAP} calls reached for today. Used: ${usedToday}/${DAILY_CAP}. Try again tomorrow.`,
      }, { status: 429 });
    }

    if (files.length > remaining) {
      return NextResponse.json({
        error: `This folder has ${files.length} files but only ${remaining} calls remain in today's limit (${usedToday}/${DAILY_CAP} used). Please reduce the folder to ${remaining} files or fewer.`,
      }, { status: 429 });
    }

    // Create bulk session
    const [session] = await sql`
      INSERT INTO bulk_sessions (rm_name, session_date, folder_url, total_files, stakeholders)
      VALUES (${rmName}, ${sessionDate}, ${folderUrl}, ${files.length}, ${stakeholders ?? []})
      RETURNING *
    `;

    // Create a call record for each file
    const callIds: string[] = [];
    for (const file of files) {
      // Use direct export URL — API key download (?alt=media) returns 403 for some files
      const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}&confirm=1`;

      // Extract phone number from filename — four possible formats:
      // 1. 9634772961(9634772961)_ts.mp3        → starts with digits, take first 10
      // 2. 00917004304511(...)_ts.mp3            → starts with 00, strip 00+91 → last 10
      // 3. Name(00919232485035)_ts.mp3           → starts with letter, bracket has 00+91+10, strip 00+91
      // 4. Name(7907163125)_ts.mp3              → starts with letter, bracket has 10 digits, use as-is
      const phoneNumber = extractPhoneFromFilename(file.name);
      const prospectLabel = phoneNumber ?? file.name;

      const [call] = await sql`
        INSERT INTO calls (prospect_name, company, rep_name, call_type, drive_url, stakeholders, status, session_id)
        VALUES (${prospectLabel}, 'Bulk Session', ${rmName}, 'Bulk Call', ${driveDownloadUrl}, ${stakeholders ?? []}, 'uploaded', ${session.id})
        RETURNING id
      `;
      // Pre-populate phone in reports row so User View grouping works immediately
      await sql`INSERT INTO reports (call_id, phone) VALUES (${call.id}, ${phoneNumber})`;
      callIds.push(call.id);
    }

    return NextResponse.json({ sessionId: session.id, callIds, totalFiles: files.length, files });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start bulk session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

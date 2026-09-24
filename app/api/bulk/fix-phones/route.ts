import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseFolderIdFromUrl, listDriveFiles } from '@/lib/drive';

// Mirrors the extraction logic in bulk/start/route.ts
function stripInternationalPrefix(digits: string): string | null {
  // 00 + country code 91 + 10-digit number = 14 digits
  if (digits.startsWith('00') && digits.length === 14) {
    return digits.slice(4); // removes '0091'
  }
  return null;
}

function extractPhoneFromFilename(filename: string): string | null {
  const name = filename.replace(/\.[^.]+$/, ''); // strip extension

  if (/^\d/.test(name)) {
    const raw = name.match(/^(\d+)/)?.[1] ?? '';
    if (raw.startsWith('00')) return stripInternationalPrefix(raw);
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  } else {
    // Starts with letters — extract number from last (...) group
    const raw = name.match(/\((\d+)\)(?=[^(]*$)/)?.[1] ?? '';
    if (!raw) return null;
    if (raw.startsWith('00')) return stripInternationalPrefix(raw);
    return raw.length === 10 ? raw : null;
  }
}

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const sql = getDb();

  const [session] = await sql`SELECT * FROM bulk_sessions WHERE id = ${sessionId}`;
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    // Re-fetch filenames from Drive
    const folderId = parseFolderIdFromUrl(session.folder_url);
    const files = await listDriveFiles(folderId);

    // Build fileId → filename map
    const fileMap = new Map(files.map((f: { id: string; name: string }) => [f.id, f.name]));

    // Get all calls for this session with their drive URLs
    const calls = await sql`SELECT id, drive_url FROM calls WHERE session_id = ${sessionId}`;

    let updated = 0;
    for (const call of calls) {
      // Extract Drive file ID from stored URL
      const fileIdMatch = String(call.drive_url ?? '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) continue;

      const filename = fileMap.get(fileIdMatch[1]);
      if (!filename) continue;

      const phone = extractPhoneFromFilename(filename);
      const prospectLabel = phone ?? filename.replace(/\.[^.]+$/, ''); // fallback: filename without extension

      await sql`UPDATE calls SET prospect_name = ${prospectLabel} WHERE id = ${call.id}`;
      await sql`UPDATE reports SET phone = ${phone} WHERE call_id = ${call.id}`;
      updated++;
    }

    return NextResponse.json({ updated, total: calls.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fix phones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

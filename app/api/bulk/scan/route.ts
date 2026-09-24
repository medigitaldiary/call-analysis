import { NextRequest, NextResponse } from 'next/server';
import { parseFolderIdFromUrl, listDriveFiles } from '@/lib/drive';
import type { DriveOwnerGroup, DriveFile } from '@/types';

// Known RMs — used for fuzzy name matching against Drive owner display names / emails
const KNOWN_RMS = ['Sharik', 'Tarun', 'Khushboo', 'Kunal', 'Sai', 'Sonica', 'Aadi', 'Saanvi'];

function suggestRmName(displayName: string, email: string): string {
  const haystack = `${displayName} ${email}`.toLowerCase();
  for (const rm of KNOWN_RMS) {
    if (haystack.includes(rm.toLowerCase())) return rm;
  }
  // Fallback: capitalise the first segment of the display name
  return displayName.split(' ')[0] ?? displayName;
}

// POST /api/bulk/scan  { folderUrl }
// Returns files grouped by Drive owner — no DB writes, pure dry-run.
export async function POST(req: NextRequest) {
  const { folderUrl } = await req.json();
  if (!folderUrl) return NextResponse.json({ error: 'folderUrl is required' }, { status: 400 });

  try {
    const folderId = parseFolderIdFromUrl(folderUrl);
    const files = await listDriveFiles(folderId);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No audio files found in the folder. Make sure the folder is shared publicly and contains .mp3 / .wav files.' },
        { status: 400 },
      );
    }

    // Group by owner email (stable key); fall back to displayName if no email
    const groupMap = new Map<string, DriveOwnerGroup>();

    for (const file of files) {
      const owner = file.owners?.[0];
      // If Drive doesn't return owner info (edge case), bucket under 'unknown'
      const key     = owner?.emailAddress ?? owner?.displayName ?? 'unknown';
      const display = owner?.displayName  ?? 'Unknown';
      const email   = owner?.emailAddress ?? '';

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          ownerEmail:       email,
          ownerDisplayName: display,
          suggestedRmName:  suggestRmName(display, email),
          files: [],
        });
      }
      groupMap.get(key)!.files.push(file as DriveFile);
    }

    const groups = [...groupMap.values()].sort((a, b) =>
      a.suggestedRmName.localeCompare(b.suggestedRmName),
    );

    return NextResponse.json({
      groups,
      total_files: files.length,
      total_rms:   groups.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

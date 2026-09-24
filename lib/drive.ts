const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
  'audio/ogg', 'audio/x-m4a', 'video/mp4', 'video/webm',
];

export function parseFolderIdFromUrl(url: string): string {
  // Handles: /folders/FOLDER_ID and /drive/folders/FOLDER_ID?...
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Could not parse folder ID from URL. Make sure it is a valid Google Drive folder link.');
  return match[1];
}

export async function listDriveFiles(folderId: string): Promise<import('@/types').DriveFile[]> {
  const apiKey = process.env.GOOGLE_API_KEY!;
  const allFiles: import('@/types').DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q:         `'${folderId}' in parents`,
      fields:    'nextPageToken,files(id,name,mimeType,owners)',
      key:       apiKey,
      pageSize:  '1000',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive API error: ${err}`);
    }
    const data = await res.json();
    const page: import('@/types').DriveFile[] = (data.files ?? []).filter(
      (f: import('@/types').DriveFile) => AUDIO_MIME_TYPES.includes(f.mimeType)
    );
    allFiles.push(...page);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.GOOGLE_API_KEY}`;
}

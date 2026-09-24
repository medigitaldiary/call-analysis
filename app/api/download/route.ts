import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch file' }, { status: res.status });

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const filename = url.split('/').pop() ?? 'download';

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = getDb();
    const [calls, sessions] = await Promise.all([
      sql`
        SELECT c.*,
          (r.transcript IS NOT NULL AND r.transcript <> '') AS has_transcript,
          (
            SELECT cp.user_id FROM customer_profiles cp
            WHERE cp.phone = COALESCE(r.phone, c.prospect_name)
            LIMIT 1
          ) AS user_id
        FROM calls c
        LEFT JOIN reports r ON r.call_id = c.id
        LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
        WHERE (c.session_id IS NULL OR bs.archived_at IS NULL)
        ORDER BY c.created_at DESC
      `,
      sql`
        SELECT id, rm_name, session_date, status, doc_url, sheet_url, created_at
        FROM bulk_sessions
        WHERE archived_at IS NULL
        ORDER BY created_at DESC
      `,
    ]);
    return NextResponse.json({ calls, sessions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch calls';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

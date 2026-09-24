import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';


// GET /api/day-report?date=YYYY-MM-DD  → fetch a stored report
// GET /api/day-report                  → list all report dates
export async function GET(req: NextRequest) {
  const sql = getDb();
  const date = req.nextUrl.searchParams.get('date');

  try {
    if (date) {
      const [row] = await sql`SELECT * FROM day_reports WHERE report_date = ${date}`;
      if (!row) return NextResponse.json({ error: 'No report found for this date' }, { status: 404 });
      return NextResponse.json({ report: row.report, date: row.report_date, total_calls: row.total_calls, updated_at: row.created_at });
    }

    // List all available report dates
    const rows = await sql`SELECT report_date, total_calls, created_at AS updated_at FROM day_reports ORDER BY report_date DESC`;
    return NextResponse.json({ dates: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch day report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export interface CustomerCall {
  call_id: string;
  created_at: string;
  rep_name: string;
  status: string;
  outcome: string | null;
  customer_name: string | null;
  summary: string | null;
  session_id: string | null;
}

export interface Customer {
  phone: string;
  display_name: string;
  user_id: string | null;
  total_calls: number;
  last_called: string;
  reps: string[];
  calls: CustomerCall[];
}

export async function GET() {
  try {
    const sql = getDb();

    // Join calls + reports + customer_profiles for real names
    const rows = await sql`
      SELECT
        c.id            AS call_id,
        c.created_at,
        c.rep_name,
        c.status,
        c.prospect_name,
        c.session_id,
        r.phone,
        r.customer_name,
        r.outcome,
        r.summary,
        cp.name         AS profile_name,
        cp.user_id      AS profile_user_id
      FROM calls c
      LEFT JOIN reports r ON r.call_id = c.id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      LEFT JOIN customer_profiles cp
        ON cp.phone = r.phone
        OR cp.phone = c.prospect_name
      WHERE
        (r.phone IS NOT NULL OR c.prospect_name ~ '^[0-9]{10}$')
        AND (c.session_id IS NULL OR bs.archived_at IS NULL)
      ORDER BY c.created_at DESC
    `;

    // Group by phone number
    const customerMap = new Map<string, Customer>();

    for (const row of rows) {
      // Resolve phone: prefer reports.phone, fall back to prospect_name if it looks like a number
      const phone: string =
        row.phone ??
        (row.prospect_name && /^\d{10}$/.test(row.prospect_name) ? row.prospect_name : null);

      if (!phone) continue;

      if (!customerMap.has(phone)) {
        customerMap.set(phone, {
          phone,
          display_name: row.profile_name ?? phone,  // real name if available, else phone
          user_id: row.profile_user_id ?? null,
          total_calls: 0,
          last_called: row.created_at,
          reps: [],
          calls: [],
        });
      } else if (row.profile_name) {
        // Update display_name if we now have a real name
        customerMap.get(phone)!.display_name = row.profile_name;
        customerMap.get(phone)!.user_id = row.profile_user_id ?? null;
      }

      const customer = customerMap.get(phone)!;
      customer.total_calls += 1;

      if (new Date(row.created_at) > new Date(customer.last_called)) {
        customer.last_called = row.created_at;
      }

      if (row.rep_name && !customer.reps.includes(row.rep_name)) {
        customer.reps.push(row.rep_name);
      }

      customer.calls.push({
        call_id:       row.call_id,
        created_at:    row.created_at,
        rep_name:      row.rep_name,
        status:        row.status,
        outcome:       row.outcome ?? null,
        customer_name: row.customer_name ?? null,
        summary:       row.summary ?? null,
        session_id:    row.session_id ?? null,
      });
    }

    // Sort customers by last_called desc
    const customers = [...customerMap.values()].sort(
      (a, b) => new Date(b.last_called).getTime() - new Date(a.last_called).getTime()
    );

    return NextResponse.json({ customers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch customers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

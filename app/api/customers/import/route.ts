import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Allow larger CSV uploads (up to 10 MB)
export const maxDuration = 60; // seconds

/** Parse a CSV string into an array of objects keyed by header row */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return row;
  });
}

/** Normalise phone: strip country code prefix, keep last 10 digits */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

export async function POST(req: NextRequest) {
  const sql = getDb();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 });

    // Detect column names flexibly
    const sample = rows[0];
    const keys = Object.keys(sample);
    const phoneKey  = keys.find(k => /phone|mobile|mob|contact/.test(k)) ?? 'phone';
    const nameKey   = keys.find(k => /^name$|full_name|customer_name/.test(k)) ?? 'name';
    const userIdKey = keys.find(k => /user_id|userid|id/.test(k));

    // ── Build valid-row map (deduplicate by phone — last row wins) ───────────
    const rowMap = new Map<string, { name: string | null; userId: string | null }>();
    let skipped = 0;

    for (const row of rows) {
      const phone = normalisePhone(row[phoneKey] ?? '');
      if (!phone) { skipped++; continue; }
      rowMap.set(phone, {
        name:   row[nameKey]?.trim() || null,
        userId: userIdKey ? row[userIdKey]?.trim() || null : null,
      });
    }

    const phones:  string[]          = [];
    const names:   (string | null)[] = [];
    const userIds: (string | null)[] = [];
    for (const [phone, { name, userId }] of rowMap) {
      phones.push(phone);
      names.push(name);
      userIds.push(userId);
    }

    if (phones.length === 0) {
      return NextResponse.json({ error: 'No valid phone numbers found in CSV' }, { status: 400 });
    }

    // ── Single bulk upsert via unnest ─────────────────────────────────────────
    // xmax = 0 → freshly inserted row; xmax != 0 → updated row
    const BATCH = 5000;
    let inserted = 0, updated = 0;

    for (let i = 0; i < phones.length; i += BATCH) {
      const bPhones  = phones.slice(i, i + BATCH);
      const bNames   = names.slice(i, i + BATCH);
      const bUserIds = userIds.slice(i, i + BATCH);

      const result = await sql`
        INSERT INTO customer_profiles (phone, name, user_id)
        SELECT * FROM unnest(
          ${bPhones}::text[],
          ${bNames}::text[],
          ${bUserIds}::text[]
        ) AS t(phone, name, user_id)
        ON CONFLICT (phone) DO UPDATE
          SET
            name    = COALESCE(EXCLUDED.name,    customer_profiles.name),
            user_id = COALESCE(EXCLUDED.user_id, customer_profiles.user_id),
            updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `;

      for (const r of result) {
        if (r.is_insert) inserted++; else updated++;
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted,
      updated,
      skipped,
      detectedColumns: { phone: phoneKey, name: nameKey, userId: userIdKey ?? '(none)' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

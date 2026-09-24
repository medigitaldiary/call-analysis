import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Claude Sonnet 4.6 pricing (per million tokens)
const PRICE_INPUT_PER_M  = 3.0;   // $3.00 per 1M input tokens
const PRICE_OUTPUT_PER_M = 15.0;  // $15.00 per 1M output tokens

// Sarvam AI pricing: ₹36/hour (Saarika v2.5 actual rate)
const SARVAM_PRICE_PER_HOUR_INR = 36;
const SARVAM_PRICE_PER_SEC_INR  = SARVAM_PRICE_PER_HOUR_INR / 3600;

// Only show data from this date onwards (pre-production data excluded)
const USAGE_START_DATE = '2026-04-21';

function calcCost(inputTokens: number, outputTokens: number) {
  return (inputTokens / 1_000_000) * PRICE_INPUT_PER_M
       + (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
}

function calcSarvamCost(durationSec: number) {
  return durationSec * SARVAM_PRICE_PER_SEC_INR;
}

export async function GET() {
  try {
    const sql = getDb();

    // Ensure day_reports has token columns (idempotent — safe to run every request)
    await sql`
      ALTER TABLE day_reports
        ADD COLUMN IF NOT EXISTS input_tokens  BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0
    `;

    // Claude API latency stats — only from calls on/after USAGE_START_DATE
    const [latency] = await sql`
      SELECT
        ROUND(AVG(r.claude_latency_ms))  AS avg_ms,
        MIN(r.claude_latency_ms)         AS min_ms,
        MAX(r.claude_latency_ms)         AS max_ms,
        COUNT(r.claude_latency_ms)       AS timed_calls
      FROM reports r
      JOIN calls c ON c.id = r.call_id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE r.claude_latency_ms IS NOT NULL
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
    `;

    // Sarvam AI totals — on/after USAGE_START_DATE
    const [sarvamTotals] = await sql`
      SELECT
        COUNT(*)                                     AS total_calls,
        COALESCE(SUM(r.sarvam_duration_sec), 0)      AS total_duration_sec
      FROM reports r
      JOIN calls c ON c.id = r.call_id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE r.sarvam_duration_sec > 0
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
    `;

    // Sarvam daily breakdown (last 30 days, on/after USAGE_START_DATE)
    const sarvamDaily = await sql`
      SELECT
        COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) AS day,
        COUNT(*)                                     AS calls,
        COALESCE(SUM(r.sarvam_duration_sec), 0)     AS duration_sec
      FROM reports r
      JOIN calls c ON c.id = r.call_id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE r.sarvam_duration_sec > 0
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY day DESC
    `;

    // Overall totals — on/after USAGE_START_DATE
    const [totals] = await sql`
      SELECT
        COUNT(*)                                                              AS total_calls,
        COALESCE(SUM(r.input_tokens),  0)                                     AS total_input,
        COALESCE(SUM(r.output_tokens), 0)                                     AS total_output,
        COALESCE(SUM(
          CASE WHEN r.duration IS NOT NULL AND r.duration != ''
               THEN REGEXP_REPLACE(r.duration, '[^0-9.]', '', 'g')::numeric * 60
               ELSE NULL
          END
        ), 0)                                                                 AS total_duration_sec
      FROM reports r
      JOIN calls c ON c.id = r.call_id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE (r.input_tokens > 0 OR r.output_tokens > 0)
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
    `;

    // RM report generation tokens — from bulk_sessions on/after USAGE_START_DATE
    const [rmTokens] = await sql`
      SELECT
        COALESCE(SUM(bs.input_tokens  - COALESCE(r_agg.total_in,  0)), 0) AS rm_input,
        COALESCE(SUM(bs.output_tokens - COALESCE(r_agg.total_out, 0)), 0) AS rm_output
      FROM bulk_sessions bs
      LEFT JOIN (
        SELECT c.session_id,
          COALESCE(SUM(r.input_tokens),  0) AS total_in,
          COALESCE(SUM(r.output_tokens), 0) AS total_out
        FROM calls c
        JOIN reports r ON r.call_id = c.id
        GROUP BY c.session_id
      ) r_agg ON r_agg.session_id = bs.id
      WHERE (bs.input_tokens > 0 OR bs.output_tokens > 0)
        AND DATE(bs.session_date) >= ${USAGE_START_DATE}::date
    `;

    // Per-session breakdown — on/after USAGE_START_DATE
    const sessions = await sql`
      SELECT
        bs.id,
        bs.rm_name,
        bs.session_date,
        bs.total_files,
        bs.status,
        bs.input_tokens,
        bs.output_tokens,
        bs.created_at
      FROM bulk_sessions bs
      WHERE DATE(bs.session_date) >= ${USAGE_START_DATE}::date
      ORDER BY bs.session_date DESC, bs.created_at DESC
    `;

    // Per-date breakdown by report type (last 30 days, on/after USAGE_START_DATE)
    // 1. Transcript analysis tokens (from reports table, per call)
    // 2. RM report generation tokens (bulk_sessions total minus call tokens = RM-only portion)
    // 3. Day end report tokens (from day_reports table)
    const reportTypeDaily = await sql`
      WITH call_date AS (
        SELECT
          COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) AS day,
          COALESCE(SUM(r.input_tokens),  0) AS transcript_input,
          COALESCE(SUM(r.output_tokens), 0) AS transcript_output
        FROM reports r
        JOIN calls c ON c.id = r.call_id
        LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
        WHERE (r.input_tokens > 0 OR r.output_tokens > 0)
          AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
          AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY 1
      ),
      rm_date AS (
        SELECT
          DATE(bs.session_date) AS day,
          COALESCE(SUM(bs.input_tokens  - COALESCE(r_agg.total_in,  0)), 0) AS rm_input,
          COALESCE(SUM(bs.output_tokens - COALESCE(r_agg.total_out, 0)), 0) AS rm_output
        FROM bulk_sessions bs
        LEFT JOIN (
          SELECT c.session_id,
            COALESCE(SUM(r.input_tokens),  0) AS total_in,
            COALESCE(SUM(r.output_tokens), 0) AS total_out
          FROM calls c JOIN reports r ON r.call_id = c.id
          GROUP BY c.session_id
        ) r_agg ON r_agg.session_id = bs.id
        WHERE (bs.input_tokens > 0 OR bs.output_tokens > 0)
          AND DATE(bs.session_date) >= ${USAGE_START_DATE}::date
          AND DATE(bs.session_date) >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY 1
      ),
      day_rpt AS (
        SELECT
          report_date::date AS day,
          COALESCE(input_tokens,  0) AS dr_input,
          COALESCE(output_tokens, 0) AS dr_output
        FROM day_reports
        WHERE report_date >= ${USAGE_START_DATE}::date
          AND report_date >= CURRENT_DATE - INTERVAL '30 days'
      )
      SELECT
        COALESCE(cd.day, rd.day, dr.day)            AS day,
        COALESCE(cd.transcript_input,  0)           AS transcript_input,
        COALESCE(cd.transcript_output, 0)           AS transcript_output,
        COALESCE(rd.rm_input,          0)           AS rm_input,
        COALESCE(rd.rm_output,         0)           AS rm_output,
        COALESCE(dr.dr_input,          0)           AS dr_input,
        COALESCE(dr.dr_output,         0)           AS dr_output
      FROM call_date cd
      FULL OUTER JOIN rm_date rd  ON rd.day  = cd.day
      FULL OUTER JOIN day_rpt dr  ON dr.day  = COALESCE(cd.day, rd.day)
      ORDER BY day DESC
    `;

    // Daily aggregation (last 30 days, on/after USAGE_START_DATE)
    const daily = await sql`
      SELECT
        COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) AS day,
        COUNT(*)                              AS calls,
        COALESCE(SUM(r.input_tokens),  0)    AS input_tokens,
        COALESCE(SUM(r.output_tokens), 0)    AS output_tokens,
        COALESCE(SUM(c.duration_sec),  0)    AS duration_sec
      FROM reports r
      JOIN calls c ON c.id = r.call_id
      LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
      WHERE (r.input_tokens > 0 OR r.output_tokens > 0)
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= ${USAGE_START_DATE}::date
        AND COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata')) >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY COALESCE(DATE(bs.session_date), DATE(c.created_at AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY day DESC
    `;

    // Add RM report generation tokens on top of individual call analysis tokens
    const totalInput    = Number(totals.total_input)  + Number(rmTokens.rm_input);
    const totalOutput   = Number(totals.total_output) + Number(rmTokens.rm_output);
    const totalCost     = calcCost(totalInput, totalOutput);
    const totalDurSec   = Number(totals.total_duration_sec);

    const sarvamDurSec   = Number(sarvamTotals.total_duration_sec);
    const sarvamCalls    = Number(sarvamTotals.total_calls);
    const sarvamTotalCost = calcSarvamCost(sarvamDurSec);

    const sarvamDailyRows = sarvamDaily.map((d: Record<string, unknown>) => {
      const dur = Number(d.duration_sec);
      return {
        day:          d.day,
        calls:        Number(d.calls),
        duration_sec: dur,
        cost_inr:     calcSarvamCost(dur),
      };
    });

    const sessionRows = sessions.map((s: Record<string, unknown>) => {
      const inp = Number(s.input_tokens ?? 0);
      const out = Number(s.output_tokens ?? 0);
      return {
        id:           s.id,
        rm_name:      s.rm_name,
        session_date: s.session_date,
        total_files:  s.total_files,
        status:       s.status,
        input_tokens:  inp,
        output_tokens: out,
        cost_usd:     calcCost(inp, out),
        created_at:   s.created_at,
      };
    });

    const reportTypeDailyRows = reportTypeDaily.map((d: Record<string, unknown>) => {
      const tIn  = Number(d.transcript_input);
      const tOut = Number(d.transcript_output);
      const rIn  = Number(d.rm_input);
      const rOut = Number(d.rm_output);
      const dIn  = Number(d.dr_input);
      const dOut = Number(d.dr_output);
      return {
        day:                 d.day,
        transcript_input:    tIn,
        transcript_output:   tOut,
        transcript_cost_usd: calcCost(tIn, tOut),
        rm_input:            rIn,
        rm_output:           rOut,
        rm_cost_usd:         calcCost(rIn, rOut),
        day_report_input:    dIn,
        day_report_output:   dOut,
        day_report_cost_usd: calcCost(dIn, dOut),
        total_cost_usd:      calcCost(tIn + rIn + dIn, tOut + rOut + dOut),
      };
    });

    // Merge daily call data (calls count + duration) with full cost breakdown
    // (transcript analysis + RM report generation + day end report generation)
    const reportTypeMap = new Map<string, Record<string, unknown>>(
      reportTypeDailyRows.map((r: Record<string, unknown>) => [String(r.day), r])
    );
    const callDailyMap = new Map<string, Record<string, unknown>>(
      (daily as Record<string, unknown>[]).map(d => [String(d.day), d])
    );
    const allDays = [...new Set([
      ...reportTypeDailyRows.map((r: Record<string, unknown>) => String(r.day)),
      ...(daily as Record<string, unknown>[]).map(d => String(d.day)),
    ])].sort((a, b) => b.localeCompare(a));

    const dailyRows = allDays.map(dayKey => {
      const callD = callDailyMap.get(dayKey);
      const typeD = reportTypeMap.get(dayKey);

      const tIn  = typeD ? Number(typeD.transcript_input)  : (callD ? Number(callD.input_tokens)  : 0);
      const tOut = typeD ? Number(typeD.transcript_output) : (callD ? Number(callD.output_tokens) : 0);
      const rIn  = typeD ? Number(typeD.rm_input)  : 0;
      const rOut = typeD ? Number(typeD.rm_output) : 0;
      const dIn  = typeD ? Number(typeD.dr_input)  : 0;
      const dOut = typeD ? Number(typeD.dr_output) : 0;

      const fullInput  = tIn + rIn + dIn;
      const fullOutput = tOut + rOut + dOut;

      return {
        day:                  dayKey,
        calls:                callD ? Number(callD.calls) : 0,
        input_tokens:         fullInput,
        output_tokens:        fullOutput,
        duration_sec:         callD ? Number(callD.duration_sec) : 0,
        cost_usd:             calcCost(fullInput, fullOutput),
        transcript_cost_usd:  calcCost(tIn, tOut),
        rm_cost_usd:          calcCost(rIn, rOut),
        day_report_cost_usd:  calcCost(dIn, dOut),
      };
    });

    return NextResponse.json({
      summary: {
        total_calls:        Number(totals.total_calls),
        total_input:        totalInput,
        total_output:       totalOutput,
        total_tokens:       totalInput + totalOutput,
        total_cost_usd:     totalCost,
        total_duration_sec: totalDurSec,
        avg_cost_per_call:  Number(totals.total_calls) > 0 ? totalCost / Number(totals.total_calls) : 0,
        tokens_per_sec:     totalDurSec > 0 ? (totalInput + totalOutput) / totalDurSec : null,
        cost_per_sec:       totalDurSec > 0 ? totalCost / totalDurSec : null,
      },
      sessions:         sessionRows,
      daily:            dailyRows,
      daily_by_type:    reportTypeDailyRows,
      latency: {
        avg_ms:      latency.avg_ms      ? Number(latency.avg_ms)      : null,
        min_ms:      latency.min_ms      ? Number(latency.min_ms)      : null,
        max_ms:      latency.max_ms      ? Number(latency.max_ms)      : null,
        timed_calls: Number(latency.timed_calls),
      },
      pricing: {
        model:         'claude-sonnet-4-6',
        input_per_1m:  PRICE_INPUT_PER_M,
        output_per_1m: PRICE_OUTPUT_PER_M,
        currency:      'USD',
      },
      sarvam: {
        total_calls:        sarvamCalls,
        total_duration_sec: sarvamDurSec,
        total_cost_inr:     sarvamTotalCost,
        avg_cost_per_call:  sarvamCalls > 0 ? sarvamTotalCost / sarvamCalls : 0,
        avg_duration_sec:   sarvamCalls > 0 ? sarvamDurSec / sarvamCalls : 0,
        price_per_hour_inr: SARVAM_PRICE_PER_HOUR_INR,
        daily:              sarvamDailyRows,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch usage';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

# Intelligence Features Implementation Plan
## Lead Source Tracking + Competitor Mention Intelligence

**Target codebase:** `/Users/deekshithaadurai/Documents/signup-call-flow`  
**Platform:** Radar — Next.js call-analysis platform for BondScanner  
**Date drafted:** 2026-05-12

---

## Table of Contents

1. [Approach Comparison](#1-approach-comparison)
2. [Recommended Architecture](#2-recommended-architecture)
3. [Exact Prompt Changes](#3-exact-prompt-changes)
4. [Exact DB Schema Changes](#4-exact-db-schema-changes)
5. [Code Changes Required (file-by-file)](#5-code-changes-required-file-by-file)
6. [RM Report Additions](#6-rm-report-additions)
7. [Day Report Additions](#7-day-report-additions)
8. [New Analytics API Endpoints](#8-new-analytics-api-endpoints)
9. [Backfill Strategy](#9-backfill-strategy)
10. [Confidence Scoring & Thresholds](#10-confidence-scoring--thresholds)
11. [Edge Cases](#11-edge-cases)
12. [UI / UX Plan](#12-ui--ux-plan)
13. [TypeScript Types](#13-typescript-types)
14. [Performance & Scalability](#14-performance--scalability)
15. [Cost Analysis](#15-cost-analysis)
16. [Accuracy Evaluation](#16-accuracy-evaluation)
17. [Implementation Phases](#17-implementation-phases)
18. [Future Extensions](#18-future-extensions)

---

## 1. Approach Comparison

### Feature 1: Lead Source Extraction

#### Option A — Keyword / Regex Matching
Pattern-match known terms: "google", "referral", "friend ne bataya", "instagram", etc.

| Dimension | Assessment |
|---|---|
| Accuracy | ~50–60% — misses paraphrasing, Hinglish, indirect volunteering |
| Hindi/Hinglish | Very poor. "Ek dost ne bataya" matches nothing |
| False positives | High — RM saying "some customers come from ads" contaminates |
| Cost | Zero |
| Maintenance | Fragile. Every new phrasing needs a new rule |

**Verdict:** Not production-viable. Useful only as a pre-filter.

#### Option B — Fuzzy/Embedding Similarity
Embed the transcript, compute cosine similarity to seed phrases per category.

| Dimension | Assessment |
|---|---|
| Accuracy | ~65–70% — better than regex, still struggles with indirect mention |
| Hindi/Hinglish | Depends on the embedding model. multilingual-e5-large is reasonable |
| Latency | Adds ~200–400ms per call if run inline |
| Cost | ~$0.00002/call with text-embedding-3-small. Negligible |
| Context understanding | Cannot tell if RM asked vs. customer volunteered |

**Verdict:** Better than regex but still misses context. Does not extract `question_asked` or `raw_answer`.

#### Option C — LLM Inline (extend existing Claude call in `lib/analyse.ts`)
Add `lead_source` and `competitor_mentions` fields to the existing ANALYSIS_PROMPT.

| Dimension | Assessment |
|---|---|
| Accuracy | ~90–95% — handles paraphrasing, indirect mention, Hinglish natively |
| Hindi/Hinglish | Excellent. claude-sonnet-4-6 understands Hinglish |
| `question_asked` field | Extractable — Claude can read conversational structure |
| Extra API calls | **Zero** — piggybacked on existing call |
| Cost increase | ~200–350 extra input tokens + ~150 extra output tokens per call |
| Integration complexity | Low — JSON schema addition, same parse pipeline |

**Verdict: Recommended.** Best accuracy, zero extra latency, minimal cost increase.

#### Option D — LLM Post-processing (separate Claude pass after analysis)
A second `extractIntelligence(transcript)` call for every new call going forward.

| Dimension | Assessment |
|---|---|
| Accuracy | Same as Option C |
| Extra API calls | +1 per call. Doubles the number of Claude requests per call |
| Cost increase | ~$0.003–0.005 per call (full Sonnet call) |
| Latency | +3–8 seconds per call (sequential) or manageable if parallel |
| Complexity | Requires separate retry logic, separate error handling |

**Verdict:** Use only for the backfill of historical transcripts (see Section 9). Not for new calls.

#### Option E — Hybrid (keyword pre-filter + LLM confirmation)
Run regex to detect if any source-related terms appear, then only call LLM for those calls.

| Dimension | Assessment |
|---|---|
| Accuracy | Same as LLM when triggered, zero when not triggered |
| Coverage | Misses calls where question was asked but customer gave vague answer |
| Complexity | Two code paths to maintain |

**Verdict:** False economy. The prompt tokens added for the inline approach cost less than the engineering complexity of a hybrid system.

---

### Feature 2: Competitor Mention Extraction

The same five options apply. The key difference: competitor mentions are specific named entities ("Wint Wealth", "Grip"), which makes regex slightly more viable, but Hinglish variants ("Wint wala app", "wo Grip Invest hai na") make it unreliable. The `relationship` classification (`actively_using` vs `comparing` vs `casual_mention`) is impossible without LLM.

**Recommendation:** Same as Feature 1 — inline extension of the existing Claude call.

---

## 2. Recommended Architecture

### Core Principle: Zero Extra API Calls

Both features are extracted inline within the existing `analyseTranscript()` call in `lib/analyse.ts`. The JSON response schema is extended with two new top-level keys: `lead_source` and `competitor_mentions`.

```
Audio
  └─► Sarvam STT
        └─► lib/analyse.ts (claude-sonnet-4-6)
              ├── [existing fields: outcome, call_quality, sentiment, etc.]
              ├── lead_source            ← NEW
              └── competitor_mentions   ← NEW
                    └─► reports table (JSONB columns)
                          └─► call_lead_sources table     ← NEW (normalized)
                          └─► call_competitor_mentions table ← NEW (normalized)
```

### Why Not a Separate Microservice

The pipeline already tolerates 1000–1400 input tokens and 600 output tokens per call. Adding ~350 input + ~150 output tokens is a ~25% increase in per-call LLM cost — significantly cheaper than any architecture that requires a second API call. The existing `createWithRetry()` function and JSON parse sanitisation already handle edge cases. There is no benefit to a separate extraction service at current scale.

### Data Flow for New Fields

```
analyseTranscript(transcript, durationSec)
  → parsed.lead_source          → AnalysisResult.lead_source
  → parsed.competitor_mentions  → AnalysisResult.competitor_mentions

process-call/route.ts
  → UPDATE reports SET lead_source = ..., competitor_mentions = ...
  → INSERT INTO call_lead_sources (one row per source slug)
  → INSERT INTO call_competitor_mentions (one row per mention)
```

The dual-write (JSONB on `reports` + normalized rows) is explained in Section 4.

---

## 3. Exact Prompt Changes

### 3.1 New JSON Schema Fields

Add these two fields to the JSON structure in `ANALYSIS_PROMPT` in `lib/analyse.ts`, after `action_items`:

```json
"lead_source": {
  "question_asked": true,
  "answered": true,
  "sources": ["referral", "ads"],
  "raw_answer": "exact verbatim phrase the customer used",
  "confidence": 0.85
},
"competitor_mentions": [
  {
    "name": "Wint Wealth",
    "normalized": "wint_wealth",
    "relationship": "comparing",
    "context": "Customer said they are comparing returns with Wint Wealth before deciding.",
    "confidence": 0.92
  }
]
```

### 3.2 Natural-Language Instructions

Add the following instruction block immediately before the JSON template in `ANALYSIS_PROMPT`, after the existing `SCORING GATES` section:

```
━━━ LEAD SOURCE EXTRACTION ━━━
Determine where the customer heard about BondScanner. Look for:
  • RM explicitly asking the question (any phrasing: "aapko kaise pata chala", "how did you find us", "referred by?")
  • Customer volunteering the information without being asked
  • Indirect signals (customer says "your ad came up when I searched", "your YouTube video")

FIELD RULES:
• question_asked: true if the RM asked (any paraphrase). false if the RM never asked.
• answered: true if the customer gave a real answer (even vague). false if customer deflected or said "don't know"/"yaad nahi".
• sources: array of normalized slugs from this exact list:
    ads | organic_search | referral | friend_family | social_media | youtube |
    whatsapp | existing_customer | influencer | partner_distributor | other | unknown
  Use "unknown" only for responses like "don't know", "don't remember", "I just came across it".
  Use "other" when a specific source is named but it doesn't fit any category.
  The array can have multiple entries (e.g. ["referral", "ads"] if customer says "my friend told me and I also saw your ad").
  Return empty array [] ONLY if question_asked=false AND customer never volunteered the info.
• raw_answer: exact verbatim phrase from the transcript. null if the question was never asked and nothing was volunteered.
• confidence: 0.0–1.0. High (≥0.9) = question clearly asked, answer clearly stated. Lower if paraphrased or inferred.

MULTILINGUAL: The question may be asked in Hindi, Hinglish, or English. Common Hindi signals:
  "kaise pata chala", "kahan se suna", "kisne bataya", "koi recommend kiya", "kahan dekha"
Customer answers like "Ek dost ne bataya" = referral. "Google pe dekha" = organic_search. "Instagram pe aaya" = social_media.

FALSE POSITIVE PREVENTION:
  • If the RM says "most customers come from ads" as a generic statement, do NOT extract it as a lead source for this call.
  • Only extract if the customer (or RM confirming a specific answer) says where THIS customer came from.
  • If the call is too short for the question to have been asked (<60 seconds), set question_asked=false.

━━━ COMPETITOR MENTION EXTRACTION ━━━
Detect any mentions of competing investment platforms. Known competitors to normalize:
  wint_wealth    → Wint Wealth, WintWealth, Wint, Wint ka app
  grip_invest    → Grip Invest, Grip, Grip wala
  goldenpi       → GoldenPi, Golden Pi, Golden Pie
  bondsindia     → BondsIndia, Bonds India
  jiraaf         → Jiraaf, Jiraf, Jiraaf wala
  indiabonds     → IndiaBonds, India Bonds
  other          → any platform not in the list above (still extract it)

RELATIONSHIP TYPES (pick the most accurate one):
  actively_using  → customer currently uses this platform ("I invest there", "I have an account")
  was_using       → customer used it previously but no longer ("I was using Grip before")
  comparing       → customer is evaluating or comparing ("I was looking at Wint as well", "comparing returns")
  casual_mention  → mentioned in passing, no clear relationship ("I think Wint does something similar")

EXTRACTION RULES:
  • Extract ALL mentions in the call, each as a separate object.
  • If the RM mentions a competitor (to compare or explain BondScanner's advantage), still extract it — the context field should make it clear who mentioned it.
  • confidence: ≥0.9 for explicit named mention. Lower for transcription variants or uncertain context.
  • Return empty array [] if no competitors are mentioned.
  • Do NOT extract BondScanner itself as a competitor.
  • Do NOT extract generic terms like "other apps", "another platform" unless a specific name appears nearby.
  • Transcription artifacts: "Grip" may appear as "grip" or "gripp" — normalize these.
```

### 3.3 Max Tokens Update

Increase `max_tokens` from `2048` to `2500` in `lib/analyse.ts` to accommodate the larger response.

---

## 4. Exact DB Schema Changes

### 4.1 Part A — `reports` Table Additions

Create as migration `007_intelligence_columns.sql`:

```sql
-- Migration 007: Add lead_source and competitor_mentions to reports
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS lead_source          JSONB,
  ADD COLUMN IF NOT EXISTS competitor_mentions  JSONB;

-- Partial indexes for analytics queries (only index non-null rows)
CREATE INDEX IF NOT EXISTS idx_reports_lead_source
  ON reports USING GIN (lead_source)
  WHERE lead_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_competitor_mentions
  ON reports USING GIN (competitor_mentions)
  WHERE competitor_mentions IS NOT NULL;
```

### 4.2 Part B — New Normalized Flat Tables

Create as migration `008_intelligence_tables.sql`:

```sql
-- ── call_lead_sources ────────────────────────────────────────────────────────
-- One row per source slug per call. Enables simple GROUP BY analytics.
CREATE TABLE IF NOT EXISTS call_lead_sources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id        UUID REFERENCES calls(id) ON DELETE CASCADE,
  session_id     UUID REFERENCES bulk_sessions(id) ON DELETE SET NULL,
  rm_name        TEXT,
  session_date   DATE,
  phone          TEXT,
  customer_name  TEXT,
  source         TEXT NOT NULL,       -- slug: ads | organic_search | referral | ...
  question_asked BOOLEAN DEFAULT FALSE,
  answered       BOOLEAN DEFAULT FALSE,
  raw_answer     TEXT,
  confidence     NUMERIC(3,2),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup by phone (join to customer_profiles for user_id)
CREATE INDEX IF NOT EXISTS idx_cls_phone         ON call_lead_sources (phone);
-- Lookup by RM + date range (most common analytics query)
CREATE INDEX IF NOT EXISTS idx_cls_rm_date       ON call_lead_sources (rm_name, session_date);
-- Lookup by source slug (distribution queries)
CREATE INDEX IF NOT EXISTS idx_cls_source        ON call_lead_sources (source);
-- Lookup by session
CREATE INDEX IF NOT EXISTS idx_cls_session_id    ON call_lead_sources (session_id);
-- Lookup by date alone (day-level aggregation)
CREATE INDEX IF NOT EXISTS idx_cls_session_date  ON call_lead_sources (session_date);


-- ── call_competitor_mentions ─────────────────────────────────────────────────
-- One row per competitor mention per call. Relationship is denormalized for fast reads.
CREATE TABLE IF NOT EXISTS call_competitor_mentions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id             UUID REFERENCES calls(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES bulk_sessions(id) ON DELETE SET NULL,
  rm_name             TEXT,
  session_date        DATE,
  phone               TEXT,
  customer_name       TEXT,
  competitor          TEXT NOT NULL,     -- slug: wint_wealth | grip_invest | ...
  competitor_display  TEXT,              -- human label: "Wint Wealth"
  relationship        TEXT,              -- actively_using | was_using | comparing | casual_mention
  context             TEXT,              -- 1-sentence summary from Claude
  confidence          NUMERIC(3,2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup by phone (for per-customer competitor history)
CREATE INDEX IF NOT EXISTS idx_ccm_phone          ON call_competitor_mentions (phone);
-- Lookup by RM + date (most common analytics)
CREATE INDEX IF NOT EXISTS idx_ccm_rm_date        ON call_competitor_mentions (rm_name, session_date);
-- Lookup by competitor slug (competitor-level drilldown)
CREATE INDEX IF NOT EXISTS idx_ccm_competitor     ON call_competitor_mentions (competitor);
-- Lookup by relationship type (e.g. "show me all actively_using mentions")
CREATE INDEX IF NOT EXISTS idx_ccm_relationship   ON call_competitor_mentions (relationship);
-- Lookup by session
CREATE INDEX IF NOT EXISTS idx_ccm_session_id     ON call_competitor_mentions (session_id);
-- Lookup by date alone
CREATE INDEX IF NOT EXISTS idx_ccm_session_date   ON call_competitor_mentions (session_date);
```

### 4.3 Why Dual-Write (JSONB Raw + Normalized Rows)

**The JSONB column on `reports` is the source of truth.** It stores the full extraction object exactly as Claude returned it, including `raw_answer`, `confidence`, and the full context string. This preserves all nuance and makes the per-call report view trivial — one row, all data.

**The normalized tables (`call_lead_sources`, `call_competitor_mentions`) are the analytics layer.** Every analytics query — "how many calls came from referrals this week", "which customers use Grip Invest" — is a simple `SELECT ... WHERE source = 'referral' AND session_date BETWEEN ...` with indexed columns. Doing this with GIN-indexed JSONB is possible but produces slower, harder-to-read queries.

The dual-write happens in `process-call/route.ts` immediately after writing the JSONB. If the normalized write fails (it shouldn't, but in theory), the JSONB is still intact and the backfill endpoint (Section 8) can re-populate the flat tables from JSONB at any time.

---

## 5. Code Changes Required (file-by-file)

### 5.1 `lib/analyse.ts`

**Changes:**
1. Extend `ANALYSIS_PROMPT` with the lead source and competitor instruction blocks (Section 3.2).
2. Add `lead_source` and `competitor_mentions` fields to the JSON schema in the prompt (Section 3.1).
3. Extend the `AnalysisResult` interface to include the new fields:
   ```typescript
   lead_source?: LeadSourceExtraction | null;
   competitor_mentions?: CompetitorMention[] | null;
   ```
4. Map `parsed.lead_source` and `parsed.competitor_mentions` in the return object.
5. Increase `max_tokens` from `2048` to `2500`.

**No changes** to `createWithRetry`, the retry logic, or the JSON sanitisation pipeline — it already handles nested arrays and objects.

### 5.2 `app/api/bulk/process-call/route.ts`

**Changes:** After the existing `UPDATE reports SET ...` block, add:

1. Write `lead_source` and `competitor_mentions` JSONB to `reports`:
   ```typescript
   lead_source = ${analysis.lead_source ? sql.json(...) : null},
   competitor_mentions = ${analysis.competitor_mentions ? sql.json(...) : null},
   ```
   (Add to the existing UPDATE statement — do not issue a second UPDATE.)

2. After the reports UPDATE, perform the normalized flat-table inserts:

```typescript
// Write normalized lead_source rows
if (analysis.lead_source?.sources?.length) {
  for (const source of analysis.lead_source.sources) {
    await sql`
      INSERT INTO call_lead_sources
        (call_id, session_id, rm_name, session_date, phone, customer_name,
         source, question_asked, answered, raw_answer, confidence)
      VALUES (
        ${callId},
        ${sessionId},
        ${call.rep_name ?? null},
        ${call.session_date ?? null},   -- populated below
        ${analysis.phone ?? null},
        ${analysis.customer_name ?? null},
        ${source},
        ${analysis.lead_source.question_asked ?? false},
        ${analysis.lead_source.answered ?? false},
        ${analysis.lead_source.raw_answer ?? null},
        ${analysis.lead_source.confidence ?? null}
      )
    `;
  }
} else if (analysis.lead_source) {
  // question_asked or not_answered — still write one row with source = 'unknown'
  // so we can track question_asked rate
  await sql`
    INSERT INTO call_lead_sources
      (call_id, session_id, rm_name, session_date, phone, customer_name,
       source, question_asked, answered, raw_answer, confidence)
    VALUES (
      ${callId}, ${sessionId}, ${call.rep_name ?? null}, ${null},
      ${analysis.phone ?? null}, ${analysis.customer_name ?? null},
      ${'unknown'},
      ${analysis.lead_source.question_asked ?? false},
      ${analysis.lead_source.answered ?? false},
      ${analysis.lead_source.raw_answer ?? null},
      ${analysis.lead_source.confidence ?? null}
    )
  `;
}

// Write normalized competitor_mentions rows
if (analysis.competitor_mentions?.length) {
  const COMPETITOR_DISPLAY: Record<string, string> = {
    wint_wealth: 'Wint Wealth', grip_invest: 'Grip Invest',
    goldenpi: 'GoldenPi', bondsindia: 'BondsIndia',
    jiraaf: 'Jiraaf', indiabonds: 'IndiaBonds', other: 'Other',
  };
  for (const mention of analysis.competitor_mentions) {
    await sql`
      INSERT INTO call_competitor_mentions
        (call_id, session_id, rm_name, session_date, phone, customer_name,
         competitor, competitor_display, relationship, context, confidence)
      VALUES (
        ${callId}, ${sessionId}, ${call.rep_name ?? null}, ${null},
        ${analysis.phone ?? null}, ${analysis.customer_name ?? null},
        ${mention.normalized},
        ${COMPETITOR_DISPLAY[mention.normalized] ?? mention.name},
        ${mention.relationship ?? null},
        ${mention.context ?? null},
        ${mention.confidence ?? null}
      )
    `;
  }
}
```

**Note on `session_date`:** The `session_date` is on the `bulk_sessions` row, not on `calls`. Fetch it by joining when you fetch the call at the top of the route, or pass it as part of the request body. The cleanest approach: add `session_date` to the SELECT at the top:
```typescript
const [call] = await sql`
  SELECT c.*, bs.session_date
  FROM calls c
  LEFT JOIN bulk_sessions bs ON bs.id = c.session_id
  WHERE c.id = ${callId}
`;
```

### 5.3 `lib/rm-analyse.ts`

**Changes:**
1. Add `lead_source` and `competitor_mentions` fields to the `calls` parameter array type.
2. Add `lead_source_summary` and `competitor_summary` sections to the RM report JSON schema in the prompt (see Section 6 for exact schema).
3. Extend the `RMReport` TypeScript type (via `types/index.ts`) to include these sections.
4. Pass `lead_source` and `competitor_mentions` from each call's `reports` row through to the prompt payload in `app/api/bulk/generate-report/route.ts`.

In `generate-report/route.ts`, update the `callData` mapping to include:
```typescript
lead_source: c.lead_source as LeadSourceExtraction | null,
competitor_mentions: c.competitor_mentions as CompetitorMention[] | null,
```

### 5.4 `lib/day-analyse.ts`

Same pattern as `rm-analyse.ts`:
1. Add `lead_source` and `competitor_mentions` to the call input type.
2. Add `lead_source_summary` and `competitor_summary` to the day report JSON schema.
3. Pass the fields through in `day-report/generate/route.ts`.

### 5.5 `types/index.ts`

Add all new types (see Section 13 for complete definitions). Extend `RMReport` and `DayReport` to include the new summary sections. Extend `Report` to include `lead_source` and `competitor_mentions` optional fields.

### 5.6 New file: `lib/analytics.ts`

Aggregation helper functions used by the analytics API routes:

```typescript
export async function getLeadSourceStats(params: LeadSourceQueryParams)
export async function getCompetitorStats(params: CompetitorQueryParams)
export async function backfillIntelligence(params: BackfillParams)
```

These keep the route handlers thin and the SQL in one place.

### 5.7 New files: Analytics API Routes

- `app/api/analytics/lead-sources/route.ts`
- `app/api/analytics/competitors/route.ts`
- `app/api/analytics/backfill/route.ts`

Full specification in Section 8.

### 5.8 New files: UI Components (Phase 7)

- `components/calls/LeadSourceSection.tsx` — reusable card for RM report and day report
- `components/calls/CompetitorSection.tsx` — reusable card for RM report and day report

---

## 6. RM Report Additions

### 6.1 Input to Claude (`lib/rm-analyse.ts`)

Each call object passed to Claude in `generateRMReport()` must be extended to include:
```typescript
lead_source: LeadSourceExtraction | null,
competitor_mentions: CompetitorMention[] | null,
```

These are already in the `reports` table after Phase 3. The `callData` mapping in `generate-report/route.ts` just needs to pass them through.

### 6.2 Prompt Addition

Add these two sections to the RM report JSON schema (after `"languages"`):

```json
"lead_source_summary": {
  "calls_asked": <number of calls where question_asked=true>,
  "calls_answered": <number where answered=true>,
  "calls_not_asked": <number where question_asked=false>,
  "ask_rate": "<e.g. 78%>",
  "answer_rate": "<e.g. 65% of asked>",
  "distribution": [
    {
      "source": "Referral",
      "slug": "referral",
      "count": 12,
      "percentage": "43%"
    }
  ]
},
"competitor_summary": {
  "calls_with_mentions": <number>,
  "total_mentions": <number>,
  "breakdown": [
    {
      "competitor": "Wint Wealth",
      "slug": "wint_wealth",
      "count": 4,
      "relationship_breakdown": {
        "actively_using": 2,
        "comparing": 2,
        "was_using": 0,
        "casual_mention": 0
      },
      "call_refs": [2, 7, 12, 18]
    }
  ]
}
```

**Important:** The RM prompt already receives summarized call data. The lead_source and competitor_mentions are small JSON objects — pass them in full. Claude will aggregate them into the summary. Do not pre-aggregate in code; let Claude do it since it also incorporates the context when writing the breakdown.

**Exception:** `distribution.percentage` should be computed in code if the Claude-generated percentage drifts. For the RM report this is less critical than for the day report, so trust Claude here for now.

---

## 7. Day Report Additions

### 7.1 Input Extension

Same as the RM report: add `lead_source` and `competitor_mentions` to the `callData` mapping in `day-report/generate/route.ts`.

### 7.2 Prompt Addition

Add after `"languages"` in the day report JSON schema:

```json
"lead_source_summary": {
  "calls_asked": <number>,
  "calls_answered": <number>,
  "calls_not_asked": <number>,
  "ask_rate": "<e.g. 72%>",
  "answer_rate": "<e.g. 61% of asked>",
  "distribution": [
    {
      "source": "Referral",
      "slug": "referral",
      "count": 18,
      "percentage": "38%"
    }
  ],
  "per_rm_breakdown": [
    {
      "rm_name": "Kunal",
      "ask_rate": "90%",
      "top_source": "referral"
    }
  ]
},
"competitor_summary": {
  "calls_with_mentions": <number>,
  "total_mentions": <number>,
  "breakdown": [
    {
      "competitor": "Wint Wealth",
      "slug": "wint_wealth",
      "count": 7,
      "unique_customers": 6,
      "relationship_breakdown": {
        "actively_using": 3,
        "comparing": 3,
        "was_using": 1,
        "casual_mention": 0
      },
      "rm_breakdown": [
        { "rm_name": "Kunal", "count": 4 },
        { "rm_name": "Shreshth", "count": 3 }
      ]
    }
  ]
}
```

**Note on `unique_customers`:** Claude cannot reliably deduplicate across phone numbers in large call batches. For accuracy, compute `unique_customers` in the day report route from the `call_competitor_mentions` table after Claude returns the report, then override Claude's value — same pattern used for `total_talk_time` today.

---

## 8. New Analytics API Endpoints

### 8.1 `GET /api/analytics/lead-sources`

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | 30 days ago | Start date (inclusive) |
| `to` | `YYYY-MM-DD` | today | End date (inclusive) |
| `rm_name` | string | (all RMs) | Filter to a single RM |
| `min_confidence` | number | `0.5` | Exclude rows below this confidence |

**Response Shape:**
```typescript
{
  total_calls_in_range: number;
  stats: {
    question_asked: number;
    question_not_asked: number;
    ask_rate_pct: number;       // question_asked / total_calls_in_range
    answered: number;
    not_answered: number;
    answer_rate_pct: number;    // answered / question_asked
  };
  distribution: Array<{
    slug: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  per_rm_breakdown: Array<{
    rm_name: string;
    total_calls: number;
    asked: number;
    answered: number;
    top_source: string | null;
  }>;
  recent_calls: Array<{
    call_id: string;
    phone: string;
    customer_name: string;
    rm_name: string;
    session_date: string;
    source: string;
    raw_answer: string;
    confidence: number;
  }>;  // last 20 calls, ordered by created_at DESC
}
```

**SQL Approach:**
```sql
-- Distribution query (parameterized)
SELECT
  source,
  COUNT(*)                               AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM call_lead_sources
WHERE session_date BETWEEN $1 AND $2
  AND ($3::text IS NULL OR rm_name = $3)
  AND (confidence IS NULL OR confidence >= $4)
  AND source NOT IN ('unknown')  -- exclude unresolved for distribution
GROUP BY source
ORDER BY count DESC;

-- Ask-rate query
SELECT
  COUNT(*)                                                   AS total_rows,
  COUNT(*) FILTER (WHERE question_asked = true)              AS asked,
  COUNT(*) FILTER (WHERE answered = true)                    AS answered,
  COUNT(DISTINCT call_id) FILTER (WHERE question_asked = false) AS not_asked
FROM call_lead_sources
WHERE session_date BETWEEN $1 AND $2
  AND ($3::text IS NULL OR rm_name = $3);
```

**Important:** The `call_lead_sources` table has one row per source per call. For the ask-rate stats, `COUNT(DISTINCT call_id)` is needed to avoid double-counting calls with multiple sources.

---

### 8.2 `GET /api/analytics/competitors`

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | 30 days ago | Start date (inclusive) |
| `to` | `YYYY-MM-DD` | today | End date (inclusive) |
| `rm_name` | string | (all RMs) | Filter to a single RM |
| `competitor` | string | (all competitors) | Filter to one competitor slug |
| `min_confidence` | number | `0.5` | Exclude rows below this confidence |

**Response Shape:**
```typescript
{
  total_calls_with_mentions: number;
  total_unique_customers: number;
  competitors: Array<{
    slug: string;
    display_name: string;
    mention_count: number;
    unique_customer_count: number;
    phones: string[];
    user_ids: string[];         // joined from customer_profiles
    call_ids: string[];
    relationship_breakdown: {
      actively_using: number;
      was_using: number;
      comparing: number;
      casual_mention: number;
    };
    rm_breakdown: Array<{
      rm_name: string;
      count: number;
    }>;
  }>;
}
```

**SQL Approach (competitor detail):**
```sql
SELECT
  ccm.competitor,
  ccm.competitor_display,
  COUNT(*)                                AS mention_count,
  COUNT(DISTINCT ccm.phone)               AS unique_customer_count,
  ARRAY_AGG(DISTINCT ccm.phone)           AS phones,
  ARRAY_AGG(DISTINCT cp.user_id)
    FILTER (WHERE cp.user_id IS NOT NULL) AS user_ids,
  ARRAY_AGG(DISTINCT ccm.call_id::text)   AS call_ids,
  COUNT(*) FILTER (WHERE ccm.relationship = 'actively_using')  AS actively_using,
  COUNT(*) FILTER (WHERE ccm.relationship = 'was_using')       AS was_using,
  COUNT(*) FILTER (WHERE ccm.relationship = 'comparing')       AS comparing,
  COUNT(*) FILTER (WHERE ccm.relationship = 'casual_mention')  AS casual_mention
FROM call_competitor_mentions ccm
LEFT JOIN customer_profiles cp ON cp.phone = ccm.phone
WHERE ccm.session_date BETWEEN $1 AND $2
  AND ($3::text IS NULL OR ccm.rm_name = $3)
  AND ($4::text IS NULL OR ccm.competitor = $4)
  AND (ccm.confidence IS NULL OR ccm.confidence >= $5)
GROUP BY ccm.competitor, ccm.competitor_display
ORDER BY mention_count DESC;
```

---

### 8.3 `POST /api/analytics/backfill`

**Request Body:**
```typescript
{
  from?: string;          // YYYY-MM-DD, default: beginning of time
  to?: string;            // YYYY-MM-DD, default: today
  dry_run?: boolean;      // default: false — if true, returns count of eligible calls without processing
  use_haiku?: boolean;    // default: true — use claude-haiku-3-5 for 10x cost reduction
  batch_size?: number;    // default: 50, max: 100
}
```

**Response:**
```typescript
{
  eligible_calls: number;
  processed: number;
  skipped: number;         // confidence < 0.3 or no transcript
  errors: number;
  cost_estimate_usd: number;
}
```

**Logic:**
1. Find all `reports` rows where `transcript IS NOT NULL` AND `lead_source IS NULL` within the date range.
2. Apply `LIMIT batch_size` to prevent overload (route can be called multiple times).
3. For each eligible call, call `extractIntelligenceOnly(transcript)` (see Section 9).
4. Write results to `reports.lead_source`, `reports.competitor_mentions`, and the flat tables.
5. Return summary stats.

**Rate Limiting:** Enforced at 50 calls per request by default. Do not process more than 100 per request even if `batch_size: 100` is passed. The route can be re-run until all historical calls are processed.

---

## 9. Backfill Strategy

### 9.1 The Extraction-Only Prompt

For historical transcripts, we do not need full re-analysis. We only need `lead_source` and `competitor_mentions`. This means a much shorter prompt:

```typescript
const BACKFILL_EXTRACTION_PROMPT = (transcript: string) => `You are an extraction assistant. From this sales call transcript, extract ONLY the following two fields and return raw JSON (no markdown):

{
  "lead_source": {
    "question_asked": <boolean: did the RM ask how the customer heard about BondScanner?>,
    "answered": <boolean: did the customer give a real answer?>,
    "sources": [<slugs from: ads|organic_search|referral|friend_family|social_media|youtube|whatsapp|existing_customer|influencer|partner_distributor|other|unknown>],
    "raw_answer": "<verbatim phrase or null>",
    "confidence": <0.0–1.0>
  },
  "competitor_mentions": [
    {
      "name": "<as spoken>",
      "normalized": "<wint_wealth|grip_invest|goldenpi|bondsindia|jiraaf|indiabonds|other>",
      "relationship": "<actively_using|was_using|comparing|casual_mention>",
      "context": "<one sentence>",
      "confidence": <0.0–1.0>
    }
  ]
}

LEAD SOURCE: Look for the RM asking "kaise pata chala", "referred by", "how did you find us" or similar. Also capture if customer volunteers the info. Normalize to slugs.
COMPETITORS: Detect mentions of Wint Wealth, Grip Invest, GoldenPi, BondsIndia, Jiraaf, IndiaBonds, or any other investment platform. Include relationship type.

TRANSCRIPT:
${transcript}`;
```

### 9.2 Model Choice: claude-haiku-3-5

For backfill, use `claude-haiku-3-5` (`claude-haiku-3-5` in the API). It is approximately 10x cheaper than Sonnet ($0.25/1M input, $1.25/1M output vs $3/$15) and the task is extraction-only (no complex reasoning required).

The extraction prompt is ~400 input tokens + transcript length. For a typical 1000-token transcript: ~1400 input tokens + ~150 output tokens.

### 9.3 Cost to Backfill 5,000 Existing Calls

Assumptions:
- Average transcript: ~1,000 tokens
- Backfill prompt overhead: ~400 tokens
- Total input per call: ~1,400 tokens
- Output per call: ~150 tokens
- Model: claude-haiku-3-5 ($0.25/1M input, $1.25/1M output)

```
Input:  5,000 × 1,400 × ($0.25 / 1,000,000) = $1.75
Output: 5,000 ×   150 × ($1.25 / 1,000,000) = $0.94
─────────────────────────────────────────────────────
Total backfill cost:                           $2.69
```

Under $3 to process 5,000 historical calls. Run in batches of 50 over ~100 runs of the backfill endpoint.

### 9.4 Implementation Notes for Backfill Route

- Add a `backfill_at` column to `reports` (TIMESTAMPTZ) to track when backfill ran, separate from `created_at`.
- Query for `lead_source IS NULL AND transcript IS NOT NULL AND backfill_at IS NULL` to find eligible calls.
- After successful extraction, set `backfill_at = NOW()`.
- Set `backfill_at = NOW()` even for calls where extraction returned empty arrays (so they aren't reprocessed endlessly).
- For dry_run mode: just `SELECT COUNT(*)` and return the count, no Claude calls made.

---

## 10. Confidence Scoring & Thresholds

### 10.1 Confidence Scale

| Range | Label | Interpretation |
|---|---|---|
| 0.9–1.0 | High | Question explicitly asked in clear language, customer gave a direct, unambiguous answer, or competitor explicitly named by exact name |
| 0.7–0.9 | Good | Question paraphrased, answer implied from context, or competitor named with slight transcription variation ("Wint" instead of "Wint Wealth") |
| 0.5–0.7 | Medium | Indirect mention ("I was looking at another platform"), source inferred from context, or question phrasing was very vague |
| < 0.5 | Low | Speculative extraction; should be stored but not displayed or counted in analytics |

### 10.2 Display vs. Analytics Thresholds

| Context | Threshold | Rationale |
|---|---|---|
| Per-call report view | 0.0 (show all) | Users need full transparency including low-confidence extractions |
| RM report summary | 0.6 | Avoid inflating stats with speculative entries |
| Day report | 0.6 | Same |
| Analytics API (default) | 0.5 | Conservative default, user-adjustable via `min_confidence` param |
| Flat table inserts | 0.0 (insert all) | Always persist for audit; filter at query time |

### 10.3 Confidence Calibration

After the first week of production data:
1. Sample 30 calls with confidence 0.5–0.7 and manually verify.
2. If accuracy at 0.5 is >80%, keep the analytics default. If <60%, raise to 0.65.
3. Track the distribution of confidence scores in the analytics dashboard — if the majority cluster above 0.85, the scoring is well-calibrated.

### 10.4 `not_asked` vs `unknown`

These are semantically distinct and must not be conflated in analytics:
- `question_asked=false` (RM never asked) → tracked as a metric on the RM coaching dashboard, NOT as a lead source in distribution charts.
- `source='unknown'` (RM asked, customer said "don't know/remember") → IS counted in the distribution as `unknown`.
- `answered=false` (RM asked, customer deflected) → tracked as `not_answered` in stats, NOT in source distribution.

---

## 11. Edge Cases

### 11.1 Lead Source Edge Cases

**Multiple sources in one call:**
The `sources` array already handles this. A customer saying "My colleague told me and I also saw your Instagram ad" → `["referral", "ads"]`. Two rows are written to `call_lead_sources` for that call.

**Vague answers ("internet", "online"):**
Normalize as `organic_search` if the customer says "Google se", "internet pe dekha", "searched online". If they only say "online" with no further detail, use `other` with `confidence: 0.6`. Instruct Claude in the prompt: `"online" alone without specifics → other. "Google pe" or "search karke" → organic_search`.

**"Don't remember" / "yaad nahi":**
`question_asked=true`, `answered=false`, `sources=[]`, `source` in flat table written as `unknown`. The analytics `not_answered` counter increments.

**RM never asks:**
`question_asked=false`, `answered=false`, `sources=[]`. Flat table gets one row with `question_asked=false`, `source='unknown'`. The RM coaching metric "ask rate" drops for this RM.

**Question asked in Hindi:**
The prompt explicitly lists Hindi signals. No special handling needed — Claude handles it natively.

**Customer volunteers without being asked:**
`question_asked=false` (RM didn't ask), `answered=true` (customer gave info), `sources=[...]`. This is a valid extraction and should be counted in distribution. The prompt says: "Also capture if customer volunteers the info without being asked."

**Short calls (<60 seconds) where question wasn't reached:**
The scoring gate already sets `call_quality=null` for short calls. For lead source: `question_asked=false` expected. The prompt includes: "If the call is too short for the question to have been asked (<60 seconds), set question_asked=false."

**Customer is an existing customer returning for more investment:**
Normalize as `existing_customer`. The customer is both a lead source (they came back) and a qualification signal.

### 11.2 Competitor Edge Cases

**Transcription errors ("Grip" → "gripp", "Wint" → "Wint Welt"):**
Claude handles approximate matching. The prompt explicitly notes: "Transcription artifacts: 'Grip' may appear as 'grip' or 'gripp' — normalize these." Include "Wint Welt", "Wind Wealth" as Wint Wealth variants in the prompt instructions.

**Indirect mention ("another platform", "ek aur app hai"):**
Prompt: "Do NOT extract generic terms like 'other apps', 'another platform' unless a specific name appears nearby." If the customer says "ek aur app hai jo yahi karta hai" without naming it → do not extract. If the transcript continues and reveals the name → extract.

**RM mentions competitor to make a comparison:**
Extract it. The `context` field should clarify: "RM compared BondScanner rates favorably against Grip Invest." The relationship should be classified based on what the customer reveals, not what the RM says. If the RM mentions it only to pitch BondScanner and the customer has no opinion, use `casual_mention`.

**Customer mentions a non-financial competitor or unrelated app:**
Exclude. The prompt specifies "competing investment platforms" — payment apps, mutual fund apps outside the known list should not be extracted unless the competitive context is explicit.

**Unknown platform name (not in the known list):**
Use `normalized: "other"` and preserve the `name` field with the exact spoken name. This feeds the future extension "auto-tag new competitor names that appear repeatedly."

**Customer mentions multiple competitors:**
Each becomes a separate entry in `competitor_mentions[]` and a separate row in `call_competitor_mentions`. Handled by the array structure.

**Hindi mention ("Wint wala app hai na"):**
Claude normalizes this correctly. Include in the prompt examples: `"Wint wala" → wint_wealth`.

### 11.3 False Positive Prevention

Add this to the prompt (within the competitor section):
- Do NOT extract BondScanner itself.
- Do NOT extract stock brokers (Zerodha, Groww) unless the customer is explicitly comparing bond investment features.
- Do NOT extract generic references ("mutual fund app", "SIP platform") without a specific name.
- For lead source: only extract if THIS SPECIFIC CUSTOMER's source is stated. Generic comments by the RM ("most of our customers come from Google") are not lead source data for this call.

---

## 12. UI / UX Plan

### 12.1 RM Report Modal Additions

The RM report is displayed as a modal/panel after a session completes. Add two new Section cards after "Languages":

#### Lead Source Card

```
┌─ Lead Sources ──────────────────────────────────────────────┐
│ [Asked: 38/45]  [Answered: 31/38]  [Not Asked: 7/45]        │
│ Ask Rate: 84%   Answer Rate: 82%                             │
│                                                              │
│  Referral        ████████████████  12  (39%)                 │
│  Ads             ████████          8   (26%)                 │
│  Organic Search  █████             5   (16%)                 │
│  Friend/Family   ████              4   (13%)                 │
│  WhatsApp        ██                2   (6%)                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ # │ Customer   │ Source    │ Raw Answer             │     │
│  ├─────────────────────────────────────────────────────┤     │
│  │ 2 │ Ramesh K.  │ Referral  │ "Ek colleague ne      │     │
│  │   │            │           │  bataya"               │     │
│  │ 5 │ Priya S.   │ Ads       │ "Google ad dekha tha" │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

Implementation: Read `rmReport.lead_source_summary`. For the call-level table, the data comes from the `call_lead_sources` flat table (fetch via a separate API call when the modal opens, keyed by `session_id`).

#### Competitor Intelligence Card

```
┌─ Competitor Intelligence ───────────────────────────────────┐
│ 6 calls with mentions  ·  9 total mentions                   │
│                                                              │
│  Competitor      Count  Active  Comparing  Was Using         │
│  Wint Wealth       4      2        2          0              │
│  Grip Invest       3      1        1          1              │
│  GoldenPi          2      0        2          0              │
│                                                              │
│  [▼ Wint Wealth — 4 mentions]                                │
│     Call #2 · Ramesh K. · "actively using" · compared rates  │
│     Call #7 · Suresh P. · "comparing"      · evaluating both │
└──────────────────────────────────────────────────────────────┘
```

Implementation: Read `rmReport.competitor_summary`. Expandable rows show individual call entries.

### 12.2 Day End Report Additions

Add two new Section blocks after "Language Distribution" in `DayReportView.tsx`:

**Section 10: Lead Source Distribution (Cross-RM)**

Table: Source | Count | % | RM Breakdown (mini sparkline or text list)

Stat chips row: Total Asked / Not Asked / Answer Rate

**Section 11: Competitor Landscape**

Table columns: Competitor | Total Mentions | Unique Customers | Actively Using | Comparing | RM Breakdown

Implementation: Read from `report.lead_source_summary` and `report.competitor_summary`. These are generated by Claude in the day report.

### 12.3 New `/analytics` Page (Phase 2)

Route: `app/(calls)/analytics/page.tsx`

**Layout:**
```
┌─ Analytics ──────────────────────────────────────────────────┐
│  [From: 2026-04-01]  [To: 2026-05-12]  [RM: All]  [Apply]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ Lead Sources ──────────┐  ┌─ Competitor Intelligence ──┐ │
│  │  Ask Rate: 79%          │  │  Calls with mentions: 42   │ │
│  │  Answer Rate: 71%       │  │  Top: Wint Wealth (18)     │ │
│  │  [Stacked bar by date]  │  │  [Competitor table]        │ │
│  │                         │  │  [Drilldown to call IDs]   │ │
│  │  [Source distribution]  │  │                            │ │
│  │  [Confidence filter]    │  │                            │ │
│  └─────────────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Lead Source Section:**
- Stacked bar chart by date (each bar = one day, stacked by source slug)
- Distribution table: Source | Count | % | Avg Confidence
- Confidence threshold slider (default 0.5)
- RM breakdown table: RM | Ask Rate | Answer Rate | Top Source

**Competitor Section:**
- Sortable table: Competitor | Total Mentions | Unique Customers | Actively Using | Comparing
- Clicking a row shows call-level detail: call_id, phone, customer_name, user_id, rm_name, date, context
- RM filter applies to both sections

Data source: `/api/analytics/lead-sources` and `/api/analytics/competitors`.

---

## 13. TypeScript Types

Add to `types/index.ts`:

```typescript
// ── Lead Source ───────────────────────────────────────────────────────────────

export type LeadSourceSlug =
  | 'ads'
  | 'organic_search'
  | 'referral'
  | 'friend_family'
  | 'social_media'
  | 'youtube'
  | 'whatsapp'
  | 'existing_customer'
  | 'influencer'
  | 'partner_distributor'
  | 'other'
  | 'unknown';

export interface LeadSourceExtraction {
  question_asked: boolean;
  answered: boolean;
  sources: LeadSourceSlug[];
  raw_answer: string | null;
  confidence: number;
}

// ── Competitor Mentions ───────────────────────────────────────────────────────

export type CompetitorSlug =
  | 'wint_wealth'
  | 'grip_invest'
  | 'goldenpi'
  | 'bondsindia'
  | 'jiraaf'
  | 'indiabonds'
  | 'other';

export type CompetitorRelationship =
  | 'actively_using'
  | 'was_using'
  | 'comparing'
  | 'casual_mention';

export interface CompetitorMention {
  name: string;                       // as spoken/transcribed
  normalized: CompetitorSlug;
  relationship: CompetitorRelationship;
  context: string;
  confidence: number;
}

// ── Aggregated Summaries (for RM + Day reports) ───────────────────────────────

export interface LeadSourceDistributionEntry {
  source: string;                     // human-readable label
  slug: LeadSourceSlug;
  count: number;
  percentage: string;                 // e.g. "43%"
}

export interface LeadSourceSummary {
  calls_asked: number;
  calls_answered: number;
  calls_not_asked: number;
  ask_rate: string;
  answer_rate: string;
  distribution: LeadSourceDistributionEntry[];
  per_rm_breakdown?: Array<{          // day report only
    rm_name: string;
    ask_rate: string;
    top_source: string | null;
  }>;
}

export interface CompetitorBreakdownEntry {
  competitor: string;                 // human label
  slug: CompetitorSlug;
  count: number;
  unique_customers?: number;          // day report only
  relationship_breakdown: {
    actively_using: number;
    was_using: number;
    comparing: number;
    casual_mention: number;
  };
  call_refs?: number[];               // RM report: call numbers
  rm_breakdown?: Array<{             // day report only
    rm_name: string;
    count: number;
  }>;
}

export interface CompetitorSummary {
  calls_with_mentions: number;
  total_mentions: number;
  breakdown: CompetitorBreakdownEntry[];
}

// ── Extended Report interface ─────────────────────────────────────────────────
// Add to existing Report interface:
// lead_source: LeadSourceExtraction | null;
// competitor_mentions: CompetitorMention[] | null;

// ── Extended RMReport interface ───────────────────────────────────────────────

export interface RMReport {
  // ... existing fields ...
  lead_source_summary?: LeadSourceSummary;
  competitor_summary?: CompetitorSummary;
}

// ── Extended DayReport interface ──────────────────────────────────────────────

export interface DayReport {
  // ... existing fields ...
  lead_source_summary?: LeadSourceSummary;
  competitor_summary?: CompetitorSummary;
}

// ── Analytics API response types ─────────────────────────────────────────────

export interface LeadSourceAnalyticsResponse {
  total_calls_in_range: number;
  stats: {
    question_asked: number;
    question_not_asked: number;
    ask_rate_pct: number;
    answered: number;
    not_answered: number;
    answer_rate_pct: number;
  };
  distribution: Array<{
    slug: LeadSourceSlug;
    label: string;
    count: number;
    percentage: number;
  }>;
  per_rm_breakdown: Array<{
    rm_name: string;
    total_calls: number;
    asked: number;
    answered: number;
    top_source: string | null;
  }>;
  recent_calls: Array<{
    call_id: string;
    phone: string;
    customer_name: string;
    rm_name: string;
    session_date: string;
    source: string;
    raw_answer: string;
    confidence: number;
  }>;
}

export interface CompetitorAnalyticsResponse {
  total_calls_with_mentions: number;
  total_unique_customers: number;
  competitors: Array<{
    slug: CompetitorSlug;
    display_name: string;
    mention_count: number;
    unique_customer_count: number;
    phones: string[];
    user_ids: string[];
    call_ids: string[];
    relationship_breakdown: {
      actively_using: number;
      was_using: number;
      comparing: number;
      casual_mention: number;
    };
    rm_breakdown: Array<{
      rm_name: string;
      count: number;
    }>;
  }>;
}
```

---

## 14. Performance & Scalability

### 14.1 Index Strategy

The indexes defined in migration 008 are designed around the three dominant query patterns:

1. **Date-range + RM filter** (analytics page, RM report): `(rm_name, session_date)` composite index covers both.
2. **Source/competitor filter** (distribution queries): `(source)` and `(competitor)` single-column indexes.
3. **Phone lookup** (customer drilldown, joining `customer_profiles`): `(phone)` on both tables.

The `session_id` index supports the RM report modal fetching all rows for a given session without a full table scan.

### 14.2 Live Queries vs. Materialized Views

At current scale (250 calls/day, ~5,000 total rows after first month), all analytics queries run in <50ms against the normalized tables with the indexes above. No materialized views are needed.

**Threshold to add materialized views:** When total rows in `call_lead_sources` or `call_competitor_mentions` exceed ~100,000 (roughly 1–2 years of data at current scale), and the analytics page date-range queries start taking >500ms. At that point, create a `mv_lead_source_daily` and `mv_competitor_daily` materialized view, refreshed nightly.

**When to add external caching:** The analytics page does not need Redis/Memcached at current scale. The queries are fast and not called on a hot path. Revisit if the analytics page is accessed by multiple users simultaneously or if query times exceed 1 second.

### 14.3 Query Optimization for Complex Patterns

**"Competitors per RM per week":**
```sql
SELECT
  rm_name,
  competitor,
  COUNT(*) AS mention_count,
  DATE_TRUNC('week', session_date) AS week_start
FROM call_competitor_mentions
WHERE session_date >= NOW() - INTERVAL '12 weeks'
GROUP BY rm_name, competitor, week_start
ORDER BY week_start DESC, mention_count DESC;
```
This runs in <10ms at current scale with the `(rm_name, session_date)` index.

**"Customers who use both Wint Wealth and Grip Invest":**
```sql
SELECT phone FROM call_competitor_mentions
WHERE competitor = 'wint_wealth'
INTERSECT
SELECT phone FROM call_competitor_mentions
WHERE competitor = 'grip_invest';
```
Simple, fast with the `(competitor)` index.

### 14.4 Backfill Rate Limiting

The backfill endpoint is rate-limited to 50 calls per request. At Haiku's latency (~0.5s per short extraction), 50 calls takes ~25 seconds — well within the 120s Vercel route timeout. Do not increase the default batch size. If processing needs to be faster, run multiple concurrent calls to the backfill endpoint from a script (not from the UI).

---

## 15. Cost Analysis

### 15.1 Token Impact Per New Call

**Current per-call tokens (approximate):**
- Input: ~1,000 tokens (prompt template + average transcript)
- Output: ~600 tokens (full analysis JSON)

**Added by the new prompt sections (Section 3.2):**
- Extra input tokens: ~350 tokens (instruction blocks + JSON schema examples)
- Extra output tokens: ~150 tokens (lead_source object + competitor_mentions array, assuming ~1 source + 0–1 competitor on average)

**Updated per-call totals:**
- Input: ~1,350 tokens (+35%)
- Output: ~750 tokens (+25%)

### 15.2 Extra Cost Per Call (claude-sonnet-4-6)

```
Claude Sonnet pricing: $3.00/1M input, $15.00/1M output

Extra input:   350 tokens × ($3.00 / 1,000,000)  = $0.00105
Extra output:  150 tokens × ($15.00 / 1,000,000) = $0.00225
─────────────────────────────────────────────────────────────
Extra per call:                                    $0.00330
```

That's 0.33 cents per call, or roughly $0.33 per 100 calls.

### 15.3 Daily & Monthly Cost at Current Scale

**Scale: 250 calls/day**

```
Daily extra cost:   250 × $0.00330 = $0.83/day
Monthly extra cost: 250 × 30 × $0.00330 = $24.75/month
```

**Existing baseline cost (estimate from current ~1,600 input + 600 output tokens including RM/day reports amortized):**
Approximate existing cost is already ~$1.20–1.50/day. The new fields add ~55% to the per-call portion but only ~15% to total daily cost when amortized across RM and day reports.

### 15.4 Backfill Cost Comparison

| Approach | Model | Input/call | Output/call | Cost/call | Total (5,000 calls) |
|---|---|---|---|---|---|
| Haiku extraction-only | claude-haiku-3-5 | ~1,400 tokens | ~150 tokens | $0.00054 | **$2.69** |
| Sonnet extraction-only | claude-sonnet-4-6 | ~1,400 tokens | ~150 tokens | $0.00645 | $32.25 |
| Sonnet full re-analysis | claude-sonnet-4-6 | ~2,700 tokens | ~750 tokens | $0.01935 | $96.75 |

**Use Haiku for backfill.** The 12x cost saving over Sonnet full re-analysis is substantial, and extraction-only accuracy on explicit named entities is not materially lower.

### 15.5 Summary Table

| Scenario | Cost |
|---|---|
| Per new call (incremental) | $0.0033 |
| Per day (250 calls) | $0.83 |
| Per month (7,500 calls) | $24.75 |
| Backfill 5,000 historical calls (Haiku) | $2.69 |

---

## 16. Accuracy Evaluation

### 16.1 Manual Spot-Check Protocol

**Weekly sample:** Pick 20 random calls from the previous week where `confidence >= 0.5`. Open the Drive audio, listen to the relevant portion of the call (or read the transcript), and verify:
- Was the lead source question actually asked?
- Did Claude extract the right source slug?
- Were all competitor mentions captured?
- Were relationship types classified correctly?

Log results in a simple spreadsheet: call_id | field | claude_value | correct_value | is_correct.

Compute weekly accuracy rates. Target: ≥85% for `question_asked`, ≥80% for `sources`, ≥90% for competitor name detection, ≥75% for relationship type.

### 16.2 Confidence Calibration Approach

After 4 weeks of production data, bucket all spot-checked calls by confidence decile and compute accuracy per bucket:

| Confidence Range | Calls Checked | % Correct |
|---|---|---|
| 0.9–1.0 | 30 | target ≥ 95% |
| 0.7–0.9 | 30 | target ≥ 85% |
| 0.5–0.7 | 30 | target ≥ 70% |
| < 0.5 | 20 | expected < 60% |

If confidence is well-calibrated, higher confidence rows should be more accurate. If the curve is flat, the prompt needs adjustment to make Claude more conservative with high-confidence scores.

### 16.3 Feedback Loop: Wrong Extraction Flag

In the per-call report view, add a small "Mark wrong" link next to the lead source and each competitor mention. This sets a boolean `extraction_flagged = true` on the `call_lead_sources` / `call_competitor_mentions` row (add this column in migration 008).

Query weekly:
```sql
SELECT source, COUNT(*) AS flagged
FROM call_lead_sources
WHERE extraction_flagged = true
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY source ORDER BY flagged DESC;
```

If specific sources are flagged frequently, add clarifying instructions to the prompt for those categories.

### 16.4 Separate `question_asked` Accuracy Tracking

`question_asked` is the easiest field to verify — you can simply read the transcript and check if the RM said anything resembling "how did you hear about us". Track this separately in the spot-check spreadsheet. If Claude misses the question more than 10% of the time, strengthen the Hindi/Hinglish signal examples in the prompt.

---

## 17. Implementation Phases

### Phase 1 — DB Schema Migrations
**What:** Run `007_intelligence_columns.sql` and `008_intelligence_tables.sql` against Neon.  
**Files:** `supabase/migrations/007_intelligence_columns.sql` (new), `supabase/migrations/008_intelligence_tables.sql` (new)  
**Complexity:** S  
**Dependencies:** None. Safe to run on production before any code changes — additive only.  
**Output:** `reports` table has two new JSONB columns; `call_lead_sources` and `call_competitor_mentions` tables exist.

---

### Phase 2 — Extend Per-Call Analysis Prompt
**What:** Update `lib/analyse.ts` — add prompt instructions, JSON schema fields, increase max_tokens, extend `AnalysisResult` interface, map new fields in the return object.  
**Files:** `lib/analyse.ts`, `types/index.ts` (add `LeadSourceExtraction`, `CompetitorMention` types)  
**Complexity:** M  
**Dependencies:** Phase 1 (columns must exist before we start writing to them)  
**Testing:** Run a single call through `analyseTranscript()` and log the output — verify `lead_source` and `competitor_mentions` are populated correctly. Try a Hinglish transcript.

---

### Phase 3 — Update Process-Call Route
**What:** In `process-call/route.ts`, add `lead_source` and `competitor_mentions` to the `UPDATE reports` statement. Add the flat-table INSERT blocks for both `call_lead_sources` and `call_competitor_mentions`. Fetch `session_date` from `bulk_sessions` via JOIN at the top of the route.  
**Files:** `app/api/bulk/process-call/route.ts`  
**Complexity:** M  
**Dependencies:** Phase 1 + Phase 2  
**Note:** Add `session_date` to the initial SELECT (see Section 5.2). Test with a live session — inspect the flat tables in Neon after a call processes.

---

### Phase 4 — Extend RM Report Prompt
**What:** In `lib/rm-analyse.ts`, add `lead_source` and `competitor_mentions` to the call input type. Add `lead_source_summary` and `competitor_summary` to the JSON schema. In `generate-report/route.ts`, pass the new fields through `callData`. Extend `RMReport` type in `types/index.ts`.  
**Files:** `lib/rm-analyse.ts`, `app/api/bulk/generate-report/route.ts`, `types/index.ts`  
**Complexity:** M  
**Dependencies:** Phase 3 (data must exist in `reports` before the RM report can aggregate it)

---

### Phase 5 — Extend Day Report Prompt
**What:** Same pattern as Phase 4, applied to `lib/day-analyse.ts` and `app/api/day-report/generate/route.ts`. Add `per_rm_breakdown` to the day report's `lead_source_summary`. Override `unique_customers` in competitor breakdown with a code-computed value from the flat tables.  
**Files:** `lib/day-analyse.ts`, `app/api/day-report/generate/route.ts`, `types/index.ts`  
**Complexity:** M  
**Dependencies:** Phase 3

---

### Phase 6 — Build Analytics API Endpoints
**What:** Create `lib/analytics.ts` with helper functions. Create three new API routes: `lead-sources`, `competitors`, `backfill`.  
**Files:** `lib/analytics.ts` (new), `app/api/analytics/lead-sources/route.ts` (new), `app/api/analytics/competitors/route.ts` (new), `app/api/analytics/backfill/route.ts` (new)  
**Complexity:** L  
**Dependencies:** Phase 1 (flat tables), Phase 3 (data populating the tables)  
**Note:** Test backfill endpoint in `dry_run=true` mode first. Then test with `batch_size=5` on a small set before running at scale.

---

### Phase 7 — Build UI Additions
**What:** Add Lead Sources and Competitor Intelligence sections to the RM report modal and the Day Report view. Build reusable `LeadSourceSection` and `CompetitorSection` components.  
**Files:** `components/calls/LeadSourceSection.tsx` (new), `components/calls/CompetitorSection.tsx` (new), `components/calls/DayReportView.tsx` (extend), and the RM report display component (whichever component renders `rmReport`).  
**Complexity:** L  
**Dependencies:** Phase 4 (RM report has new fields), Phase 5 (day report has new fields)

---

### Phase 8 — Backfill Existing Data
**What:** Run the backfill endpoint against all historical transcripts. Use `dry_run=true` first to count eligible calls. Then run in batches of 50. Monitor the `call_lead_sources` and `call_competitor_mentions` tables after each batch.  
**Files:** No code changes — operational task using the Phase 6 endpoint.  
**Complexity:** S (operational)  
**Dependencies:** Phase 6  
**Cost:** ~$2.69 for 5,000 calls using Haiku (see Section 15.4).

---

### Phase 9 — Analytics Page (Phase 2, Optional)
**What:** Build the `/analytics` page with date range picker, RM filter, lead source charts, and competitor drilldown table.  
**Files:** `app/(calls)/analytics/page.tsx` (new), `components/layout/Sidebar.tsx` (add nav link)  
**Complexity:** L  
**Dependencies:** Phase 6 (API endpoints)  
**Note:** Defer until Phases 1–8 are stable and data has accumulated for at least 2 weeks. The raw analytics endpoints (Phase 6) give immediate value without a dedicated UI.

---

## 18. Future Extensions

### Lead Source × Investment Amount
Cross-join `call_lead_sources` with deal data (once deal value is tracked in the `reports` table) to compute average investment amount per acquisition channel. This tells you whether referral customers invest more than ad-acquired customers — a direct input to marketing spend decisions.

### Competitor Spike Alert
After Phase 6, add a cron job (can be a Vercel cron or an external scheduler) that runs nightly:
```sql
SELECT competitor, COUNT(*) AS today_count
FROM call_competitor_mentions
WHERE session_date = CURRENT_DATE
GROUP BY competitor
```
Compare to the 7-day rolling average. If any competitor's count is >2x the average, send an email alert to the team. Wint Wealth suddenly appearing in 15 calls instead of 5 is a signal worth acting on.

### RM Coaching Dashboard
Add a "Lead Source Ask Rate" metric to the RM performance section: "Kunal asked the lead source question in 30% of calls this week vs 78% team average." This is a direct read from `call_lead_sources WHERE rm_name = 'Kunal' AND session_date BETWEEN ...`, counting `question_asked=true / total distinct call_ids`.

### Auto-Tag Emerging Competitors
Weekly query against `call_competitor_mentions WHERE competitor = 'other'`, aggregated by the `competitor_display` field (which preserves the raw spoken name). If any non-normalized name appears ≥5 times in a week, flag it for review and consider adding it to the known list. This requires no ML — just a SQL aggregation and a human eyeball.

### Lead Source ROI (if ad spend connected)
If BondScanner connects Google Ads or Facebook Ads spend data (via API or manual CSV upload), you can compute: acquisition cost per `ads` lead = (weekly ad spend) / (weekly `ads` rows in `call_lead_sources`). Compare to referral cost (which is near-zero). This makes the analytics page a lightweight CAC dashboard.

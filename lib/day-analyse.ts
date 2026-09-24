import Anthropic from '@anthropic-ai/sdk';
import type { DayReport } from '@/types';

function getClaude() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

async function createWithRetry(params: Parameters<ReturnType<typeof getClaude>['messages']['create']>[0], maxRetries = 4): Promise<Anthropic.Message> {
  let delay = 8000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getClaude().messages.create(params) as Anthropic.Message;
    } catch (err: unknown) {
      const isOverloaded = err instanceof Error && (
        err.message.includes('529') || err.message.includes('overloaded') || err.message.includes('Overloaded')
      );
      if (isOverloaded && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 60000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Claude API still overloaded after retries');
}

export async function generateDayReport(
  reportDate: string,
  calls: Array<{
    call_number: number;
    rep_name: string | null;
    customer_name: string | null;
    phone: string | null;
    duration: string | null;
    duration_sec: number | null;
    outcome: string | null;
    summary: string | null;
    keywords: string[] | null;
    topics: string[] | null;
    action_items: Array<{ priority: string; task: string; owner: string; deadline: string }> | null;
    sentiment: { overall: string; agent: string; customer: string } | null;
    speaker_breakdown: { language: string; agent_percentage: number; customer_percentage: number } | null;
    call_quality: string | null;
    agent_performance: string | null;
  }>
): Promise<{ report: DayReport; input_tokens: number; output_tokens: number }> {

  const reps = [...new Set(calls.map(c => c.rep_name).filter(Boolean))].join(', ');

  const prompt = `You are an expert sales analytics assistant for BondScanner, a bond investment platform.
Analyse ALL call data for ${reportDate} across all reps (${reps}) and return a JSON object for the LEADERSHIP DAY-END REPORT with EXACTLY this structure (raw JSON only, no markdown fences):

{
  "overview": {
    "total_calls": <total number of calls>,
    "unique_customers": <count unique phone numbers>,
    "total_talk_time": "<computed externally — leave as PLACEHOLDER>",
    "reps_on_duty": ["<rep1>", "<rep2>"],
    "deals_discussed": "<e.g. 9 calls (20%)>"
  },
  "outcomes": [
    { "outcome": "<outcome label e.g. Follow-up Scheduled>", "count": <number>, "percentage": "<e.g. 38%>" }
  ],
  "deals_discussed": {
    "with_deals": <number of calls where bonds/products meaningfully discussed>,
    "without_deals": <remaining calls>,
    "deal_calls": "<e.g. #2 (Adarsh — Kunal), #21 (Nagaraj — Shreshth)>"
  },
  "highlights": [
    {
      "rank": "<Best Call / Second Best / Notable Resolution — pick top 3-4>",
      "call_number": <number>,
      "customer_name": "<name>",
      "phone": "<phone>",
      "duration": "<e.g. 10:35 min>",
      "rep": "<rep name>",
      "description": "<2-3 sentences on why this call stands out>"
    }
  ],
  "action_items": [
    {
      "priority": "HIGH | MEDIUM | LOW",
      "action": "<specific action>",
      "owner": "<rep name or team>",
      "deadline": "<DD-Mon>"
    }
  ],
  "improvements": [
    {
      "point": "<specific improvement with cross-RM pattern observed>",
      "call_refs": [
        { "rm_name": "<rep name>", "call_number": <number>, "customer_name": "<name or null>", "phone": "<phone or null>" }
      ]
    }
  ],
  "agent_performance": [
    {
      "agent": "<rep name>",
      "total_calls": <number>,
      "follow_ups": <number — follow_up_scheduled outcomes>,
      "avg_performance": "<e.g. 5.8/10>",
      "best_call": "<customer name — duration>"
    }
  ],
  "products": [
    { "bond_issuer": "<name>", "yield": "<e.g. 15.5%>", "context": "<e.g. High Yield / Existing Investment>" }
  ],
  "languages": [
    { "language": "<language>", "calls": <number>, "percentage": "<e.g. 62%>" }
  ]
}

CALL DATA (${calls.length} calls across all reps on ${reportDate}):
${JSON.stringify(calls, null, 2)}`;

  const message = await createWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const text    = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Escape literal newlines inside JSON strings, then strip trailing commas
  let sanitised = '';
  let inString = false, escaped = false;
  for (const ch of cleaned) {
    if (escaped)            { sanitised += ch; escaped = false; continue; }
    if (ch === '\\')        { sanitised += ch; escaped = true;  continue; }
    if (ch === '"')         { inString = !inString; sanitised += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) { sanitised += '\\n'; continue; }
    sanitised += ch;
  }
  sanitised = sanitised.replace(/,(\s*[}\]])/g, '$1');

  let parsed: DayReport;
  try {
    parsed = JSON.parse(sanitised) as DayReport;
  } catch {
    const start = sanitised.indexOf('{');
    const end   = sanitised.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Could not extract JSON from Claude day report response');
    parsed = JSON.parse(sanitised.slice(start, end + 1)) as DayReport;
  }

  return {
    report:        parsed,
    input_tokens:  message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
}

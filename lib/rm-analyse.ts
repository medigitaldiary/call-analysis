import Anthropic from '@anthropic-ai/sdk';
import type { RMReport } from '@/types';

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

export async function generateRMReport(
  rmName: string,
  sessionDate: string,
  calls: Array<{
    call_number: number;
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
    speaker_breakdown: { language: string; agent_percentage: number; customer_percentage: number; description: string } | null;
    compliance: string | null;
    call_quality: string | null;
    agent_performance: string | null;
  }>
): Promise<{ report: RMReport; input_tokens: number; output_tokens: number }> {
  const prompt = `You are an expert sales analytics assistant. Analyse the following call data for RM ${rmName} on ${sessionDate} and return a JSON object with EXACTLY this structure (raw JSON only, no markdown fences):

{
  "overview": {
    "total_calls": <number>,
    "unique_customers": <number - count unique phone numbers>,
    "total_talk_time": "<e.g. ~75 min>",
    "rep_on_duty": "${rmName}",
    "deals_discussed": "<e.g. 9 calls (20%)>"
  },
  "outcomes": [
    { "outcome": "<outcome label>", "count": <number>, "percentage": "<e.g. 38%>" }
  ],
  "deals_discussed": {
    "with_deals": <number>,
    "without_deals": <number>,
    "deal_calls": "<comma-separated list of call numbers where deals were discussed, e.g. #2 (Adarsh Hiremat), #21 (Nagaraj)>"
  },
  "highlights": [
    {
      "rank": "<Best Call / Second Best / Existing Investor Resolved / Support Resolution - pick top 3-4 meaningful calls>",
      "call_number": <number>,
      "customer_name": "<name>",
      "phone": "<phone>",
      "duration": "<e.g. 10:35 min>",
      "description": "<2-3 sentence description of why this call stands out>"
    }
  ],
  "action_items": [
    {
      "priority": "HIGH | MEDIUM | LOW",
      "action": "<specific action>",
      "owner": "<owner name or team>",
      "deadline": "<DD-Mon>"
    }
  ],
  "improvements": [
    {
      "point": "<specific improvement area>",
      "call_refs": [
        { "call_number": <number>, "customer_name": "<name or null>", "phone": "<phone or null>" }
      ]
    }
  ],
  "agent_performance": {
    "agent": "${rmName}",
    "total_calls": <number>,
    "follow_ups": <number - calls with follow_up_scheduled outcome>,
    "avg_performance": "N/A",
    "best_call": "<customer name — duration>",
    "summary": "<2-3 sentence performance summary. Mention how many calls were excluded from scoring due to gate conditions (short/low-quality calls).>"
  },
  "products": [
    { "bond_issuer": "<name>", "yield": "<e.g. 15.5%>", "context": "<e.g. High Yield / Existing investment>" }
  ],
  "languages": [
    { "language": "<language>", "calls": <number>, "percentage": "<e.g. 62%>" }
  ]
}

CALL DATA (${calls.length} calls):
${JSON.stringify(calls, null, 2)}`;

  const message = await createWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Escape literal newlines inside JSON string values (common in Hindi/Hinglish summaries).
  // Track string state so we only escape inside strings, not structural whitespace.
  let sanitised = '';
  let inString = false, escaped = false;
  for (const ch of cleaned) {
    if (escaped)                                  { sanitised += ch; escaped = false; continue; }
    if (ch === '\\')                              { sanitised += ch; escaped = true;  continue; }
    if (ch === '"')                               { inString = !inString; sanitised += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) { sanitised += '\\n'; continue; }
    sanitised += ch;
  }
  sanitised = sanitised.replace(/,(\s*[}\]])/g, '$1'); // strip trailing commas

  let parsed: RMReport;
  try {
    parsed = JSON.parse(sanitised) as RMReport;
  } catch {
    // Last resort: extract JSON block between first { and last }
    const start = sanitised.indexOf('{');
    const end   = sanitised.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Could not extract JSON from Claude RM report response');
    parsed = JSON.parse(sanitised.slice(start, end + 1)) as RMReport;
  }

  return {
    report:        parsed,
    input_tokens:  message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  };
}

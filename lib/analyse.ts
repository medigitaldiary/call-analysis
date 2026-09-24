import Anthropic from '@anthropic-ai/sdk';
import type { Report } from '@/types';

function getClaude() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

const ANALYSIS_PROMPT = (transcript: string, durationSec?: number) => `You are a call analysis assistant for a bond investment sales team. Analyse the transcript below and return a JSON object with EXACTLY this structure (raw JSON only, no markdown).

CALL DURATION: ${durationSec != null ? `${durationSec} seconds` : 'unknown'}

━━━ SCORING GATES (follow strictly) ━━━
GATE 1 — If duration < 60 seconds OR the transcript shows no real conversation (silent recording, wrong number, single-word exchange), set call_quality to null AND agent_performance to null.
GATE 2 — After scoring call_quality, extract the numeric value. If it is less than 4, set agent_performance to null. Only score agent_performance when call_quality ≥ 4/10.

━━━ CALL QUALITY RUBRIC (score out of 10) ━━━
Score each sub-criterion and sum them:
• Conversation depth   (0–3 pts): Real back-and-forth vs monologue or silence
• Customer engagement  (0–3 pts): Customer responds, asks questions, shows interest
• Resolution           (0–2 pts): Customer's query or need was actually addressed
• Structure            (0–2 pts): Clear intro → discussion → close

━━━ AGENT PERFORMANCE RUBRIC (score out of 10, ONLY if call_quality ≥ 4) ━━━
Score each sub-criterion and sum them:
• Opening & rapport    (0–2 pts): Professional greeting, built comfort with customer
• Needs discovery      (0–2 pts): Agent asked what the customer is looking for
• Product pitch        (0–3 pts): Bond/investment options explained clearly with yields/returns
• Objection handling   (0–2 pts): Customer hesitations or concerns were addressed
• Clear next step      (0–1 pt) : Follow-up action or callback defined before ending the call

{
  "date": "extracted or null",
  "time": "extracted or null",
  "duration": "in minutes, e.g. 1.3 min",
  "phone": "customer phone number or null",
  "customer_name": "customer name or No Name if unknown",
  "rep_name": "rep/agent name or No Name if unknown",
  "outcome": "one of: follow_up_scheduled | deal_closed | not_interested | info_shared | escalated | no_outcome",
  "call_quality": "score out of 10 per rubric e.g. 7/10, or null if Gate 1 applies",
  "agent_performance": "score out of 10 per rubric e.g. 8/10, or null if Gate 1 or Gate 2 applies",
  "summary": "2-3 sentence plain English summary of what happened on the call",
  "sentiment": {
    "overall": "score out of 10",
    "agent": "score out of 10",
    "customer": "score out of 10"
  },
  "speaker_breakdown": {
    "description": "one sentence describing what each party did",
    "language": "language spoken e.g. English, Hindi, Hinglish",
    "agent_percentage": 70,
    "customer_percentage": 30
  },
  "keywords": ["keyword1", "keyword2"],
  "topics": ["topic1"],
  "compliance": "any compliance issues flagged or None",
  "action_items": [
    {
      "priority": "HIGH | MEDIUM | LOW",
      "task": "specific action to take",
      "owner": "Rep name or team e.g. Support",
      "deadline": "DD-MM-YYYY, one day after call date if not specified"
    }
  ]
}
TRANSCRIPT:
${transcript}`;

export interface AnalysisResult extends Partial<Report> {
  input_tokens: number;
  output_tokens: number;
  claude_latency_ms: number;
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

export async function analyseTranscript(transcript: string, durationSec?: number): Promise<AnalysisResult> {
  const t0 = Date.now();
  const message = await createWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: ANALYSIS_PROMPT(transcript, durationSec) }],
  });
  const claude_latency_ms = Date.now() - t0;

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Robust parse: strip control characters (common in Hindi/Hinglish transcripts)
  const sanitised = cleaned
    .replace(/[\u0000-\u001F\u007F]/g, (m: string) => m === '\n' || m === '\r' || m === '\t' ? m : '')
    .replace(/,\s*([}\]])/g, '$1');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(sanitised);
  } catch {
    const start = sanitised.indexOf('{');
    const end   = sanitised.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Could not parse Claude analysis response as JSON');
    parsed = JSON.parse(sanitised.slice(start, end + 1));
  }

  return {
    date_extracted:    parsed.date ?? null,
    time_extracted:    parsed.time ?? null,
    duration:          parsed.duration ?? null,
    phone:             parsed.phone ?? null,
    customer_name:     parsed.customer_name ?? null,
    outcome:           parsed.outcome ?? null,
    call_quality:      parsed.call_quality ?? null,
    agent_performance: parsed.agent_performance ?? null,
    summary:           parsed.summary ?? null,
    sentiment:         parsed.sentiment ?? null,
    speaker_breakdown: parsed.speaker_breakdown ?? null,
    keywords:          parsed.keywords ?? null,
    topics:            parsed.topics ?? null,
    compliance:        parsed.compliance ?? null,
    action_items:      parsed.action_items ?? null,
    input_tokens:       message.usage.input_tokens,
    output_tokens:      message.usage.output_tokens,
    claude_latency_ms,
  };
}

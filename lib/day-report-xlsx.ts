import * as XLSX from 'xlsx';

export interface TranscriptCallRow {
  phone:             string | null;
  customer_name:     string | null;
  duration:          string | null;
  outcome:           string | null;
  call_quality:      string | null;
  agent_performance: string | null;
  summary:           string | null;
  sentiment:         { overall: string; agent: string; customer: string } | null;
  action_items:      Array<{ priority: string; task: string; owner: string; deadline: string }> | null;
  compliance:        string | null;
  transcript:        string | null;
}

export interface RMTranscriptData {
  rmName:  string;
  date:    string;
  calls:   TranscriptCallRow[];
}

function buildAnalysisText(c: TranscriptCallRow): string {
  const lines: string[] = [];

  if (c.summary)           lines.push(`SUMMARY\n${c.summary}`);
  if (c.outcome)           lines.push(`Outcome: ${c.outcome}`);
  if (c.call_quality)      lines.push(`Call Quality: ${c.call_quality}`);
  if (c.agent_performance) lines.push(`Agent Performance: ${c.agent_performance}`);

  if (c.sentiment) {
    lines.push(`Sentiment — Overall: ${c.sentiment.overall}  |  Agent: ${c.sentiment.agent}  |  Customer: ${c.sentiment.customer}`);
  }

  if (c.compliance && c.compliance.toLowerCase() !== 'none') {
    lines.push(`⚠ Compliance: ${c.compliance}`);
  }

  let actionItems: Array<{ priority: string; task: string; owner: string; deadline: string }> | null = null;
  if (Array.isArray(c.action_items)) {
    actionItems = c.action_items;
  } else if (typeof c.action_items === 'string') {
    try {
      const parsed = JSON.parse(c.action_items);
      if (Array.isArray(parsed)) actionItems = parsed;
      else if (typeof parsed === 'string') {
        // Double-encoded string — parse once more
        try { const again = JSON.parse(parsed); if (Array.isArray(again)) actionItems = again; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  if (actionItems && actionItems.length > 0) {
    const items = actionItems.map((a: { priority: string; task: string; owner: string; deadline: string }, i: number) =>
      `${i + 1}. [${a.priority}] ${a.task} — ${a.owner} (${a.deadline})`
    ).join('\n');
    lines.push(`ACTION ITEMS\n${items}`);
  }

  return lines.join('\n\n');
}

export function generateCombinedTranscriptXlsx(rms: RMTranscriptData[]): Buffer {
  const wb = XLSX.utils.book_new();

  for (const rm of rms) {
    // Sheet name: RM name (max 31 chars, Excel limit)
    const sheetName = rm.rmName.slice(0, 31);

    // Cap transcript at 1 500 chars per call — keeps xlsx compact for large sessions
    const MAX_TRANSCRIPT = 1500;
    const rows = rm.calls.map((c, i) => {
      const raw = c.transcript ?? '';
      const transcript = raw.length > MAX_TRANSCRIPT
        ? raw.slice(0, MAX_TRANSCRIPT) + '\n…[truncated]'
        : raw;
      return {
        '#':                i + 1,
        'Phone Number':     c.phone          ?? '',
        'Customer':         c.customer_name  ?? '',
        'Duration':         c.duration       ?? '',
        'Call Transcript':  transcript,
        'Call Analysis':    buildAnalysisText(c),
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [
      { '#': '', 'Phone Number': '', 'Customer': '', 'Duration': '', 'Call Transcript': 'No calls found', 'Call Analysis': '' }
    ]);

    // Set column widths
    ws['!cols'] = [
      { wch: 4  },  // #
      { wch: 16 },  // Phone Number
      { wch: 22 },  // Customer
      { wch: 10 },  // Duration
      { wch: 80 },  // Call Transcript
      { wch: 60 },  // Call Analysis
    ];

    // Enable text wrap on Transcript & Analysis columns (cols E and F = index 4, 5)
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (const C of [4, 5]) {
        const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cell_address]) continue;
        ws[cell_address].s = { alignment: { wrapText: true, vertical: 'top' } };
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

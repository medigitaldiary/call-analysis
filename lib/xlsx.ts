import * as XLSX from 'xlsx';
import { Call, Report } from '@/types';

export function generateXlsx(call: Call, report: Report): Buffer {
  const callDate = new Date(call.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const row = {
    Prospect: call.prospect_name,
    Company: call.company,
    Date: report.date_extracted ?? callDate,
    Time: report.time_extracted ?? '',
    Rep: call.rep_name,
    'Call Type': call.call_type ?? '',
    Duration: report.duration ?? '',
    Phone: report.phone ?? '',
    'Customer Name': report.customer_name ?? '',
    Outcome: report.outcome ?? '',
    'Call Quality': report.call_quality ?? '',
    'Agent Performance': report.agent_performance ?? '',
    'Sentiment Overall': report.sentiment?.overall ?? '',
    'Sentiment Agent': report.sentiment?.agent ?? '',
    'Sentiment Customer': report.sentiment?.customer ?? '',
    Language: report.speaker_breakdown?.language ?? '',
    'Agent Talk %': report.speaker_breakdown?.agent_percentage ?? '',
    Keywords: (report.keywords ?? []).join(', '),
    Topics: (report.topics ?? []).join(', '),
    Compliance: report.compliance ?? 'None',
    'Action Items Count': (report.action_items ?? []).length,
    'Doc URL': report.doc_url ?? '',
  };

  const ws = XLSX.utils.json_to_sheet([row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Call Analysis');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

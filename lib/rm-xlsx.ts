import * as XLSX from 'xlsx';
import type { RMReport } from '@/types';

export function generateRMXlsx(
  rmName: string,
  sessionDate: string,
  report: RMReport,
  calls: Array<{ call_number: number; customer_name: string | null; phone: string | null; duration: string | null; outcome: string | null; call_quality: string | null; agent_performance: string | null; summary: string | null; compliance: string | null; }>
): Buffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ['RM Daily Call Report', `${rmName} — ${sessionDate}`],
    [],
    ['OVERVIEW'],
    ['Total Calls', report.overview.total_calls],
    ['Unique Customers', report.overview.unique_customers],
    ['Total Talk Time', report.overview.total_talk_time],
    ['Deals Discussed', report.overview.deals_discussed],
    [],
    ['CALL OUTCOMES'],
    ['Outcome', 'Count', 'Percentage'],
    ...report.outcomes.map(o => [o.outcome, o.count, o.percentage]),
    [],
    ['AGENT PERFORMANCE'],
    ['Agent', 'Total Calls', 'Follow-ups', 'Avg Performance', 'Best Call'],
    [report.agent_performance.agent, report.agent_performance.total_calls, report.agent_performance.follow_ups, report.agent_performance.avg_performance, report.agent_performance.best_call],
    [],
    ['LANGUAGE DISTRIBUTION'],
    ['Language', 'Calls', '% of Total'],
    ...report.languages.map(l => [l.language, l.calls, l.percentage]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Sheet 2: All Calls
  const callsData = calls.map(c => ({
    '#': c.call_number,
    'Customer': c.customer_name ?? '',
    'Phone': c.phone ?? '',
    'Duration': c.duration ?? '',
    'Outcome': c.outcome ?? '',
    'Call Quality': c.call_quality ?? '',
    'Agent Performance': c.agent_performance ?? '',
    'Compliance': c.compliance ?? 'None',
    'Summary': c.summary ?? '',
  }));
  const wsCalls = XLSX.utils.json_to_sheet(callsData);
  XLSX.utils.book_append_sheet(wb, wsCalls, 'All Calls');

  // Sheet 3: Action Items
  const actionsData = report.action_items.map(a => ({
    'Priority': a.priority,
    'Action': a.action,
    'Owner': a.owner,
    'Deadline': a.deadline,
  }));
  const wsActions = XLSX.utils.json_to_sheet(actionsData.length ? actionsData : [{ 'Priority': '', 'Action': 'No action items', 'Owner': '', 'Deadline': '' }]);
  XLSX.utils.book_append_sheet(wb, wsActions, 'Action Items');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

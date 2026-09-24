import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from 'docx';
import type { RMReport } from '@/types';

const PRIORITY_COLOR: Record<string, string> = { HIGH: 'ef4444', MEDIUM: 'f59e0b', LOW: '22c55e' };
void PRIORITY_COLOR;

function heading(text: string, level: 1 | 2 = 2) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: level === 1 ? 28 : 24, color: level === 1 ? '3b82f6' : '1b2748' })],
    spacing: { before: 300, after: 120 },
  });
}

function tableRow(cells: string[], isHeader = false) {
  return new TableRow({
    children: cells.map(text =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: isHeader, size: isHeader ? 20 : 18 })] })],
        shading: isHeader ? { fill: '1b2748', type: ShadingType.SOLID } : undefined,
      })
    ),
  });
}

export async function generateRMDocx(rmName: string, sessionDate: string, report: RMReport): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: 'BONDSCANNER', bold: true, size: 32, color: '3b82f6' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `RM Daily Call Report — ${rmName} — ${sessionDate}`, bold: true, size: 26 })],
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '1e3058' } },
  }));

  // 1. Overview
  children.push(heading('1. Overview'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Metric', 'Value', 'Notes'], true),
      tableRow(['Total Calls Processed', String(report.overview.total_calls), 'All audio files included']),
      tableRow(['Unique Customers', String(report.overview.unique_customers), 'Unique phone numbers']),
      tableRow(['Total Talk Time', report.overview.total_talk_time, 'Excluding dropped/voicemail']),
      tableRow(['Rep on Duty', report.overview.rep_on_duty, 'Sole agent for the day']),
      tableRow(['Deals Discussed', report.overview.deals_discussed, 'Bonds/yields/products meaningfully discussed']),
    ],
  }));

  // 2. Call Outcomes
  children.push(heading('2. Call Outcomes'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Outcome', 'Count', 'Percentage'], true),
      ...report.outcomes.map(o => tableRow([o.outcome, String(o.count), o.percentage])),
    ],
  }));

  // 3. Deals Discussed
  children.push(heading('3. Deals Discussed'));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Deals Discussed captures calls where bonds, investment products, yields, or transaction details were meaningfully discussed.', italics: true, size: 18 })],
    spacing: { after: 120 },
  }));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Metric', 'Count', '% of Total Calls'], true),
      tableRow(['Calls with Deals Discussed', String(report.deals_discussed.with_deals), `${Math.round(report.deals_discussed.with_deals / report.overview.total_calls * 100)}%`]),
      tableRow(['Calls without Deals Discussed', String(report.deals_discussed.without_deals), `${Math.round(report.deals_discussed.without_deals / report.overview.total_calls * 100)}%`]),
    ],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Calls with deals discussed: ${report.deals_discussed.deal_calls}`, size: 18 })],
    spacing: { before: 120, after: 120 },
  }));

  // 4. Top Highlights
  children.push(heading('4. Top Highlights'));
  for (const h of report.highlights) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${h.rank} — #${h.call_number} | ${h.customer_name} | ${h.phone} | ${h.duration}`, bold: true, size: 20 })],
      spacing: { before: 160, after: 60 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: h.description, size: 18 })],
      spacing: { after: 120 },
    }));
  }

  // 5. Urgent Action Items
  children.push(heading('5. Urgent Action Items'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Priority', 'Action', 'Owner', 'Deadline'], true),
      ...report.action_items.map(a => tableRow([a.priority, a.action, a.owner, a.deadline])),
    ],
  }));

  // 6. Areas for Improvement
  children.push(heading('6. Areas for Improvement'));
  for (const imp of report.improvements) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `• ${imp.point}`, size: 18 })],
      spacing: { after: 40 },
    }));
    if (imp.call_refs && imp.call_refs.length > 0) {
      const refs = imp.call_refs.map(r =>
        `#${r.call_number}${r.customer_name ? ` (${r.customer_name})` : ''}${r.phone ? ` · ${r.phone}` : ''}`
      ).join(', ');
      children.push(new Paragraph({
        children: [new TextRun({ text: `  Ref: ${refs}`, size: 16, color: '3b82f6', italics: true })],
        spacing: { after: 80 },
      }));
    }
  }

  // 7. Agent Performance
  children.push(heading('7. Agent Performance'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Agent', 'Total Calls', 'Follow-ups', 'Avg Performance', 'Best Call'], true),
      tableRow([
        report.agent_performance.agent,
        String(report.agent_performance.total_calls),
        String(report.agent_performance.follow_ups),
        report.agent_performance.avg_performance,
        report.agent_performance.best_call,
      ]),
    ],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: report.agent_performance.summary, size: 18 })],
    spacing: { before: 120, after: 120 },
  }));

  // 8. Top Bonds & Products Discussed
  children.push(heading('8. Top Bonds & Products Discussed'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Bond / Issuer', 'Yield', 'Context'], true),
      ...report.products.map(p => tableRow([p.bond_issuer, p.yield, p.context])),
    ],
  }));

  // 9. Language Distribution
  children.push(heading('9. Language Distribution'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(['Language', 'Calls', '% of Total'], true),
      ...report.languages.map(l => tableRow([l.language, String(l.calls), l.percentage])),
    ],
  }));

  // Footer
  children.push(new Paragraph({
    children: [new TextRun({ text: `Generated by Radar · BondScanner · ${new Date().toISOString()}`, color: '7e95b8', size: 16 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    border: { top: { style: BorderStyle.SINGLE, size: 1, color: '1e3058' } },
  }));

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

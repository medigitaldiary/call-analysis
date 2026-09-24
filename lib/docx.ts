import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
} from 'docx';
import { Call, Report } from '@/types';

export async function generateDocx(call: Call, report: Report): Promise<Buffer> {
  const callDate = new Date(call.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const actionItemsText = (report.action_items ?? []).map((item, i) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}. `, bold: true }),
        new TextRun({ text: `[${item.priority}] ` }),
        new TextRun({ text: `${item.task} — ` }),
        new TextRun({ text: item.owner, bold: true }),
        new TextRun({ text: ` — ${item.deadline}` }),
      ],
      spacing: { after: 80 },
    })
  );

  const metaRows = [
    ['Date', report.date_extracted ?? callDate],
    ['Time', report.time_extracted ?? ''],
    ['Duration', report.duration ?? ''],
    ['Phone', report.phone ?? ''],
    ['Customer', report.customer_name ?? call.prospect_name],
    ['Rep', call.rep_name],
    ['Outcome', report.outcome ?? ''],
    ['Call Quality', report.call_quality ?? ''],
    ['Agent Performance', report.agent_performance ?? ''],
  ].map(([label, value]) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
          width: { size: 35, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: value })] })],
          width: { size: 65, type: WidthType.PERCENTAGE },
        }),
      ],
    })
  );

  const sb = report.speaker_breakdown;
  const sent = report.sentiment;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'BONDSCANNER', bold: true, size: 32, color: '3b82f6' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'CALL ANALYSIS REPORT', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '1e3058' } },
          }),

          new Paragraph({
            children: [new TextRun({ text: 'CALL DETAILS', bold: true, size: 24, color: '3b82f6' })],
            spacing: { before: 300, after: 200 },
          }),
          new Table({ rows: metaRows, width: { size: 100, type: WidthType.PERCENTAGE } }),

          new Paragraph({
            children: [new TextRun({ text: 'SUMMARY', bold: true, size: 24, color: '3b82f6' })],
            spacing: { before: 300, after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: report.summary ?? '' })],
            spacing: { after: 300 },
          }),

          ...(sent ? [
            new Paragraph({
              children: [new TextRun({ text: 'SENTIMENT', bold: true, size: 24, color: '3b82f6' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({ text: `Overall: ${sent.overall}  |  Agent: ${sent.agent}  |  Customer: ${sent.customer}` })],
              spacing: { after: 300 },
            }),
          ] : []),

          ...(sb ? [
            new Paragraph({
              children: [new TextRun({ text: 'SPEAKER BREAKDOWN', bold: true, size: 24, color: '3b82f6' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({ text: sb.description })],
              spacing: { after: 80 },
            }),
            new Paragraph({
              children: [new TextRun({ text: `Language: ${sb.language}  |  Agent: ${sb.agent_percentage}%  |  Customer: ${sb.customer_percentage}%` })],
              spacing: { after: 300 },
            }),
          ] : []),

          ...((report.keywords ?? []).length > 0 ? [
            new Paragraph({
              children: [new TextRun({ text: 'KEYWORDS', bold: true, size: 24, color: '3b82f6' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({ text: (report.keywords ?? []).join(', ') })],
              spacing: { after: 300 },
            }),
          ] : []),

          ...((report.topics ?? []).length > 0 ? [
            new Paragraph({
              children: [new TextRun({ text: 'TOPICS', bold: true, size: 24, color: '3b82f6' })],
              spacing: { before: 200, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({ text: (report.topics ?? []).join(', ') })],
              spacing: { after: 300 },
            }),
          ] : []),

          new Paragraph({
            children: [new TextRun({ text: 'COMPLIANCE', bold: true, size: 24, color: '3b82f6' })],
            spacing: { before: 200, after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: report.compliance ?? 'None' })],
            spacing: { after: 300 },
          }),

          new Paragraph({
            children: [new TextRun({ text: 'ACTION ITEMS', bold: true, size: 24, color: '3b82f6' })],
            spacing: { before: 300, after: 200 },
          }),
          ...actionItemsText,

          new Paragraph({
            children: [new TextRun({ text: `Generated by Radar  ·  ${new Date().toISOString()}`, color: '7e95b8', size: 18 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
            border: { top: { style: BorderStyle.SINGLE, size: 1, color: '1e3058' } },
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

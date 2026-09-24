import nodemailer from 'nodemailer';
import type { DayReport, RMReport } from '@/types';

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required');

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15_000,  // 15 s to open the TLS connection
    greetingTimeout:   15_000,  // 15 s for the EHLO greeting
    socketTimeout:    120_000,  // 2 min for uploading the message body/attachments
  });
}

// ─── HTML builders ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArr<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function buildDayReportHtml(date: string, report: DayReport, rmReports: { rmName: string; sessionDate: string; report: RMReport }[], transcriptNote = ''): string {
  const fmtDate = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const outcomesHtml = safeArr<typeof report.outcomes[0]>(report.outcomes)
    .map(o => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${o.outcome}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${o.count}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${o.percentage}</td></tr>`)
    .join('');

  const highlightsHtml = safeArr<typeof report.highlights[0]>(report.highlights)
    .map(h => `<li style="margin-bottom:10px;"><strong>${h.rank} — #${h.call_number} · ${h.customer_name}</strong> <span style="color:#6b7280;">(${h.rep ?? ''} · ${h.duration})</span><br><span style="color:#374151;">${h.description}</span></li>`)
    .join('');

  const actionItemsHtml = safeArr<typeof report.action_items[0]>(report.action_items)
    .map((a, i) => {
      const color = a.priority === 'HIGH' ? '#ef4444' : a.priority === 'MEDIUM' ? '#f59e0b' : '#22c55e';
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;"><span style="background:${color}18;color:${color};border:1px solid ${color}40;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">${a.priority}</span></td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${a.action}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#6b7280;">${a.owner}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#6b7280;white-space:nowrap;">${a.deadline}</td></tr>`;
    })
    .join('');

  const improvementsHtml = safeArr<typeof report.improvements[0]>(report.improvements)
    .map(imp => {
      if (typeof imp === 'string') return `<li style="margin-bottom:6px;color:#374151;">${imp}</li>`;
      const refs = safeArr<typeof imp.call_refs[0]>(imp.call_refs).length > 0
        ? ` <span style="font-size:11px;color:#6b7280;">[${safeArr<typeof imp.call_refs[0]>(imp.call_refs).map(r => `${r.rm_name} #${r.call_number}${r.customer_name ? ` ${r.customer_name}` : ''}`).join(', ')}]</span>`
        : '';
      return `<li style="margin-bottom:6px;color:#374151;">${imp.point}${refs}</li>`;
    })
    .join('');

  const agentPerfHtml = safeArr<typeof report.agent_performance[0]>(report.agent_performance)
    .map((a, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};"><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${a.agent}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#3b82f6;font-weight:600;">${a.total_calls}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${a.follow_ups}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#f59e0b;font-weight:600;">${a.avg_performance}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#6b7280;font-size:12px;">${a.best_call}</td></tr>`)
    .join('');

  const productsArr = safeArr<typeof report.products[0]>(report.products);
  const productsHtml = productsArr.length
    ? `<h2 style="font-size:16px;color:#1b2748;margin:28px 0 10px;">Top Bonds &amp; Products</h2>
       <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
         <tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Bond / Issuer</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Yield</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Context</th></tr>
         ${productsArr.map(p => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${p.bond_issuer}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#22c55e;font-weight:600;">${p.yield}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${p.context}</td></tr>`).join('')}
       </table>` : '';

  // RM summary blurbs
  const rmSummaryHtml = rmReports.length
    ? `<h2 style="font-size:16px;color:#1b2748;margin:28px 0 10px;">RM Performance Snapshots</h2>
       ${rmReports.map(rm => `
         <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
           <div style="font-size:13px;font-weight:700;color:#1b2748;margin-bottom:4px;">${rm.rmName} <span style="font-weight:400;color:#6b7280;font-size:12px;">· ${rm.sessionDate}</span></div>
           <div style="font-size:12px;color:#374151;line-height:1.6;">${rm.report.agent_performance?.summary ?? ''}</div>
           <div style="margin-top:6px;font-size:12px;color:#6b7280;">
             Median score: <strong style="color:#f59e0b;">${rm.report.agent_performance?.avg_performance ?? 'N/A'}</strong>
             &nbsp;·&nbsp; Follow-ups: <strong>${rm.report.agent_performance?.follow_ups ?? 0}</strong>
             &nbsp;·&nbsp; Total calls: <strong>${rm.report.agent_performance?.total_calls ?? 0}</strong>
           </div>
         </div>`).join('')}
       <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">Individual RM Excel reports are attached below.</p>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:#1b2748;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">BondScanner</p>
          <p style="margin:6px 0 0;font-size:14px;color:#7e95b8;">Day End Report — ${fmtDate}</p>
        </td></tr>

        <!-- Stats row -->
        <tr><td style="padding:24px 32px;background:#131d35;border-bottom:1px solid #1e3058;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;padding-bottom:4px;">Total Calls</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;padding-bottom:4px;">Unique Customers</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;padding-bottom:4px;">Talk Time</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;padding-bottom:4px;">Reps on Duty</td>
            </tr>
            <tr>
              <td style="color:#3b82f6;font-size:24px;font-weight:700;">${report.overview.total_calls}</td>
              <td style="color:#3b82f6;font-size:24px;font-weight:700;">${report.overview.unique_customers}</td>
              <td style="color:#f59e0b;font-size:24px;font-weight:700;">${report.overview.total_talk_time}</td>
              <td style="color:#f1f5f9;font-size:15px;font-weight:600;">${safeArr<string>(report.overview.reps_on_duty).join(', ')}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">

          <h2 style="font-size:16px;color:#1b2748;margin:0 0 10px;">Call Outcomes</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px;">
            <tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Outcome</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Count</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">%</th></tr>
            ${outcomesHtml}
          </table>

          <h2 style="font-size:16px;color:#1b2748;margin:0 0 10px;">Top Highlights</h2>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:13px;line-height:1.8;">${highlightsHtml}</ul>

          <h2 style="font-size:16px;color:#1b2748;margin:0 0 10px;">Urgent Action Items</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px;">
            <tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Priority</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Action</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Owner</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Deadline</th></tr>
            ${actionItemsHtml || '<tr><td colspan="4" style="padding:10px 12px;color:#6b7280;">No action items</td></tr>'}
          </table>

          <h2 style="font-size:16px;color:#1b2748;margin:0 0 10px;">Areas for Improvement</h2>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:13px;line-height:1.8;">${improvementsHtml}</ul>

          <h2 style="font-size:16px;color:#1b2748;margin:0 0 10px;">Agent Performance</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px;">
            <tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Agent</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Calls</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Follow-ups</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Median Score</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;">Best Call</th></tr>
            ${agentPerfHtml}
          </table>

          ${productsHtml}
          ${rmSummaryHtml}

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Generated by Radar &middot; BondScanner &middot; ${fmtDate}</p>
          ${transcriptNote ? `<p style="margin:6px 0 0;color:#9ca3af;font-size:11px;">${transcriptNote}</p>` : ''}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main send function ──────────────────────────────────────────────────────

export interface RMAttachment {
  rmName: string;
  sessionDate: string;
  report: RMReport;
  xlsxBuffer?: Buffer;
}

export type SendMode = 'test' | 'production' | 'internal';

// Each mode has its own fixed thread anchor + subject so they never bleed into each other.
const THREAD_CONFIG: Record<SendMode, { subject: string; threadId: string }> = {
  test: {
    subject:  '[TEST] Day end report - Call Analysis',
    threadId: '<day-report-test-thread@bondscanner.com>',
  },
  production: {
    subject:  'Call analysis: Day end report',
    threadId: '<day-report-thread@bondscanner.com>',
  },
  internal: {
    subject:  '[Internal] Call analysis: Day end report',
    threadId: '<day-report-internal-thread@bondscanner.com>',
  },
};

export async function sendDayReportEmail(
  date: string,
  report: DayReport,
  rmAttachments: RMAttachment[],
  recipients: string[],
  transcriptXlsx?: Buffer,
  mode: SendMode = 'production',
): Promise<{ accepted: string[] }> {
  const transport = getTransport();
  const user = process.env.GMAIL_USER!;

  const { subject, threadId } = THREAD_CONFIG[mode];

  const rmReports = rmAttachments.map(a => ({ rmName: a.rmName, sessionDate: a.sessionDate, report: a.report }));
  const transcriptNote = transcriptXlsx
    ? ''
    : 'Transcript file omitted — too many calls for a single attachment. Download individual transcripts from the Radar app.';
  const html = buildDayReportHtml(date, report, rmReports, transcriptNote);

  // Build attachments
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // Attachment 1: one summary xlsx per RM (existing generated reports)
  const attachments: { filename: string; content: Buffer; contentType: string }[] = rmAttachments
    .filter(a => a.xlsxBuffer)
    .map(a => {
      const safeDate = a.sessionDate.replace(/[^a-zA-Z0-9]/g, '_');
      const safeName = a.rmName.replace(/[^a-zA-Z0-9]/g, '_');
      return {
        filename: `RM_Report_${safeName}_${safeDate}.xlsx`,
        content: a.xlsxBuffer!,
        contentType: XLSX_MIME,
      };
    });

  // Attachment 2: combined transcript xlsx (one sheet per RM)
  if (transcriptXlsx) {
    const safeDate = date.replace(/-/g, '_');
    attachments.push({
      filename: `Transcripts_${safeDate}.xlsx`,
      content: transcriptXlsx,
      contentType: XLSX_MIME,
    });
  }

  const info = await transport.sendMail({
    from: `"Radar · BondScanner" <${user}>`,
    to: recipients.join(', '),
    subject,
    html,
    attachments,
    // Threading headers — keeps all emails for this mode in one Gmail thread
    references: threadId,
    inReplyTo:  threadId,
  });

  return { accepted: info.accepted as string[] };
}

import { Resend } from 'resend';
import { Call, Report } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArr<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

function buildEmailHtml(call: Call, report: Report): string {
  const callDate = new Date(call.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const duration = report.duration ?? (call.duration_sec ? `${Math.round(call.duration_sec / 60)} min` : 'N/A');

  const actionItemsHtml = (report.action_items ?? [])
    .map((item, i) => `<li><strong>${i + 1}. [${item.priority}] ${item.task}</strong> — ${item.owner} — ${item.deadline}</li>`)
    .join('');

  const sent = report.sentiment;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:#1b2748;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">BondScanner</p>
          <p style="margin:6px 0 0;font-size:14px;color:#7e95b8;">Call Analysis Report</p>
        </td></tr>

        <!-- Meta row -->
        <tr><td style="padding:20px 32px;background:#131d35;border-bottom:1px solid #1e3058;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#7e95b8;font-size:12px;text-transform:uppercase;">Date</td>
              <td style="color:#7e95b8;font-size:12px;text-transform:uppercase;">Rep</td>
              <td style="color:#7e95b8;font-size:12px;text-transform:uppercase;">Duration</td>
              <td style="color:#7e95b8;font-size:12px;text-transform:uppercase;">Outcome</td>
            </tr>
            <tr>
              <td style="color:#f1f5f9;font-size:14px;padding-top:4px;">${report.date_extracted ?? callDate}</td>
              <td style="color:#f1f5f9;font-size:14px;padding-top:4px;">${call.rep_name}</td>
              <td style="color:#f1f5f9;font-size:14px;padding-top:4px;">${duration}</td>
              <td style="color:#f1f5f9;font-size:14px;padding-top:4px;">${report.outcome ?? 'N/A'}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 8px;font-size:16px;color:#1b2748;">Summary</h2>
          <p style="margin:0 0 24px;color:#374151;line-height:1.6;">${report.summary ?? ''}</p>

          ${sent ? `
          <h2 style="margin:0 0 8px;font-size:16px;color:#1b2748;">Sentiment</h2>
          <p style="margin:0 0 24px;color:#374151;">Overall: ${sent.overall} &nbsp;|&nbsp; Agent: ${sent.agent} &nbsp;|&nbsp; Customer: ${sent.customer}</p>
          ` : ''}

          ${(report.keywords ?? []).length > 0 ? `
          <h2 style="margin:0 0 8px;font-size:16px;color:#1b2748;">Keywords</h2>
          <p style="margin:0 0 24px;color:#374151;">${(report.keywords ?? []).join(', ')}</p>
          ` : ''}

          <h2 style="margin:0 0 8px;font-size:16px;color:#1b2748;">Compliance</h2>
          <p style="margin:0 0 24px;color:${report.compliance && report.compliance.toLowerCase() !== 'none' ? '#ef4444' : '#22c55e'};">${report.compliance ?? 'None'}</p>

          <h2 style="margin:0 0 8px;font-size:16px;color:#1b2748;">Action Items</h2>
          <ul style="margin:0 0 24px;padding-left:20px;color:#374151;line-height:1.8;">${actionItemsHtml || '<li>No action items.</li>'}</ul>

          ${report.doc_url ? `
          <div style="margin-top:24px;">
            <a href="${report.doc_url}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-right:12px;">Download Report (.docx)</a>
            ${report.sheet_url ? `<a href="${report.sheet_url}" style="display:inline-block;background:#1b2748;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;">Download Sheet (.xlsx)</a>` : ''}
          </div>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Generated automatically by Radar &middot; BondScanner</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildRMEmailHtml(rmName: string, sessionDate: string, report: import('@/types').RMReport): string {
  const actionItemsHtml = safeArr<typeof report.action_items[0]>(report.action_items)
    .map((a, i) => `<li><strong>${i + 1}. [${a.priority}] ${a.action}</strong> — ${a.owner} — ${a.deadline}</li>`)
    .join('');

  const outcomesHtml = safeArr<typeof report.outcomes[0]>(report.outcomes)
    .map(o => `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${o.outcome}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${o.count}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${o.percentage}</td></tr>`)
    .join('');

  const highlightsHtml = safeArr<typeof report.highlights[0]>(report.highlights)
    .map(h => `<li style="margin-bottom:8px;"><strong>${h.rank} — #${h.call_number} · ${h.customer_name}</strong><br>${h.description}</li>`)
    .join('');

  const improvementsHtml = safeArr<typeof report.improvements[0]>(report.improvements)
    .map(imp => {
      const callRefs = safeArr<typeof imp.call_refs[0]>(imp.call_refs);
      const refs = callRefs.length > 0
        ? ` <span style="font-size:11px;color:#6b7280;">[${callRefs.map(r => `#${r.call_number}${r.customer_name ? ` ${r.customer_name}` : ''}`).join(', ')}]</span>`
        : '';
      return `<li>${imp.point}${refs}</li>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">

        <tr><td style="background:#1b2748;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">BondScanner</p>
          <p style="margin:6px 0 0;font-size:14px;color:#7e95b8;">RM Daily Report — ${rmName} · ${sessionDate}</p>
        </td></tr>

        <tr><td style="padding:24px 32px;background:#131d35;border-bottom:1px solid #1e3058;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;">Total Calls</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;">Unique Customers</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;">Talk Time</td>
              <td style="color:#7e95b8;font-size:11px;text-transform:uppercase;">With Deals</td>
            </tr>
            <tr>
              <td style="color:#3b82f6;font-size:22px;font-weight:700;padding-top:4px;">${report.overview.total_calls}</td>
              <td style="color:#3b82f6;font-size:22px;font-weight:700;padding-top:4px;">${report.overview.unique_customers}</td>
              <td style="color:#f59e0b;font-size:22px;font-weight:700;padding-top:4px;">${report.overview.total_talk_time}</td>
              <td style="color:#22c55e;font-size:22px;font-weight:700;padding-top:4px;">${report.deals_discussed.with_deals}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:32px;">

          <h2 style="margin:0 0 12px;font-size:16px;color:#1b2748;">Call Outcomes</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Outcome</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Count</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">%</th>
            </tr>
            ${outcomesHtml}
          </table>

          <h2 style="margin:0 0 12px;font-size:16px;color:#1b2748;">Agent Performance</h2>
          <p style="margin:0 0 6px;color:#374151;line-height:1.6;">
            <strong>Avg Score:</strong> ${report.agent_performance.avg_performance} &nbsp;|&nbsp;
            <strong>Follow-ups:</strong> ${report.agent_performance.follow_ups} &nbsp;|&nbsp;
            <strong>Best Call:</strong> ${report.agent_performance.best_call}
          </p>
          <p style="margin:0 0 28px;color:#374151;line-height:1.6;">${report.agent_performance.summary}</p>

          <h2 style="margin:0 0 12px;font-size:16px;color:#1b2748;">Top Highlights</h2>
          <ul style="margin:0 0 28px;padding-left:20px;color:#374151;line-height:1.8;">${highlightsHtml}</ul>

          <h2 style="margin:0 0 12px;font-size:16px;color:#1b2748;">Urgent Action Items</h2>
          <ul style="margin:0 0 28px;padding-left:20px;color:#374151;line-height:1.8;">${actionItemsHtml || '<li>No action items.</li>'}</ul>

          <h2 style="margin:0 0 12px;font-size:16px;color:#1b2748;">Areas for Improvement</h2>
          <ul style="margin:0 0 28px;padding-left:20px;color:#374151;line-height:1.8;">${improvementsHtml}</ul>

        </td></tr>

        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Generated automatically by Radar &middot; BondScanner</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendRMReportEmail(
  rmName: string,
  sessionDate: string,
  report: import('@/types').RMReport,
  stakeholders: string[],
  docBuffer?: Buffer,
  sheetBuffer?: Buffer,
): Promise<string> {
  const subject = `RM Report — ${rmName} — ${sessionDate}`;
  const safeDate = sessionDate.replace(/[^a-zA-Z0-9]/g, '_');

  const attachments = [];
  if (docBuffer) attachments.push({ filename: `RM_Report_${rmName}_${safeDate}.docx`, content: docBuffer });
  if (sheetBuffer) attachments.push({ filename: `RM_Summary_${rmName}_${safeDate}.xlsx`, content: sheetBuffer });

  const { data, error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'radar@bondscanner.in',
    to: stakeholders,
    subject,
    html: buildRMEmailHtml(rmName, sessionDate, report),
    attachments: attachments as never[],
  });

  if (error) throw new Error(error.message);
  return data?.id ?? '';
}

export async function sendStakeholderEmail(
  call: Call,
  report: Report,
  docBuffer?: Buffer,
  sheetBuffer?: Buffer
): Promise<string> {
  const callDate = new Date(call.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const subject = `Call Report — ${call.prospect_name} (${call.company}) — ${callDate}`;
  const safeCompany = call.company.replace(/[^a-zA-Z0-9]/g, '_');

  const attachments = [];
  if (docBuffer) {
    attachments.push({ filename: `${safeCompany}_${callDate}.docx`, content: docBuffer });
  }
  if (sheetBuffer) {
    attachments.push({ filename: `${safeCompany}_${callDate}.xlsx`, content: sheetBuffer });
  }

  const { data, error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'radar@bondscanner.in',
    to: call.stakeholders,
    subject,
    html: buildEmailHtml(call, report),
    attachments: attachments as never[],
  });

  if (error) throw new Error(error.message);
  return data?.id ?? '';
}

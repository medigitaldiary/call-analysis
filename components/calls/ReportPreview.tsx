'use client';

import { useState } from 'react';
import { Report, ActionItem } from '@/types';

interface Props {
  report: Report;
  callId: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  follow_up_scheduled: 'Follow-up Scheduled',
  deal_closed:         'Deal Closed',
  not_interested:      'Not Interested',
  info_shared:         'Info Shared',
  escalated:           'Escalated',
  no_outcome:          'No Outcome',
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#22c55e',
};

export default function ReportPreview({ report, callId }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const [emailInput, setEmailInput] = useState('');

  async function sendEmail() {
    setSendError('');
    const emails = emailInput
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);
    if (!emails.length) {
      setSendError('Please enter at least one stakeholder email.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, stakeholders: emails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Send failed');
      setSent(true);
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const sent_ = report.sentiment;
  const sb = report.speaker_breakdown;

  const metaRows: [string, string | null | undefined][] = [
    ['Date',              report.date_extracted],
    ['Time',              report.time_extracted],
    ['Duration',          report.duration],
    ['Phone',             report.phone],
    ['Customer Name',     report.customer_name],
    ['Rep Name',          (report as unknown as Record<string, unknown>).rep_name as string ?? null],
    ['Outcome',           report.outcome ? (OUTCOME_LABELS[report.outcome] ?? report.outcome) : null],
    ['Call Quality',      report.call_quality],
    ['Agent Performance', report.agent_performance],
  ];

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--card-border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
          Call Analysis Report
        </h3>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Metadata table ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {metaRows.map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontWeight: 600, width: '38%', background: '#131d35' }}>
                  {label}
                </td>
                <td style={{ padding: '9px 14px', color: value ? '#f1f5f9' : 'var(--text-dim)' }}>
                  {value ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Summary ── */}
        <Section label="Summary">
          <p style={{ margin: 0, lineHeight: 1.7, color: '#f1f5f9', fontSize: 13 }}>
            {report.summary ?? '—'}
          </p>
        </Section>

        {/* ── Sentiment ── */}
        {sent_ && (
          <Section label="Sentiment">
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {(['overall', 'agent', 'customer'] as const).map((key) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
                    {sent_[key]}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Speaker Breakdown ── */}
        {sb && (
          <Section label="Speaker Breakdown">
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#f1f5f9', lineHeight: 1.6 }}>
              {sb.description}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip label="Language" value={sb.language} />
              <Chip label="Agent" value={`${sb.agent_percentage}%`} color="#3b82f6" />
              <Chip label="Customer" value={`${sb.customer_percentage}%`} color="#f59e0b" />
            </div>
            {/* Simple bar */}
            <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'var(--card-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${sb.agent_percentage}%`, background: '#3b82f6', borderRadius: 3 }} />
            </div>
          </Section>
        )}

        {/* ── Keywords ── */}
        {(report.keywords ?? []).length > 0 && (
          <Section label="Keywords">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {(report.keywords ?? []).join(', ')}
            </p>
          </Section>
        )}

        {/* ── Topics ── */}
        {(report.topics ?? []).length > 0 && (
          <Section label="Topics">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {(report.topics ?? []).join(', ')}
            </p>
          </Section>
        )}

        {/* ── Compliance ── */}
        <Section label="Compliance">
          <p style={{
            margin: 0,
            fontSize: 13,
            color: report.compliance && report.compliance.toLowerCase() !== 'none' ? '#ef4444' : '#22c55e',
            lineHeight: 1.6,
          }}>
            {report.compliance ?? 'None'}
          </p>
        </Section>

        {/* ── Action Items ── */}
        <Section label="Action Items">
          {(report.action_items ?? []).length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>No action items.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(report.action_items ?? []).map((item: ActionItem, i: number) => (
                <li
                  key={i}
                  style={{
                    padding: '10px 14px',
                    background: '#0c1021',
                    border: `1px solid ${PRIORITY_COLOR[item.priority] ?? '#1e3058'}30`,
                    borderLeft: `3px solid ${PRIORITY_COLOR[item.priority] ?? '#1e3058'}`,
                    borderRadius: '0 8px 8px 0',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: `${PRIORITY_COLOR[item.priority] ?? '#7e95b8'}20`,
                      color: PRIORITY_COLOR[item.priority] ?? '#7e95b8',
                      letterSpacing: 0.5,
                    }}>
                      {item.priority}
                    </span>
                    <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{item.task}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Owner: <span style={{ color: '#3b82f6' }}>{item.owner}</span>
                    {' '}—{' '}
                    Deadline: {item.deadline}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* ── Footer actions ── */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {report.doc_url && (
            <a href={`/api/download?url=${encodeURIComponent(report.doc_url)}`} download style={outlineLinkStyle}>
              ↓ Export Doc (.docx)
            </a>
          )}
          {report.sheet_url && (
            <a href={`/api/download?url=${encodeURIComponent(report.sheet_url)}`} download style={outlineLinkStyle}>
              ↓ Export Sheet (.xlsx)
            </a>
          )}
        </div>

        {/* Stakeholder email row */}
        {!sent ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <input
                type="text"
                placeholder="Stakeholder emails (comma-separated)"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0c1021',
                  border: '1px solid var(--card-border)',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {sendError && (
                <p style={{ margin: '4px 0 0', color: '#ef4444', fontSize: 12 }}>{sendError}</p>
              )}
            </div>
            <button
              onClick={sendEmail}
              disabled={sending}
              style={{
                padding: '8px 20px',
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {sending ? 'Sending…' : '✉ Send to Stakeholders'}
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
            ✓ Report sent to stakeholders
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: '1px solid var(--card-border)',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 10px',
      background: '#0c1021',
      border: '1px solid var(--card-border)',
      borderRadius: 20,
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}:</span>
      <span style={{ color: color ?? '#f1f5f9', fontWeight: 600 }}>{value}</span>
    </span>
  );
}

const outlineLinkStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 13,
  fontWeight: 500,
  textDecoration: 'none',
};

'use client';

import { useState, useEffect } from 'react';
import type { DayReport } from '@/types';

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#22c55e',
};

const OUTCOME_COLOR: Record<string, string> = {
  'follow_up_scheduled': '#3b82f6',
  'deal_closed':         '#22c55e',
  'not_interested':      '#ef4444',
  'info_shared':         '#f59e0b',
  'escalated':           '#a855f7',
  'no_outcome':          '#7e95b8',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DayReportView() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [report, setReport]             = useState<DayReport | null>(null);
  const [reportDate, setReportDate]     = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<{ report_date: string; total_calls: number }[]>([]);
  const [generating, setGenerating]     = useState(false);
  const [sending, setSending]           = useState<'idle' | 'test' | 'production' | 'internal'>('idle');
  const [error, setError]               = useState<string | null>(null);
  const [sendMsg, setSendMsg]           = useState<string | null>(null);

  // Load available dates
  useEffect(() => {
    fetch('/api/day-report')
      .then(r => r.json())
      .then(d => setAvailableDates(d.dates ?? []));
  }, []);

  // Load report when date changes (if one exists)
  useEffect(() => {
    setReport(null);
    setError(null);
    fetch(`/api/day-report?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.report) { setReport(d.report); setReportDate(d.date); }
      });
  }, [selectedDate]);

  async function handleGenerate() {
    setGenerating(true); setError(null); setReport(null);
    try {
      const res = await fetch('/api/day-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setReport(data.report);
      setReportDate(data.date);
      // Refresh available dates
      fetch('/api/day-report').then(r => r.json()).then(d => setAvailableDates(d.dates ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend(mode: 'test' | 'production' | 'internal') {
    setSending(mode); setSendMsg(null);
    try {
      const res = await fetch('/api/day-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, mode }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try { data = await res.json(); } catch {
        throw new Error(
          res.status === 504 || res.status === 524
            ? 'Send timed out — too many calls for one request. Try again or contact support.'
            : `Send failed (${res.status}) — server returned an unexpected response.`
        );
      }
      if (!res.ok) throw new Error(data.error ?? 'Send failed');
      const label = mode === 'test' ? '🧪 Test sent to' : mode === 'internal' ? '✓ Internal sent to' : '✓ Report sent to';
      setSendMsg(`${label} ${data.recipients?.join(', ')}`);
    } catch (e: unknown) {
      setSendMsg(`✗ ${e instanceof Error ? e.message : 'Send failed'}`);
    } finally {
      setSending('idle');
    }
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header row */}
      <div className="history-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Day End Report</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Leadership-level summary across all reps for a given date</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="date"
            value={selectedDate}
            max={today()}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ background: '#0c1021', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: '#f1f5f9', outline: 'none' }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ padding: '8px 18px', background: generating ? '#1e3058' : '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer' }}
          >
            {generating ? 'Generating…' : report ? '↻ Regenerate' : '⚡ Generate Report'}
          </button>
          {report && (<>
            <button
              onClick={() => handleSend('test')}
              disabled={sending !== 'idle'}
              style={{ padding: '8px 18px', background: sending === 'test' ? '#1e3058' : '#f59e0b18', border: '1px solid #f59e0b40', borderRadius: 8, color: '#f59e0b', fontSize: 13, fontWeight: 600, cursor: sending !== 'idle' ? 'not-allowed' : 'pointer' }}
            >
              {sending === 'test' ? 'Sending…' : '🧪 Test'}
            </button>
            <button
              onClick={() => handleSend('production')}
              disabled={sending !== 'idle'}
              style={{ padding: '8px 18px', background: sending === 'production' ? '#1e3058' : '#22c55e20', border: '1px solid #22c55e40', borderRadius: 8, color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: sending !== 'idle' ? 'not-allowed' : 'pointer' }}
            >
              {sending === 'production' ? 'Sending…' : '✉ Send Report'}
            </button>
            <button
              onClick={() => handleSend('internal')}
              disabled={sending !== 'idle'}
              style={{ padding: '8px 18px', background: sending === 'internal' ? '#1e3058' : '#8b5cf620', border: '1px solid #8b5cf640', borderRadius: 8, color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: sending !== 'idle' ? 'not-allowed' : 'pointer' }}
            >
              {sending === 'internal' ? 'Sending…' : '🏢 Send Internal'}
            </button>
          </>)}
        </div>
      </div>

      {/* Available dates chips */}
      {availableDates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {availableDates.map(d => (
            <button
              key={d.report_date}
              onClick={() => setSelectedDate(d.report_date)}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                background: selectedDate === d.report_date ? '#1e3058' : 'transparent',
                color: selectedDate === d.report_date ? '#7eb3f8' : 'var(--text-muted)',
                border: `1px solid ${selectedDate === d.report_date ? '#3b82f640' : 'var(--card-border)'}`,
              }}
            >
              {new Date(d.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {d.total_calls} calls
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {error   && <div style={{ padding: '10px 16px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>}
      {sendMsg && (() => {
        const ok = sendMsg.startsWith('✓') || sendMsg.startsWith('🧪');
        return <div style={{ padding: '10px 16px', background: ok ? '#22c55e20' : '#ef444420', border: `1px solid ${ok ? '#22c55e40' : '#ef444440'}`, borderRadius: 8, color: ok ? '#22c55e' : '#ef4444', fontSize: 13 }}>{sendMsg}</div>;
      })()}

      {/* Empty state */}
      {!report && !generating && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            {availableDates.some(d => d.report_date === selectedDate)
              ? 'Loading saved report…'
              : 'No report for this date yet.'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Select a date and click Generate Report</div>
        </div>
      )}

      {generating && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 14 }}>Generating day end report for {selectedDate}…</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Claude is analysing all calls for the day</div>
        </div>
      )}

      {/* ── REPORT ── */}
      {report && reportDate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 1. Overview */}
          <Section title="1. Overview">
            <table style={tableStyle}>
              <thead><tr>{['Metric', 'Value', 'Notes'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Total Calls Processed', report.overview.total_calls, 'All audio files included'],
                  ['Unique Customers', report.overview.unique_customers, ''],
                  ['Total Talk Time', report.overview.total_talk_time, 'Excluding dropped/voicemail'],
                  ['Reps on Duty', report.overview.reps_on_duty.join(', '), ''],
                  ['Deals Discussed', report.overview.deals_discussed, 'Bonds/yields meaningfully discussed'],
                ].map(([metric, value, note]) => (
                  <tr key={String(metric)}>
                    <td style={tdStyle}>{metric}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>{value}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 11 }}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* 2. Call Outcomes */}
          <Section title="2. Call Outcomes">
            <table style={tableStyle}>
              <thead><tr>{['Outcome', 'Count', 'Percentage'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {report.outcomes.map(o => {
                  const key = o.outcome.toLowerCase().replace(/\s+/g, '_');
                  const color = OUTCOME_COLOR[key] ?? '#7e95b8';
                  return (
                    <tr key={o.outcome}>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 20, fontSize: 11 }}>
                          {o.outcome}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>{o.count}</td>
                      <td style={{ ...tdStyle, color: '#7e95b8' }}>{o.percentage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          {/* 3. Deals Discussed */}
          <Section title="3. Deals Discussed">
            <div className="stats-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'With Deals',    value: report.deals_discussed.with_deals,    color: '#22c55e' },
                { label: 'Without Deals', value: report.deals_discussed.without_deals, color: '#7e95b8' },
                { label: '% Deal Calls',  value: `${Math.round((report.deals_discussed.with_deals / report.overview.total_calls) * 100)}%`, color: '#3b82f6' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#131d35', borderRadius: 8, border: '1px solid var(--card-border)', padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: '#f1f5f9' }}>Calls with deals:</strong> {report.deals_discussed.deal_calls}
            </p>
          </Section>

          {/* 4. Top Highlights */}
          <Section title="4. Top Highlights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {report.highlights.map(h => (
                <div key={h.rank} style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h.rank}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>#{h.call_number}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{h.customer_name}</span>
                    {h.phone && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {h.phone}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {h.duration}</span>
                    <span style={{ fontSize: 11, padding: '1px 6px', background: '#1e3058', color: '#7e95b8', border: '1px solid #253870', borderRadius: 4 }}>{h.rep}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{h.description}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 5. Urgent Action Items */}
          <Section title="5. Urgent Action Items">
            <div className="table-scroll">
            <table style={{ ...tableStyle, minWidth: 500 }}>
              <thead><tr>{['Priority', 'Action', 'Owner', 'Deadline'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {report.action_items.map((a, i) => {
                  const color = PRIORITY_COLOR[a.priority] ?? '#7e95b8';
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', background: `${color}18`, color, border: `1px solid ${color}30`, borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{a.priority}</span>
                      </td>
                      <td style={{ ...tdStyle, color: '#f1f5f9', maxWidth: 360 }}>{a.action}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{a.owner}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.deadline}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Section>

          {/* 6. Areas for Improvement */}
          <Section title="6. Areas for Improvement">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.improvements.map((imp, i) => {
                const point = typeof imp === 'string' ? imp : imp.point;
                const refs  = typeof imp === 'string' ? [] : (imp.call_refs ?? []);
                return (
                  <div key={i}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>• {point}</div>
                    {refs.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {refs.map((ref, ri) => (
                          <span key={ri} style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            background: '#1e3058', color: '#93c5fd', border: '1px solid #1e40af',
                            fontFamily: 'monospace',
                          }}>
                            {ref.rm_name} · {ref.phone ?? ref.customer_name ?? `#${ref.call_number}`}
                            {ref.phone && ref.customer_name ? ` · ${ref.customer_name}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 7. Agent Performance */}
          <Section title="7. Agent Performance">
            <div className="table-scroll">
            <table style={{ ...tableStyle, minWidth: 480 }}>
              <thead><tr>{['Agent', 'Total Calls', 'Follow-ups', 'Avg Performance', 'Best Call'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {report.agent_performance.map((a, i) => (
                  <tr key={a.agent} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>{a.agent}</td>
                    <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>{a.total_calls}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{a.follow_ups}</td>
                    <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 600 }}>{a.avg_performance}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 11 }}>{a.best_call}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Section>

          {/* 8. Top Bonds & Products */}
          {report.products.length > 0 && (
            <Section title="8. Top Bonds & Products Discussed">
              <div className="table-scroll">
              <table style={{ ...tableStyle, minWidth: 400 }}>
                <thead><tr>{['Bond / Issuer', 'Yield', 'Context'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {report.products.map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>{p.bond_issuer}</td>
                      <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>{p.yield}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Section>
          )}

          {/* 9. Language Distribution */}
          {report.languages.length > 0 && (
            <Section title="9. Language Distribution">
              <table style={tableStyle}>
                <thead><tr>{['Language', 'Calls', '% of Total'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {report.languages.map((l, i) => (
                    <tr key={l.language} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                      <td style={{ ...tdStyle, color: '#f1f5f9' }}>{l.language}</td>
                      <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>{l.calls}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{l.percentage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--card-border)', background: '#131d35' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{title}</h3>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  borderBottom: '1px solid var(--card-border)', background: '#131d35', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 14px', color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)', verticalAlign: 'middle',
};

'use client';

import { useEffect, useState } from 'react';

interface UsageSummary {
  total_calls: number;
  total_input: number;
  total_output: number;
  total_tokens: number;
  total_cost_usd: number;
  total_duration_sec: number;
  avg_cost_per_call: number;
  tokens_per_sec: number | null;
  cost_per_sec: number | null;
}

interface SessionUsage {
  id: string;
  rm_name: string;
  session_date: string;
  total_files: number;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

interface DailyUsage {
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  duration_sec: number;
  cost_usd: number;
  // breakdown (all three sources)
  transcript_cost_usd:  number;
  rm_cost_usd:          number;
  day_report_cost_usd:  number;
}

interface DailyByType {
  day: string;
  transcript_input: number;
  transcript_output: number;
  transcript_cost_usd: number;
  rm_input: number;
  rm_output: number;
  rm_cost_usd: number;
  day_report_input: number;
  day_report_output: number;
  day_report_cost_usd: number;
  total_cost_usd: number;
}

interface Pricing {
  model: string;
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
}

interface Latency {
  avg_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  timed_calls: number;
}

interface SarvamDaily {
  day: string;
  calls: number;
  duration_sec: number;
  cost_inr: number;
}

interface SarvamUsage {
  total_calls: number;
  total_duration_sec: number;
  total_cost_inr: number;
  avg_cost_per_call: number;
  avg_duration_sec: number;
  price_per_hour_inr: number;
  daily: SarvamDaily[];
}

interface UsageData {
  summary: UsageSummary;
  sessions: SessionUsage[];
  daily: DailyUsage[];
  daily_by_type: DailyByType[];
  latency: Latency;
  pricing: Pricing;
  sarvam: SarvamUsage;
}

type Tab = 'claude' | 'sarvam';

function fmt(n: number) { return n.toLocaleString(); }
function fmtUsd(n: number) { return `$${n.toFixed(4)}`; }
function fmtUsdShort(n: number) {
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
function fmtInr(n: number) {
  if (n >= 1) return `₹${n.toFixed(2)}`;
  return `₹${n.toFixed(4)}`;
}
function fmtDuration(sec: number) {
  if (sec <= 0) return '—';
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`;
  if (sec >= 60)   return `${Math.round(sec / 60)} min`;
  return `${sec}s`;
}

export default function UsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('claude');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d?.summary ? d : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      Loading usage data…
    </div>
  );

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
      Failed to load usage data.
    </div>
  );

  const { summary, sessions, daily, daily_by_type, latency, pricing, sarvam } = data;

  const avgDailyCost = daily.length > 0
    ? daily.reduce((s, d) => s + d.cost_usd, 0) / daily.length
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Header with tab toggle */}
      <div className="history-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>API Usage</h2>
        <div style={{ display: 'flex', background: '#0c1021', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--card-border)' }}>
          {(['claude', 'sarvam'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '5px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: tab === t ? '#1e3058' : 'transparent',
                color: tab === t ? '#f1f5f9' : 'var(--text-muted)',
              }}
            >
              {t === 'claude' ? '🤖 Claude API' : '🎙️ Sarvam AI'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'claude' ? (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Model + pricing note */}
          <div className="usage-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Model: <span style={{ color: '#3b82f6', fontWeight: 500 }}>{pricing.model}</span>
              &nbsp;·&nbsp; Input: <span style={{ color: '#22c55e' }}>${pricing.input_per_1m}/M tokens</span>
              &nbsp;·&nbsp; Output: <span style={{ color: '#f59e0b' }}>${pricing.output_per_1m}/M tokens</span>
            </p>
            <a
              href="https://console.anthropic.com/settings/billing"
              target="_blank"
              rel="noreferrer"
              style={{ padding: '7px 14px', background: '#1e3058', border: '1px solid var(--card-border)', borderRadius: 8, color: '#f1f5f9', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
            >
              ↗ Anthropic Console
            </a>
          </div>

          {/* Summary stat cards */}
          <div className="stats-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { label: 'Calls Analysed',    value: fmt(summary.total_calls),           sub: 'total',           color: '#3b82f6' },
              { label: 'Total Tokens Used', value: fmt(summary.total_tokens),           sub: `${fmt(summary.total_input)} in · ${fmt(summary.total_output)} out`, color: '#a855f7' },
              { label: 'Total Cost',        value: fmtUsdShort(summary.total_cost_usd), sub: 'all time',        color: '#22c55e' },
              { label: 'Avg Cost / Call',   value: fmtUsd(summary.avg_cost_per_call),  sub: 'per analysis',    color: '#f59e0b' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Efficiency metrics */}
          <div className="stats-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              {
                label: 'Tokens / Second of Audio',
                value: summary.tokens_per_sec != null ? `${summary.tokens_per_sec.toFixed(1)}` : '—',
                sub:   summary.total_duration_sec > 0
                         ? `across ${Math.round(summary.total_duration_sec / 60)} min of audio`
                         : 'no duration data yet',
                color: '#38bdf8',
              },
              {
                label: 'Cost / Second of Audio',
                value: summary.cost_per_sec != null ? `$${(summary.cost_per_sec * 100).toFixed(4)}¢` : '—',
                sub:   summary.cost_per_sec != null
                         ? `= $${(summary.cost_per_sec * 60).toFixed(4)} per minute`
                         : 'no duration data yet',
                color: '#fb923c',
              },
              {
                label: 'Total Audio Analysed',
                value: summary.total_duration_sec > 0
                         ? summary.total_duration_sec >= 3600
                           ? `${(summary.total_duration_sec / 3600).toFixed(1)}h`
                           : `${Math.round(summary.total_duration_sec / 60)} min`
                         : '—',
                sub:   summary.total_duration_sec > 0
                         ? `${fmt(summary.total_duration_sec)}s total`
                         : 'no duration data yet',
                color: '#a78bfa',
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Claude API latency */}
          <div style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>⚡ Claude API Response Time</h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {latency.timed_calls > 0
                  ? `measured across ${latency.timed_calls} call${latency.timed_calls !== 1 ? 's' : ''}`
                  : 'data collected from next batch onwards'}
              </span>
            </div>
            <div className="stats-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Avg Response Time', value: latency.avg_ms != null ? `${(latency.avg_ms / 1000).toFixed(1)}s` : '—', sub: latency.avg_ms != null ? `${latency.avg_ms.toLocaleString()} ms` : 'run a batch to start tracking', color: '#3b82f6' },
                { label: 'Fastest',           value: latency.min_ms != null ? `${(latency.min_ms / 1000).toFixed(1)}s` : '—', sub: latency.min_ms != null ? `${latency.min_ms.toLocaleString()} ms` : '—', color: '#22c55e' },
                { label: 'Slowest',           value: latency.max_ms != null ? `${(latency.max_ms / 1000).toFixed(1)}s` : '—', sub: latency.max_ms != null ? `${latency.max_ms.toLocaleString()} ms` : '—', color: '#f59e0b' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: '#0c1021', borderRadius: 8, border: '1px solid var(--card-border)', padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost projections */}
          <div style={{ background: '#131d35', border: '1px solid #3b82f630', borderRadius: 10, padding: '16px 20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>📊 Cost Projections  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(based on {daily.length}-day average of {fmtUsd(avgDailyCost)}/day)</span></h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 12 }}>
              {[
                { label: 'Weekly',  value: fmtUsdShort(avgDailyCost * 7) },
                { label: 'Monthly', value: fmtUsdShort(avgDailyCost * 30) },
                { label: 'Yearly',  value: fmtUsdShort(avgDailyCost * 365) },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: '#0c1021', borderRadius: 8, border: '1px solid var(--card-border)',
                  padding: isMobile ? '10px 14px' : '12px 16px',
                  display: isMobile ? 'flex' : 'block',
                  alignItems: isMobile ? 'center' : undefined,
                  justifyContent: isMobile ? 'space-between' : undefined,
                  textAlign: isMobile ? 'left' : 'center',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: isMobile ? 0 : 6 }}>{label}</div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: '#3b82f6' }}>{value}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              * Projections are estimates based on current usage patterns. Actual costs depend on call volume and transcript length.
            </p>
          </div>

          {/* Daily breakdown */}
          {daily.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Daily Usage (Last 30 Days)</h3>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Includes transcript analysis + RM report generation + day end report · matches Anthropic console billing
                </span>
              </div>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Date', 'Calls', 'Talk Time', 'Input Tokens', 'Output Tokens', 'Cost (USD)'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((d, i) => (
                      <tr key={String(d.day)} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                        <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {new Date(d.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>{d.calls || '—'}</td>
                        <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 600 }}>{fmtDuration(d.duration_sec)}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{fmt(d.input_tokens)}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{fmt(d.output_tokens)}</td>
                        <td style={{ ...tdStyle }}>
                          <span style={{ color: '#22c55e', fontWeight: 700 }}>{fmtUsd(d.cost_usd)}</span>
                          {/* Cost breakdown chips */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            {d.transcript_cost_usd > 0 && (
                              <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56,189,248,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                                📝 {fmtUsd(d.transcript_cost_usd)}
                              </span>
                            )}
                            {d.rm_cost_usd > 0 && (
                              <span style={{ fontSize: 10, color: '#a855f7', background: 'rgba(168,85,247,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                                📊 {fmtUsd(d.rm_cost_usd)}
                              </span>
                            )}
                            {d.day_report_cost_usd > 0 && (
                              <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                                📋 {fmtUsd(d.day_report_cost_usd)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e3058' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#f1f5f9' }}>Total</td>
                      <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 700 }}>{fmt(daily.reduce((s, d) => s + d.calls, 0))}</td>
                      <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 700 }}>{fmtDuration(daily.reduce((s, d) => s + d.duration_sec, 0))}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontWeight: 700 }}>{fmt(daily.reduce((s, d) => s + d.input_tokens, 0))}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontWeight: 700 }}>{fmt(daily.reduce((s, d) => s + d.output_tokens, 0))}</td>
                      <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700 }}>{fmtUsdShort(daily.reduce((s, d) => s + d.cost_usd, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Cost breakdown by report type */}
          {daily_by_type.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Cost by Report Type (Last 30 Days)</h3>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={{ ...thStyle, color: '#38bdf8' }}>📝 Transcript Analysis</th>
                      <th style={{ ...thStyle, color: '#a855f7' }}>📊 RM Report Gen</th>
                      <th style={{ ...thStyle, color: '#f59e0b' }}>📋 Day End Report</th>
                      <th style={{ ...thStyle, color: '#22c55e' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily_by_type.map((d, i) => (
                      <tr key={String(d.day)} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                        <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {new Date(d.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>{fmtUsd(d.transcript_cost_usd)}</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>
                            {fmt(d.transcript_input + d.transcript_output)} tok
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: '#a855f7', fontWeight: 600 }}>{fmtUsd(d.rm_cost_usd)}</span>
                          <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>
                            {fmt(d.rm_input + d.rm_output)} tok
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {d.day_report_cost_usd > 0 ? (
                            <>
                              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fmtUsd(d.day_report_cost_usd)}</span>
                              <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>
                                {fmt(d.day_report_input + d.day_report_output)} tok
                              </span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700 }}>{fmtUsd(d.total_cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e3058' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#f1f5f9' }}>Total</td>
                      <td style={tdStyle}>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                          {fmtUsdShort(daily_by_type.reduce((s, d) => s + d.transcript_cost_usd, 0))}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: '#a855f7', fontWeight: 700 }}>
                          {fmtUsdShort(daily_by_type.reduce((s, d) => s + d.rm_cost_usd, 0))}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                          {fmtUsdShort(daily_by_type.reduce((s, d) => s + d.day_report_cost_usd, 0))}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700 }}>
                        {fmtUsdShort(daily_by_type.reduce((s, d) => s + d.total_cost_usd, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Per-session breakdown */}
          {sessions.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Per Session Breakdown</h3>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Session', 'Date', 'Calls', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Cost (USD)'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{s.rm_name}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(s.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>{s.total_files}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{fmt(s.input_tokens)}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{fmt(s.output_tokens)}</td>
                        <td style={{ ...tdStyle, color: '#a855f7', fontWeight: 600 }}>{fmt(s.input_tokens + s.output_tokens)}</td>
                        <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700 }}>{fmtUsd(s.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e3058' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#f1f5f9' }} colSpan={2}>Total</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#3b82f6' }}>{summary.total_calls}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontWeight: 600 }}>{fmt(summary.total_input)}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontWeight: 600 }}>{fmt(summary.total_output)}</td>
                      <td style={{ ...tdStyle, color: '#a855f7', fontWeight: 700 }}>{fmt(summary.total_tokens)}</td>
                      <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700 }}>{fmtUsdShort(summary.total_cost_usd)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {summary.total_calls === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
              <div style={{ fontSize: 14 }}>No usage data yet. Process calls to see token usage and cost estimates here.</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Sarvam pricing note */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Speech-to-text transcription&nbsp;·&nbsp;
              <span style={{ color: '#f59e0b', fontWeight: 500 }}>₹{sarvam.price_per_hour_inr}/hour</span>
            </p>
            <a
              href="https://dashboard.sarvam.ai"
              target="_blank"
              rel="noreferrer"
              style={{ padding: '7px 14px', background: '#1e3058', border: '1px solid var(--card-border)', borderRadius: 8, color: '#f1f5f9', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
            >
              ↗ Sarvam Dashboard
            </a>
          </div>

          {/* Sarvam summary cards */}
          <div className="stats-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { label: 'Calls Transcribed', value: fmt(sarvam.total_calls),               sub: 'total',                                    color: '#3b82f6' },
              { label: 'Total Audio',        value: fmtDuration(sarvam.total_duration_sec), sub: `${fmt(sarvam.total_duration_sec)}s`,         color: '#a855f7' },
              { label: 'Total Cost',         value: fmtInr(sarvam.total_cost_inr),         sub: 'all time',                                  color: '#22c55e' },
              { label: 'Avg Cost / Call',    value: fmtInr(sarvam.avg_cost_per_call),      sub: `~${fmtDuration(sarvam.avg_duration_sec)} avg`, color: '#f59e0b' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Sarvam daily breakdown */}
          {sarvam.daily.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Daily Transcription (Last 30 Days)</h3>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: 360, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Date', 'Calls', 'Audio Duration', 'Cost (₹)'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sarvam.daily.map((d, i) => (
                      <tr key={String(d.day)} style={{ background: i % 2 === 0 ? 'transparent' : '#131d35' }}>
                        <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {new Date(d.day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>{d.calls}</td>
                        <td style={{ ...tdStyle, color: '#a855f7', fontWeight: 600 }}>{fmtDuration(d.duration_sec)}</td>
                        <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>{fmtInr(d.cost_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sarvam.total_calls === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
              <div style={{ fontSize: 14 }}>No Sarvam usage yet. Transcription data will appear here after processing calls.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  borderBottom: '1px solid var(--card-border)', background: '#131d35', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 14px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)',
};

'use client';

import { useEffect, useState } from 'react';
import type { Report } from '@/types';
import type { Customer } from '@/app/api/customers/route';
import ReportPreview from './ReportPreview';

const OUTCOME_COLOR: Record<string, string> = {
  follow_up_scheduled: '#3b82f6',
  deal_closed:         '#22c55e',
  not_interested:      '#ef4444',
  info_shared:         '#f59e0b',
  escalated:           '#a855f7',
  no_outcome:          '#7e95b8',
};

export default function CustomerView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [modal, setModal]         = useState<{ callId: string; mode: 'analysis' | 'transcript' } | null>(null);
  const [search, setSearch]       = useState('');
  const [copied, setCopied]       = useState<string | null>(null);

  function copyUserId(e: React.MouseEvent, userId: string) {
    e.stopPropagation();
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(userId);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers ?? []);
      }
      setLoading(false);
    }
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  function toggle(phone: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }

  const filtered = customers.filter(c =>
    c.phone.includes(search) ||
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    c.reps.some(r => r.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      Loading user view…
    </div>
  );

  if (customers.length === 0) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
      <div style={{ fontSize: 14 }}>No users found yet. Process bulk recordings to populate this view.</div>
    </div>
  );

  return (
    <>
      {/* Search bar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by phone, name or rep…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0c1021', border: '1px solid var(--card-border)',
            borderRadius: 8, padding: '8px 14px', fontSize: 13,
            color: '#f1f5f9', outline: 'none',
          }}
        />
      </div>

      {/* Summary bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', gap: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{filtered.length}</span> users
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
            {filtered.reduce((s, c) => s + c.total_calls, 0)}
          </span> total calls
        </span>
      </div>

      {/* User rows */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['User / Phone', 'Last Called', 'Calls', 'Rep(s)', 'Latest Outcome', ''].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer, idx) => {
              const isExpanded = expanded.has(customer.phone);
              const latestCall = customer.calls[0];
              const latestOutcome = latestCall?.outcome ?? null;
              const outlineColor = OUTCOME_COLOR[latestOutcome ?? ''] ?? '#7e95b8';
              const lastDate = new Date(customer.last_called).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: '2-digit',
              });

              return [
                /* ── Customer row ── */
                <tr
                  key={`cust-${customer.phone}`}
                  onClick={() => toggle(customer.phone)}
                  style={{ background: idx % 2 === 0 ? '#131d35' : '#0f1729', cursor: 'pointer' }}
                >
                  {/* Name / Phone */}
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, color: '#7e95b8', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
                      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#1e3058', border: '1px solid #253870', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                        {customer.display_name.slice(0, 2)}
                      </span>
                      <span>
                        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {customer.display_name}
                          {customer.user_id && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 10, padding: '1px 6px', background: '#1e3058', color: '#7e95b8', borderRadius: 4, fontWeight: 400, border: '1px solid #253870' }}>
                                {customer.user_id}
                              </span>
                              <button
                                onClick={e => copyUserId(e, customer.user_id!)}
                                title="Copy user ID"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: copied === customer.user_id ? '#22c55e' : '#4a6080', fontSize: 11, lineHeight: 1, borderRadius: 3, transition: 'color 0.15s' }}
                              >
                                {copied === customer.user_id ? '✓' : '⎘'}
                              </button>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>+91 {customer.phone}</div>
                      </span>
                    </span>
                  </td>

                  <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{lastDate}</td>

                  {/* Call count badge */}
                  <td style={tdStyle}>
                    <span style={{ padding: '3px 10px', background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f630', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                      {customer.total_calls} call{customer.total_calls !== 1 ? 's' : ''}
                    </span>
                  </td>

                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{customer.reps.join(', ')}</td>

                  {/* Latest outcome pill */}
                  <td style={tdStyle}>
                    {latestOutcome ? (
                      <span style={{ padding: '3px 10px', background: `${outlineColor}18`, color: outlineColor, border: `1px solid ${outlineColor}30`, borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {latestOutcome.replace(/_/g, ' ')}
                      </span>
                    ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>

                  <td style={tdStyle} />
                </tr>,

                /* ── Expanded call rows ── */
                ...(isExpanded ? customer.calls.map((call, ci) => {
                  const outcomeColor = OUTCOME_COLOR[call.outcome ?? ''] ?? '#7e95b8';
                  const callDate = new Date(call.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                  const isReady = ['ready', 'sent'].includes(call.status);
                  const isLast = ci === customer.calls.length - 1;

                  return (
                    <tr key={`call-${call.call_id}`} style={{ background: ci % 2 === 0 ? '#0c1120' : '#0d1224' }}>
                      {/* Indent + call info */}
                      <td style={{ ...tdStyle, paddingLeft: 20 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {/* Tree connector: vertical line + horizontal tick */}
                          <span style={{
                            display: 'inline-block', width: 20, flexShrink: 0,
                            fontFamily: 'monospace', fontSize: 14, lineHeight: 1,
                            color: '#3a5070', userSelect: 'none',
                          }}>
                            {isLast ? '└─' : '├─'}
                          </span>
                          <span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {call.customer_name && call.customer_name !== 'No Name' ? call.customer_name : `Call ${ci + 1}`}
                            </span>
                            {call.summary && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, maxWidth: 400, lineHeight: 1.4 }}>
                                {call.summary.slice(0, 100)}{call.summary.length > 100 ? '…' : ''}
                              </div>
                            )}
                          </span>
                        </span>
                      </td>

                      <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{callDate}</td>
                      <td style={tdStyle} />
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{call.rep_name}</td>

                      {/* Outcome pill */}
                      <td style={tdStyle}>
                        {call.outcome ? (
                          <span style={{ padding: '3px 10px', background: `${outcomeColor}18`, color: outcomeColor, border: `1px solid ${outcomeColor}30`, borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                            {call.outcome.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '3px 10px', background: '#131d3560', border: '1px solid var(--card-border)', borderRadius: 20 }}>
                            {call.status}
                          </span>
                        )}
                      </td>

                      {/* CTAs */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {isReady ? (
                            <>
                              <button onClick={e => { e.stopPropagation(); setModal({ callId: call.call_id, mode: 'analysis' }); }} style={btnStyle('#3b82f6')}>
                                View Analysis
                              </button>
                              <button onClick={e => { e.stopPropagation(); setModal({ callId: call.call_id, mode: 'transcript' }); }} style={btnStyle('#7e95b8')}>
                                Transcript
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Processing…</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {modal && <CallModal callId={modal.callId} mode={modal.mode} onClose={() => setModal(null)} />}
    </>
  );
}

function CallModal({ callId, mode, onClose }: { callId: string; mode: 'analysis' | 'transcript'; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports?callId=${callId}`)
      .then(r => r.json())
      .then(({ report: r }) => { setReport(r ?? null); setLoading(false); });
  }, [callId]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0c1021', border: '1px solid var(--card-border)', borderRadius: 12, width: '100%', maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--card-border)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            {mode === 'analysis' ? 'Call Analysis' : 'Transcript'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {loading ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
            : !report ? <p style={{ color: '#ef4444', fontSize: 13 }}>Report not found.</p>
            : mode === 'transcript' ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.7, color: '#f1f5f9', fontFamily: 'inherit', maxHeight: '70vh', overflowY: 'auto' }}>
                {report.transcript ?? 'No transcript available.'}
              </pre>
            ) : <ReportPreview report={report} callId={callId} />}
        </div>
      </div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return { padding: '4px 10px', background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 6, color, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' };
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--card-border)', background: '#131d35', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 14px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)', verticalAlign: 'middle',
};

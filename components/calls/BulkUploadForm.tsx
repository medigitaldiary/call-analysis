'use client';

import { useState } from 'react';
import type { RMReport, RMReportActionItem } from '@/types';

interface Log { time: string; message: string; isError?: boolean; }

const PRIORITY_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };

export default function BulkUploadForm() {
  const [rmName, setRmName] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [folderUrl, setFolderUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [report, setReport] = useState<RMReport | null>(null);
  const [docUrl, setDocUrl] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [error, setError] = useState('');

  function addLog(message: string, isError = false) {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, isError }]);
  }

  async function startProcessing() {
    if (!rmName || !folderUrl) { setError('Please fill in RM Name and Drive Folder URL.'); return; }
    setError(''); setLogs([]); setProgress({ current: 0, total: 0 });
    setReport(null); setDocUrl(''); setSheetUrl(''); setRunning(true);

    try {
      addLog('Listing audio files from Drive folder…');
      const startRes = await fetch('/api/bulk/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmName, sessionDate, folderUrl }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? 'Failed to start session');

      const { sessionId, callIds, totalFiles } = startData;
      addLog(`Found ${totalFiles} audio file(s). Starting processing…`);
      setProgress({ current: 0, total: totalFiles });

      let successCount = 0;
      for (let i = 0; i < callIds.length; i++) {
        addLog(`Processing call ${i + 1}/${totalFiles}…`);
        try {
          const processRes = await fetch('/api/bulk/process-call', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: callIds[i], sessionId }),
          });
          const processData = await processRes.json();
          if (!processRes.ok) { addLog(`Call ${i + 1} failed: ${processData.error}`, true); }
          else { successCount++; addLog(`Call ${i + 1} complete — ${processData.analysis?.customer_name ?? 'Unknown'} — ${processData.analysis?.outcome ?? ''}`); }
        } catch { addLog(`Call ${i + 1} failed — network error`, true); }
        setProgress({ current: i + 1, total: totalFiles });
      }

      const failCount = totalFiles - successCount;

      if (failCount > 0) {
        addLog(`⚠ ${failCount} call(s) failed — RM report skipped to avoid incomplete data.`, true);
        addLog(`Go to Call History → expand this session → click ↻ Retry ${failCount} failed to fix them, then use ↻ Regen Report.`, true);
      } else {
        addLog(`All ${totalFiles} calls processed successfully. Generating RM report…`);
        const reportRes = await fetch('/api/bulk/generate-report', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const reportData = await reportRes.json();
        if (!reportRes.ok) throw new Error(reportData.error ?? 'Report generation failed');

        setReport(reportData.rmReport);
        setDocUrl(reportData.docUrl);
        setSheetUrl(reportData.sheetUrl);
        addLog('RM report generated successfully!');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setError(message); addLog(`Error: ${message}`, true);
    } finally { setRunning(false); }
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Form card ── */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Bulk Call Upload</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Share a Google Drive folder link containing all recordings. Folder must be set to &quot;Anyone with the link can view&quot;.
        </p>

        <div className="bulk-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 12, alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>RM Name *</label>
            <input value={rmName} onChange={e => setRmName(e.target.value)} placeholder="e.g. Kunal" disabled={running} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Session Date</label>
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} disabled={running} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Drive Folder URL *</label>
            <input value={folderUrl} onChange={e => setFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." disabled={running} style={inputStyle} />
          </div>
          <button onClick={startProcessing} disabled={running} className="bulk-start-btn" style={{
            padding: '9px 20px', background: running ? '#253870' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 13,
            fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {running ? '⏳ Processing…' : '▶ Start'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Progress ── */}
      {(running || logs.length > 0) && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Processing Status</span>
            {progress.total > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{progress.current} / {progress.total} — {pct}%</span>
            )}
          </div>
          {progress.total > 0 && (
            <div style={{ height: 4, background: 'var(--card-border)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          )}
          <div style={{ background: '#0c1021', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, maxHeight: 160, overflowY: 'auto' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ color: log.isError ? '#ef4444' : '#7e95b8', marginBottom: 3 }}>
                <span style={{ color: '#3b82f6', marginRight: 8 }}>{log.time}</span>{log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Full-width Report ── */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Report header */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#22c55e' }}>✓ RM Report Ready</h2>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  {report.agent_performance.agent} · {sessionDate}
                </p>
              </div>
              <div className="dl-buttons" style={{ display: 'flex', gap: 10 }}>
                {docUrl && <a href={`/api/download?url=${encodeURIComponent(docUrl)}`} download style={linkStyle}>↓ Report (.docx)</a>}
                {sheetUrl && <a href={`/api/download?url=${encodeURIComponent(sheetUrl)}`} download style={linkStyle}>↓ Sheet (.xlsx)</a>}
              </div>
            </div>
            {/* 4 overview stat cards */}
            <div className="stats-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total Calls', value: report.overview.total_calls, color: '#3b82f6' },
                { label: 'Unique Customers', value: report.overview.unique_customers, color: '#3b82f6' },
                { label: 'Total Talk Time', value: (() => {
                  const raw = String(report.overview.total_talk_time ?? '');
                  const match = raw.match(/^(~?[\d.]+\s*(?:min|s|h\s*\d+\s*min|hours?))/i);
                  return match ? match[1] : raw.split(' - ')[0].split('(')[0].trim();
                })(), color: '#f59e0b' },
                { label: 'Deals Discussed', value: String(report.deals_discussed.with_deals) + ' calls', color: '#22c55e' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#131d35', borderRadius: 8, padding: '14px 18px', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 1: Call Outcomes + Language Distribution + Agent Performance */}
          <div className="stats-3col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

            <Section title="2. Call Outcomes">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['Outcome', 'Count', '%'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {report.outcomes.map((o, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                      <td style={tdStyle}>{o.outcome}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#3b82f6' }}>{o.count}</td>
                      <td style={tdStyle}>{o.percentage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="9. Language Distribution">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['Language', 'Calls', '%'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {report.languages.map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                      <td style={tdStyle}>{l.language}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#3b82f6' }}>{l.calls}</td>
                      <td style={tdStyle}>{l.percentage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="7. Agent Performance">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  ['Total Calls', report.agent_performance.total_calls, '#3b82f6'],
                  ['Follow-ups', report.agent_performance.follow_ups, '#f59e0b'],
                  ['Avg Score', report.agent_performance.avg_performance, '#22c55e'],
                  ['Best Call', report.agent_performance.best_call, '#3b82f6'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} style={{ background: '#131d35', borderRadius: 6, padding: '8px 10px', border: '1px solid var(--card-border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: String(color) }}>{value}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{report.agent_performance.summary}</p>
            </Section>
          </div>

          {/* Row 2: Top Highlights (full width) */}
          <Section title="4. Top Highlights">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10 }}>
              {report.highlights.map((h, i) => (
                <div key={i} style={{ padding: '12px 16px', background: '#131d35', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 5 }}>
                    {h.rank} — #{h.call_number} · {h.customer_name} · {h.phone} · {h.duration}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{h.description}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Row 3: Action Items + Improvements */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            <Section title="5. Urgent Action Items">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {report.action_items.map((a: RMReportActionItem, i: number) => (
                  <div key={i} style={{
                    padding: '10px 12px', background: '#0c1021',
                    border: `1px solid ${PRIORITY_COLOR[a.priority] ?? '#1e3058'}30`,
                    borderLeft: `3px solid ${PRIORITY_COLOR[a.priority] ?? '#1e3058'}`,
                    borderRadius: '0 6px 6px 0', fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${PRIORITY_COLOR[a.priority]}20`, color: PRIORITY_COLOR[a.priority] }}>{a.priority}</span>
                      <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{a.action}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Owner: <span style={{ color: '#3b82f6' }}>{a.owner}</span> — Deadline: {a.deadline}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

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
                              {ref.phone ?? ref.customer_name ?? `#${ref.call_number}`}
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
          </div>

          {/* Row 4: Bonds + Deals */}
          <div style={{ display: 'grid', gridTemplateColumns: report.products.length > 0 ? '2fr 1fr' : '1fr', gap: 20 }}>

            {report.products.length > 0 && (
              <Section title="8. Top Bonds & Products Discussed">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{['Bond / Issuer', 'Yield', 'Context'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.products.map((p, i) => (
                      <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{p.bond_issuer}</td>
                        <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>{p.yield}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            <Section title="3. Deals Discussed">
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, background: '#131d35', borderRadius: 8, padding: '16px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>With Deals</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{report.deals_discussed.with_deals}</div>
                </div>
                <div style={{ flex: 1, background: '#131d35', borderRadius: 8, padding: '16px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>Without Deals</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>{report.deals_discussed.without_deals}</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{report.deals_discussed.deal_calls}</p>
            </Section>
          </div>

        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '18px 22px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9', borderBottom: '1px solid var(--card-border)', paddingBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#0c1021', border: '1px solid var(--card-border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: '#f1f5f9', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' };
const linkStyle: React.CSSProperties = {
  padding: '8px 16px', background: 'transparent', border: '1px solid var(--card-border)',
  borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontWeight: 500, textDecoration: 'none',
};
const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
  borderBottom: '1px solid var(--card-border)', background: '#131d35',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)',
};

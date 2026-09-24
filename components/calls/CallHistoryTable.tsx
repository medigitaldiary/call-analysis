'use client';

import { useEffect, useRef, useState } from 'react';
import { Call, CallStatus, Report, RMReport, RMReportActionItem } from '@/types';
import ReportPreview from './ReportPreview';

interface BulkSession {
  id: string;
  rm_name: string;
  session_date: string;
  status: string;
  doc_url: string | null;
  sheet_url: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; blink?: boolean }> = {
  uploaded:    { label: 'Uploaded',    color: '#7e95b8' },
  transcribing:{ label: 'Transcribing',color: '#f59e0b', blink: true },
  analysing:   { label: 'Analysing',   color: '#f59e0b', blink: true },
  generating:  { label: 'Generating',  color: '#f59e0b', blink: true },
  ready:       { label: 'Ready',       color: '#3b82f6' },
  sent:        { label: 'Sent',        color: '#22c55e' },
  error:       { label: 'Error',       color: '#ef4444' },
};

const PRIORITY_COLOR: Record<string, string> = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };

export default function CallHistoryTable({ onRetry }: { onRetry?: (callId: string) => void }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [sessions, setSessions] = useState<BulkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ callId: string; mode: 'analysis' | 'transcript' } | null>(null);
  const [rmModal, setRmModal] = useState<string | null>(null); // sessionId
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null); // sessionId pending confirm
  const hasAutoExpandedRef = useRef(false);
  const [archiving, setArchiving] = useState<string | null>(null); // sessionId being archived

  useEffect(() => {
    async function loadCalls() {
      const res = await fetch('/api/calls');
      if (res.ok) {
        const data = await res.json();
        const newSessions: BulkSession[] = data.sessions ?? [];
        const newCalls: Call[] = data.calls ?? [];
        setCalls(newCalls);
        setSessions(newSessions);
        if (!hasAutoExpandedRef.current && (newSessions.length > 0 || newCalls.length > 0)) {
          hasAutoExpandedRef.current = true;
          const sessionDates = newSessions.map(s => s.session_date.slice(0, 10));
          const callDates = newCalls
            .filter(c => !c.session_id)
            .map(c => {
              const ist = new Date(new Date(c.created_at).getTime() + (5 * 60 + 30) * 60 * 1000);
              return ist.toISOString().slice(0, 10);
            });
          const allDatesInit = [...new Set([...sessionDates, ...callDates])].sort((a, b) => b.localeCompare(a));
          if (allDatesInit.length > 0) setExpandedDates(new Set([allDatesInit[0]]));
        }
      }
      setLoading(false);
    }
    loadCalls();
    const interval = setInterval(loadCalls, 5000);
    return () => clearInterval(interval);
  }, []);

  function toggleSession(sessionId: string) {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function toggleDate(dateKey: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  async function archiveSession(sessionId: string) {
    setArchiving(sessionId);
    await fetch('/api/bulk/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    // Remove session from local state immediately (don't wait for poll)
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setCalls(prev => prev.filter(c => c.session_id !== sessionId));
    setArchiveConfirm(null);
    setArchiving(null);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
        Loading call history…
      </div>
    );
  }

  const individualCalls = calls.filter(c => !c.session_id);
  const sessionCallMap = new Map<string, Call[]>();
  for (const call of calls) {
    if (call.session_id) {
      const arr = sessionCallMap.get(call.session_id) ?? [];
      arr.push(call);
      sessionCallMap.set(call.session_id, arr);
    }
  }

  const hasAnyData = individualCalls.length > 0 || sessions.length > 0;
  if (!hasAnyData) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📞</div>
        <div style={{ fontSize: 14 }}>No calls yet. Upload your first recording to get started.</div>
      </div>
    );
  }

  const sessionsByDate = new Map<string, BulkSession[]>();
  for (const s of sessions) {
    const dk = s.session_date.slice(0, 10);
    const arr = sessionsByDate.get(dk) ?? [];
    arr.push(s);
    sessionsByDate.set(dk, arr);
  }

  const individualCallsByDate = new Map<string, Call[]>();
  for (const call of individualCalls) {
    const ist = new Date(new Date(call.created_at).getTime() + (5 * 60 + 30) * 60 * 1000);
    const dk = ist.toISOString().slice(0, 10);
    const arr = individualCallsByDate.get(dk) ?? [];
    arr.push(call);
    individualCallsByDate.set(dk, arr);
  }

  const allDates = [
    ...new Set([...[...sessionsByDate.keys()], ...[...individualCallsByDate.keys()]]),
  ].sort((a, b) => b.localeCompare(a));

  // col-hide-mobile class hides Rep, Date, Doc, Sheet on small screens
  const COLS: { label: string; hide?: boolean }[] = [
    { label: 'Prospect / Session' },
    { label: 'Rep',              hide: true },
    { label: 'Date',             hide: true },
    { label: 'Status' },
    { label: 'Doc',              hide: true },
    { label: 'Sheet',            hide: true },
    { label: 'View Analysis' },
    { label: '' },
    { label: '' },
  ];

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>{COLS.map((c, i) => <th key={i} className={c.hide ? 'col-hide-mobile' : ''} style={thStyle}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {allDates.flatMap((dateKey, dateIdx) => {
              const dateSessions = (sessionsByDate.get(dateKey) ?? []).sort((a, b) =>
                a.rm_name.localeCompare(b.rm_name)
              );
              const dateIndivCalls = individualCallsByDate.get(dateKey) ?? [];
              const isDateExpanded = expandedDates.has(dateKey);
              const totalCallsInDate =
                dateSessions.reduce((sum, s) => sum + (sessionCallMap.get(s.id)?.length ?? 0), 0) +
                dateIndivCalls.length;

              const dateRows: React.ReactNode[] = [];

              dateRows.push(
                <tr
                  key={`date-${dateKey}`}
                  onClick={() => toggleDate(dateKey)}
                  style={{ cursor: 'pointer', background: '#07101f' }}
                >
                  <td colSpan={9} style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--card-border)',
                    borderTop: dateIdx > 0 ? '2px solid #1e3058' : 'none',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 10, color: '#7e95b8', display: 'inline-block',
                        transform: isDateExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s',
                      }}>▶</span>
                      <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 15 }}>
                        {formatDateHeader(dateKey)}
                      </span>
                      {dateSessions.length > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', background: '#3b82f620', color: '#3b82f6', borderRadius: 20, border: '1px solid #3b82f630' }}>
                          {dateSessions.length} RM{dateSessions.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {totalCallsInDate} call{totalCallsInDate !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </td>
                </tr>
              );

              if (!isDateExpanded) return dateRows;

              dateSessions.forEach((session, sessionIdx) => {
                const sessionCalls = sessionCallMap.get(session.id) ?? [];
                const isExpanded = expandedSessions.has(session.id);
                const date = new Date(session.session_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                });
                const allReady = sessionCalls.length > 0 && sessionCalls.every(c => ['ready', 'sent'].includes(c.status));
                const isReady = session.status === 'ready' || allReady;
                const errorCalls = sessionCalls.filter(c => c.status === 'error');
                const emptyTranscriptCalls = sessionCalls.filter(c => c.status === 'ready' && !c.has_transcript);
                const stuckCalls = sessionCalls.filter(c => ['transcribing', 'analysing', 'generating', 'uploaded'].includes(c.status));
                const retryableCalls = [...errorCalls, ...emptyTranscriptCalls, ...stuckCalls];
                // Show retry if session is still 'processing' (browser loop died) OR there are error/stuck calls
                const hasErrors = retryableCalls.length > 0 || session.status === 'processing';

                dateRows.push(
                  <tr
                    key={`session-${session.id}`}
                    onClick={() => toggleSession(session.id)}
                    style={{ background: sessionIdx % 2 === 0 ? '#131d35' : '#0f1729', cursor: 'pointer' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10, color: '#7e95b8', display: 'inline-block',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.15s',
                        }}>▶</span>
                        <span style={{ fontSize: 14 }}>📁</span>
                        <span>{session.rm_name} — {date}</span>
                        <span style={{
                          fontSize: 11, padding: '2px 8px',
                          background: '#3b82f620', color: '#3b82f6',
                          borderRadius: 20, border: '1px solid #3b82f630',
                        }}>
                          {sessionCalls.length} call{sessionCalls.length !== 1 ? 's' : ''}
                        </span>
                        {archiveConfirm === session.id ? (
                          <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
                            <span style={{ fontSize: 11, color: '#ef4444' }}>Archive?</span>
                            <button
                              onClick={() => archiveSession(session.id)}
                              disabled={archiving === session.id}
                              style={{ padding: '2px 8px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 5, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}
                            >
                              {archiving === session.id ? '…' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setArchiveConfirm(null)}
                              style={{ padding: '2px 8px', background: 'transparent', border: '1px solid var(--card-border)', borderRadius: 5, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setArchiveConfirm(session.id); }}
                            title="Archive session"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#3a5070', fontSize: 14, lineHeight: 1, marginLeft: 2 }}
                          >
                            🗑
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="col-hide-mobile" style={{ ...tdStyle, color: 'var(--text-muted)' }}>{session.rm_name}</td>
                    <td className="col-hide-mobile" style={{ ...tdStyle, color: 'var(--text-dim)' }}>{date}</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: isReady ? '#3b82f618' : '#f59e0b18',
                        color: isReady ? '#3b82f6' : '#f59e0b',
                        border: `1px solid ${isReady ? '#3b82f630' : '#f59e0b30'}`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReady ? '#3b82f6' : '#f59e0b' }} />
                        {isReady ? 'Ready' : 'Processing'}
                      </span>
                    </td>
                    <td className="col-hide-mobile" style={tdStyle}>
                      {session.doc_url
                        ? <a href={`/api/download?url=${encodeURIComponent(session.doc_url)}`} download onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 12 }}>↓ .docx</a>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td className="col-hide-mobile" style={tdStyle}>
                      {session.sheet_url
                        ? <a href={`/api/download?url=${encodeURIComponent(session.sheet_url)}`} download onClick={e => e.stopPropagation()} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 12 }}>↓ .xlsx</a>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {isReady ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            onClick={e => { e.stopPropagation(); setRmModal(session.id); }}
                            style={actionBtnStyle('#22c55e')}
                          >
                            View RM Report
                          </button>
                          <RegenerateReportButton sessionId={session.id} />
                        </div>
                      ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={tdStyle}><span style={{ color: 'var(--text-dim)' }}>—</span></td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {hasErrors && <RetrySessionButton sessionId={session.id} errorCount={retryableCalls.length} />}
                        {isReady && <FixPhonesButton sessionId={session.id} />}
                        {isReady && <SendSessionButton sessionId={session.id} />}
                      </div>
                    </td>
                  </tr>
                );

                if (isExpanded) {
                  dateRows.push(
                    <tr key={`expanded-${session.id}`}>
                      <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--card-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr>
                              {['Prospect', 'Rep', 'Date', 'Duration', 'User ID', 'Status', '', '', 'View Analysis', 'View Transcript', ''].map((h, i) => (
                                <th key={i} style={subThStyle}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sessionCalls.map((call, ci) => {
                              const cfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.uploaded;
                              const callDate = new Date(call.created_at).toLocaleDateString('en-GB', {
                                day: '2-digit', month: 'short', year: '2-digit',
                              });
                              const callReady = ['ready', 'sent'].includes(call.status);
                              return (
                                <tr key={`call-${call.id}`} style={{ background: ci % 2 === 0 ? '#0b1020' : '#0d1326' }}>
                                  <td style={{ ...tdStyle, paddingLeft: 32, color: 'var(--text-muted)' }}>
                                    <span style={{ fontSize: 11, color: '#1e3058', marginRight: 8 }}>└</span>
                                    {call.prospect_name}
                                  </td>
                                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{call.rep_name}</td>
                                  <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{callDate}</td>
                                  <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{formatDuration(call.duration_sec)}</td>
                                  <td style={tdStyle}>
                                    {call.user_id ? <CopyChip value={call.user_id} /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                  </td>
                                  <td style={tdStyle}>
                                    <span className={cfg.blink ? 'blink' : ''} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 6,
                                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                                      background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
                                    }}>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                                      {cfg.label}
                                    </span>
                                  </td>
                                  <td style={tdStyle}><DocLink callId={call.id} type="doc" /></td>
                                  <td style={tdStyle}><DocLink callId={call.id} type="sheet" /></td>
                                  <td style={tdStyle}>
                                    {callReady
                                      ? <button onClick={() => setModal({ callId: call.id, mode: 'analysis' })} style={actionBtnStyle('#3b82f6')}>View Analysis</button>
                                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                  </td>
                                  <td style={tdStyle}>
                                    {callReady
                                      ? <button onClick={() => setModal({ callId: call.id, mode: 'transcript' })} style={actionBtnStyle('#7e95b8')}>View Transcript</button>
                                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                  </td>
                                  <td style={tdStyle}>
                                    {call.status === 'error' && onRetry && (
                                      <button onClick={() => onRetry(call.id)} style={actionBtnStyle('#ef4444')}>Retry</button>
                                    )}
                                    {call.status === 'ready' && <SendButton callId={call.id} />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                }
              });

              dateIndivCalls.forEach((call, callIdx) => {
                const cfg = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.uploaded;
                const date = new Date(call.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                });
                const isReady = ['ready', 'sent'].includes(call.status);
                dateRows.push(
                  <tr key={call.id} style={{ background: callIdx % 2 === 0 ? 'transparent' : '#131d35' }}>
                    <td style={tdStyle}>
                      <div>{call.prospect_name}</div>
                      {call.user_id && <div style={{ marginTop: 3 }}><CopyChip value={call.user_id} /></div>}
                    </td>
                    <td className="col-hide-mobile" style={{ ...tdStyle, color: 'var(--text-muted)' }}>{call.rep_name}</td>
                    <td className="col-hide-mobile" style={{ ...tdStyle, color: 'var(--text-dim)' }}>
                      <div>{date}</div>
                      {call.duration_sec && call.duration_sec > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{formatDuration(call.duration_sec)}</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span className={cfg.blink ? 'blink' : ''} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="col-hide-mobile" style={tdStyle}><DocLink callId={call.id} type="doc" /></td>
                    <td className="col-hide-mobile" style={tdStyle}><DocLink callId={call.id} type="sheet" /></td>
                    <td style={tdStyle}>
                      {isReady
                        ? <button onClick={() => setModal({ callId: call.id, mode: 'analysis' })} style={actionBtnStyle('#3b82f6')}>View Analysis</button>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {isReady
                        ? <button onClick={() => setModal({ callId: call.id, mode: 'transcript' })} style={actionBtnStyle('#7e95b8')}>View Transcript</button>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {call.status === 'error' && onRetry && (
                        <button onClick={() => onRetry(call.id)} style={actionBtnStyle('#ef4444')}>Retry</button>
                      )}
                      {call.status === 'ready' && <SendButton callId={call.id} />}
                    </td>
                  </tr>
                );
              });

              return dateRows;
            })}
          </tbody>
        </table>
      </div>

      {/* Individual call modal */}
      {modal && (
        <ReportModal callId={modal.callId} mode={modal.mode} onClose={() => setModal(null)} />
      )}

      {/* RM Report modal */}
      {rmModal && (
        <RMReportModal sessionId={rmModal} onClose={() => setRmModal(null)} />
      )}
    </>
  );
}

/* ── RM Report Modal ── */
function RMReportModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [report, setReport] = useState<RMReport | null>(null);
  const [meta, setMeta] = useState<{ rm_name: string; session_date: string; doc_url: string | null; sheet_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/bulk/status?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(({ session }) => {
        const raw = session?.rm_report ?? null;
        setReport(typeof raw === 'string' ? JSON.parse(raw) : raw);
        setMeta(session ? { rm_name: session.rm_name, session_date: session.session_date, doc_url: session.doc_url, sheet_url: session.sheet_url } : null);
        setLoading(false);
      });
  }, [sessionId]);

  const date = meta ? new Date(meta.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '32px 20px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0c1021', border: '1px solid var(--card-border)', borderRadius: 12,
        width: '100%', maxWidth: 900, position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--card-border)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>RM Report</h2>
            {meta && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{meta.rm_name} · {date}</p>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {meta?.doc_url && (
              <a href={`/api/download?url=${encodeURIComponent(meta.doc_url)}`} download style={outlineLinkStyle}>↓ .docx</a>
            )}
            {meta?.sheet_url && (
              <a href={`/api/download?url=${encodeURIComponent(meta.sheet_url)}`} download style={outlineLinkStyle}>↓ .xlsx</a>
            )}
            <a href="/api/scoring-guide" download="BondScanner-Scoring-Methodology.html" style={{ ...outlineLinkStyle, fontSize: 11, color: '#7e95b8' }}>
              📄 Scoring Guide
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', maxHeight: '80vh', overflowY: 'auto' }}>
          {loading ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading report…</p>
          ) : !report ? (
            <p style={{ color: '#ef4444', fontSize: 13 }}>Report not available. The session may still be processing.</p>
          ) : (
            <RMReportView report={report} />
          )}
        </div>
      </div>
    </div>
  );
}

function RMReportView({ report }: { report: RMReport }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Overview stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Calls', value: report.overview.total_calls, color: '#3b82f6' },
          { label: 'Unique Customers', value: report.overview.unique_customers, color: '#3b82f6' },
          { label: 'Total Talk Time', value: (() => {
            // Strip verbose Claude explanations — keep only the leading duration token e.g. "~1.8 min"
            const raw = String(report.overview.total_talk_time ?? '');
            const match = raw.match(/^(~?[\d.]+\s*(?:min|s|h\s*\d+\s*min|hours?))/i);
            return match ? match[1] : raw.split(' - ')[0].split('(')[0].trim();
          })(), color: '#f59e0b' },
          { label: 'With Deals', value: report.deals_discussed.with_deals, color: '#22c55e' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#131d35', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Outcomes + Language side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title="Call Outcomes">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Outcome', 'Count', '%'].map(h => <th key={h} style={thStyleInner}>{h}</th>)}</tr></thead>
            <tbody>
              {report.outcomes.map((o, i) => (
                <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                  <td style={tdStyleInner}>{o.outcome}</td>
                  <td style={{ ...tdStyleInner, fontWeight: 600, color: '#3b82f6' }}>{o.count}</td>
                  <td style={tdStyleInner}>{o.percentage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Language Distribution">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Language', 'Calls', '%'].map(h => <th key={h} style={thStyleInner}>{h}</th>)}</tr></thead>
            <tbody>
              {report.languages.map((l, i) => (
                <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                  <td style={tdStyleInner}>{l.language}</td>
                  <td style={{ ...tdStyleInner, fontWeight: 600, color: '#3b82f6' }}>{l.calls}</td>
                  <td style={tdStyleInner}>{l.percentage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Agent Performance */}
      <Section title="Agent Performance">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          {[
            ['Total Calls', report.agent_performance.total_calls, '#3b82f6'],
            ['Follow-ups', report.agent_performance.follow_ups, '#f59e0b'],
            ['Median Score', (() => {
              const raw = String(report.agent_performance.avg_performance ?? '');
              const match = raw.match(/^([\d.]+\/\d+)/);
              return match ? match[1] : raw.split(' - ')[0].trim();
            })(), '#22c55e'],
            ['Best Call', report.agent_performance.best_call, '#3b82f6'],
          ].map(([label, value, color]) => (
            <div key={String(label)} style={{ background: '#131d35', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: String(color) }}>{value}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{report.agent_performance.summary}</p>
      </Section>

      {/* Top Highlights */}
      <Section title="Top Highlights">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.highlights.map((h, i) => (
            <div key={i} style={{ padding: '10px 14px', background: '#131d35', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                {h.rank} — #{h.call_number} · {h.customer_name} · {h.phone} · {h.duration}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{h.description}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Action Items + Improvements */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title="Urgent Action Items">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.action_items.map((a: RMReportActionItem, i: number) => (
              <div key={i} style={{
                padding: '8px 12px', background: '#0c1021',
                border: `1px solid ${PRIORITY_COLOR[a.priority] ?? '#1e3058'}30`,
                borderLeft: `3px solid ${PRIORITY_COLOR[a.priority] ?? '#1e3058'}`,
                borderRadius: '0 6px 6px 0',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${PRIORITY_COLOR[a.priority]}20`, color: PRIORITY_COLOR[a.priority] }}>{a.priority}</span>
                  <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500 }}>{a.action}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Owner: <span style={{ color: '#3b82f6' }}>{a.owner}</span> — Deadline: {a.deadline}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Areas for Improvement">
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

      {/* Bonds + Deals */}
      <div style={{ display: 'grid', gridTemplateColumns: report.products.length > 0 ? '2fr 1fr' : '1fr', gap: 16 }}>
        {report.products.length > 0 && (
          <Section title="Top Bonds & Products Discussed">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Bond / Issuer', 'Yield', 'Context'].map(h => <th key={h} style={thStyleInner}>{h}</th>)}</tr></thead>
              <tbody>
                {report.products.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#131d35' : 'transparent' }}>
                    <td style={{ ...tdStyleInner, fontWeight: 500 }}>{p.bond_issuer}</td>
                    <td style={{ ...tdStyleInner, color: '#22c55e', fontWeight: 600 }}>{p.yield}</td>
                    <td style={{ ...tdStyleInner, color: 'var(--text-muted)' }}>{p.context}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <Section title="Deals Discussed">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, background: '#131d35', borderRadius: 8, padding: '14px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5 }}>With Deals</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#22c55e' }}>{report.deals_discussed.with_deals}</div>
            </div>
            <div style={{ flex: 1, background: '#131d35', borderRadius: 8, padding: '14px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5 }}>Without</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-muted)' }}>{report.deals_discussed.without_deals}</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{report.deals_discussed.deal_calls}</p>
        </Section>
      </div>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#131d35', border: '1px solid var(--card-border)', borderRadius: 10, padding: '14px 18px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--card-border)', paddingBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

/* ── Individual call modal ── */
function ReportModal({ callId, mode, onClose }: { callId: string; mode: 'analysis' | 'transcript'; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports?callId=${callId}`)
      .then(r => r.json())
      .then(({ report: r }) => { setReport(r ?? null); setLoading(false); });
  }, [callId]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 20px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0c1021', border: '1px solid var(--card-border)', borderRadius: 12,
        width: '100%', maxWidth: 780,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--card-border)',
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
            {mode === 'analysis' ? 'Call Analysis' : 'Transcript'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {loading ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
          ) : !report ? (
            <p style={{ color: '#ef4444', fontSize: 13 }}>Report not found.</p>
          ) : mode === 'transcript' ? (
            !report.transcript ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 14, color: '#f59e0b', fontWeight: 600, marginBottom: 8 }}>
                  Transcript not available
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  This call was processed before the transcript fix was deployed.<br />
                  Use the <strong style={{ color: '#f59e0b' }}>↻ Retry</strong> button on the session row to re-process it.
                </div>
              </div>
            ) : (
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 13, lineHeight: 1.7, color: '#f1f5f9',
              fontFamily: 'inherit', maxHeight: '70vh', overflowY: 'auto',
            }}>
              {report.transcript}
            </pre>
            )
          ) : (
            <ReportPreview report={report} callId={callId} />
          )}
        </div>
      </div>
    </div>
  );
}

function DocLink({ callId, type }: { callId: string; type: 'doc' | 'sheet' }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports?callId=${callId}`)
      .then(r => r.json())
      .then(({ report }) => {
        if (report) setUrl(type === 'doc' ? report.doc_url : report.sheet_url);
      });
  }, [callId, type]);

  if (!url) return <span style={{ color: 'var(--text-dim)' }}>—</span>;
  return (
    <a href={`/api/download?url=${encodeURIComponent(url)}`} download
      style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 12 }}>
      {type === 'doc' ? '↓ .docx' : '↓ .xlsx'}
    </a>
  );
}

function SendButton({ callId }: { callId: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    const res = await fetch('/api/send-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    });
    setSending(false);
    if (res.ok) setSent(true);
  }

  if (sent) return <span style={{ color: '#22c55e', fontSize: 12 }}>✓ Sent</span>;
  return (
    <button onClick={send} disabled={sending} style={actionBtnStyle('#3b82f6')}>
      {sending ? '…' : 'Send Now'}
    </button>
  );
}

function SendSessionButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    const emails = emailInput.split(',').map(e => e.trim()).filter(Boolean);
    if (!emails.length) { setErr('Enter at least one email.'); return; }
    setSending(true); setErr('');
    const res = await fetch('/api/bulk/send-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, stakeholders: emails }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setErr(data.error ?? 'Send failed'); return; }
    setSent(true); setOpen(false);
  }

  if (sent) return <span style={{ color: '#22c55e', fontSize: 12 }}>✓ Sent</span>;

  if (!open) return (
    <button onClick={e => { e.stopPropagation(); setOpen(true); }} style={actionBtnStyle('#22c55e')}>
      Send Report
    </button>
  );

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 220 }}>
      <input
        autoFocus
        type="text"
        placeholder="email1, email2…"
        value={emailInput}
        onChange={e => setEmailInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        style={{
          padding: '5px 10px', background: '#0c1021', border: '1px solid var(--card-border)',
          borderRadius: 6, color: '#f1f5f9', fontSize: 12, outline: 'none',
        }}
      />
      {err && <span style={{ fontSize: 11, color: '#ef4444' }}>{err}</span>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={send} disabled={sending} style={actionBtnStyle('#22c55e')}>
          {sending ? '…' : '✉ Send'}
        </button>
        <button onClick={() => { setOpen(false); setErr(''); }} style={actionBtnStyle('#7e95b8')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FixPhonesButton({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');

  async function handleFix(e: React.MouseEvent) {
    e.stopPropagation();
    setState('loading');
    try {
      const res = await fetch('/api/bulk/fix-phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) { setResult(data.error ?? `HTTP ${res.status}`); setState('error'); return; }
      setResult(`${data.updated}/${data.total} updated`);
      setState('done');
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  if (state === 'done') return <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Phones fixed ({result})</span>;
  if (state === 'error') return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: '#ef4444' }}>{result}</span>
      <button onClick={() => setState('idle')} style={actionBtnStyle('#ef4444')}>Try again</button>
    </div>
  );
  return (
    <button onClick={handleFix} disabled={state === 'loading'} style={actionBtnStyle('#a78bfa')}>
      {state === 'loading' ? 'Fixing…' : '# Fix Phones'}
    </button>
  );
}

function RegenerateReportButton({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleRegen(e: React.MouseEvent) {
    e.stopPropagation();
    setState('loading');
    setErrMsg('');
    try {
      const res = await fetch('/api/bulk/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrMsg(data.error ?? `HTTP ${res.status}`);
        setState('error');
      } else {
        setState('done');
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  if (state === 'done') return <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Report updated</span>;
  if (state === 'error') return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 160, wordBreak: 'break-word' }}>{errMsg}</span>
      <button onClick={() => setState('idle')} style={actionBtnStyle('#ef4444')}>Try again</button>
    </div>
  );

  return (
    <button onClick={handleRegen} disabled={state === 'loading'} style={actionBtnStyle('#7e95b8')}>
      {state === 'loading' ? 'Generating…' : '↻ Regen Report'}
    </button>
  );
}

function RetrySessionButton({ sessionId, errorCount }: { sessionId: string; errorCount: number }) {
  const [state, setState] = useState<'idle' | 'retrying' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [step, setStep] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setState('retrying');
    setErrMsg('');

    try {
      // 1. Reset failed calls and get their IDs back
      const retryRes = await fetch('/api/bulk/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const retryData = await retryRes.json();
      if (!retryRes.ok) throw new Error(retryData.error ?? 'Retry failed');

      const callIds: string[] = retryData.callIds ?? [];
      if (callIds.length === 0) { setState('done'); return; }

      setProgress({ done: 0, total: callIds.length });

      // 2. Re-process each call sequentially (same pattern as BulkUploadForm)
      for (let i = 0; i < callIds.length; i++) {
        await fetch('/api/bulk/process-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: callIds[i], sessionId }),
        });
        setProgress({ done: i + 1, total: callIds.length });
      }

      // 3. Regenerate the RM-level report with the fresh transcripts/analysis
      setStep('Regenerating RM report…');
      await fetch('/api/bulk/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      setState('done');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Retry failed');
      setState('error');
    }
  }

  if (state === 'done') {
    return <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Retry complete</span>;
  }

  if (state === 'error') {
    return (
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 11, color: '#ef4444' }}>{errMsg}</span>
        <button onClick={() => setState('idle')} style={actionBtnStyle('#ef4444')}>Try again</button>
      </div>
    );
  }

  if (state === 'retrying') {
    return (
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
        <span style={{ fontSize: 12, color: '#f59e0b' }}>
          {step || `↻ Retrying ${progress.done}/${progress.total}…`}
        </span>
        <div style={{ height: 3, background: '#1e3058', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2, background: '#f59e0b',
            width: step ? '95%' : (progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%'),
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    );
  }

  return (
    <button onClick={handleRetry} style={actionBtnStyle('#f59e0b')}>
      ↻ Retry {errorCount} failed
    </button>
  );
}

function formatDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}sec`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}min ${s}sec` : `${m}min`;
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f1f5f9' }}>{value}</span>
      <button
        onClick={copy}
        title="Copy user ID"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 4px', lineHeight: 1,
          color: copied ? '#22c55e' : '#3a5070',
          fontSize: 13,
        }}
      >
        {copied ? '✓' : '⎘'}
      </button>
    </span>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '4px 10px', background: `${color}18`, border: `1px solid ${color}40`,
    borderRadius: 6, color, fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--card-border)', background: '#131d35', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 14px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)',
};
const subThStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', color: '#3b82f6', fontWeight: 600,
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid #1e3058', background: '#070e1e', whiteSpace: 'nowrap',
};
const thStyleInner: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--card-border)', background: '#0c1021',
};
const tdStyleInner: React.CSSProperties = {
  padding: '8px 10px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)',
};
const outlineLinkStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'transparent', border: '1px solid var(--card-border)',
  borderRadius: 8, color: '#f1f5f9', fontSize: 12, fontWeight: 500, textDecoration: 'none',
};

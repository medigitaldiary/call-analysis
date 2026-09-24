'use client';

import { useEffect, useState } from 'react';
import type { DriveOwnerGroup } from '@/types';

const STORAGE_KEY = `combined-bulk-${new Date().toISOString().slice(0, 10)}`;

interface Log { time: string; message: string; isError?: boolean; }

interface RMState {
  ownerEmail:       string;
  ownerDisplayName: string;
  rmName:           string;          // editable
  files:            DriveOwnerGroup['files'];
  // set after processing starts
  sessionId?:       string;
  status:           'pending' | 'running' | 'done' | 'error';
  progress:         { current: number; total: number };
  logs:             Log[];
  docUrl?:          string;
  sheetUrl?:        string;
}

type Step = 'input' | 'preview' | 'processing' | 'done';

const inputStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
  padding: '8px 12px', color: '#f1f5f9', fontSize: 13, width: '100%',
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' };

function addLog(setter: React.Dispatch<React.SetStateAction<RMState[]>>, idx: number, message: string, isError = false) {
  setter(prev => prev.map((rm, i) => i !== idx ? rm : {
    ...rm,
    logs: [...rm.logs, { time: new Date().toLocaleTimeString(), message, isError }],
  }));
}

function setRMField<K extends keyof RMState>(
  setter: React.Dispatch<React.SetStateAction<RMState[]>>,
  idx: number, key: K, val: RMState[K],
) {
  setter(prev => prev.map((rm, i) => i !== idx ? rm : { ...rm, [key]: val }));
}

export default function CombinedBulkUpload() {
  const [folderUrl,    setFolderUrl]    = useState('');
  const [sessionDate,  setSessionDate]  = useState(new Date().toISOString().split('T')[0]);
  const [step,         setStep]         = useState<Step>('input');
  const [scanning,     setScanning]     = useState(false);
  const [scanError,    setScanError]    = useState('');
  const [rms,          setRms]          = useState<RMState[]>([]);
  const [anyRunning,   setAnyRunning]   = useState(false);

  // Restore today's session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const { folderUrl: u, sessionDate: d, rms: r, step: s } = JSON.parse(saved);
      setFolderUrl(u ?? '');
      setSessionDate(d ?? new Date().toISOString().split('T')[0]);
      // Mark any previously-running RM as error so retry button shows
      setRms((r as RMState[]).map(rm => ({
        ...rm,
        status: rm.status === 'running' ? 'error' : rm.status,
      })));
      setStep(s === 'input' || s === 'preview' ? s : 'done');
    } catch { /* ignore corrupt storage */ }
  }, []);

  // Persist state to localStorage whenever rms or step changes
  useEffect(() => {
    if (rms.length === 0) return;
    try {
      // Trim logs to last 20 per RM to avoid bloating storage
      const slim = rms.map(rm => ({ ...rm, logs: rm.logs.slice(-20) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ folderUrl, sessionDate, rms: slim, step }));
    } catch { /* quota exceeded — skip */ }
  }, [rms, step, folderUrl, sessionDate]);

  // ── Step 1: Scan folder ───────────────────────────────────────────────────
  async function handleScan() {
    if (!folderUrl) { setScanError('Please enter a Google Drive folder URL.'); return; }
    setScanError(''); setScanning(true); setRms([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    try {
      const res  = await fetch('/api/bulk/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');

      const groups: DriveOwnerGroup[] = data.groups;
      setRms(groups.map(g => ({
        ownerEmail:       g.ownerEmail,
        ownerDisplayName: g.ownerDisplayName,
        rmName:           g.suggestedRmName,
        files:            g.files,
        status:           'pending',
        progress:         { current: 0, total: g.files.length },
        logs:             [],
      })));
      setStep('preview');
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  // ── Retry a single errored RM ─────────────────────────────────────────────
  async function handleRetryRM(idx: number) {
    const rm = rms[idx];
    setAnyRunning(true);
    setRMField(setRms, idx, 'status', 'running');
    setRMField(setRms, idx, 'logs', []);

    try {
      let sessionId = rm.sessionId;
      let callIds: string[] = [];

      if (sessionId) {
        // Session exists — reset stuck/failed calls then re-process
        addLog(setRms, idx, `Retrying failed calls for ${rm.rmName}…`);
        const retryRes = await fetch('/api/bulk/retry', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let retryData: any = {};
        try { retryData = await retryRes.json(); } catch {
          const txt = await retryRes.text().catch(() => '');
          throw new Error(`Retry setup failed (${retryRes.status}): ${txt.slice(0, 120)}`);
        }
        if (!retryRes.ok) throw new Error(retryData.error ?? 'Retry failed');
        callIds = retryData.callIds ?? [];
        addLog(setRms, idx, `${callIds.length} call(s) queued for retry…`);
      } else {
        // No session yet — start from scratch
        addLog(setRms, idx, `Starting session for ${rm.rmName} (${rm.files.length} files)…`);
        const startRes = await fetch('/api/bulk/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rmName: rm.rmName, sessionDate, folderUrl, fileIds: rm.files.map(f => f.id) }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error ?? 'Failed to start session');
        sessionId = startData.sessionId;
        callIds = startData.callIds;
        setRMField(setRms, idx, 'sessionId', sessionId);
        setRMField(setRms, idx, 'progress', { current: 0, total: startData.totalFiles });
        addLog(setRms, idx, `Session created. Processing ${startData.totalFiles} calls…`);
      }

      if (callIds.length > 0) {
        let successCount = 0;
        for (let c = 0; c < callIds.length; c++) {
          addLog(setRms, idx, `Processing call ${c + 1}/${callIds.length}…`);
          try {
            const pRes = await fetch('/api/bulk/process-call', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callId: callIds[c], sessionId }),
            });
            const pData = await pRes.json();
            if (pData.skipped) {
              addLog(setRms, idx, `Call ${c + 1} skipped.`);
            } else if (!pRes.ok) {
              addLog(setRms, idx, `Call ${c + 1} failed: ${pData.error}`, true);
            } else {
              successCount++;
              addLog(setRms, idx, `Call ${c + 1} ✓ — ${pData.analysis?.customer_name ?? 'Unknown'} · ${pData.analysis?.outcome ?? ''}`);
            }
          } catch {
            addLog(setRms, idx, `Call ${c + 1} failed — network error`, true);
          }
          setRMField(setRms, idx, 'progress', { current: c + 1, total: callIds.length });
        }
        const failCount = callIds.length - successCount;
        if (failCount > 0) {
          addLog(setRms, idx, `⚠ ${failCount} call(s) still failing.`, true);
          setRMField(setRms, idx, 'status', 'error');
          setAnyRunning(false);
          return;
        }
      }

      // Generate RM report
      addLog(setRms, idx, `All calls done. Generating RM report…`);
      const rptRes = await fetch('/api/bulk/generate-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rptData: any = {};
      try { rptData = await rptRes.json(); } catch {
        throw new Error(
          rptRes.status === 504 || rptRes.status === 524
            ? 'Report generation timed out — the session has too many calls. Try regenerating from Call History.'
            : `Report generation failed (${rptRes.status}) — response was not JSON.`
        );
      }
      if (!rptRes.ok) throw new Error(rptData.error ?? 'Report generation failed');
      setRMField(setRms, idx, 'docUrl',  rptData.docUrl);
      setRMField(setRms, idx, 'sheetUrl', rptData.sheetUrl);
      setRMField(setRms, idx, 'status',  'done');
      addLog(setRms, idx, `✅ ${rm.rmName} complete — report ready.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      addLog(setRms, idx, `Error: ${msg}`, true);
      setRMField(setRms, idx, 'status', 'error');
    }

    setAnyRunning(false);
  }

  // ── Step 2 → 3: Process all RMs sequentially ─────────────────────────────
  async function handleProcessAll() {
    setStep('processing');
    setAnyRunning(true);

    for (let idx = 0; idx < rms.length; idx++) {
      const rm = rms[idx];
      setRMField(setRms, idx, 'status', 'running');
      addLog(setRms, idx, `Starting session for ${rm.rmName} (${rm.files.length} files)…`);

      try {
        // 1. Start session
        const startRes = await fetch('/api/bulk/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rmName:      rm.rmName,
            sessionDate: sessionDate,
            folderUrl:   folderUrl,
            // Pass only this RM's file IDs so start can skip the other RMs' files
            fileIds:     rm.files.map(f => f.id),
          }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error ?? 'Failed to start session');

        const { sessionId, callIds, totalFiles } = startData;
        setRMField(setRms, idx, 'sessionId', sessionId);
        setRMField(setRms, idx, 'progress', { current: 0, total: totalFiles });
        addLog(setRms, idx, `Session created. Processing ${totalFiles} calls…`);

        // 2. Process calls one by one
        let successCount = 0;
        for (let c = 0; c < callIds.length; c++) {
          setRMField(setRms, idx, 'progress', { current: c, total: totalFiles });
          addLog(setRms, idx, `Processing call ${c + 1}/${totalFiles}…`);
          try {
            const pRes = await fetch('/api/bulk/process-call', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callId: callIds[c], sessionId }),
            });
            const pData = await pRes.json();
            if (pData.skipped) {
              addLog(setRms, idx, `Call ${c + 1} skipped.`);
            } else if (!pRes.ok) {
              addLog(setRms, idx, `Call ${c + 1} failed: ${pData.error}`, true);
            } else {
              successCount++;
              addLog(setRms, idx, `Call ${c + 1} ✓ — ${pData.analysis?.customer_name ?? 'Unknown'} · ${pData.analysis?.outcome ?? ''}`);
            }
          } catch {
            addLog(setRms, idx, `Call ${c + 1} failed — network error`, true);
          }
          setRMField(setRms, idx, 'progress', { current: c + 1, total: totalFiles });
        }

        const failCount = totalFiles - successCount;
        if (failCount > 0) {
          addLog(setRms, idx, `⚠ ${failCount} call(s) failed — RM report skipped. Use Retry in Call History.`, true);
          setRMField(setRms, idx, 'status', 'error');
        } else {
          // 3. Generate RM report
          addLog(setRms, idx, `All calls done. Generating RM report…`);
          const rptRes  = await fetch('/api/bulk/generate-report', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let rptData: any = {};
          try { rptData = await rptRes.json(); } catch {
            throw new Error(
              rptRes.status === 504 || rptRes.status === 524
                ? 'Report generation timed out — the session has too many calls. Try Regen Report from Call History.'
                : `Report generation failed (${rptRes.status}) — response was not JSON.`
            );
          }
          if (!rptRes.ok) throw new Error(rptData.error ?? 'Report generation failed');

          setRMField(setRms, idx, 'docUrl',   rptData.docUrl);
          setRMField(setRms, idx, 'sheetUrl', rptData.sheetUrl);
          setRMField(setRms, idx, 'status',   'done');
          addLog(setRms, idx, `✅ ${rm.rmName} complete — report ready.`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Processing failed';
        addLog(setRms, idx, `Error: ${msg}`, true);
        setRMField(setRms, idx, 'status', 'error');
      }
    }

    setAnyRunning(false);
    setStep('done');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const statusColor = (s: RMState['status']) =>
    s === 'done' ? '#22c55e' : s === 'error' ? '#ef4444' : s === 'running' ? '#f59e0b' : '#64748b';
  const statusLabel = (s: RMState['status']) =>
    s === 'done' ? '✅ Done' : s === 'error' ? '❌ Error' : s === 'running' ? '⏳ Processing…' : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Step 1: Input ── */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Combined Bulk Upload — All RMs</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Paste the shared folder where all RMs have uploaded their recordings. The system will auto-detect each RM by file owner and create separate sessions.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Shared Drive Folder URL *</label>
            <input
              value={folderUrl}
              onChange={e => { setFolderUrl(e.target.value); setScanError(''); setStep('input'); setRms([]); }}
              placeholder="https://drive.google.com/drive/folders/…"
              disabled={anyRunning}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Session Date *</label>
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              disabled={anyRunning}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={scanning || anyRunning || !folderUrl}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: scanning ? '#334155' : '#3b82f6', color: '#fff',
              opacity: (!folderUrl || anyRunning) ? 0.5 : 1,
            }}
          >
            {scanning ? 'Scanning…' : '🔍 Scan Folder'}
          </button>
        </div>

        {scanError && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>{scanError}</p>
        )}
      </div>

      {/* ── Step 2: Preview ── */}
      {(step === 'preview' || step === 'processing' || step === 'done') && rms.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                Detected {rms.length} RM{rms.length !== 1 ? 's' : ''} · {rms.reduce((s, r) => s + r.files.length, 0)} total files
              </h3>
              {step === 'preview' && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Confirm or edit RM names before processing.
                </p>
              )}
            </div>
            {step === 'preview' && (
              <button
                onClick={handleProcessAll}
                style={{
                  padding: '8px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, background: '#22c55e', color: '#fff',
                }}
              >
                ▶ Process All RMs
              </button>
            )}
          </div>

          {/* RM rows */}
          {rms.map((rm, idx) => {
            const pct = rm.progress.total > 0
              ? Math.round((rm.progress.current / rm.progress.total) * 100) : 0;

            return (
              <div
                key={rm.ownerEmail || idx}
                style={{
                  border: `1px solid ${statusColor(rm.status)}44`,
                  borderRadius: 8, marginBottom: 12, overflow: 'hidden',
                }}
              >
                {/* Header row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 140px 180px 80px',
                  gap: 12, alignItems: 'center',
                  padding: '12px 16px', background: '#0f172a',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>
                      Drive owner: {rm.ownerDisplayName}
                      {rm.ownerEmail && <span style={{ marginLeft: 6, color: '#475569' }}>({rm.ownerEmail})</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {step === 'preview' ? (
                        <input
                          value={rm.rmName}
                          onChange={e => setRMField(setRms, idx, 'rmName', e.target.value)}
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: 13, fontWeight: 600, width: 160 }}
                          placeholder="RM Name"
                        />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{rm.rmName}</span>
                      )}
                      {step === 'preview' && (
                        <button
                          onClick={() => setRms(prev => prev.filter((_, i) => i !== idx))}
                          title="Remove this RM"
                          style={{
                            background: 'none', border: '1px solid #ef444440', borderRadius: 4,
                            color: '#ef4444', fontSize: 14, cursor: 'pointer',
                            padding: '2px 7px', lineHeight: 1, fontWeight: 600,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    📁 {rm.files.length} file{rm.files.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(rm.status) }}>
                      {statusLabel(rm.status)}
                    </span>
                    {rm.status === 'error' && !anyRunning && (
                      <button
                        onClick={() => handleRetryRM(idx)}
                        style={{
                          padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: '#f59e0b18', border: '1px solid #f59e0b40',
                          borderRadius: 5, color: '#f59e0b',
                        }}
                      >
                        ↻ Retry
                      </button>
                    )}
                  </div>
                  {/* Download links when done */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {rm.docUrl && (
                      <a href={rm.docUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}>📄 Doc</a>
                    )}
                    {rm.sheetUrl && (
                      <a href={rm.sheetUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#34d399', textDecoration: 'none' }}>📊 Sheet</a>
                    )}
                  </div>
                </div>

                {/* Progress bar (while running) */}
                {rm.status === 'running' && (
                  <div style={{ background: '#1e293b', padding: '6px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                      <span>{rm.progress.current}/{rm.progress.total} calls</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: '#334155', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#f59e0b', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}

                {/* Logs (while running or after error/done) */}
                {rm.logs.length > 0 && (
                  <div style={{
                    background: '#020817', padding: '8px 16px', maxHeight: 140, overflowY: 'auto',
                    fontFamily: 'monospace', fontSize: 11,
                  }}>
                    {rm.logs.map((l, li) => (
                      <div key={li} style={{ color: l.isError ? '#f87171' : '#64748b', marginBottom: 2 }}>
                        <span style={{ color: '#475569', marginRight: 8 }}>{l.time}</span>{l.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Done summary */}
          {step === 'done' && (
            <div style={{
              marginTop: 8, padding: '12px 16px', borderRadius: 8,
              background: '#052e16', border: '1px solid #166534',
              fontSize: 13, color: '#86efac',
            }}>
              ✅ All RMs processed. Sessions are visible in Call History.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

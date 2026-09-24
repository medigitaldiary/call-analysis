'use client';

import { useEffect, useState } from 'react';
import {
  getSonarToken, setSonarToken, decodeTokenExpiry,
  fetchOwners, fetchTasksForOwnerOnDate, fetchTasksByTypeOnDate,
  fetchRecordingsForTasks,
  TASK_TITLES, SonarOwner, ScanRecording,
} from '@/lib/sonar';

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
  padding: '8px 12px', color: '#f1f5f9', fontSize: 13, width: '100%',
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' };
const cardStyle:  React.CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
  borderRadius: 10, padding: '20px 24px',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Log { time: string; message: string; isError?: boolean; }

interface RMImportState {
  ownerId:       string;
  rmName:        string;
  recordings:    ScanRecording[];
  sessionId?:    string;
  callRecordMap: Record<string, { sonarCallId: string; sonarTaskId: string }>;
  status:        'pending' | 'running' | 'done' | 'error';
  progress:      { current: number; total: number };
  logs:          Log[];
  docUrl?:       string;
  sheetUrl?:     string;
}

type ImportMode = 'by-rm' | 'by-task-type';
type Step = 'input' | 'preview' | 'processing' | 'done';

// ── State helpers ─────────────────────────────────────────────────────────────
function addLog(
  setter: React.Dispatch<React.SetStateAction<RMImportState[]>>,
  idx: number, message: string, isError = false,
) {
  setter(prev => prev.map((rm, i) => i !== idx ? rm : {
    ...rm, logs: [...rm.logs, { time: new Date().toLocaleTimeString(), message, isError }],
  }));
}
function setField<K extends keyof RMImportState>(
  setter: React.Dispatch<React.SetStateAction<RMImportState[]>>,
  idx: number, key: K, val: RMImportState[K],
) {
  setter(prev => prev.map((rm, i) => i !== idx ? rm : { ...rm, [key]: val }));
}

// ── Token badge ───────────────────────────────────────────────────────────────
function tokenStatus(token: string | null): { label: string; color: string } {
  if (!token) return { label: 'Not set', color: '#ef4444' };
  const exp = decodeTokenExpiry(token);
  if (!exp)  return { label: 'Set (no expiry info)', color: '#f59e0b' };
  const mins = Math.floor((exp.getTime() - Date.now()) / 60000);
  if (mins <= 0)  return { label: 'Expired', color: '#ef4444' };
  if (mins < 30)  return { label: `Expires in ${mins}m`, color: '#f59e0b' };
  return { label: `Valid · ${Math.floor(mins / 60)}h ${mins % 60}m left`, color: '#22c55e' };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SonarImport() {
  // Token
  const [savedToken,   setSavedToken]   = useState<string | null>(null);
  const [tokenInput,   setTokenInput]   = useState('');
  const [showToken,    setShowToken]    = useState(false);

  // Owners (for By RM mode)
  const [owners,        setOwners]        = useState<SonarOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError,   setOwnersError]   = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');

  // Task type selection (for By Task Type mode)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Shared scan state
  const [importMode,    setImportMode]    = useState<ImportMode>('by-rm');
  const [sessionDate,   setSessionDate]   = useState(new Date().toISOString().split('T')[0]);
  const [step,          setStep]          = useState<Step>('input');
  const [scanning,      setScanning]      = useState(false);
  const [scanProgress,  setScanProgress]  = useState<{ fetched: number; total: number } | null>(null);
  const [scanError,     setScanError]     = useState('');
  const [rms,           setRms]           = useState<RMImportState[]>([]);
  const [anyRunning,    setAnyRunning]    = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = getSonarToken();
    setSavedToken(t);

    // Receive token forwarded by the Radar parent page via postMessage.
    // Radar sends { type: "SONAR_AUTH_TOKEN", token } on iframe load and
    // every 4 minutes thereafter.
    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://radar.sustvest.in') return;
      if (event.data?.type === 'SONAR_AUTH_TOKEN' && event.data?.token) {
        setSonarToken(event.data.token);
        setSavedToken(event.data.token);
      }
    }
    window.addEventListener('message', handleMessage);
    // Ask the parent for the token now that the listener is ready.
    // Radar listens for this and responds with SONAR_AUTH_TOKEN.
    window.parent.postMessage({ type: 'REQUEST_SONAR_TOKEN' }, 'https://radar.sustvest.in');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!savedToken) { setOwners([]); return; }
    setOwnersLoading(true);
    setOwnersError('');
    fetchOwners(savedToken)
      .then(list => { setOwners(list); setOwnersLoading(false); })
      .catch(err => {
        setOwnersError(err.message === '401' ? 'Token expired — please re-paste.' : err.message);
        setOwnersLoading(false);
      });
  }, [savedToken]);

  // ── Token ─────────────────────────────────────────────────────────────────
  function handleSaveToken() {
    const t = tokenInput.trim();
    if (!t) return;
    setSonarToken(t);
    setSavedToken(t);
    setTokenInput('');
    setShowToken(false);
  }

  // ── Tab switch — reset scan state ─────────────────────────────────────────
  function switchMode(mode: ImportMode) {
    setImportMode(mode);
    setRms([]);
    setStep('input');
    setScanError('');
    setScanProgress(null);
  }

  // ── Toggle task type chip ─────────────────────────────────────────────────
  function toggleType(title: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
    setRms([]); setStep('input'); setScanError('');
  }

  // ── Shared: build rms[] from (tasks → recordings) ────────────────────────
  async function buildRmsFromTasks(
    token: string,
    tasks: Awaited<ReturnType<typeof fetchTasksForOwnerOnDate>>,
  ): Promise<RMImportState[]> {
    if (tasks.length === 0) return [];

    setScanProgress({ fetched: 0, total: tasks.length });
    const recordings = await fetchRecordingsForTasks(token, tasks, (fetched, total) =>
      setScanProgress({ fetched, total }),
    );
    setScanProgress(null);

    // Group by RM owner
    const rmMap = new Map<string, { rmName: string; recordings: ScanRecording[] }>();
    for (const task of tasks) {
      const ownerId  = task.task_ownerId  ?? 'unknown';
      const rmName   = task.task_ownerName?.split(' ')[0] ?? 'Unknown';
      if (!rmMap.has(ownerId)) rmMap.set(ownerId, { rmName, recordings: [] });
    }
    for (const rec of recordings) {
      // Find which RM owns this task
      const task = tasks.find(t => t.id === rec.sonarTaskId);
      const ownerId = task?.task_ownerId ?? 'unknown';
      rmMap.get(ownerId)?.recordings.push(rec);
    }

    return [...rmMap.entries()]
      .filter(([, v]) => v.recordings.length > 0)
      .map(([ownerId, { rmName, recordings }]) => ({
        ownerId, rmName, recordings,
        callRecordMap: {},
        status:   'pending' as const,
        progress: { current: 0, total: recordings.length },
        logs:     [],
      }));
  }

  // ── Scan: By RM ───────────────────────────────────────────────────────────
  async function handleScanByRM() {
    if (!savedToken || !selectedOwner) return;
    const owner = owners.find(o => o.id === selectedOwner);
    if (!owner) return;
    setScanError(''); setScanning(true); setRms([]);

    try {
      const tasks = await fetchTasksForOwnerOnDate(savedToken, selectedOwner, sessionDate);
      if (tasks.length === 0) {
        setScanError(`No tasks found for ${owner.name} on ${sessionDate}.`);
        return;
      }
      const rmStates = await buildRmsFromTasks(savedToken, tasks);
      if (rmStates.length === 0) {
        setScanError(`No call recordings found for ${owner.name} on ${sessionDate}.`);
        return;
      }
      // Override rmName with owner's first name (not from task, since all tasks belong to same RM)
      setRms(rmStates.map(r => ({ ...r, rmName: owner.name.split(' ')[0] })));
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setScanError(msg === '401' ? 'Token expired — please re-paste and try again.' : msg);
    } finally {
      setScanning(false);
    }
  }

  // ── Scan: By Task Type ────────────────────────────────────────────────────
  async function handleScanByTaskType() {
    if (!savedToken || selectedTypes.size === 0) return;
    setScanError(''); setScanning(true); setRms([]);

    try {
      const tasks = await fetchTasksByTypeOnDate(savedToken, [...selectedTypes], sessionDate);
      if (tasks.length === 0) {
        setScanError(`No tasks found for selected type(s) on ${sessionDate}.`);
        return;
      }
      const rmStates = await buildRmsFromTasks(savedToken, tasks);
      if (rmStates.length === 0) {
        setScanError(`No call recordings found for selected type(s) on ${sessionDate}.`);
        return;
      }
      setRms(rmStates);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setScanError(msg === '401' ? 'Token expired — please re-paste and try again.' : msg);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }

  // ── Process all RMs ───────────────────────────────────────────────────────
  async function handleProcessAll() {
    setStep('processing');
    setAnyRunning(true);
    for (let idx = 0; idx < rms.length; idx++) await processRM(idx);
    setAnyRunning(false);
    setStep('done');
  }

  async function processRM(idx: number) {
    const rm = rms[idx];
    setField(setRms, idx, 'status', 'running');
    addLog(setRms, idx, `Starting session for ${rm.rmName} (${rm.recordings.length} recordings)…`);

    try {
      const startRes = await fetch('/api/bulk/sonar-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmName: rm.rmName, sessionDate, recordings: rm.recordings }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? 'Failed to start session');

      const { sessionId, callIds } = startData as { sessionId: string; callIds: string[] };
      setField(setRms, idx, 'sessionId', sessionId);
      setField(setRms, idx, 'progress', { current: 0, total: callIds.length });

      const callMap: RMImportState['callRecordMap'] = {};
      callIds.forEach((cid, i) => {
        callMap[cid] = {
          sonarCallId: rm.recordings[i].sonarCallId,
          sonarTaskId: rm.recordings[i].sonarTaskId,
        };
      });
      setField(setRms, idx, 'callRecordMap', callMap);
      addLog(setRms, idx, `Session created. Processing ${callIds.length} calls…`);

      let successCount = 0;
      const currentToken = getSonarToken()!;

      for (let c = 0; c < callIds.length; c++) {
        const callId = callIds[c];
        const { sonarCallId, sonarTaskId } = callMap[callId];
        addLog(setRms, idx, `Call ${c + 1}/${callIds.length} — refreshing URL…`);

        let freshUrl: string | undefined;
        try {
          const { fetchRecordingsForTask } = await import('@/lib/sonar');
          const freshRecs = await fetchRecordingsForTask(currentToken, sonarTaskId);
          freshUrl = freshRecs.find(r => r.callId === sonarCallId)?.signedUrl;
        } catch { /* use original URL stored in DB */ }

        try {
          const pRes = await fetch('/api/bulk/process-call', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callId, sessionId,
              ...(freshUrl ? { audioUrlOverride: freshUrl } : {}),
            }),
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
        setField(setRms, idx, 'progress', { current: c + 1, total: callIds.length });
      }

      const failCount = callIds.length - successCount;
      if (failCount > 0) {
        addLog(setRms, idx, `⚠ ${failCount} call(s) failed — report skipped. Retry from Call History.`, true);
        setField(setRms, idx, 'status', 'error');
        return;
      }

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
            ? 'Report timed out — try Regen Report from Call History.'
            : `Report generation failed (${rptRes.status}).`,
        );
      }
      if (!rptRes.ok) throw new Error(rptData.error ?? 'Report generation failed');

      setField(setRms, idx, 'docUrl',   rptData.docUrl);
      setField(setRms, idx, 'sheetUrl', rptData.sheetUrl);
      setField(setRms, idx, 'status',   'done');
      addLog(setRms, idx, `✅ ${rm.rmName} complete — report ready.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Processing failed';
      addLog(setRms, idx, `Error: ${msg}`, true);
      setField(setRms, idx, 'status', 'error');
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const statusColor = (s: RMImportState['status']) =>
    ({ done: '#22c55e', error: '#ef4444', running: '#f59e0b', pending: '#64748b' })[s];
  const statusLabel = (s: RMImportState['status']) =>
    ({ done: '✅ Done', error: '❌ Error', running: '⏳ Processing…', pending: '—' })[s];

  const badge = tokenStatus(savedToken);
  const totalRecordings = rms.reduce((s, r) => s + r.recordings.length, 0);
  const canScanRM = !!savedToken && !!selectedOwner && !anyRunning;
  const canScanType = !!savedToken && selectedTypes.size > 0 && !anyRunning;

  // ── Tab style ─────────────────────────────────────────────────────────────
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 600 : 400,
    background: active ? '#3b82f6' : 'transparent',
    color: active ? '#fff' : '#94a3b8',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Token ────────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Sonar Auth Token</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Radar → DevTools → Application → Local Storage → copy the{' '}
              <code style={{ color: '#60a5fa' }}>token</code> value
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
              background: badge.color + '18', color: badge.color, border: `1px solid ${badge.color}40`,
            }}>
              ● {badge.label}
            </span>
            <button onClick={() => setShowToken(v => !v)} style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
            }}>
              {showToken ? 'Hide' : savedToken ? 'Update Token' : 'Set Token'}
            </button>
          </div>
        </div>

        {showToken && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Paste JWT token from Radar localStorage</label>
              <textarea
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>
            <button
              onClick={handleSaveToken}
              disabled={!tokenInput.trim()}
              style={{
                padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, background: '#3b82f6', color: '#fff',
                opacity: !tokenInput.trim() ? 0.5 : 1, alignSelf: 'flex-end', height: 36,
              }}
            >
              Save Token
            </button>
          </div>
        )}
      </div>

      {/* ── Mode tabs ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 8, background: 'var(--card-bg)', border: '1px solid var(--card-border)', alignSelf: 'flex-start' }}>
        <button style={tabBtn(importMode === 'by-rm')}        onClick={() => switchMode('by-rm')}>👤 By RM</button>
        <button style={tabBtn(importMode === 'by-task-type')} onClick={() => switchMode('by-task-type')}>🏷 By Task Type</button>
      </div>

      {/* ── Scan panel ───────────────────────────────────────────────────── */}
      <div style={cardStyle}>

        {importMode === 'by-rm' ? (
          <>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Import by RM</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
              Select an RM and date to fetch all their call recordings.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>RM</label>
                {ownersLoading ? (
                  <div style={{ ...inputStyle, color: '#64748b' }}>Loading RMs…</div>
                ) : ownersError ? (
                  <div style={{ ...inputStyle, color: '#ef4444', fontSize: 12 }}>{ownersError}</div>
                ) : (
                  <select
                    value={selectedOwner}
                    onChange={e => { setSelectedOwner(e.target.value); setRms([]); setStep('input'); setScanError(''); }}
                    disabled={!savedToken || anyRunning}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">— Select RM —</option>
                    {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Session Date</label>
                <input type="date" value={sessionDate}
                  onChange={e => { setSessionDate(e.target.value); setRms([]); setStep('input'); setScanError(''); }}
                  disabled={anyRunning} style={inputStyle} />
              </div>
              <button onClick={handleScanByRM} disabled={scanning || !canScanRM} style={{
                padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, background: scanning ? '#334155' : '#3b82f6',
                color: '#fff', opacity: !canScanRM ? 0.5 : 1,
              }}>
                {scanning ? 'Scanning…' : '🔍 Scan'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Import by Task Type</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
              Select one or more task types to fetch recordings across all RMs for that date.
            </p>

            {/* Task type chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {TASK_TITLES.map(title => {
                const active = selectedTypes.has(title);
                return (
                  <button
                    key={title}
                    onClick={() => toggleType(title)}
                    disabled={anyRunning}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      fontWeight: active ? 600 : 400,
                      background: active ? '#3b82f618' : '#1e293b',
                      color:      active ? '#60a5fa'   : '#64748b',
                      border:     active ? '1px solid #3b82f660' : '1px solid #334155',
                      transition: 'all 0.15s',
                    }}
                  >
                    {active ? '✓ ' : ''}{title.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>Session Date</label>
                <input type="date" value={sessionDate}
                  onChange={e => { setSessionDate(e.target.value); setRms([]); setStep('input'); setScanError(''); }}
                  disabled={anyRunning} style={inputStyle} />
              </div>
              <button onClick={handleScanByTaskType} disabled={scanning || !canScanType} style={{
                padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, background: scanning ? '#334155' : '#3b82f6',
                color: '#fff', opacity: !canScanType ? 0.5 : 1,
              }}>
                {scanning ? 'Scanning…' : '🔍 Scan'}
              </button>
            </div>

            {selectedTypes.size > 0 && !scanning && step === 'input' && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b' }}>
                {selectedTypes.size} type{selectedTypes.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </>
        )}

        {/* Scan progress (task type mode scans many tasks) */}
        {scanning && scanProgress && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              <span>Checking recordings… {scanProgress.fetched}/{scanProgress.total} tasks</span>
              <span>{Math.round((scanProgress.fetched / scanProgress.total) * 100)}%</span>
            </div>
            <div style={{ height: 3, background: '#334155', borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${Math.round((scanProgress.fetched / scanProgress.total) * 100)}%`,
                background: '#3b82f6', borderRadius: 2, transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        {scanError && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>{scanError}</p>
        )}
      </div>

      {/* ── Preview & Processing (shared between both modes) ─────────────── */}
      {(step === 'preview' || step === 'processing' || step === 'done') && rms.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                {rms.length} RM{rms.length !== 1 ? 's' : ''} · {totalRecordings} recording{totalRecordings !== 1 ? 's' : ''} found
              </h3>
              {step === 'preview' && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Confirm RM names before starting.
                </p>
              )}
            </div>
            {step === 'preview' && (
              <button onClick={handleProcessAll} style={{
                padding: '8px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, background: '#22c55e', color: '#fff',
              }}>
                ▶ Start Import
              </button>
            )}
          </div>

          {rms.map((rm, idx) => {
            const pct = rm.progress.total > 0
              ? Math.round((rm.progress.current / rm.progress.total) * 100) : 0;

            const taskGroups = rm.recordings.reduce<Record<string, number>>((acc, r) => {
              acc[r.sonarTaskName] = (acc[r.sonarTaskName] ?? 0) + 1;
              return acc;
            }, {});

            return (
              <div key={rm.ownerId} style={{
                border: `1px solid ${statusColor(rm.status)}44`,
                borderRadius: 8, marginBottom: 12, overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 160px 180px 80px',
                  gap: 12, alignItems: 'center', padding: '12px 16px', background: '#0f172a',
                }}>
                  <div>
                    {/* Task type badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {Object.entries(taskGroups).map(([name, count]) => (
                        <span key={name} style={{
                          padding: '1px 7px', borderRadius: 3, fontSize: 11,
                          background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                        }}>
                          {name.replace(/_/g, ' ')} ×{count}
                        </span>
                      ))}
                    </div>
                    {step === 'preview' ? (
                      <input
                        value={rm.rmName}
                        onChange={e => setField(setRms, idx, 'rmName', e.target.value)}
                        style={{ ...inputStyle, padding: '4px 8px', fontSize: 13, fontWeight: 600, width: 160 }}
                        placeholder="RM Name"
                      />
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{rm.rmName}</span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    🎙 {rm.recordings.length} recording{rm.recordings.length !== 1 ? 's' : ''}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: statusColor(rm.status) }}>
                    {statusLabel(rm.status)}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {rm.docUrl   && <a href={rm.docUrl}   target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}>📄 Doc</a>}
                    {rm.sheetUrl && <a href={rm.sheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#34d399', textDecoration: 'none' }}>📊 Sheet</a>}
                  </div>
                </div>

                {/* Recordings table — preview only */}
                {step === 'preview' && (
                  <div style={{ background: '#0f172a', borderTop: '1px solid #1e293b', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#1e293b' }}>
                          {['#', 'Task Type', 'Direction', 'Started', 'Duration', 'Phone'].map(h => (
                            <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rm.recordings.map((rec, ri) => {
                          const mins = Math.floor(rec.durationSecs / 60);
                          const secs = Math.round(rec.durationSecs % 60);
                          return (
                            <tr key={rec.sonarCallId} style={{ borderTop: '1px solid #1e293b20' }}>
                              <td style={{ padding: '5px 12px', color: '#475569' }}>{ri + 1}</td>
                              <td style={{ padding: '5px 12px', color: '#94a3b8' }}>{rec.sonarTaskName.replace(/_/g, ' ')}</td>
                              <td style={{ padding: '5px 12px' }}>
                                <span style={{ color: rec.direction === 'OUTBOUND' ? '#60a5fa' : '#34d399', fontWeight: 500 }}>
                                  {rec.direction === 'OUTBOUND' ? '↗' : '↙'} {rec.direction}
                                </span>
                              </td>
                              <td style={{ padding: '5px 12px', color: '#64748b' }}>
                                {new Date(rec.startedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
                              </td>
                              <td style={{ padding: '5px 12px', color: rec.answeredAt ? '#f1f5f9' : '#ef4444' }}>
                                {rec.answeredAt ? `${mins}m ${secs}s` : 'Unanswered'}
                              </td>
                              <td style={{ padding: '5px 12px', color: '#64748b' }}>{rec.customerPhone ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Progress bar */}
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

                {/* Logs */}
                {rm.logs.length > 0 && (
                  <div style={{
                    background: '#020817', padding: '8px 16px', maxHeight: 160,
                    overflowY: 'auto', fontFamily: 'monospace', fontSize: 11,
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

          {step === 'done' && (
            <div style={{
              marginTop: 8, padding: '12px 16px', borderRadius: 8,
              background: '#052e16', border: '1px solid #166534', fontSize: 13, color: '#86efac',
            }}>
              ✅ Import complete. Sessions are visible in Call History.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

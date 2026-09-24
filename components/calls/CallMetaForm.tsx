'use client';

import { useState } from 'react';
import UploadZone from './UploadZone';
import PipelineStatus from './PipelineStatus';
import ReportPreview from './ReportPreview';
import { CallFormData, PipelineStep, Report } from '@/types';

interface PipelineLog {
  time: string;
  message: string;
}

export default function CallMetaForm({ repEmail }: { repEmail?: string }) {
  const [repName, setRepName] = useState(repEmail ? repEmail.split('@')[0] : '');
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const isRunning = ['uploading', 'transcribing', 'analysing', 'generating'].includes(pipelineStep);

  function addLog(message: string) {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  }

  async function runPipeline() {
    setError('');
    setLogs([]);
    setReport(null);

    if (!repName.trim()) {
      setError('Please enter your Rep Name.');
      return;
    }
    if (!file && !driveUrl) {
      setError('Please upload a recording or provide a Google Drive URL.');
      return;
    }

    try {
      setPipelineStep('uploading');
      addLog('Uploading recording…');

      const formData = new FormData();
      formData.append('prospect_name', '');
      formData.append('company', '-');
      formData.append('rep_name', repName.trim());
      formData.append('call_type', 'Intro Call');
      formData.append('stakeholders', '');
      if (file) formData.append('file', file);
      if (driveUrl) formData.append('drive_url', driveUrl);

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed');

      const newCallId = uploadData.callId;
      setCallId(newCallId);
      addLog(`Upload complete. Call ID: ${newCallId}`);

      setPipelineStep('transcribing');
      addLog('Transcribing audio with Sarvam AI (this may take 1–3 min)…');

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: newCallId }),
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error ?? 'Transcription failed');
      addLog('Transcription complete.');

      setPipelineStep('analysing');
      addLog('Analysing transcript with Claude…');

      const analyseRes = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: newCallId }),
      });
      const analyseData = await analyseRes.json();
      if (!analyseRes.ok) throw new Error(analyseData.error ?? 'Analysis failed');
      addLog('Analysis complete.');

      setPipelineStep('generating');
      addLog('Generating .docx report and .xlsx sheet…');

      const [docRes, sheetRes] = await Promise.all([
        fetch('/api/generate-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: newCallId }),
        }),
        fetch('/api/generate-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: newCallId }),
        }),
      ]);

      if (!docRes.ok) throw new Error((await docRes.json()).error ?? 'Doc generation failed');
      if (!sheetRes.ok) throw new Error((await sheetRes.json()).error ?? 'Sheet generation failed');
      addLog('Documents generated and uploaded.');

      const reportRes = await fetch(`/api/reports?callId=${newCallId}`);
      const { report: fullReport } = await reportRes.json();

      setReport(fullReport);
      setPipelineStep('ready');
      addLog('Pipeline complete! Report is ready.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pipeline failed';
      setError(message);
      setPipelineStep('error');
      addLog(`Error: ${message}`);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Single unified card ── */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Single Call Upload</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Upload a recording or paste a Google Drive link to auto-generate a call report.
        </p>

        {/* Upload zone */}
        <UploadZone
          onFileSelect={(f) => { setFile(f); setDriveUrl(''); }}
          onDriveUrl={(url) => { setDriveUrl(url); setFile(null); }}
          disabled={isRunning}
        />

        {/* Rep Name + Run button row */}
        <div className="bulk-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>Rep Name *</label>
            <input
              value={repName}
              onChange={e => setRepName(e.target.value)}
              placeholder="Your name"
              disabled={isRunning}
              style={inputStyle}
            />
          </div>
          <button
            onClick={runPipeline}
            disabled={isRunning}
            className="bulk-start-btn"
            style={{
              padding: '9px 24px',
              background: isRunning ? '#253870' : '#3b82f6',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: isRunning ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {isRunning ? <><span className="blink">●</span> Running…</> : '▶ Run Pipeline'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* Pipeline status */}
      {pipelineStep !== 'idle' && (
        <PipelineStatus step={pipelineStep} logs={logs} />
      )}

      {/* Report preview */}
      {report && callId && pipelineStep === 'ready' && (
        <ReportPreview report={report} callId={callId} />
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  background: '#0c1021',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  color: '#f1f5f9',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

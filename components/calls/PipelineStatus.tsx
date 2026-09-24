'use client';

import { PipelineStep } from '@/types';

interface PipelineLog {
  time: string;
  message: string;
}

interface Props {
  step: PipelineStep;
  logs: PipelineLog[];
}

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'uploading', label: 'Upload' },
  { key: 'transcribing', label: 'Transcribe' },
  { key: 'analysing', label: 'Analyse' },
  { key: 'generating', label: 'Generate' },
  { key: 'ready', label: 'Ready' },
];

const stepOrder: PipelineStep[] = ['uploading', 'transcribing', 'analysing', 'generating', 'ready'];

function getStepStatus(key: PipelineStep, current: PipelineStep): 'completed' | 'active' | 'idle' | 'error' {
  if (current === 'error') return 'idle';
  const currentIdx = stepOrder.indexOf(current);
  const keyIdx = stepOrder.indexOf(key);
  if (keyIdx < currentIdx) return 'completed';
  if (keyIdx === currentIdx) return 'active';
  return 'idle';
}

export default function PipelineStatus({ step, logs }: Props) {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 10,
        padding: '20px 24px',
      }}
    >
      <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
        Pipeline Status
      </h3>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        {STEPS.map((s, idx) => {
          const status = getStepStatus(s.key, step);
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
              {/* Step dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  className={status === 'active' ? 'pulse-ring' : ''}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background:
                      status === 'completed' ? '#22c55e' :
                      status === 'active'    ? '#3b82f6' :
                      '#253870',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: status === 'active' ? '2px solid #3b82f6' : 'none',
                    transition: 'background 0.3s',
                    flexShrink: 0,
                  }}
                >
                  {status === 'completed' && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: 11,
                  color: status === 'completed' ? '#22c55e' : status === 'active' ? '#3b82f6' : 'var(--text-dim)',
                  fontWeight: status === 'active' ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {s.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: status === 'completed' ? '#22c55e' : '#1e3058',
                    margin: '0 4px',
                    marginBottom: 22,
                    transition: 'background 0.3s',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error badge */}
      {step === 'error' && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6,
          color: '#ef4444',
          fontSize: 13,
          marginBottom: 12,
        }}>
          Pipeline encountered an error. See log below.
        </div>
      )}

      {/* Live log */}
      <div
        style={{
          background: '#0c1021',
          border: '1px solid var(--card-border)',
          borderRadius: 8,
          padding: '12px 14px',
          maxHeight: 160,
          overflowY: 'auto',
          fontFamily: 'monospace',
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Waiting to start…</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4, display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{log.time}</span>
              <span style={{ color: log.message.startsWith('Error') ? '#ef4444' : 'var(--text-muted)' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

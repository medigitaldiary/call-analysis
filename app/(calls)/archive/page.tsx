'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ArchivedSession {
  id: string;
  rm_name: string;
  session_date: string;
  status: string;
  total_files: number;
  archived_at: string;
  call_count: number;
}

export default function ArchivePage() {
  const [sessions, setSessions] = useState<ArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/bulk/archived');
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function restore(sessionId: string) {
    setRestoring(sessionId);
    await fetch('/api/bulk/archived', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setRestoring(null);
  }

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'clip' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>🗄 Archive</h2>
          {!loading && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Link href="/history" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: 'transparent', border: '1px solid var(--card-border)',
          color: 'var(--text-muted)', textDecoration: 'none',
        }}>
          ← Back to History
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
          Loading archive…
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗄</div>
          <div style={{ fontSize: 14 }}>No archived sessions yet.</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            Use the 🗑 bin icon on any session in Call History to archive it.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Session', 'Rep', 'Date', 'Calls', 'Archived On', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, idx) => {
                const sessionDate = new Date(s.session_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                });
                const archivedDate = new Date(s.archived_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                });
                const archivedTime = new Date(s.archived_at).toLocaleTimeString('en-GB', {
                  hour: '2-digit', minute: '2-digit',
                });

                return (
                  <tr key={s.id} style={{ background: idx % 2 === 0 ? 'transparent' : '#131d35' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>📁</span>
                        {s.rm_name} — {sessionDate}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.rm_name}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{sessionDate}</td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px',
                        background: '#3b82f620', color: '#3b82f6',
                        borderRadius: 20, border: '1px solid #3b82f630',
                      }}>
                        {s.call_count} call{Number(s.call_count) !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>
                      {archivedDate} · {archivedTime}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => restore(s.id)}
                        disabled={restoring === s.id}
                        style={{
                          padding: '4px 10px', background: '#3b82f618',
                          border: '1px solid #3b82f640', borderRadius: 6,
                          color: '#3b82f6', fontSize: 12, fontWeight: 500,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {restoring === s.id ? '…' : '↩ Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--card-border)', background: '#131d35', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 14px', color: '#f1f5f9', borderBottom: '1px solid var(--card-border)',
};

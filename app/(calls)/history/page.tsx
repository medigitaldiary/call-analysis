'use client';

import { useState } from 'react';
import Link from 'next/link';
import CallHistoryTable from '@/components/calls/CallHistoryTable';
import CustomerView from '@/components/calls/CustomerView';
import DayReportView from '@/components/calls/DayReportView';

type SubTab = 'rm' | 'user' | 'day';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'rm',   label: '📁 RM View' },
  { id: 'user', label: '👤 User View' },
  { id: 'day',  label: '📋 Day Report' },
];

export default function HistoryPage() {
  const [subTab, setSubTab] = useState<SubTab>('rm');

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'clip' }}>
      {/* Sub-tab toggle */}
      <div className="history-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Call History</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', background: '#0c1021', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--card-border)' }}>
            {SUB_TABS.map(st => (
              <button
                key={st.id}
                onClick={() => setSubTab(st.id)}
                style={{
                  padding: '5px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: subTab === st.id ? '#1e3058' : 'transparent',
                  color: subTab === st.id ? '#f1f5f9' : 'var(--text-muted)',
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
          <Link href="/archive" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: 'transparent', border: '1px solid var(--card-border)',
            color: 'var(--text-muted)', textDecoration: 'none',
          }}>
            🗄 Archive
          </Link>
        </div>
      </div>

      {subTab === 'rm'   && <CallHistoryTable />}
      {subTab === 'user' && <CustomerView />}
      {subTab === 'day'  && <DayReportView />}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Bulk Upload', href: '/bulk' },
  { label: '+ New Call',  href: '/single' },
  { label: 'Call History', href: '/history' },
  { label: '📊 Usage',   href: '/usage' },
];

export default function CallsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0c1021', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky header + tab bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: '#0c1021',
          borderBottom: '1px solid var(--card-border)',
          padding: '16px 24px 0',
          flexShrink: 0,
        }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
              Call Analysis
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Upload a call recording to auto-generate reports, sheets, and stakeholder emails.
            </p>
          </div>

          <div className="tab-bar" style={{ display: 'flex', gap: 0 }}>
            {TABS.map(({ label, href }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="tab-btn"
                  style={{
                    padding: '10px 20px',
                    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                    color: active ? '#3b82f6' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400,
                    fontSize: 14,
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    display: 'inline-block',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Page content */}
        <main className="page-main" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>

      </div>
    </div>
  );
}

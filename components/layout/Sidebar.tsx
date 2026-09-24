'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href?: string;
  isSection?: boolean;
  isActive?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '#' },
  { label: 'User', isSection: true },
  { label: 'Profile', href: '#' },
  { label: 'KYC Approval', href: '#' },
  { label: 'Bonds', isSection: true },
  { label: 'Companies', href: '#' },
  { label: 'Sellers', href: '#' },
  { label: 'Deals', href: '#' },
  { label: 'Investments', href: '#' },
  { label: 'Task Management', isSection: true },
  { label: 'My Tasks', href: '#' },
  { label: 'RFQ Placement', href: '#' },
  { label: 'Pre-Sales', isSection: true },
  { label: 'Call Analysis', href: '/calls' },
  { label: 'Payment', isSection: true },
  { label: 'Bank Codes', href: '#' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        minHeight: '100vh',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--card-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo header */}
      <div
        style={{
          height: 'var(--topbar-h)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderBottom: '1px solid var(--card-border)',
          gap: 10,
        }}
      >
        {/* BondScanner radar SVG */}
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="13" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
          <circle cx="14" cy="14" r="9" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" />
          <circle cx="14" cy="14" r="5" stroke="white" strokeWidth="1.5" strokeOpacity="0.8" />
          <circle cx="14" cy="14" r="2" fill="white" />
          <line x1="14" y1="1" x2="14" y2="27" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
          <line x1="1" y1="14" x2="27" y2="14" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
        </svg>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>
          BondScanner
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navItems.map((item, idx) => {
          if (item.isSection) {
            return (
              <div
                key={idx}
                style={{
                  padding: '14px 20px 4px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'var(--text-dim)',
                }}
              >
                {item.label}
              </div>
            );
          }

          const isActive = item.href === '/calls' && pathname.startsWith('/calls');
          const isPlaceholder = item.href === '#';

          return (
            <Link
              key={idx}
              href={item.href ?? '#'}
              style={{
                display: 'block',
                padding: '8px 20px',
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#f1f5f9' : isPlaceholder ? 'var(--text-muted)' : 'var(--text-muted)',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.15s',
                cursor: isPlaceholder ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLAnchorElement).style.background = 'var(--sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom user area */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: '#253870',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            color: '#f1f5f9',
          }}
        >
          R
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500 }}>Radar</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>bondscanner.in</div>
        </div>
      </div>
    </aside>
  );
}

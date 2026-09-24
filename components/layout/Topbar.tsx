'use client';

export default function Topbar({ title = 'Call Analysis' }: { title?: string }) {
  return (
    <header
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--topbar-bg)',
        borderBottom: '1px solid var(--card-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>{title}</span>

      <div style={{ flex: 1 }} />

      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#253870',
          border: '2px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 600,
          color: '#f1f5f9',
          cursor: 'pointer',
        }}
      >
        R
      </div>
    </header>
  );
}

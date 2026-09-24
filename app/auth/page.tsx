'use client';

export default function AuthPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0c1021',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#131d35',
          border: '1px solid #1e3058',
          borderRadius: 14,
          padding: '40px 48px',
          width: 360,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.4" />
            <circle cx="14" cy="14" r="9" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.6" />
            <circle cx="14" cy="14" r="5" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.8" />
            <circle cx="14" cy="14" r="2" fill="#3b82f6" />
            <line x1="14" y1="1" x2="14" y2="27" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.3" />
            <line x1="1" y1="14" x2="27" y2="14" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.3" />
          </svg>
        </div>

        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
          BondScanner Radar
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#7e95b8' }}>
          Sign in to access Call Analysis
        </p>

        <a
          href="/calls"
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          Continue to Radar
        </a>

        <p style={{ marginTop: 20, fontSize: 12, color: '#4a6080' }}>
          Only @bondscanner.in accounts are permitted.
        </p>
      </div>
    </div>
  );
}

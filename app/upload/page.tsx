'use client';

import { useRef, useState } from 'react';

interface ImportResult {
  success: boolean;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  detectedColumns: { phone: string; name: string; userId: string };
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file.'); return; }
    setFile(f);
    setResult(null);
    setError('');
  }

  async function runImport() {
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/customers/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0c1021', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ maxWidth: 680, margin: '0 auto 32px' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Customer Data Import</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7e95b8' }}>
          Upload a CSV to map phone numbers to customer names &amp; user IDs. Existing records are updated; new ones are inserted.
        </p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Format guide */}
        <div style={{ background: '#131d35', border: '1px solid #1e3058', borderRadius: 10, padding: '16px 20px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#7e95b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Expected CSV format</p>
          <code style={{ display: 'block', background: '#0c1021', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#f1f5f9', lineHeight: 1.8 }}>
            user_id,name,phone<br />
            USR001,Rahul Mehta,9876543210<br />
            USR002,Priya Sharma,9123456789
          </code>
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#4a6080', lineHeight: 1.6 }}>
            Column names are auto-detected — <code style={{ color: '#7e95b8' }}>phone / mobile / contact</code> and <code style={{ color: '#7e95b8' }}>name / full_name / customer_name</code> are all recognised.
            Phone numbers with country code (+91 / 91) are normalised to 10 digits automatically.
            <br />
            <span style={{ color: '#4a6080' }}>
              <strong style={{ color: '#7e95b8' }}>Name is optional</strong> — rows with only a phone + user_id are imported fine. If a name already exists in the DB it won't be overwritten by a blank.
            </span>
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          style={{
            background: dragging ? '#1e3058' : '#131d35',
            border: `2px dashed ${dragging ? '#3b82f6' : '#1e3058'}`,
            borderRadius: 10, padding: '40px 24px',
            textAlign: 'center', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          {file ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#7e95b8' }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Drop your CSV here</div>
              <div style={{ fontSize: 12, color: '#7e95b8' }}>or click to browse</div>
            </>
          )}
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Import button */}
        {file && !result && (
          <button
            onClick={runImport}
            disabled={loading}
            style={{
              padding: '12px 24px', background: loading ? '#253870' : '#3b82f6',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ Importing…' : '⬆ Import Customer Data'}
          </button>
        )}

        {/* Result */}
        {result && (
          <div style={{ background: '#131d35', border: '1px solid #22c55e30', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', marginBottom: 16 }}>✓ Import Complete</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total Rows',  value: result.total,    color: '#f1f5f9' },
                { label: 'Inserted',    value: result.inserted,  color: '#22c55e' },
                { label: 'Updated',     value: result.updated,   color: '#3b82f6' },
                { label: 'Skipped',     value: result.skipped,   color: '#f59e0b' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#0c1021', borderRadius: 8, padding: '12px 14px', border: '1px solid #1e3058', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#4a6080', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: '#7e95b8', borderTop: '1px solid #1e3058', paddingTop: 12 }}>
              <span style={{ marginRight: 16 }}>📌 Phone column: <strong style={{ color: '#f1f5f9' }}>{result.detectedColumns.phone}</strong></span>
              <span style={{ marginRight: 16 }}>📌 Name column: <strong style={{ color: '#f1f5f9' }}>{result.detectedColumns.name}</strong></span>
              <span>📌 User ID column: <strong style={{ color: '#f1f5f9' }}>{result.detectedColumns.userId}</strong></span>
            </div>

            <button
              onClick={() => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; }}
              style={{ marginTop: 14, padding: '8px 18px', background: '#1e3058', color: '#f1f5f9', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Upload Another File
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

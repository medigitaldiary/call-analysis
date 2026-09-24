'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  onDriveUrl: (url: string) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['.mp3', '.mp4', '.m4a', '.wav', '.webm'];
const MAX_SIZE_GB = 2;

export default function UploadZone({ onFileSelect, onDriveUrl, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError('');
    if (file.size > MAX_SIZE_GB * 1024 * 1024 * 1024) {
      setError('File exceeds 2GB limit');
      return;
    }
    setSelectedFile(file);
    setDriveUrl('');
    onFileSelect(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function loadDriveUrl() {
    if (!driveUrl.trim()) return;
    setSelectedFile(null);
    onDriveUrl(driveUrl.trim());
  }

  const formatSize = (bytes: number) => {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Drop zone */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isDragging ? '#3b82f6' : selectedFile ? '#22c55e' : '#1e3058'}`,
          borderRadius: 10,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isDragging ? 'rgba(59,130,246,0.05)' : selectedFile ? 'rgba(34,197,94,0.04)' : 'transparent',
          transition: 'all 0.2s',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={onInputChange}
          disabled={disabled}
        />

        {selectedFile ? (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ color: '#22c55e', fontWeight: 600, fontSize: 14 }}>{selectedFile.name}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              {formatSize(selectedFile.size)}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              Click to change file
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
            <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
              Drop your recording here
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
              MP3, MP4, M4A, WAV, WebM &nbsp;·&nbsp; Max 2GB
            </div>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                background: '#1b2748',
                border: '1px solid var(--card-border)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              Browse files
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--card-border)' }} />
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--card-border)' }} />
      </div>

      {/* Drive URL input */}
      <div className="drive-row" style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          placeholder="Google Drive recording URL..."
          value={driveUrl}
          onChange={(e) => { setDriveUrl(e.target.value); setSelectedFile(null); }}
          disabled={disabled}
          style={{
            flex: 1,
            background: '#131d35',
            border: '1px solid var(--card-border)',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 13,
            color: '#f1f5f9',
            outline: 'none',
          }}
        />
        <button
          onClick={loadDriveUrl}
          disabled={!driveUrl.trim() || disabled}
          style={{
            background: driveUrl.trim() ? '#3b82f6' : '#1b2748',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            cursor: driveUrl.trim() && !disabled ? 'pointer' : 'not-allowed',
            opacity: driveUrl.trim() && !disabled ? 1 : 0.5,
          }}
        >
          Load
        </button>
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: 12, padding: '6px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

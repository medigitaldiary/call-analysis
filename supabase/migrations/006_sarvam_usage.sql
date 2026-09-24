-- Track Sarvam AI transcription duration per call
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS sarvam_duration_sec INT DEFAULT 0;

-- Track aggregated Sarvam duration per bulk session
ALTER TABLE bulk_sessions
  ADD COLUMN IF NOT EXISTS sarvam_duration_sec INT DEFAULT 0;

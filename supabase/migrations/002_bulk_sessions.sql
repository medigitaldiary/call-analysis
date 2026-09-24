-- Run after 001_init.sql
CREATE TABLE IF NOT EXISTS bulk_sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  rm_name          TEXT NOT NULL,
  session_date     DATE NOT NULL,
  folder_url       TEXT NOT NULL,
  total_files      INT DEFAULT 0,
  processed_files  INT DEFAULT 0,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','generating','ready','error')),
  error_msg        TEXT,
  rm_report        JSONB,
  doc_url          TEXT,
  sheet_url        TEXT,
  stakeholders     TEXT[]
);

ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES bulk_sessions(id);

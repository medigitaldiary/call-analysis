-- Run this in your Neon SQL editor (https://console.neon.tech)

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  prospect_name TEXT NOT NULL,
  company       TEXT NOT NULL,
  rep_name      TEXT NOT NULL,
  call_type     TEXT,
  recording_url TEXT,
  drive_url     TEXT,
  duration_sec  INT,
  stakeholders  TEXT[],          -- array of email addresses
  status        TEXT DEFAULT 'uploaded'
                CHECK (status IN ('uploaded','transcribing','analysing',
                                  'generating','ready','sent','error')),
  error_msg     TEXT
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id           UUID REFERENCES calls(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  transcript        TEXT,
  -- AI-extracted metadata
  date_extracted    TEXT,
  time_extracted    TEXT,
  duration          TEXT,
  phone             TEXT,
  customer_name     TEXT,
  outcome           TEXT,
  call_quality      TEXT,
  agent_performance TEXT,
  summary           TEXT,
  sentiment         JSONB,         -- { overall, agent, customer }
  speaker_breakdown JSONB,         -- { description, language, agent_percentage, customer_percentage }
  keywords          JSONB,         -- string[]
  topics            JSONB,         -- string[]
  compliance        TEXT,
  action_items      JSONB,         -- array of { priority, task, owner, deadline }
  -- storage
  doc_url           TEXT,          -- Vercel Blob URL for .docx
  sheet_url         TEXT,          -- Vercel Blob URL for .xlsx
  email_sent_at     TIMESTAMPTZ,
  email_recipients  TEXT[]
);

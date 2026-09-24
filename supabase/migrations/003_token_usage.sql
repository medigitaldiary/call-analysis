-- Track Claude token usage per call report
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS input_tokens  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INT DEFAULT 0;

-- Track aggregated token usage per bulk session
ALTER TABLE bulk_sessions
  ADD COLUMN IF NOT EXISTS input_tokens  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INT DEFAULT 0;

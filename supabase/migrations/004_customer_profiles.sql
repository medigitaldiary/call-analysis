CREATE TABLE IF NOT EXISTS customer_profiles (
  phone       VARCHAR(15)  PRIMARY KEY,
  user_id     TEXT,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone ON customer_profiles (phone);

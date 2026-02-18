CREATE TABLE IF NOT EXISTS user_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  CHECK (reporter_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status_created
ON user_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_target_created
ON user_reports (target_user_id, created_at DESC);

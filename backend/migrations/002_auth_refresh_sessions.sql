CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user
ON auth_refresh_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_expires
ON auth_refresh_sessions (expires_at);

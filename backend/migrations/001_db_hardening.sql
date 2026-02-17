-- Clean up duplicate matches by keeping the earliest row for each unordered pair.
DELETE FROM matches m
USING matches d
WHERE m.id <> d.id
  AND LEAST(m.user_a_id, m.user_b_id) = LEAST(d.user_a_id, d.user_b_id)
  AND GREATEST(m.user_a_id, m.user_b_id) = GREATEST(d.user_a_id, d.user_b_id)
  AND (
    m.created_at > d.created_at
    OR (m.created_at = d.created_at AND m.id > d.id)
  );

-- Prevent duplicate matches regardless of user order.
CREATE UNIQUE INDEX IF NOT EXISTS ux_matches_pair_unordered
ON matches (LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id));

-- Keep only the latest pending offer per session.
WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC, id DESC) AS rn
  FROM meetup_offers
  WHERE status = 'pending'
)
UPDATE meetup_offers mo
SET status = 'expired'
FROM ranked_pending rp
WHERE mo.id = rp.id
  AND rp.rn > 1;

-- Ensure only one pending offer is active per availability session.
CREATE UNIQUE INDEX IF NOT EXISTS ux_meetup_offers_pending_session
ON meetup_offers (session_id)
WHERE status = 'pending';

-- Speed common query paths under load.
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
ON auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires
ON auth_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetup_offers_session_created
ON meetup_offers (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_submissions_queue
ON verification_submissions (status, submitted_at DESC);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

UPDATE users
SET plan_tier = CASE
  WHEN is_admin = TRUE THEN 'plus'
  ELSE 'free'
END
WHERE plan_tier IS NULL
   OR plan_tier NOT IN ('free', 'plus');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_plan_tier_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_plan_tier_check
    CHECK (plan_tier IN ('free', 'plus'));
  END IF;
END $$;

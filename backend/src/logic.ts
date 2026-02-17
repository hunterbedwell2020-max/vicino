import { pool } from "./db.js";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createAccessToken, createRefreshToken, verifyAccessToken } from "./authToken.js";
import {
  COORDINATION_WINDOW_MINUTES,
  LOCATION_EXPIRY_MINUTES,
  MAX_MESSAGES_PER_USER,
  MAX_MESSAGES_TOTAL,
  OFFER_RESPONSE_SECONDS
} from "./store.js";
import type { MeetDecision, SwipeDecision } from "./types.js";

const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date();
const REFRESH_SESSION_DAYS = Math.max(7, Number(process.env.JWT_REFRESH_DAYS ?? 30));

type DbMatch = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
  coordination_ends_at: string | null;
};

type DbSession = {
  id: string;
  initiator_user_id: string;
  created_at: string;
  active: boolean;
};

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, derived);
}

function mapUser(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: row.last_name ? String(row.last_name) : "",
    username: row.username ? String(row.username) : null,
    isAdmin: Boolean(row.is_admin),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    isBanned: Boolean(row.is_banned),
    age: Number(row.age),
    gender: String(row.gender),
    preferredGender: row.preferred_gender ? String(row.preferred_gender) : null,
    likes: row.likes ? String(row.likes) : null,
    dislikes: row.dislikes ? String(row.dislikes) : null,
    bio: String(row.bio ?? ""),
    profilePhotoUrl: row.profile_photo_url ? String(row.profile_photo_url) : null,
    verified: Boolean(row.verified),
    photos: Array.isArray(row.photos) ? row.photos : [],
    hobbies: Array.isArray(row.hobbies) ? row.hobbies : [],
    promptOne: row.prompt_one ? String(row.prompt_one) : null,
    promptTwo: row.prompt_two ? String(row.prompt_two) : null,
    promptThree: row.prompt_three ? String(row.prompt_three) : null,
    maxDistanceMiles: Number(row.max_distance_miles ?? 25)
  };
}

function ensureNotBanned(row: Record<string, unknown>) {
  if (Boolean(row.is_banned)) {
    throw new Error("Account is suspended. Contact support for review.");
  }
}

function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapVerification(row: Record<string, unknown>) {
  return {
    userId: String(row.id),
    verified: Boolean(row.verified),
    status: row.verification_status as "unsubmitted" | "pending" | "approved" | "rejected",
    submittedAt: row.verification_submitted_at ? String(row.verification_submitted_at) : null,
    reviewedAt: row.verification_reviewed_at ? String(row.verification_reviewed_at) : null,
    reviewerNote: row.verification_reviewer_note ? String(row.verification_reviewer_note) : null
  };
}

async function logAdminAction(
  db: Queryable,
  input: {
    adminUserId: string;
    action: string;
    targetUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await db.query(
    `INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [
      id("audit"),
      input.adminUserId,
      input.action,
      input.targetUserId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

async function createAuthTokensForUser(user: Record<string, unknown>) {
  const sessionId = id("as");
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await pool.query(
    `INSERT INTO auth_refresh_sessions (id, user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)`,
    [sessionId, String(user.id), refreshTokenHash, REFRESH_SESSION_DAYS]
  );

  return {
    token: createAccessToken({
      userId: String(user.id),
      sessionId,
      isAdmin: Boolean(user.is_admin)
    }),
    refreshToken
  };
}

async function fetchSessionUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, is_admin, email, phone, is_banned, age, gender, preferred_gender, likes, dislikes,
            bio, profile_photo_url, verified, photos, hobbies, prompt_one, prompt_two, prompt_three, max_distance_miles,
            verification_status, verification_submitted_at, verification_reviewed_at, verification_reviewer_note
     FROM users
     WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) {
    throw new Error("User not found");
  }
  ensureNotBanned(rows[0]);
  return rows[0] as Record<string, unknown>;
}

async function getUser(userId: string) {
  const user = await getUserAny(userId);
  ensureNotBanned(user);
  if (!user.verified) {
    throw new Error("User must be ID verified");
  }
  if (Number(user.age) < 18) {
    throw new Error("User must be 18+");
  }
  return user;
}

async function getUserAny(userId: string) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, password_hash, is_admin, email, phone, is_banned, age, gender, preferred_gender, likes, dislikes, bio, profile_photo_url, verified, photos,
            hobbies, prompt_one, prompt_two, prompt_three,
            latitude, longitude, max_distance_miles,
            verification_status, verification_submitted_at,
            verification_reviewed_at, verification_reviewer_note
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

async function getMatchById(matchId: string): Promise<DbMatch> {
  const { rows } = await pool.query(
    `SELECT id, user_a_id, user_b_id, created_at, coordination_ends_at
     FROM matches
     WHERE id = $1`,
    [matchId]
  );
  const match = rows[0] as DbMatch | undefined;
  if (!match) {
    throw new Error("Match not found");
  }
  return match;
}

async function getActiveSession(sessionId: string): Promise<DbSession> {
  const { rows } = await pool.query(
    `SELECT id, initiator_user_id, created_at, active
     FROM availability_sessions
     WHERE id = $1 AND active = TRUE`,
    [sessionId]
  );
  const session = rows[0] as DbSession | undefined;
  if (!session) {
    throw new Error("Active availability session not found");
  }
  return session;
}

function requireMatchMember(match: DbMatch, userId: string) {
  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    throw new Error("User is not part of this match");
  }
}

async function getMessageCounts(matchId: string) {
  const { rows } = await pool.query(
    `SELECT sender_user_id, COUNT(*)::int AS count
     FROM messages
     WHERE match_id = $1
     GROUP BY sender_user_id`,
    [matchId]
  );

  const byUser: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byUser[row.sender_user_id] = Number(row.count);
    total += Number(row.count);
  }
  return { byUser, total };
}

function isPublicPlaceId(placeId: string) {
  return placeId.startsWith("poi_");
}

export async function listUsers() {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, is_admin, email, phone, is_banned, age, gender,
            preferred_gender, likes, dislikes, bio, profile_photo_url, verified, photos,
            hobbies, prompt_one, prompt_two, prompt_three,
            latitude, longitude, max_distance_miles
     FROM users
     ORDER BY id`
  );
  return rows.map(mapUser);
}

export async function registerAuthUser(input: {
  email: string;
  username: string;
  password: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  marketingConsent?: boolean;
  policyVersion: string;
}) {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error("Username must be 3-24 chars: letters, numbers, underscore.");
  }

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (!input.acceptedTerms || !input.acceptedPrivacy) {
    throw new Error("You must accept the Terms and Privacy Policy to create an account.");
  }

  const passwordHash = hashPassword(input.password);
  const userId = id("u");
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (
        id, first_name, last_name, username, password_hash, email, age, gender,
        terms_accepted_at, privacy_accepted_at, policy_version, marketing_consent,
        bio, verified, verification_status, photos, hobbies, max_distance_miles
      )
      VALUES ($1, $2, $3, $4, $5, $6, 18, 'other', NOW(), NOW(), $7, $8, '', FALSE, 'unsubmitted', '[]'::jsonb, ARRAY[]::text[], 25)
      RETURNING id, first_name, last_name, username, is_admin, email, phone, age, gender, preferred_gender, likes, dislikes,
                bio, verified, photos, hobbies, prompt_one, prompt_two, prompt_three, max_distance_miles, is_banned`,
      [
        userId,
        username,
        "",
        username,
        passwordHash,
        input.email.trim().toLowerCase(),
        input.policyVersion.trim(),
        Boolean(input.marketingConsent)
      ]
    );

    const tokens = await createAuthTokensForUser(rows[0] as Record<string, unknown>);
    return { user: mapUser(rows[0]), ...tokens };
  } catch (err) {
    const pgErr = err as { code?: string; detail?: string };
    if (pgErr.code === "23505") {
      throw new Error("Email or username is already in use.");
    }
    throw err;
  }
}

export async function loginAuthUser(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, password_hash, is_admin, email, phone, is_banned, age, gender, preferred_gender, likes, dislikes,
            bio, profile_photo_url, verified, photos, hobbies, prompt_one, prompt_two, prompt_three, max_distance_miles
     FROM users
     WHERE username = $1`,
    [normalized]
  );

  if (rows.length === 0) {
    throw new Error("Invalid username or password.");
  }
  const user = rows[0];
  ensureNotBanned(user);
  if (!user.password_hash || !verifyPassword(password, String(user.password_hash))) {
    throw new Error("Invalid username or password.");
  }

  const tokens = await createAuthTokensForUser(user as Record<string, unknown>);
  return { user: mapUser(user), ...tokens };
}

export async function getAuthSession(token: string) {
  const payload = verifyAccessToken(token);
  const sessionRes = await pool.query(
    `SELECT id
     FROM auth_refresh_sessions
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [payload.sid]
  );
  if (sessionRes.rowCount === 0) {
    throw new Error("Session expired. Please sign in again.");
  }
  const row = await fetchSessionUser(payload.sub);
  return {
    token,
    user: mapUser(row),
    verification: mapVerification(row)
  };
}

export async function assertAdminSession(token: string) {
  const session = await getAuthSession(token);
  if (!session.user.isAdmin) {
    throw new Error("Admin privileges required.");
  }
  return session;
}

export async function logoutAuthSession(token: string) {
  const payload = verifyAccessToken(token);
  await pool.query(
    `UPDATE auth_refresh_sessions
     SET revoked_at = NOW()
     WHERE id = $1`,
    [payload.sid]
  );
}

export async function refreshAuthSession(refreshToken: string) {
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const sessionRes = await pool.query(
    `SELECT id, user_id
     FROM auth_refresh_sessions
     WHERE refresh_token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [refreshTokenHash]
  );
  if (sessionRes.rowCount === 0) {
    throw new Error("Refresh token expired. Please sign in again.");
  }

  const session = sessionRes.rows[0];
  const user = await fetchSessionUser(String(session.user_id));

  const nextRefresh = createRefreshToken();
  const nextRefreshHash = hashRefreshToken(nextRefresh);
  await pool.query(
    `UPDATE auth_refresh_sessions
     SET refresh_token_hash = $2
     WHERE id = $1`,
    [session.id, nextRefreshHash]
  );

  const nextAccessToken = createAccessToken({
    userId: String(user.id),
    sessionId: String(session.id),
    isAdmin: Boolean(user.is_admin)
  });

  return {
    token: nextAccessToken,
    refreshToken: nextRefresh,
    user: mapUser(user),
    verification: mapVerification(user)
  };
}

export async function updateUserProfile(
  userId: string,
  updates: {
    firstName?: string;
    email?: string;
    phone?: string;
    age?: number;
    gender?: string;
    preferredGender?: string;
    likes?: string;
    dislikes?: string;
    bio?: string;
    profilePhotoUrl?: string;
    photos?: string[];
    hobbies?: string[];
    promptOne?: string;
    promptTwo?: string;
    promptThree?: string;
  }
) {
  await getUserAny(userId);

  const firstName = updates.firstName?.trim() || null;
  const email = updates.email?.trim().toLowerCase() || null;
  const phone = updates.phone?.trim() || null;
  const age = updates.age ?? null;
  if (age != null && age < 18) {
    throw new Error("User must be 18+");
  }
  const gender = updates.gender?.trim().toLowerCase() || null;
  const preferredGender = updates.preferredGender?.trim().toLowerCase() || null;
  const likes = updates.likes?.trim() || null;
  const dislikes = updates.dislikes?.trim() || null;
  const bio = updates.bio?.trim() || null;
  const profilePhotoUrl = updates.profilePhotoUrl?.trim() || null;
  const photos = updates.photos ?? null;
  const hobbies = updates.hobbies ?? null;
  const promptOne = updates.promptOne?.trim() || null;
  const promptTwo = updates.promptTwo?.trim() || null;
  const promptThree = updates.promptThree?.trim() || null;

  const { rows } = await pool.query(
    `UPDATE users
     SET first_name = COALESCE($2, first_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         age = COALESCE($5, age),
         gender = COALESCE($6, gender),
         preferred_gender = COALESCE($7, preferred_gender),
         likes = COALESCE($8, likes),
         dislikes = COALESCE($9, dislikes),
         bio = COALESCE($10, bio),
         profile_photo_url = COALESCE($11, profile_photo_url),
         photos = COALESCE($12::jsonb, photos),
         hobbies = COALESCE($13::text[], hobbies),
         prompt_one = COALESCE($14, prompt_one),
         prompt_two = COALESCE($15, prompt_two),
         prompt_three = COALESCE($16, prompt_three)
     WHERE id = $1
     RETURNING id,
               first_name AS "firstName",
               email,
               phone,
               age,
               gender,
               preferred_gender AS "preferredGender",
               likes,
               dislikes,
               bio,
               profile_photo_url AS "profilePhotoUrl",
               verified,
               photos,
               hobbies,
               prompt_one AS "promptOne",
               prompt_two AS "promptTwo",
               prompt_three AS "promptThree",
               max_distance_miles AS "maxDistanceMiles"`,
    [
      userId,
      firstName,
      email,
      phone,
      age,
      gender,
      preferredGender,
      likes,
      dislikes,
      bio,
      profilePhotoUrl,
      photos ? JSON.stringify(photos) : null,
      hobbies,
      promptOne,
      promptTwo,
      promptThree
    ]
  );

  return rows[0];
}

export async function listDiscoveryProfiles(userId: string) {
  const user = await getUser(userId);
  if (user.latitude == null || user.longitude == null) {
    throw new Error("Set user location before discovery");
  }
  if (!user.gender || !user.preferred_gender) {
    return [];
  }

  const { rows } = await pool.query(
    `SELECT
        u.id,
        u.first_name AS "firstName",
        u.age,
        u.gender,
        u.bio,
        u.verified,
        u.photos,
        ROUND((
          3959 * ACOS(
            LEAST(1, GREATEST(-1,
              COS(RADIANS($2)) * COS(RADIANS(u.latitude)) *
              COS(RADIANS(u.longitude) - RADIANS($3)) +
              SIN(RADIANS($2)) * SIN(RADIANS(u.latitude))
            ))
          )
        )::numeric, 2) AS "distanceMiles"
      FROM users u
      WHERE u.id <> $1
        AND u.verified = TRUE
        AND u.latitude IS NOT NULL
        AND u.longitude IS NOT NULL
        AND u.gender = $5
        AND u.preferred_gender = $6
        AND NOT EXISTS (
          SELECT 1 FROM swipes s
          WHERE s.from_user_id = $1 AND s.to_user_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM matches m
          WHERE (m.user_a_id = $1 AND m.user_b_id = u.id)
             OR (m.user_a_id = u.id AND m.user_b_id = $1)
        )
        AND (
          3959 * ACOS(
            LEAST(1, GREATEST(-1,
              COS(RADIANS($2)) * COS(RADIANS(u.latitude)) *
              COS(RADIANS(u.longitude) - RADIANS($3)) +
              SIN(RADIANS($2)) * SIN(RADIANS(u.latitude))
            ))
          )
        ) <= $4
      ORDER BY "distanceMiles" ASC, u.id ASC`,
    [
      userId,
      Number(user.latitude),
      Number(user.longitude),
      Number(user.max_distance_miles ?? 25),
      String(user.preferred_gender).toLowerCase(),
      String(user.gender).toLowerCase()
    ]
  );

  return rows;
}

export async function updateUserLocation(userId: string, latitude: number, longitude: number) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET latitude = $2,
         longitude = $3,
         last_location_at = NOW()
     WHERE id = $1
     RETURNING id, first_name AS "firstName", latitude, longitude, last_location_at AS "lastLocationAt"`,
    [userId, latitude, longitude]
  );
  return rows[0];
}

export async function updateUserDistancePreference(userId: string, maxDistanceMiles: number) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET max_distance_miles = $2
     WHERE id = $1
     RETURNING id, first_name AS "firstName", max_distance_miles AS "maxDistanceMiles"`,
    [userId, maxDistanceMiles]
  );
  return rows[0];
}

export async function assertVerifiedUser(userId: string) {
  await getUser(userId);
}

export async function getVerificationStatus(userId: string) {
  const user = await getUserAny(userId);
  return {
    userId: user.id,
    verified: Boolean(user.verified),
    status: user.verification_status as "unsubmitted" | "pending" | "approved" | "rejected",
    submittedAt: user.verification_submitted_at,
    reviewedAt: user.verification_reviewed_at,
    reviewerNote: user.verification_reviewer_note
  };
}

export async function submitVerification(
  userId: string,
  idDocumentUri: string,
  selfieUri: string,
  idDocumentType: string
) {
  await getUserAny(userId);
  const submissionId = id("verify");

  await pool.query(
    `INSERT INTO verification_submissions (
      id, user_id, id_document_uri, selfie_uri, id_document_type, status, submitted_at
    ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
    [submissionId, userId, idDocumentUri, selfieUri, idDocumentType]
  );

  await pool.query(
    `UPDATE users
     SET verified = FALSE,
         verification_status = 'pending',
         verification_submitted_at = NOW(),
         verification_reviewed_at = NULL,
         verification_reviewer_note = NULL
     WHERE id = $1`,
    [userId]
  );

  return {
    submissionId,
    userId,
    status: "pending" as const
  };
}

export async function listVerificationQueue(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
  options?: { limit?: number; offset?: number }
) {
  const limit = Math.max(1, Math.min(Number(options?.limit ?? 50), 200));
  const offset = Math.max(0, Number(options?.offset ?? 0));
  const params: unknown[] = [];
  let whereClause = "";
  if (status !== "all") {
    params.push(status);
    whereClause = `WHERE vs.status = $1`;
  }
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const { rows } = await pool.query(
    `SELECT
      vs.id,
      vs.user_id AS "userId",
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.age,
      u.gender,
      vs.id_document_uri AS "idDocumentUri",
      vs.selfie_uri AS "selfieUri",
      vs.id_document_type AS "idDocumentType",
      vs.status,
      u.is_banned AS "isBanned",
      vs.submitted_at AS "submittedAt",
      vs.reviewer_id AS "reviewerId",
      vs.reviewer_note AS "reviewerNote",
      vs.reviewed_at AS "reviewedAt"
     FROM verification_submissions vs
     JOIN users u ON u.id = vs.user_id
     ${whereClause}
     ORDER BY vs.submitted_at DESC
     LIMIT ${limitParam}
     OFFSET ${offsetParam}`,
    params
  );

  return rows;
}

export async function reviewVerificationSubmission(
  submissionId: string,
  decision: "approved" | "rejected",
  reviewerId: string,
  reviewerNote?: string
) {
  const client = await pool.connect();
  let userId = "";
  try {
    await client.query("BEGIN");
    const submissionRes = await client.query(
      `SELECT id, user_id
       FROM verification_submissions
       WHERE id = $1
       FOR UPDATE`,
      [submissionId]
    );
    if (submissionRes.rowCount === 0) {
      throw new Error("Verification submission not found");
    }

    userId = String(submissionRes.rows[0].user_id);

    await client.query(
      `UPDATE verification_submissions
       SET status = $2,
           reviewer_id = $3,
           reviewer_note = $4,
           reviewed_at = NOW()
       WHERE id = $1`,
      [submissionId, decision, reviewerId, reviewerNote ?? null]
    );

    await client.query(
      `UPDATE users
       SET verified = $2,
           verification_status = $3,
           verification_reviewed_at = NOW(),
           verification_reviewer_note = $4
       WHERE id = $1`,
      [userId, decision === "approved", decision, reviewerNote ?? null]
    );

    await logAdminAction(client as unknown as Queryable, {
      adminUserId: reviewerId,
      action: "verification_review",
      targetUserId: userId,
      metadata: {
        submissionId,
        decision,
        reviewerNote: reviewerNote ?? null
      }
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    submissionId,
    userId,
    decision
  };
}

export async function banUserByAdmin(adminUserId: string, targetUserId: string, reason?: string) {
  if (adminUserId === targetUserId) {
    throw new Error("Admin cannot ban own account.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query(
      `SELECT id, is_banned
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [targetUserId]
    );
    if (target.rowCount === 0) {
      throw new Error("Target user not found.");
    }

    await client.query(
      `UPDATE users
       SET is_banned = TRUE,
           banned_reason = $2,
           banned_at = NOW()
       WHERE id = $1`,
      [targetUserId, reason?.trim() || "Admin moderation action"]
    );

    await client.query(
      `UPDATE auth_refresh_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [targetUserId]
    );

    await logAdminAction(client as unknown as Queryable, {
      adminUserId,
      action: "user_ban",
      targetUserId,
      metadata: {
        reason: reason?.trim() || null
      }
    });

    await client.query("COMMIT");
    return { ok: true as const, userId: targetUserId, isBanned: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function unbanUserByAdmin(adminUserId: string, targetUserId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [targetUserId]
    );
    if (target.rowCount === 0) {
      throw new Error("Target user not found.");
    }

    await client.query(
      `UPDATE users
       SET is_banned = FALSE,
           banned_reason = NULL,
           banned_at = NULL
       WHERE id = $1`,
      [targetUserId]
    );

    await logAdminAction(client as unknown as Queryable, {
      adminUserId,
      action: "user_unban",
      targetUserId,
      metadata: {}
    });

    await client.query("COMMIT");
    return { ok: true as const, userId: targetUserId, isBanned: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMatches(userId?: string, options?: { limit?: number; offset?: number }) {
  const limit = Math.max(1, Math.min(Number(options?.limit ?? 50), 200));
  const offset = Math.max(0, Number(options?.offset ?? 0));
  const params: unknown[] = [];
  let whereClause = "";
  if (userId) {
    params.push(userId);
    whereClause = `WHERE user_a_id = $1 OR user_b_id = $1`;
  }
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;
  const { rows } = await pool.query(
    `SELECT id, user_a_id, user_b_id, created_at, coordination_ends_at
     FROM matches
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limitParam}
     OFFSET ${offsetParam}`,
    params
  );

  const out = [] as Array<Record<string, unknown>>;
  for (const match of rows as DbMatch[]) {
    const counts = await getMessageCounts(match.id);
    const decisionsRes = await pool.query(
      `SELECT user_id, decision
       FROM meet_decisions
       WHERE match_id = $1`,
      [match.id]
    );

    const meetDecisionByUser: Record<string, string> = {};
    for (const row of decisionsRes.rows) {
      meetDecisionByUser[row.user_id] = row.decision;
    }

    out.push({
      id: match.id,
      userAId: match.user_a_id,
      userBId: match.user_b_id,
      createdAt: match.created_at,
      coordinationEndsAt: match.coordination_ends_at,
      messagesByUser: counts.byUser,
      totalMessages: counts.total,
      meetDecisionByUser
    });
  }

  return out;
}

export async function listOffers() {
  const { rows } = await pool.query(
    `SELECT id, session_id AS "sessionId", initiator_user_id AS "initiatorUserId",
            recipient_user_id AS "recipientUserId", place_id AS "placeId",
            place_label AS "placeLabel", created_at AS "createdAt",
            respond_by AS "respondBy", location_expires_at AS "locationExpiresAt", status
     FROM meetup_offers
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function listMessages(matchId: string, options?: { limit?: number; before?: string | null }) {
  await getMatchById(matchId);
  const limit = Math.max(1, Math.min(Number(options?.limit ?? 100), 300));
  const before = options?.before ? new Date(options.before) : null;
  const beforeIso =
    before && !Number.isNaN(before.getTime()) ? before.toISOString() : null;

  const { rows } = await pool.query(
    `SELECT id, match_id AS "matchId", sender_user_id AS "senderUserId", body, created_at AS "createdAt"
     FROM messages
     WHERE match_id = $1
       AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
     ORDER BY created_at DESC
     LIMIT $3`,
    [matchId, beforeIso, limit]
  );
  return [...rows].reverse();
}

export async function swipe(fromUserId: string, toUserId: string, decision: SwipeDecision) {
  await getUser(fromUserId);
  await getUser(toUserId);

  if (fromUserId === toUserId) {
    throw new Error("Cannot swipe on self");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pairKey = [fromUserId, toUserId].sort().join(":");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [pairKey]);

    await client.query(
      `INSERT INTO swipes (from_user_id, to_user_id, decision, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (from_user_id, to_user_id)
       DO UPDATE SET decision = EXCLUDED.decision, created_at = NOW()`,
      [fromUserId, toUserId, decision]
    );

    if (decision === "left") {
      await client.query("COMMIT");
      return { matched: false };
    }

    const reciprocal = await client.query(
      `SELECT 1
       FROM swipes
       WHERE from_user_id = $1 AND to_user_id = $2 AND decision = 'right'`,
      [toUserId, fromUserId]
    );

    if (reciprocal.rowCount === 0) {
      await client.query("COMMIT");
      return { matched: false };
    }

    const existing = await client.query(
      `SELECT id, user_a_id, user_b_id, created_at, coordination_ends_at
       FROM matches
       WHERE (user_a_id = $1 AND user_b_id = $2)
          OR (user_a_id = $2 AND user_b_id = $1)
       LIMIT 1`,
      [fromUserId, toUserId]
    );

    if (existing.rowCount && existing.rows[0]) {
      await client.query("COMMIT");
      const row = existing.rows[0];
      return {
        matched: true,
        match: {
          id: row.id,
          userAId: row.user_a_id,
          userBId: row.user_b_id,
          createdAt: row.created_at,
          coordinationEndsAt: row.coordination_ends_at
        }
      };
    }

    const matchId = id("match");
    const inserted = await client.query(
      `INSERT INTO matches (id, user_a_id, user_b_id, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, user_a_id, user_b_id, created_at, coordination_ends_at`,
      [matchId, fromUserId, toUserId]
    );
    await client.query("COMMIT");

    const row = inserted.rows[0];
    return {
      matched: true,
      match: {
        id: row.id,
        userAId: row.user_a_id,
        userBId: row.user_b_id,
        createdAt: row.created_at,
        coordinationEndsAt: row.coordination_ends_at,
        messagesByUser: { [fromUserId]: 0, [toUserId]: 0 },
        totalMessages: 0,
        meetDecisionByUser: {}
      }
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function sendMessage(matchId: string, senderUserId: string, body: string) {
  if (!body.trim()) {
    throw new Error("Message body cannot be empty");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`match_messages:${matchId}`]);

    const matchRes = await client.query(
      `SELECT id, user_a_id, user_b_id, created_at, coordination_ends_at
       FROM matches
       WHERE id = $1
       FOR UPDATE`,
      [matchId]
    );

    const match = matchRes.rows[0] as DbMatch | undefined;
    if (!match) {
      throw new Error("Match not found");
    }
    requireMatchMember(match, senderUserId);

    const countsRes = await client.query(
      `SELECT sender_user_id, COUNT(*)::int AS count
       FROM messages
       WHERE match_id = $1
       GROUP BY sender_user_id`,
      [matchId]
    );

    const byUser: Record<string, number> = {};
    let total = 0;
    for (const row of countsRes.rows) {
      byUser[String(row.sender_user_id)] = Number(row.count);
      total += Number(row.count);
    }

    const senderCount = byUser[senderUserId] ?? 0;
    if (senderCount >= MAX_MESSAGES_PER_USER) {
      throw new Error("Per-person message limit reached");
    }
    if (total >= MAX_MESSAGES_TOTAL) {
      throw new Error("Chat message cap reached");
    }

    const msgId = id("msg");
    const inserted = await client.query(
      `INSERT INTO messages (id, match_id, sender_user_id, body, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, match_id, sender_user_id, body, created_at`,
      [msgId, matchId, senderUserId, body]
    );

    await client.query("COMMIT");

    const newSenderCount = senderCount + 1;
    const newTotal = total + 1;

    return {
      message: {
        id: inserted.rows[0].id,
        matchId: inserted.rows[0].match_id,
        senderUserId: inserted.rows[0].sender_user_id,
        body: inserted.rows[0].body,
        createdAt: inserted.rows[0].created_at
      },
      remainingForSender: MAX_MESSAGES_PER_USER - newSenderCount,
      remainingTotal: MAX_MESSAGES_TOTAL - newTotal,
      needsMeetDecision: newTotal >= MAX_MESSAGES_TOTAL
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setMeetDecision(matchId: string, userId: string, decision: MeetDecision) {
  const match = await getMatchById(matchId);
  requireMatchMember(match, userId);

  await pool.query(
    `INSERT INTO meet_decisions (match_id, user_id, decision, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (match_id, user_id)
     DO UPDATE SET decision = EXCLUDED.decision, created_at = NOW()`,
    [matchId, userId, decision]
  );

  const { rows } = await pool.query(
    `SELECT user_id, decision
     FROM meet_decisions
     WHERE match_id = $1`,
    [matchId]
  );

  const decisions: Record<string, string> = {};
  for (const row of rows) {
    decisions[row.user_id] = row.decision;
  }

  return {
    bothYes:
      decisions[match.user_a_id] === "yes" && decisions[match.user_b_id] === "yes",
    decisions
  };
}

export async function startAvailability(initiatorUserId: string) {
  await getUser(initiatorUserId);

  const eligible = await pool.query(
    `SELECT
       m.id AS match_id,
       CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END AS candidate_user_id
     FROM matches m
     LEFT JOIN meet_decisions d1 ON d1.match_id = m.id AND d1.user_id = m.user_a_id
     LEFT JOIN meet_decisions d2 ON d2.match_id = m.id AND d2.user_id = m.user_b_id
     WHERE (m.user_a_id = $1 OR m.user_b_id = $1)
       AND d1.decision = 'yes'
       AND d2.decision = 'yes'`,
    [initiatorUserId]
  );

  if (eligible.rowCount === 0) {
    throw new Error("No eligible matches where both users selected yes");
  }

  await pool.query(
    `UPDATE availability_sessions
     SET active = FALSE
     WHERE initiator_user_id = $1 AND active = TRUE`,
    [initiatorUserId]
  );

  const sessionId = id("session");
  const sessionRes = await pool.query(
    `INSERT INTO availability_sessions (id, initiator_user_id, created_at, active)
     VALUES ($1, $2, NOW(), TRUE)
     RETURNING id, initiator_user_id, created_at, active`,
    [sessionId, initiatorUserId]
  );

  for (const row of eligible.rows) {
    await pool.query(
      `INSERT INTO session_candidates (session_id, match_id, candidate_user_id, response, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       ON CONFLICT (session_id, candidate_user_id)
       DO UPDATE SET match_id = EXCLUDED.match_id, response = 'pending', updated_at = NOW()`,
      [sessionId, row.match_id, row.candidate_user_id]
    );
  }

  return {
    id: sessionRes.rows[0].id,
    initiatorUserId: sessionRes.rows[0].initiator_user_id,
    createdAt: sessionRes.rows[0].created_at,
    active: sessionRes.rows[0].active
  };
}

export async function listInterestedCandidates(sessionId: string) {
  await getActiveSession(sessionId);

  const { rows } = await pool.query(
    `SELECT
      sc.match_id AS "matchId",
      sc.candidate_user_id AS "candidateUserId",
      sc.response,
      u.first_name AS "firstName",
      u.age,
      u.gender,
      u.bio,
      u.verified,
      u.photos
     FROM session_candidates sc
     JOIN users u ON u.id = sc.candidate_user_id
     WHERE sc.session_id = $1
     ORDER BY sc.updated_at DESC`,
    [sessionId]
  );

  return rows;
}

export async function respondAvailabilityInterest(
  sessionId: string,
  userId: string,
  response: "yes" | "no"
) {
  await getActiveSession(sessionId);

  const updated = await pool.query(
    `UPDATE session_candidates
     SET response = $3,
         updated_at = NOW()
     WHERE session_id = $1 AND candidate_user_id = $2
     RETURNING session_id AS "sessionId", candidate_user_id AS "candidateUserId", response`,
    [sessionId, userId, response]
  );

  if (updated.rowCount === 0) {
    throw new Error("Candidate is not part of this session");
  }

  return updated.rows[0];
}

export async function getAvailabilityState(sessionId: string) {
  const session = await getActiveSession(sessionId);
  const candidates = await listInterestedCandidates(sessionId);

  const offersRes = await pool.query(
    `SELECT id, session_id AS "sessionId", initiator_user_id AS "initiatorUserId",
            recipient_user_id AS "recipientUserId", place_id AS "placeId",
            place_label AS "placeLabel", created_at AS "createdAt",
            respond_by AS "respondBy", location_expires_at AS "locationExpiresAt", status
     FROM meetup_offers
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId]
  );

  return {
    session: {
      id: session.id,
      initiatorUserId: session.initiator_user_id,
      createdAt: session.created_at,
      active: session.active
    },
    candidates,
    latestOffer: offersRes.rows[0] ?? null
  };
}

export async function closeAvailability(sessionId: string, initiatorUserId: string) {
  const session = await getActiveSession(sessionId);
  if (session.initiator_user_id !== initiatorUserId) {
    throw new Error("Only session initiator can close this session");
  }

  await pool.query(
    `UPDATE availability_sessions
     SET active = FALSE
     WHERE id = $1`,
    [sessionId]
  );

  return { ok: true };
}

export async function createMeetupOffer(
  sessionId: string,
  initiatorUserId: string,
  recipientUserId: string,
  placeId: string,
  placeLabel: string
) {
  if (!isPublicPlaceId(placeId)) {
    throw new Error("Location must be a public mapped place");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`offer_session:${sessionId}`]);

    const sessionRes = await client.query(
      `SELECT id, initiator_user_id, active
       FROM availability_sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId]
    );
    if (sessionRes.rowCount === 0 || !sessionRes.rows[0]?.active) {
      throw new Error("Active availability session not found");
    }
    const session = sessionRes.rows[0];
    if (session.initiator_user_id !== initiatorUserId) {
      throw new Error("Only session initiator can create offers");
    }

    const candidate = await client.query(
      `SELECT response
       FROM session_candidates
       WHERE session_id = $1 AND candidate_user_id = $2
       FOR UPDATE`,
      [sessionId, recipientUserId]
    );

    if (candidate.rowCount === 0) {
      throw new Error("Recipient is not part of this availability session");
    }

    if (candidate.rows[0].response !== "yes") {
      throw new Error("Recipient has not opted in to meeting for this session");
    }

    await client.query(
      `UPDATE meetup_offers
       SET status = 'expired'
       WHERE session_id = $1 AND status = 'pending'`,
      [sessionId]
    );

    const createdAt = now();
    const respondBy = new Date(createdAt.getTime() + OFFER_RESPONSE_SECONDS * 1000);
    const locationExpiresAt = new Date(createdAt.getTime() + LOCATION_EXPIRY_MINUTES * 60 * 1000);

    const offerId = id("offer");
    const { rows } = await client.query(
      `INSERT INTO meetup_offers (
        id, session_id, initiator_user_id, recipient_user_id,
        place_id, place_label, created_at, respond_by, location_expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING id, session_id, initiator_user_id, recipient_user_id,
                place_id, place_label, created_at, respond_by, location_expires_at, status`,
      [
        offerId,
        sessionId,
        initiatorUserId,
        recipientUserId,
        placeId,
        placeLabel,
        createdAt,
        respondBy,
        locationExpiresAt
      ]
    );

    await client.query("COMMIT");

    const row = rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      initiatorUserId: row.initiator_user_id,
      recipientUserId: row.recipient_user_id,
      placeId: row.place_id,
      placeLabel: row.place_label,
      createdAt: row.created_at,
      respondBy: row.respond_by,
      locationExpiresAt: row.location_expires_at,
      status: row.status
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function respondToOffer(offerId: string, recipientUserId: string, accept: boolean) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`offer:${offerId}`]);

    const offerRes = await client.query(
      `SELECT id, session_id, initiator_user_id, recipient_user_id,
              place_id, place_label, created_at, respond_by, location_expires_at, status
       FROM meetup_offers
       WHERE id = $1
       FOR UPDATE`,
      [offerId]
    );

    if (offerRes.rowCount === 0) {
      throw new Error("Offer not found");
    }

    const offer = offerRes.rows[0];

    if (offer.recipient_user_id !== recipientUserId) {
      throw new Error("Only selected recipient can respond");
    }

    const rightNow = now();
    if (offer.status !== "pending") {
      throw new Error("Offer is no longer pending");
    }

    if (rightNow > new Date(offer.respond_by)) {
      await client.query(`UPDATE meetup_offers SET status = 'expired' WHERE id = $1`, [offerId]);
      throw new Error("Offer response window expired");
    }

    if (!accept) {
      await client.query(`UPDATE meetup_offers SET status = 'declined' WHERE id = $1`, [offerId]);
      await client.query("COMMIT");
      return {
        offer: {
          id: offer.id,
          sessionId: offer.session_id,
          initiatorUserId: offer.initiator_user_id,
          recipientUserId: offer.recipient_user_id,
          placeId: offer.place_id,
          placeLabel: offer.place_label,
          createdAt: offer.created_at,
          respondBy: offer.respond_by,
          locationExpiresAt: offer.location_expires_at,
          status: "declined"
        },
        coordinationEndsAt: null
      };
    }

    await client.query(`UPDATE meetup_offers SET status = 'accepted' WHERE id = $1`, [offerId]);

    const coordinationEndsAt = new Date(
      rightNow.getTime() + COORDINATION_WINDOW_MINUTES * 60 * 1000
    );

    await client.query(
      `UPDATE matches
       SET coordination_ends_at = $1
       WHERE (user_a_id = $2 AND user_b_id = $3)
          OR (user_a_id = $3 AND user_b_id = $2)`,
      [coordinationEndsAt, offer.initiator_user_id, offer.recipient_user_id]
    );
    await client.query("COMMIT");

    return {
      offer: {
        id: offer.id,
        sessionId: offer.session_id,
        initiatorUserId: offer.initiator_user_id,
        recipientUserId: offer.recipient_user_id,
        placeId: offer.place_id,
        placeLabel: offer.place_label,
        createdAt: offer.created_at,
        respondBy: offer.respond_by,
        locationExpiresAt: offer.location_expires_at,
        status: "accepted"
      },
      coordinationEndsAt
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function expireLocationIfNeeded(offerId: string) {
  const client = await pool.connect();
  let offer: Record<string, unknown>;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, session_id, initiator_user_id, recipient_user_id,
              place_id, place_label, created_at, respond_by, location_expires_at, status
       FROM meetup_offers
       WHERE id = $1
       FOR UPDATE`,
      [offerId]
    );

    if (!rows[0]) {
      throw new Error("Offer not found");
    }

    offer = rows[0];

    if (offer.status === "accepted" && now() > new Date(String(offer.location_expires_at))) {
      await client.query(
        `UPDATE meetup_offers SET status = 'location_expired' WHERE id = $1`,
        [offerId]
      );
      offer.status = "location_expired";
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    id: String(offer.id),
    sessionId: String(offer.session_id),
    initiatorUserId: String(offer.initiator_user_id),
    recipientUserId: String(offer.recipient_user_id),
    placeId: String(offer.place_id),
    placeLabel: String(offer.place_label),
    createdAt: String(offer.created_at),
    respondBy: String(offer.respond_by),
    locationExpiresAt: String(offer.location_expires_at),
    status: String(offer.status)
  };
}

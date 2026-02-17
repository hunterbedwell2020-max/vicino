import { Pool } from "pg";
import { randomBytes, scryptSync } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (process.env.RAILWAY_SERVICE_ID && (!databaseUrl || databaseUrl.length === 0)) {
  throw new Error("DATABASE_URL is missing or empty in Railway service variables.");
}
const connectionString =
  databaseUrl && databaseUrl.length > 0
    ? databaseUrl
    : "postgresql://postgres:postgres@localhost:5432/vicino";

export const pool = new Pool({ connectionString });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "hunterbedwell";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Teton7650!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "hunterbedwell@vicino.app";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const seedUsers = [
  {
    id: "u1",
    first_name: "Alex",
    last_name: "Stone",
    email: "alex@example.com",
    phone: "+15555550101",
    age: 28,
    gender: "male",
    preferred_gender: "female",
    likes: "Coffee shops, live music, easy hikes.",
    dislikes: "Rudeness, flakiness.",
    bio: "Coffee, hiking, and live music.",
    hobbies: ["Coffee", "Hiking", "Live music"],
    prompt_one: "My ideal first meetup is coffee and a walk.",
    prompt_two: "I value clear communication and kindness.",
    verified: true,
    photos: ["https://picsum.photos/400/600?1"],
    latitude: 37.7858,
    longitude: -122.4064,
    max_distance_miles: 25
  },
  {
    id: "u2",
    first_name: "Sam",
    last_name: "Rivera",
    email: "sam@example.com",
    phone: "+15555550102",
    age: 26,
    gender: "female",
    preferred_gender: "male",
    likes: "Bookstores, tacos, weekend trips.",
    dislikes: "Loud bars.",
    bio: "Bookstores and late-night tacos.",
    hobbies: ["Bookstores", "Tacos", "City walks"],
    prompt_one: "A perfect Sunday is a farmers market and brunch.",
    prompt_two: "I am looking for someone intentional.",
    verified: true,
    photos: ["https://picsum.photos/400/600?2"],
    latitude: 37.7796,
    longitude: -122.4183,
    max_distance_miles: 25
  },
  {
    id: "u3",
    first_name: "Taylor",
    last_name: "Brooks",
    email: "taylor@example.com",
    phone: "+15555550103",
    age: 30,
    gender: "other",
    preferred_gender: "other",
    likes: "Art shows and city runs.",
    dislikes: "Being late.",
    bio: "Art galleries and weekend runs.",
    hobbies: ["Art galleries", "Running", "Photography"],
    prompt_one: "I am overly competitive about board games.",
    prompt_two: "Teach me your favorite recipe.",
    verified: true,
    photos: ["https://picsum.photos/400/600?3"],
    latitude: 37.7924,
    longitude: -122.3997,
    max_distance_miles: 25
  },
  {
    id: "u4",
    first_name: "Mia",
    last_name: "Lopez",
    email: "mia@example.com",
    phone: "+15555550104",
    age: 27,
    gender: "female",
    preferred_gender: "male",
    likes: "Sunset walks, tea, and weekend markets.",
    dislikes: "Last-minute cancellations.",
    bio: "Big on consistency and easy conversation.",
    hobbies: ["Farmers markets", "Tea", "Pilates"],
    prompt_one: "Best first meetup is a public place with good coffee.",
    prompt_two: "I appreciate people who follow through.",
    verified: true,
    photos: ["https://picsum.photos/400/600?4"],
    latitude: 37.7811,
    longitude: -122.4108,
    max_distance_miles: 25
  },
  {
    id: "u5",
    first_name: "Jordan",
    last_name: "Kim",
    email: "jordan@example.com",
    phone: "+15555550105",
    age: 29,
    gender: "other",
    preferred_gender: "other",
    likes: "Live comedy and late dinners.",
    dislikes: "Dishonesty.",
    bio: "Looking for intentional connection nearby.",
    hobbies: ["Comedy", "Cooking", "Travel"],
    prompt_one: "A fun meetup: food market then a short walk.",
    prompt_two: "Good communication matters most to me.",
    verified: true,
    photos: ["https://picsum.photos/400/600?5"],
    latitude: 37.7882,
    longitude: -122.4021,
    max_distance_miles: 25
  },
  {
    id: "u6",
    first_name: "Noah",
    last_name: "Grant",
    email: "noah@example.com",
    phone: "+15555550106",
    age: 31,
    gender: "male",
    preferred_gender: "female",
    likes: "Museums, running, and brunch.",
    dislikes: "Rushing conversations.",
    bio: "Easygoing and looking for real-world chemistry.",
    hobbies: ["Museums", "Running", "Brunch"],
    prompt_one: "Let's do coffee and a short walk in a busy area.",
    prompt_two: "I value kindness and consistency.",
    verified: true,
    photos: ["https://picsum.photos/400/600?6"],
    latitude: 37.7764,
    longitude: -122.4212,
    max_distance_miles: 25
  }
];

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      username TEXT NULL UNIQUE,
      password_hash TEXT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      email TEXT NULL UNIQUE,
      phone TEXT NULL UNIQUE,
      age INT NOT NULL,
      gender TEXT NOT NULL,
      preferred_gender TEXT NULL,
      likes TEXT NULL,
      dislikes TEXT NULL,
      bio TEXT NOT NULL,
      hobbies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      prompt_one TEXT NULL,
      prompt_two TEXT NULL,
      prompt_three TEXT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      verification_status TEXT NOT NULL DEFAULT 'unsubmitted' CHECK (
        verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected')
      ),
      verification_submitted_at TIMESTAMPTZ NULL,
      verification_reviewed_at TIMESTAMPTZ NULL,
      verification_reviewer_note TEXT NULL,
      photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      latitude DOUBLE PRECISION NULL,
      longitude DOUBLE PRECISION NULL,
      last_location_at TIMESTAMPTZ NULL,
      max_distance_miles DOUBLE PRECISION NOT NULL DEFAULT 25
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS max_distance_miles DOUBLE PRECISION NOT NULL DEFAULT 25;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_gender TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS likes TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS dislikes TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS hobbies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE users ADD COLUMN IF NOT EXISTS prompt_one TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS prompt_two TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS prompt_three TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unsubmitted';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewer_note TEXT NULL;

    CREATE TABLE IF NOT EXISTS swipes (
      from_user_id TEXT NOT NULL REFERENCES users(id),
      to_user_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK (decision IN ('left', 'right')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (from_user_id, to_user_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id),
      user_b_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      coordination_ends_at TIMESTAMPTZ NULL,
      CHECK (user_a_id <> user_b_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meet_decisions (
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK (decision IN ('yes', 'no')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS availability_sessions (
      id TEXT PRIMARY KEY,
      initiator_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS session_candidates (
      session_id TEXT NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      candidate_user_id TEXT NOT NULL REFERENCES users(id),
      response TEXT NOT NULL CHECK (response IN ('pending', 'yes', 'no')) DEFAULT 'pending',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, candidate_user_id)
    );

    CREATE TABLE IF NOT EXISTS meetup_offers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
      initiator_user_id TEXT NOT NULL REFERENCES users(id),
      recipient_user_id TEXT NOT NULL REFERENCES users(id),
      place_id TEXT NOT NULL,
      place_label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      respond_by TIMESTAMPTZ NOT NULL,
      location_expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'accepted', 'declined', 'expired', 'location_expired')
      )
    );

    CREATE TABLE IF NOT EXISTS verification_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id_document_uri TEXT NOT NULL,
      selfie_uri TEXT NOT NULL,
      id_document_type TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewer_id TEXT NULL,
      reviewer_note TEXT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_matches_pair ON matches (user_a_id, user_b_id);
    CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id);
    CREATE INDEX IF NOT EXISTS idx_meet_decisions_match ON meet_decisions (match_id);
    CREATE INDEX IF NOT EXISTS idx_session_candidates_session ON session_candidates (session_id);
    CREATE INDEX IF NOT EXISTS idx_users_geo ON users (latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_verification_submissions_status ON verification_submissions (status, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
  `);

  await pool.query(`
    UPDATE users
    SET verification_status = CASE
      WHEN verified = TRUE THEN 'approved'
      WHEN verification_status IS NULL OR verification_status = '' THEN 'unsubmitted'
      ELSE verification_status
    END
  `);

  for (const user of seedUsers) {
    await pool.query(
      `INSERT INTO users (
         id, first_name, last_name, email, phone, age, gender, preferred_gender, likes, dislikes,
         bio, hobbies, prompt_one, prompt_two, prompt_three, verified, photos,
         latitude, longitude, last_location_at, max_distance_miles
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13, $14, $15, $16, $17::jsonb, $18, $19, NOW(), $20)
       ON CONFLICT (id) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           age = EXCLUDED.age,
           gender = EXCLUDED.gender,
           preferred_gender = EXCLUDED.preferred_gender,
           likes = EXCLUDED.likes,
           dislikes = EXCLUDED.dislikes,
           bio = EXCLUDED.bio,
           hobbies = EXCLUDED.hobbies,
           prompt_one = EXCLUDED.prompt_one,
           prompt_two = EXCLUDED.prompt_two,
           prompt_three = EXCLUDED.prompt_three,
           verified = EXCLUDED.verified,
           verification_status = CASE WHEN EXCLUDED.verified = TRUE THEN 'approved' ELSE 'unsubmitted' END,
           verification_submitted_at = NULL,
           verification_reviewed_at = NULL,
           verification_reviewer_note = NULL,
           photos = EXCLUDED.photos,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           last_location_at = NOW(),
           max_distance_miles = EXCLUDED.max_distance_miles`,
      [
        user.id,
        user.first_name,
        user.last_name,
        user.email,
        user.phone,
        user.age,
        user.gender,
        user.preferred_gender,
        user.likes,
        user.dislikes,
        user.bio,
        user.hobbies,
        user.prompt_one,
        user.prompt_two,
        null,
        user.verified,
        JSON.stringify(user.photos),
        user.latitude,
        user.longitude,
        user.max_distance_miles
      ]
    );
  }

  const adminPasswordHash = hashPassword(ADMIN_PASSWORD);
  await pool.query(
    `INSERT INTO users (
      id, first_name, last_name, username, password_hash, is_admin, email,
      age, gender, preferred_gender, likes, dislikes, bio,
      hobbies, prompt_one, prompt_two, prompt_three, verified, verification_status,
      photos, latitude, longitude, last_location_at, max_distance_miles
    )
    VALUES (
      'u_admin', 'Hunter', 'Bedwell', $1, $2, TRUE, $3,
      30, 'male', 'female', 'Intentional dating', 'Dishonesty', 'Founder account.',
      ARRAY['Building Vicino']::text[], 'Building a safer way to meet nearby.',
      'Public-first meetups only.', null, TRUE, 'approved',
      '[]'::jsonb, NULL, NULL, NOW(), 25
    )
    ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        last_name = EXCLUDED.last_name,
        password_hash = EXCLUDED.password_hash,
        is_admin = TRUE,
        email = EXCLUDED.email,
        verified = TRUE,
        verification_status = 'approved'`,
    [ADMIN_USERNAME, adminPasswordHash, ADMIN_EMAIL]
  );

  await pool.query(
    `UPDATE users
     SET is_admin = TRUE,
         password_hash = $2,
         email = COALESCE(email, $3),
         verified = TRUE,
         verification_status = 'approved'
     WHERE username = $1`,
    [ADMIN_USERNAME, adminPasswordHash, ADMIN_EMAIL]
  );

  await pool.query(
    `INSERT INTO swipes (from_user_id, to_user_id, decision, created_at)
     VALUES
       ('u2', 'u1', 'right', NOW()),
       ('u3', 'u1', 'right', NOW()),
       ('u_admin', 'u2', 'right', NOW()),
       ('u2', 'u_admin', 'right', NOW()),
       ('u_admin', 'u4', 'right', NOW()),
       ('u4', 'u_admin', 'right', NOW())
     ON CONFLICT (from_user_id, to_user_id)
     DO UPDATE SET decision = EXCLUDED.decision`
  );

  await pool.query(
    `INSERT INTO matches (id, user_a_id, user_b_id, created_at)
     SELECT 'match_seed_admin_u2', 'u_admin', 'u2', NOW()
     WHERE NOT EXISTS (
       SELECT 1
       FROM matches
       WHERE (user_a_id = 'u_admin' AND user_b_id = 'u2')
          OR (user_a_id = 'u2' AND user_b_id = 'u_admin')
     )`
  );

  await pool.query(
    `INSERT INTO matches (id, user_a_id, user_b_id, created_at)
     SELECT 'match_seed_admin_u4', 'u_admin', 'u4', NOW()
     WHERE NOT EXISTS (
       SELECT 1
       FROM matches
       WHERE (user_a_id = 'u_admin' AND user_b_id = 'u4')
          OR (user_a_id = 'u4' AND user_b_id = 'u_admin')
     )`
  );
}

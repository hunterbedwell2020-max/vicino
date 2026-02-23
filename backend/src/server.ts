import cors from "cors";
import express from "express";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { initDb, pool } from "./db.js";
import {
  assertVerifiedUser,
  assertAdminSession,
  banUserByAdmin,
  closeAvailability,
  createUserReport,
  createMeetupOffer,
  purgeExpiredVerificationSubmissions,
  expireLocationIfNeeded,
  getAvailabilityState,
  getLatestVerificationSubmissionForUser,
  getVerificationStatus,
  listAdminUsers,
  listInterestedCandidates,
  listMatches,
  listDiscoveryProfiles,
  listVerificationQueue,
  listMessages,
  listOffers,
  listUsers,
  getAuthSession,
  loginAuthUser,
  logoutAuthSession,
  refreshAuthSession,
  registerPushTokenForUser,
  registerAuthUser,
  reviewVerificationSubmission,
  respondAvailabilityInterest,
  respondToOffer,
  sendMessage,
  setUserPlanTierByAdmin,
  setMeetDecision,
  startAvailability,
  submitVerification,
  unbanUserByAdmin,
  trackProductEvent,
  updateUserProfile,
  updateUserDistancePreference,
  updateUserLocation,
  swipe
} from "./logic.js";
import { createRateLimit } from "./rateLimit.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use((req, res, next) => {
  const requestId = randomUUID();
  const started = Date.now();
  const originalSend = res.send.bind(res);
  res.send = ((body?: unknown) => {
    const durationMs = Date.now() - started;
    console.log(
      JSON.stringify({
        level: "info",
        event: "http_request",
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs
      })
    );
    return originalSend(body as never);
  }) as typeof res.send;
  res.setHeader("x-request-id", requestId);
  next();
});
const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));
const ADMIN_REVIEW_KEY = process.env.ADMIN_REVIEW_KEY ?? "";
const MAX_UPLOAD_BYTES = Math.max(256 * 1024, Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024));
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const AWS_REGION = process.env.AWS_REGION?.trim();
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID?.trim();
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET?.trim();
const AWS_S3_PUBLIC_BASE_URL = process.env.AWS_S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

const S3_CONFIG_KEYS = [AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET];
const s3Configured = S3_CONFIG_KEYS.every((value) => Boolean(value));
const s3PartiallyConfigured = S3_CONFIG_KEYS.some((value) => Boolean(value)) && !s3Configured;
if (s3PartiallyConfigured) {
  throw new Error(
    "Incomplete S3 config: set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET together."
  );
}

const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 50, keyPrefix: "auth" });
const loginRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: "auth-login" });
const userActionRateLimit = createRateLimit({ windowMs: 60 * 1000, max: 120, keyPrefix: "user-actions" });
const uploadRateLimit = createRateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: "uploads" });
const adminRateLimit = createRateLimit({ windowMs: 60 * 1000, max: 60, keyPrefix: "admin" });

function estimateBase64Bytes(base64Data: string) {
  const body = base64Data.replace(/^data:[^;]+;base64,/, "");
  const paddingMatch = body.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toDateStamp(date: Date) {
  return toAmzDate(date).slice(0, 8);
}

function encodeS3Key(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function uploadToS3(input: {
  key: string;
  body: Buffer;
  mimeType: string;
}) {
  if (!s3Configured || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    throw new Error("S3 is not configured.");
  }

  const host = `${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const payloadHash = sha256Hex(input.body);
  const canonicalUri = `/${encodeS3Key(input.key)}`;
  const canonicalHeaders =
    `content-type:${input.mimeType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(`AWS4${AWS_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, AWS_REGION);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        host,
        method: "PUT",
        path: canonicalUri,
        headers: {
          "content-type": input.mimeType,
          "content-length": String(input.body.length),
          "x-amz-date": amzDate,
          "x-amz-content-sha256": payloadHash,
          Authorization: authorization
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300) {
            resolve();
            return;
          }
          reject(new Error(`S3 upload failed (${res.statusCode}): ${bodyText || "Unknown error"}`));
        });
      }
    );
    req.on("error", reject);
    req.write(input.body);
    req.end();
  });

  const publicBase = AWS_S3_PUBLIC_BASE_URL || `https://${host}`;
  return `${publicBase}/${encodeS3Key(input.key)}`;
}

const requireAdminAccess: express.RequestHandler = async (req, res, next) => {
  const token = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      await assertAdminSession(token);
      return next();
    } catch {
      // fallback to key-based flow below
    }
  }

  if (!ADMIN_REVIEW_KEY) {
    return res.status(503).json({ error: "Admin access is not configured on server." });
  }

  const provided = req.header("x-admin-key");
  if (!provided || provided !== ADMIN_REVIEW_KEY) {
    return res.status(401).json({ error: "Unauthorized admin access." });
  }
  return next();
};

const resolveAdminActorId = async (req: express.Request) => {
  const token = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return "u_admin";
  }
  const session = await assertAdminSession(token);
  return String(session.user.id);
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vicino-backend" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ ok: true });
  } catch (err) {
    return res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

app.post("/uploads/image-base64", uploadRateLimit, async (req, res) => {
  const schema = z.object({
    base64: z.string().min(1).max(14_000_000),
    mimeType: z.string().optional(),
    filename: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const mime = (parsed.data.mimeType ?? "image/jpeg").toLowerCase().trim();
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mime)) {
      return res.status(400).json({ error: "Unsupported image type. Allowed: jpeg, png, webp, heic." });
    }
    const estimatedBytes = estimateBase64Bytes(parsed.data.base64);
    if (estimatedBytes > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ error: `Image too large. Max ${MAX_UPLOAD_BYTES} bytes.` });
    }

    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("heic") ? "heic" : "jpg";
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const body = parsed.data.base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(body, "base64");

    if (s3Configured) {
      const key = `uploads/${safeName}`;
      const url = await uploadToS3({ key, body: buffer, mimeType: mime });
      return res.json({ url });
    }

    const target = path.join(uploadsDir, safeName);
    await fs.promises.writeFile(target, buffer);
    const host = req.get("host");
    const protocol = req.protocol;
    return res.json({ url: `${protocol}://${host}/uploads/${safeName}` });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/users", async (_req, res) => {
  try {
    res.json(await listUsers());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/auth/register", authRateLimit, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    username: z
      .string()
      .min(3)
      .max(24)
      .regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8).max(200),
    acceptedTerms: z.literal(true),
    acceptedPrivacy: z.literal(true),
    marketingConsent: z.boolean().optional().default(false),
    policyVersion: z.string().min(1).max(40)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await registerAuthUser(parsed.data);
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/auth/login", authRateLimit, loginRateLimit, async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(24),
    password: z.string().min(8).max(200)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await loginAuthUser(parsed.data.username, parsed.data.password);
    return res.json(row);
  } catch (err) {
    return res.status(401).json({ error: (err as Error).message });
  }
});

app.post("/auth/refresh", authRateLimit, async (req, res) => {
  const schema = z.object({
    refreshToken: z.string().min(32)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const refreshed = await refreshAuthSession(parsed.data.refreshToken);
    return res.json(refreshed);
  } catch (err) {
    return res.status(401).json({ error: (err as Error).message });
  }
});

app.get("/auth/session", async (req, res) => {
  const token = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing auth token." });
  }

  try {
    const session = await getAuthSession(token);
    return res.json(session);
  } catch (err) {
    return res.status(401).json({ error: (err as Error).message });
  }
});

app.post("/auth/logout", async (req, res) => {
  const token = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing auth token." });
  }

  try {
    await logoutAuthSession(token);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/verification/:userId/status", async (req, res) => {
  try {
    const status = await getVerificationStatus(req.params.userId);
    return res.json(status);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/verification/submit", async (req, res) => {
  const schema = z.object({
    userId: z.string(),
    idDocumentUri: z.string().min(1),
    selfieUri: z.string().min(1),
    idDocumentType: z.string().min(1).default("unknown")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const result = await submitVerification(
      parsed.data.userId,
      parsed.data.idDocumentUri,
      parsed.data.selfieUri,
      parsed.data.idDocumentType
    );
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/admin/verifications", adminRateLimit, requireAdminAccess, async (req, res) => {
  const status = String(req.query.status ?? "pending");
  const validStatus = ["pending", "approved", "rejected", "all"].includes(status)
    ? (status as "pending" | "approved" | "rejected" | "all")
    : "pending";
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 50), 200));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  try {
    const rows = await listVerificationQueue(validStatus, { limit, offset });
    return res.json(rows);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/admin/verifications/user/:userId/latest", adminRateLimit, requireAdminAccess, async (req, res) => {
  try {
    const row = await getLatestVerificationSubmissionForUser(String(req.params.userId));
    if (!row) {
      return res.json(null);
    }
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/admin/users", adminRateLimit, requireAdminAccess, async (req, res) => {
  const segment = String(req.query.segment ?? "all");
  const validSegment = ["verified", "not_verified", "all"].includes(segment)
    ? (segment as "verified" | "not_verified" | "all")
    : "all";
  const q = req.query.q ? String(req.query.q) : "";
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 50), 200));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  try {
    const rows = await listAdminUsers({ segment: validSegment, q, limit, offset });
    return res.json(rows);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/admin/verifications/:submissionId/review", adminRateLimit, requireAdminAccess, async (req, res) => {
  const schema = z.object({
    decision: z.enum(["approved", "rejected"]),
    reviewerNote: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const submissionId = String(req.params.submissionId);
    const adminUserId = await resolveAdminActorId(req);
    const result = await reviewVerificationSubmission(
      submissionId,
      parsed.data.decision,
      adminUserId,
      parsed.data.reviewerNote
    );
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/admin/users/:userId/ban", adminRateLimit, requireAdminAccess, async (req, res) => {
  const schema = z.object({
    reason: z.string().min(1).max(280).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const adminUserId = await resolveAdminActorId(req);
    const result = await banUserByAdmin(adminUserId, String(req.params.userId), parsed.data.reason);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/admin/users/:userId/unban", adminRateLimit, requireAdminAccess, async (req, res) => {
  try {
    const adminUserId = await resolveAdminActorId(req);
    const result = await unbanUserByAdmin(adminUserId, String(req.params.userId));
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/admin/users/:userId/plan-tier", adminRateLimit, requireAdminAccess, async (req, res) => {
  const schema = z.object({
    planTier: z.enum(["free", "plus"]),
    note: z.string().max(280).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const adminUserId = await resolveAdminActorId(req);
    const result = await setUserPlanTierByAdmin(
      adminUserId,
      String(req.params.userId),
      parsed.data.planTier,
      parsed.data.note
    );
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/analytics/events", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    eventName: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9_]+$/),
    userId: z.string().optional(),
    metadata: z.record(z.any()).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const row = await trackProductEvent(parsed.data.eventName, parsed.data.userId, parsed.data.metadata);
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/reports", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    reporterUserId: z.string(),
    targetUserId: z.string(),
    reason: z.string().min(3).max(120),
    details: z.string().max(1000).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const row = await createUserReport(
      parsed.data.reporterUserId,
      parsed.data.targetUserId,
      parsed.data.reason,
      parsed.data.details
    );
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/admin/maintenance/purge-verification", adminRateLimit, requireAdminAccess, async (_req, res) => {
  try {
    const row = await purgeExpiredVerificationSubmissions();
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/discovery/:userId", async (req, res) => {
  try {
    await assertVerifiedUser(req.params.userId);
    res.json(await listDiscoveryProfiles(req.params.userId));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/users/:userId/location", async (req, res) => {
  const schema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await updateUserLocation(req.params.userId, parsed.data.latitude, parsed.data.longitude);
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/users/:userId/push-token", async (req, res) => {
  const schema = z.object({
    expoPushToken: z.string().min(1),
    platform: z.string().optional().default("unknown")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await registerPushTokenForUser(
      String(req.params.userId),
      parsed.data.expoPushToken,
      parsed.data.platform
    );
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/users/:userId/preferences/distance", async (req, res) => {
  const schema = z.object({
    maxDistanceMiles: z.number().min(1).max(150)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await updateUserDistancePreference(req.params.userId, parsed.data.maxDistanceMiles);
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/users/:userId/profile", async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1).max(60).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(30).optional(),
    age: z.number().int().min(18).max(99).optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    preferredGender: z.enum(["male", "female", "other"]).optional(),
    likes: z.string().min(1).max(280).optional(),
    dislikes: z.string().min(1).max(280).optional(),
    bio: z.string().min(1).max(500).optional(),
    profilePhotoUrl: z.string().url().optional(),
    photos: z.array(z.string().url()).max(9).optional(),
    hobbies: z.array(z.string().min(1).max(40)).max(12).optional(),
    promptOne: z.string().min(1).max(280).optional(),
    promptTwo: z.string().min(1).max(280).optional(),
    promptThree: z.string().min(1).max(280).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const row = await updateUserProfile(req.params.userId, parsed.data);
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/matches", async (req, res) => {
  const userId = req.query.userId ? String(req.query.userId) : undefined;
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 50), 200));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  try {
    res.json(await listMatches(userId, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/offers", async (_req, res) => {
  try {
    res.json(await listOffers());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/swipes", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    fromUserId: z.string(),
    toUserId: z.string(),
    decision: z.enum(["left", "right"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.fromUserId);
    await assertVerifiedUser(parsed.data.toUserId);
    const result = await swipe(parsed.data.fromUserId, parsed.data.toUserId, parsed.data.decision);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/messages", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    matchId: z.string(),
    senderUserId: z.string(),
    body: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.senderUserId);
    const result = await sendMessage(parsed.data.matchId, parsed.data.senderUserId, parsed.data.body);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/messages/:matchId", async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 100), 300));
  const before = req.query.before ? String(req.query.before) : null;
  try {
    const rows = await listMessages(req.params.matchId, { limit, before });
    return res.json(rows);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/meet-decisions", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    matchId: z.string(),
    userId: z.string(),
    decision: z.enum(["yes", "no"])
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.userId);
    const result = await setMeetDecision(parsed.data.matchId, parsed.data.userId, parsed.data.decision);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/availability/start", userActionRateLimit, async (req, res) => {
  const schema = z.object({ initiatorUserId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.initiatorUserId);
    const session = await startAvailability(parsed.data.initiatorUserId);
    const candidates = await listInterestedCandidates(session.id);
    return res.json({ session, candidates });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/availability/:sessionId", async (req, res) => {
  try {
    const state = await getAvailabilityState(req.params.sessionId);
    return res.json(state);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/availability/:sessionId/candidates", async (req, res) => {
  try {
    const candidates = await listInterestedCandidates(req.params.sessionId);
    return res.json(candidates);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/availability/respond-interest", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    sessionId: z.string(),
    userId: z.string(),
    response: z.enum(["yes", "no"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.userId);
    const row = await respondAvailabilityInterest(
      parsed.data.sessionId,
      parsed.data.userId,
      parsed.data.response
    );
    return res.json(row);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/availability/:sessionId/close", userActionRateLimit, async (req, res) => {
  const schema = z.object({ initiatorUserId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.initiatorUserId);
    const result = await closeAvailability(String(req.params.sessionId), parsed.data.initiatorUserId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/offers", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    sessionId: z.string(),
    initiatorUserId: z.string(),
    recipientUserId: z.string(),
    placeId: z.string(),
    placeLabel: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.initiatorUserId);
    await assertVerifiedUser(parsed.data.recipientUserId);
    const offer = await createMeetupOffer(
      parsed.data.sessionId,
      parsed.data.initiatorUserId,
      parsed.data.recipientUserId,
      parsed.data.placeId,
      parsed.data.placeLabel
    );
    return res.json(offer);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/offers/respond", userActionRateLimit, async (req, res) => {
  const schema = z.object({
    offerId: z.string(),
    recipientUserId: z.string(),
    accept: z.boolean()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    await assertVerifiedUser(parsed.data.recipientUserId);
    const result = await respondToOffer(parsed.data.offerId, parsed.data.recipientUserId, parsed.data.accept);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/offers/:offerId/expire-location", async (req, res) => {
  try {
    const offer = await expireLocationIfNeeded(req.params.offerId);
    return res.json(offer);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

const PORT = Number(process.env.PORT ?? 4000);

async function start() {
  await initDb();
  const retentionResult = await purgeExpiredVerificationSubmissions().catch(() => null);
  if (retentionResult) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "verification_retention_cleanup",
        deletedCount: retentionResult.deletedCount,
        retentionDays: retentionResult.retentionDays
      })
    );
  }
  app.listen(PORT, () => {
    console.log(`Vicino backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});

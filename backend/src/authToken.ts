import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type AccessTokenPayload = {
  sub: string;
  sid: string;
  adm: boolean;
  iat: number;
  exp: number;
};

const DEFAULT_ACCESS_SECRET = "vicino-dev-access-secret-change-me-immediately";
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET?.trim() || DEFAULT_ACCESS_SECRET;
const ACCESS_TTL_SECONDS = Math.max(300, Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 86400));

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

function signRaw(value: string) {
  return createHmac("sha256", ACCESS_SECRET).update(value).digest();
}

export function createAccessToken(input: { userId: string; sessionId: string; isAdmin: boolean }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: input.userId,
    sid: input.sessionId,
    adm: input.isAdmin,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(signRaw(signingInput));
  return `${signingInput}.${signature}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid token.");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const actualSig = signRaw(signingInput);
  const expectedSig = base64UrlDecode(encodedSignature);
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error("Invalid token signature.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as Partial<AccessTokenPayload>;
  if (!payload.sub || !payload.sid || typeof payload.exp !== "number") {
    throw new Error("Invalid token payload.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("Token expired.");
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    adm: Boolean(payload.adm),
    iat: Number(payload.iat ?? 0),
    exp: payload.exp
  };
}

export function createRefreshToken() {
  return randomBytes(48).toString("hex");
}

import type { RequestHandler } from "express";

type LimiterOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Entry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Entry>();

function clientIp(reqHeaders: Record<string, string | string[] | undefined>) {
  const forwarded = reqHeaders["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export function createRateLimit(options: LimiterOptions): RequestHandler {
  const { windowMs, max, keyPrefix } = options;

  return (req, res, next) => {
    const now = Date.now();
    const ip = clientIp(req.headers as Record<string, string | string[] | undefined>);
    const key = `${keyPrefix}:${ip}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    return next();
  };
}

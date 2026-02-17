import { pool } from "./db.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_ENABLED = (process.env.PUSH_NOTIFICATIONS_ENABLED ?? "true").toLowerCase() !== "false";

const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export async function registerUserPushToken(userId: string, expoPushToken: string, platform: string) {
  const token = expoPushToken.trim();
  if (!isExpoPushToken(token)) {
    throw new Error("Invalid Expo push token format.");
  }

  await pool.query(
    `INSERT INTO user_push_tokens (id, user_id, expo_push_token, platform, active, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
     ON CONFLICT (expo_push_token)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       active = TRUE,
       last_seen_at = NOW()`,
    [id("pt"), userId, token, platform.trim().toLowerCase() || "unknown"]
  );
}

async function getActiveTokens(userIds: string[]) {
  if (userIds.length === 0) {
    return [] as Array<{ userId: string; token: string }>;
  }
  const { rows } = await pool.query(
    `SELECT user_id, expo_push_token
     FROM user_push_tokens
     WHERE user_id = ANY($1::text[])
       AND active = TRUE`,
    [userIds]
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    token: String(row.expo_push_token)
  }));
}

async function deactivateTokens(tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }
  await pool.query(
    `UPDATE user_push_tokens
     SET active = FALSE
     WHERE expo_push_token = ANY($1::text[])`,
    [tokens]
  );
}

export async function sendPushToUsers(
  userIds: string[],
  notification: { title: string; body: string; data?: Record<string, unknown> }
) {
  if (!PUSH_ENABLED) {
    return;
  }

  const tokens = await getActiveTokens(userIds);
  if (tokens.length === 0) {
    return;
  }

  const messages = tokens.map((entry) => ({
    to: entry.token,
    sound: "default",
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {}
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages)
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.error("Push send failed", { status: res.status, raw });
      return;
    }

    const payload = (await res.json()) as {
      data?: Array<{ status: string; details?: { error?: string } }>;
    };
    const invalidTokens: string[] = [];
    const tickets = payload.data ?? [];
    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      const source = tokens[i];
      if (!ticket || !source) {
        continue;
      }
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(source.token);
      }
    }
    await deactivateTokens(invalidTokens);
  } catch (err) {
    console.error("Push send exception", err);
  }
}

type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
};

let sentry: SentryLike | null = null;
let sentryEnabled = false;

const SENTRY_DSN = process.env.SENTRY_DSN?.trim();
const RELEASE_VERSION = process.env.RELEASE_VERSION?.trim() || "vicino-backend@dev";
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";

export async function initBackendSentry() {
  if (!SENTRY_DSN) {
    return;
  }

  try {
    const moduleName = "@sentry/node";
    const mod = (await import(moduleName)) as unknown as SentryLike;
    mod.init({
      dsn: SENTRY_DSN,
      release: RELEASE_VERSION,
      environment: ENVIRONMENT,
      tracesSampleRate: 0.05
    });
    sentry = mod;
    sentryEnabled = true;
    console.log(JSON.stringify({ level: "info", event: "sentry_enabled", release: RELEASE_VERSION, environment: ENVIRONMENT }));
  } catch {
    console.warn("Sentry DSN present, but @sentry/node is not installed.");
  }
}

export function captureBackendError(error: unknown, extra?: Record<string, unknown>) {
  if (!sentryEnabled || !sentry) {
    return;
  }
  sentry.captureException(error, {
    extra: {
      ...(extra ?? {})
    }
  });
}

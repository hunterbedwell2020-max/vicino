let sentryInitialized = false;
let sentryClient: { captureException: (error: unknown, context?: Record<string, unknown>) => void } | null = null;

export async function initMobileSentry() {
  if (sentryInitialized) {
    return;
  }
  sentryInitialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  try {
    const Sentry = require("@sentry/react-native") as {
      init: (options: Record<string, unknown>) => void;
      captureException: (error: unknown, context?: Record<string, unknown>) => void;
    };
    const release = process.env.EXPO_PUBLIC_RELEASE_VERSION?.trim() || "vicino-mobile@dev";
    const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() || (__DEV__ ? "development" : "production");
    Sentry.init({
      dsn,
      release,
      environment,
      tracesSampleRate: 0.05
    });
    sentryClient = Sentry;
  } catch {
    console.warn("Sentry DSN present, but @sentry/react-native is not installed.");
  }
}

export function captureMobileError(error: unknown, extra?: Record<string, unknown>) {
  if (!sentryClient) {
    return;
  }
  sentryClient.captureException(error, {
    extra: {
      ...(extra ?? {})
    }
  });
}


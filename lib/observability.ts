// ============================================================
// Application-wide error reporting.
//
// Extends the pattern already used for AI events (lib/ai/observability)
// to the rest of the app: one structured, single-line JSON record per
// incident — easy to grep, cheap to store, and the shape a log drain
// can parse without a custom regex.
//
// PRIVACY: never log field values, document text, message bodies, or
// anything else that could carry personal data. Only shape and
// metadata — what broke and where, never whose data was in it.
//
// No paid APM is wired up, but the sink is a seam rather than a
// hardcoded console call: set NEXT_PUBLIC_ERROR_ENDPOINT and records
// are also POSTed there, so adding Sentry or a log drain later is a
// config change, not a refactor.
// ============================================================

export interface ErrorReport {
  /** Where it happened: "route-boundary", "root-layout", "not-found". */
  scope: string;
  message: string;
  /** Next.js attaches this to server-rendered errors; useful in logs. */
  digest?: string;
  path?: string;
}

const ENDPOINT = process.env.NEXT_PUBLIC_ERROR_ENDPOINT;

export function reportError(report: ErrorReport): void {
  const record = {
    at: new Date().toISOString(),
    kind: "app_error",
    ...report,
  };

  // eslint-disable-next-line no-console
  console.error(JSON.stringify(record));

  if (!ENDPOINT || typeof navigator === "undefined") return;

  try {
    const body = JSON.stringify(record);
    // sendBeacon survives the page being torn down, which is exactly
    // the situation an error boundary is usually in. Falls back to
    // fetch+keepalive where it is unavailable.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  } catch {
    // Reporting must never itself throw into an error boundary.
  }
}

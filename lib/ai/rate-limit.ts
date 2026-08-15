// ============================================================
// Minimal in-memory rate limiter for AI routes (Part 26).
//
// This is intentionally simple: a single Next.js server instance
// (the free-tier deployment target for this project) keeps this
// map in memory for the process lifetime. It is not a substitute
// for a distributed limiter, but it stops accidental infinite-call
// loops and basic abuse without adding a paid dependency.
// ============================================================

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 12; // generous for a chat UI, low enough to protect free quota

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - bucket.windowStart) };
  }

  bucket.count += 1;
  return { allowed: true };
}

// Periodically forget stale buckets so this doesn't grow unbounded
// over a long-lived server process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 5) buckets.delete(key);
  }
}, WINDOW_MS * 5).unref?.();

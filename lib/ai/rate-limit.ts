// ============================================================
// Rate limiter for the AI routes (Part 26).
//
// Two backends behind one interface:
//
//   memory  (default)  a per-process Map. Zero config and zero cost,
//                      but each serverless instance keeps its own
//                      counter — so N warm instances allow up to
//                      N x MAX_PER_WINDOW. Correct for a single
//                      long-lived server, approximate on Vercel.
//
//   upstash (opt-in)   a shared fixed-window counter in Upstash Redis,
//                      reached over its REST API with plain `fetch`.
//                      Works from serverless because there is no
//                      connection to pool, adds no npm dependency, and
//                      has a free tier. Set UPSTASH_REDIS_REST_URL and
//                      UPSTASH_REDIS_REST_TOKEN to enable it; the limit
//                      then holds across every instance.
//
// Selection is automatic: if the Upstash env vars are present it is
// used, otherwise memory. If a Redis call fails the request falls back
// to the in-memory limiter rather than failing open entirely — a
// degraded limit is better than none, and better than a 500.
// ============================================================
import { logAiEvent } from "@/lib/ai/observability";

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 12; // generous for a chat UI, low enough to protect free quota

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  /** Which backend answered — surfaced in logs, and handy in a demo. */
  backend?: "memory" | "upstash";
}

// ------------------------------------------------------------
// Backend 1: in-process fixed window.
// ------------------------------------------------------------
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function checkInMemory(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, backend: "memory" };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterMs: WINDOW_MS - (now - bucket.windowStart),
      backend: "memory",
    };
  }

  bucket.count += 1;
  return { allowed: true, backend: "memory" };
}

// Periodically forget stale buckets so this doesn't grow unbounded
// over a long-lived server process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 5) buckets.delete(key);
  }
}, WINDOW_MS * 5).unref?.();

// ------------------------------------------------------------
// Backend 2: shared fixed window in Upstash Redis (REST).
// ------------------------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isDistributedRateLimiting = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/**
 * One round-trip doing all three operations:
 *   INCR       bump this window's counter (creates it at 1 if absent)
 *   EXPIRE NX  set the TTL only on creation, so the window is fixed and
 *              does not slide forward on every request
 *   PTTL       remaining window, for an accurate Retry-After
 */
async function checkUpstash(key: string): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(WINDOW_MS / 1000);
  const redisKey = `nexus:rl:${key}`;

  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowSeconds), "NX"],
      ["PTTL", redisKey],
    ]),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Upstash responded ${res.status}`);

  const parsed = (await res.json()) as ({ result?: number; error?: string } | null)[];
  const count = parsed?.[0]?.result;
  if (typeof count !== "number") throw new Error("Upstash returned no counter value");

  if (count > MAX_PER_WINDOW) {
    const pttl = parsed?.[2]?.result;
    return {
      allowed: false,
      // PTTL returns -1 (no expiry) / -2 (missing) as well as real values;
      // fall back to a full window rather than reporting a negative wait.
      retryAfterMs: typeof pttl === "number" && pttl > 0 ? pttl : WINDOW_MS,
      backend: "upstash",
    };
  }

  return { allowed: true, backend: "upstash" };
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
/**
 * Consumes one unit of quota for `key` and reports whether the caller
 * may proceed. Async because the shared backend is a network call.
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  if (!isDistributedRateLimiting) return checkInMemory(key);

  try {
    return await checkUpstash(key);
  } catch (err) {
    // Never let the limiter itself break the request path.
    logAiEvent({
      route: "rate-limit",
      requestType: "upstash",
      ok: false,
      latencyMs: 0,
      errorCategory: err instanceof Error ? err.message : String(err),
    });
    return checkInMemory(key);
  }
}

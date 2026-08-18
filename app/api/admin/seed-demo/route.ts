// ============================================================
// Protected demo-seed endpoint. SERVER ONLY.
//
// PROTECTION
// A bearer token compared against SEED_SECRET, which exists only as a
// server environment variable. Deliberately NOT a query parameter:
// query strings land in browser history, referrer headers, proxy logs
// and Vercel's request logs, so `?secret=` would leak the credential
// by design. The token is compared in constant time so the endpoint
// can't be probed a byte at a time.
//
// GET is intentionally unimplemented — seeding is a mutation and must
// never be reachable by someone simply visiting a URL. There is also
// no route that returns the service account or the seed secret; the
// only thing this ever emits is counts and non-secret demo emails.
//
// SCOPE
// The handler takes NO school id. It cannot be pointed at a school
// other than the demo one, and reset only removes documents the seed
// itself created. See lib/server/demo-seed.ts.
// ============================================================
import { timingSafeEqual } from "node:crypto";
import { isAdminConfigured, adminProjectId } from "@/lib/server/firebase-admin";
import { resetDemoSchool, seedDemoSchool } from "@/lib/server/demo-seed";
import { DEMO_SCHOOL_ID } from "@/lib/server/demo-seed-data";

// The seed writes thousands of documents and calls the embedding API,
// so it needs well beyond the default serverless budget.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first
  // — but still run a comparison so the reject path costs the same.
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function authorize(request: Request): { ok: true } | { ok: false; response: Response } {
  const expected = process.env.SEED_SECRET;
  if (!expected || expected.length < 16) {
    return {
      ok: false,
      response: Response.json(
        { error: "Seeding is disabled: SEED_SECRET is not set (or is shorter than 16 characters)." },
        { status: 503 }
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !tokenMatches(provided, expected)) {
    // Same body and status for "no token" and "wrong token" — nothing
    // here tells a caller which part they got wrong.
    return { ok: false, response: Response.json({ error: "Not authorized." }, { status: 401 }) };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  if (!isAdminConfigured()) {
    return Response.json(
      { error: "FIREBASE_SERVICE_ACCOUNT is not set on the server." },
      { status: 503 }
    );
  }

  // The credential must belong to the same Firebase project the app
  // itself points at. Without this, a mistakenly pasted service account
  // from another project would happily seed a stranger's database.
  const appProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  let credentialProject: string;
  try {
    credentialProject = adminProjectId();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  if (appProject && credentialProject !== appProject) {
    return Response.json(
      {
        error: "Refusing to seed: the service account belongs to a different Firebase project than this app.",
        appProject,
        credentialProject,
      },
      { status: 409 }
    );
  }

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    // An empty body is fine and means "seed".
  }
  const action = body.action ?? "seed";

  try {
    if (action === "reset") {
      const result = await resetDemoSchool();
      return Response.json({ ok: true, action: "reset", schoolId: DEMO_SCHOOL_ID, ...result });
    }

    if (action === "reseed") {
      await resetDemoSchool();
      const result = await seedDemoSchool();
      return Response.json({ ...result, action: "reseed" });
    }

    if (action !== "seed") {
      return Response.json({ error: `Unknown action "${action}". Use seed, reseed or reset.` }, { status: 400 });
    }

    const result = await seedDemoSchool();
    return Response.json({ ...result, action: "seed" });
  } catch (err) {
    // Surface the message (useful: missing index, bad credential shape)
    // but never the stack or anything derived from the credential.
    return Response.json(
      { error: err instanceof Error ? err.message : "Seeding failed for an unknown reason." },
      { status: 500 }
    );
  }
}

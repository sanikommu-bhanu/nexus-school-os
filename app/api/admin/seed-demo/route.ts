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
// never be reachable by someone simply visiting a URL. Nothing this
// route emits contains a credential: only counts, phase state, and the
// non-secret demo email addresses.
//
// ORDER OF CHECKS (this order matters)
//   1. authorize            -> 401 / 503
//   2. validate the request -> 400
//   3. credential present   -> 503
//   4. load the Admin SDK   -> 500 if it cannot load
//   5. project matches      -> 409
//   6. run
// Validation precedes anything Firebase-related so a malformed or
// unauthorised call is rejected without ever loading the privileged
// SDK, and so bad input is a 400 regardless of server configuration.
//
// SCOPE
// The handler takes NO school id — one is never read from the body.
// Every write is scoped to schools/nexus-demo-school, and reset only
// removes documents the seed itself created. See lib/server/demo-seed.ts.
// ============================================================
import { timingSafeEqual } from "node:crypto";
import { DEMO_SCHOOL_ID } from "@/lib/server/demo-seed-data";

// firebase-admin is loaded with a dynamic import INSIDE the handler,
// never at module scope. Two reasons, both of which showed up in
// production:
//
//  1. A top-level import runs before any of this route's own logic, so
//     if the SDK fails to initialise in the serverless bundle the
//     platform returns a bare 500 HTML page and the carefully written
//     401/503 responses below never execute. Deferring the import means
//     an unauthorised caller gets a clean 401 whatever state the SDK is
//     in, and a real failure surfaces as JSON we can read.
//  2. An unauthenticated request should not be able to make the server
//     load a heavy privileged SDK at all.

// firebase-admin needs the Node runtime — it cannot run on Edge.
export const runtime = "nodejs";
// 60s is the ceiling on Vercel's Hobby plan; asking for more is
// rejected. That budget is exactly why seeding is split into phases,
// each of which is independently re-runnable.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Phase = 1 | 2 | 3 | 4;

/**
 * Phase check kept local on purpose: validating the request must not
 * require importing the seeder (which pulls in firebase-admin), so an
 * unauthorised or malformed call never loads the privileged SDK.
 */
function isPhase(v: unknown): v is Phase {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

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
  // ---- 1. authorize ----
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  // ---- 2. validate the request ----
  let body: { action?: string; phase?: unknown } = {};
  try {
    body = (await request.json()) as { action?: string; phase?: unknown };
  } catch {
    // An empty body is fine and means "seed phase 1".
  }

  const action = body.action ?? "seed";
  if (action !== "seed" && action !== "reset") {
    return Response.json(
      { error: `Unknown action "${action}". Use "seed" (with a phase) or "reset".` },
      { status: 400 }
    );
  }

  const phase = body.phase ?? 1;
  if (action === "seed" && !isPhase(phase)) {
    return Response.json(
      { error: `Invalid phase ${JSON.stringify(phase)}. Use 1, 2, 3 or 4.` },
      { status: 400 }
    );
  }

  // ---- 3. credential present ----
  if (!process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) {
    return Response.json(
      { error: "FIREBASE_SERVICE_ACCOUNT is not set on the server." },
      { status: 503 }
    );
  }

  // ---- 4. load the Admin SDK ----
  let admin: typeof import("@/lib/server/firebase-admin");
  let seeder: typeof import("@/lib/server/demo-seed");
  try {
    [admin, seeder] = await Promise.all([
      import("@/lib/server/firebase-admin"),
      import("@/lib/server/demo-seed"),
    ]);
  } catch (err) {
    return Response.json(
      { error: `Failed to load the Admin SDK: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // ---- 5. the credential must match this app's Firebase project ----
  // Without this, a mistakenly pasted service account from another
  // project would happily seed a stranger's database.
  const appProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  let credentialProject: string;
  try {
    credentialProject = admin.adminProjectId();
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

  // ---- 6. run ----
  try {
    if (action === "reset") {
      const result = await seeder.resetDemoSchool();
      return Response.json({ ok: true, action: "reset", schoolId: DEMO_SCHOOL_ID, ...result });
    }

    const result = await seeder.runSeedPhase(phase as Phase);
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

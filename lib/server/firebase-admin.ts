// ============================================================
// Firebase Admin — SERVER ONLY. Never import this from a client
// component, a hook, or anything under components/.
//
// WHY THIS EXISTS AT ALL
// firestore.rules correctly require every identity document to be
// written by its own owner:
//
//   users/{userId}     allow create: if isSelf(userId) && ...
//   teachers/{userId}  allow create: if isSelf(userId)
//   parents/{userId}   allow create: if isSelf(userId)
//
// That is the right rule and it is deliberately left untouched. It
// also means no signed-in admin can ever mint a roster of demo
// students from the browser — not a bug to work around, a boundary
// working as designed. The only legitimate way to create those
// identities is server-side with a service account, which is what
// this module provides, for the demo seed and nothing else.
//
// The client SDK in lib/firebase.ts remains the one and only path
// for ordinary application traffic, and every normal read/write in
// NEXUS still goes through firestore.rules exactly as before.
// ============================================================
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const ADMIN_APP_NAME = "nexus-admin";

/**
 * Parses the service account from the environment.
 *
 * Accepts either raw JSON or base64-encoded JSON, because Vercel's
 * environment editor is unhappy with multi-line values and most people
 * end up base64-ing the key file. Never logs the parsed value, and the
 * thrown errors deliberately describe the *shape* problem without
 * echoing any part of the credential.
 */
function readServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || raw.trim().length === 0) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on the server.");
  }

  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(text, "base64").toString("utf8");
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is neither JSON nor valid base64.");
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT could not be parsed as JSON.");
  }

  const projectId = typeof parsed.project_id === "string" ? parsed.project_id : "";
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
  // Vercel stores the newlines in a PEM as the two characters \n, so
  // they have to come back before the crypto library will accept it.
  const privateKey =
    typeof parsed.private_key === "string" ? parsed.private_key.replace(/\\n/g, "\n") : "";

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key."
    );
  }
  return { projectId, clientEmail, privateKey };
}

/**
 * A named secondary app, so this can never collide with anything else
 * that might initialise a default Firebase Admin app in the same
 * process. Lazily created: importing this module has no side effect
 * and does not require the credential to be present, which keeps
 * `next build` working on a machine that has no service account.
 */
function adminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const { projectId, clientEmail, privateKey } = readServiceAccount();
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, ADMIN_APP_NAME);
  return getApp(ADMIN_APP_NAME);
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

/** True when a credential is present — lets a route answer "not configured" instead of throwing. */
export function isAdminConfigured(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return Boolean(raw && raw.trim().length > 0);
}

/**
 * The project this credential actually points at.
 *
 * Used by the seed route as a guard: seeding is refused unless the
 * service account belongs to the same project the app is configured
 * for, so a stray credential can never write into an unrelated
 * Firebase project.
 */
export function adminProjectId(): string {
  return readServiceAccount().projectId;
}

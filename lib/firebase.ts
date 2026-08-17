// ============================================================
// Firebase client bootstrap.
// Uses only free-tier Firebase services: Auth and Firestore.
// File storage is NOT Firebase — Storage requires the paid Blaze
// plan, so document bytes go to Cloudinary instead (lib/cloudinary.ts).
// No Cloud Functions dependency for core app flows.
// All config comes from NEXT_PUBLIC_* env vars (see .env.example) —
// never hardcode keys here.
// ============================================================
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

// ------------------------------------------------------------
// Local emulator mode.
// Set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1 (see .env.example) to point
// Auth + Firestore at the local Firebase emulators instead of the real
// project. This is what makes it possible to exercise firestore.rules
// and real writes without touching production data.
// Ports mirror firebase.json's `emulators` block.
// ------------------------------------------------------------
export const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1";

const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
const FIRESTORE_EMULATOR_PORT = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080);
const AUTH_EMULATOR_PORT = Number(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT || 9099);

const firebaseConfig = {
  // Against the emulator the API key is never validated, so a demo
  // value is enough — this lets the emulator run with no real project
  // credentials present at all.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulator ? "demo-api-key" : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (useEmulator ? "nexus-school-os" : undefined),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) {
    // No config yet — app still renders in "demo/local" mode.
    return null;
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

const app = getFirebaseApp();

function buildAuth(instance: FirebaseApp): Auth {
  const a = getAuth(instance);
  if (useEmulator) {
    connectAuthEmulator(a, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
      disableWarnings: true,
    });
  }
  return a;
}

function buildDb(instance: FirebaseApp): Firestore {
  const f = getFirestore(instance);
  if (useEmulator) {
    connectFirestoreEmulator(f, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return f;
}

// getApps() is re-checked above, but Next's fast-refresh can re-run this
// module while the SDK instance survives; connect*Emulator throws if
// called twice on an already-started instance, so guard on a global.
declare global {
  // eslint-disable-next-line no-var
  var __nexusFirebase__: { auth: Auth; db: Firestore } | undefined;
}

const instances = app
  ? (globalThis.__nexusFirebase__ ??= { auth: buildAuth(app), db: buildDb(app) })
  : undefined;

export const auth: Auth | null = instances?.auth ?? null;
export const db: Firestore | null = instances?.db ?? null;
export const googleProvider = new GoogleAuthProvider();

// Force Google's account chooser on EVERY sign-in.
//
// Firebase's signOut() ends the Firebase session but has no effect on
// the Google session in the browser. Without this parameter Google sees
// exactly one signed-in account, skips the chooser entirely, and
// silently re-authenticates that same account — so after signing out,
// picking a different role and tapping "Continue with Google" logs you
// straight back in as the previous user. There is no way to pick
// another account, which makes multi-role testing (and a shared demo
// device) impossible.
//
// `select_account` always shows the picker, so a different account can
// actually be chosen. Note this is separate from role immutability:
// a given account keeps the role it was created with by design (see
// firestore.rules), so switching ROLE means switching ACCOUNT — which
// is precisely what this unblocks.
googleProvider.setCustomParameters({ prompt: "select_account" });

export const isFirebaseConfigured = Boolean(app);

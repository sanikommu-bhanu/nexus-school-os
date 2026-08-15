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
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
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

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = Boolean(app);

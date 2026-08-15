"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { createUserProfile, getCurrentUserProfile } from "@/services/user-service";
import type { Role } from "@/types";

function GoogleGlyph() {
  // Real, license-free multi-color G mark (SVG paths), not a placeholder box.
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.4 26.9 36.3 24 36.3c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.6 5.4C41.4 36 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = (searchParams.get("role") as Role) || "student";

  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    setError(null);

    if (!isFirebaseConfigured || !auth) {
      setError("Firebase isn't configured yet. Add your project keys to .env.local.");
      return;
    }

    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const existing = await getCurrentUserProfile(result.user.uid);

      if (existing) {
        router.replace(existing.onboardingComplete ? `/${existing.role}` : `/setup/${existing.role}`);
        return;
      }

      await createUserProfile(result.user.uid, {
        fullName: result.user.displayName ?? "",
        email: result.user.email,
        photoURL: result.user.photoURL ?? undefined,
        role,
      });
      router.replace(`/setup/${role}`);
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setError("Sign-in was cancelled.");
      } else if (err?.code === "auth/network-request-failed") {
        setError("Network unavailable. Check your connection and try again.");
      } else {
        setError("We couldn't sign you in. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <div className="flex flex-1 flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 text-center"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl glass-surface">
              <span className="text-xl font-bold text-ink">N</span>
            </div>
            <h1 className="text-2xl font-bold text-ink">Welcome to NEXUS</h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              Signing in as <span className="text-accent-soft capitalize">{role}</span>
            </p>
          </motion.div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoogleAuth}
              disabled={googleLoading}
              className="btn-ghost bg-white/10 disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <GoogleGlyph />
                  Continue with Google
                </>
              )}
            </button>

            <button onClick={() => router.push(`/auth/email?role=${role}&mode=login`)} className="btn-ghost">
              <Mail className="h-4.5 w-4.5" />
              Continue with Email
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-ink-muted">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => router.push(`/auth/email?role=${role}&mode=signup`)}
              className="font-semibold text-accent-soft"
            >
              Create account
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

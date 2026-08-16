"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // The auth check and the logo animation run CONCURRENTLY.
    //
    // This used to be strictly serial: wait a fixed 1600ms, and only THEN
    // subscribe to auth and read the profile — so every cold open cost
    // 1600ms + a round-trip to Firebase Auth + a Firestore read before
    // anything moved. That is a large, entirely avoidable chunk of the
    // "app feels laggy" complaint. Now the network work starts on mount
    // and the splash holds for whichever finishes last, so the logo beat
    // is free rather than additive.
    const minimumHold = new Promise<void>((resolve) => setTimeout(resolve, 900));

    const destination = (async (): Promise<string> => {
      if (!isFirebaseConfigured || !auth) return "/onboarding";

      const user = await new Promise<import("firebase/auth").User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth!, (u) => {
          unsubscribe();
          resolve(u);
        });
      });

      // NOT signed in => a new visitor: logo, then the intro carousel,
      // which leads on to role selection and the rest of the flow.
      if (!user) return "/onboarding";

      // SIGNED IN => logo, then straight to role selection. /role resumes
      // them correctly from there: a complete profile goes to their
      // dashboard, an incomplete one to /setup/{role}, and a missing one
      // gets written. Returning users never see the intro carousel again.
      return "/role";
    })();

    Promise.all([minimumHold, destination]).then(([, to]) => {
      if (!cancelled) router.replace(to);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="nexus-atmosphere flex min-h-dvh flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <div className="relative mb-7 flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-accent/40 to-action/30 shadow-glow-accent">
          <div className="absolute inset-0 rounded-[1.75rem] glass-surface" />
          <span className="relative text-3xl font-bold tracking-tight text-white">N</span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="text-3xl font-bold tracking-[0.2em] text-ink"
        >
          NEXUS
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="mt-2 text-sm text-ink-muted"
        >
          AI Operating System for Schools
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        className="absolute bottom-16 h-1 w-16 rounded-full bg-gradient-to-r from-action to-accent"
      />
    </main>
  );
}

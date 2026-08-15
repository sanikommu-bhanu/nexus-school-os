"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getCurrentUserProfile } from "@/services/user-service";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    // Hold the splash for a short beat so the reveal animation is felt,
    // then route based on real auth + profile state.
    const timer = setTimeout(async () => {
      if (!isFirebaseConfigured || !auth) {
        router.replace("/onboarding");
        return;
      }

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();

        if (!user) {
          router.replace("/onboarding");
          return;
        }

        const profile = await getCurrentUserProfile(user.uid);

        if (!profile) {
          // Authenticated but never finished onboarding.
          router.replace("/role");
          return;
        }

        if (!profile.onboardingComplete) {
          router.replace(`/setup/${profile.role}`);
          return;
        }

        router.replace(`/${profile.role}`);
      });
    }, 1600);

    return () => clearTimeout(timer);
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

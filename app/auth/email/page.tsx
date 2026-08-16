"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Check, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { ensureUserProfile, getCurrentUserProfile } from "@/services/user-service";
import { publishAuthProfile } from "@/hooks/useAuthUser";
import type { Role } from "@/types";

type Mode = "login" | "signup";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
];

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email. Try logging in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match our records.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network unavailable. Check your connection and try again.";
    case "auth/operation-not-allowed":
      // The provider is switched off in the Firebase console. Worth naming
      // exactly, because the generic message sends people hunting through
      // their own code for a bug that is really one console toggle.
      return "Email/password sign-in isn't enabled for this Firebase project. Enable it under Authentication → Sign-in method.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The Firebase API key in .env.local isn't valid for this project.";
    case "auth/weak-password":
      return "That password is too weak. Use at least 8 characters with a number and a capital letter.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function EmailAuthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  // Whether the caller actually chose a role (came via /role) as opposed
  // to landing here directly. On login-with-no-profile we only trust an
  // explicit choice; otherwise we send them to /role to pick one, rather
  // than silently filing them as a student.
  const roleParam = params.get("role") as Role | null;
  const role: Role = roleParam ?? "student";
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordChecks = PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) }));
  const passwordValid = passwordChecks.every((r) => r.passed);
  const confirmValid = mode === "login" || password === confirmPassword;

  const canSubmit = useMemo(() => {
    if (!emailValid || !passwordValid) return false;
    if (mode === "signup") {
      return fullName.trim().length > 1 && confirmValid && agreedToTerms;
    }
    return password.length > 0;
  }, [emailValid, passwordValid, mode, fullName, confirmValid, agreedToTerms, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
    if (!canSubmit) return;

    if (!isFirebaseConfigured || !auth) {
      setStatus("error");
      setErrorMessage("Firebase isn't configured yet. Add your project keys to .env.local.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // ensureUserProfile, not createUserProfile: the auth account may
        // already exist from an earlier attempt whose profile write failed.
        const profile = await ensureUserProfile(cred.user.uid, {
          fullName,
          email,
          role,
        });
        // See app/auth/page.tsx: the store must learn about this profile
        // explicitly, because the auth event that populated it fired
        // before the document existed.
        publishAuthProfile(profile);
        setStatus("success");
        setTimeout(() => router.replace(`/setup/${profile.role}`), 900);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const profile = await getCurrentUserProfile(cred.user.uid);

        if (!profile) {
          // Signed in, but no users/{uid} doc. Send them through role
          // selection, which writes the profile — never to /setup, whose
          // guard would bounce straight back to /role in a loop.
          setStatus("success");
          setTimeout(() => router.replace(roleParam ? `/role?role=${roleParam}` : "/role"), 700);
          return;
        }

        publishAuthProfile(profile);
        setStatus("success");
        setTimeout(
          () => router.replace(profile.onboardingComplete ? `/${profile.role}` : `/setup/${profile.role}`),
          700
        );
      }
    } catch (err: any) {
      setStatus("error");
      // A Firestore failure after a successful auth call has no auth/*
      // code — surfacing its real message beats "Something went wrong",
      // which would point the user at their password.
      setErrorMessage(
        typeof err?.code === "string" && err.code.startsWith("auth/")
          ? friendlyAuthError(err.code)
          : err?.message
            ? `Signed in, but your profile couldn't be saved: ${err.message}`
            : friendlyAuthError("")
      );
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame no-scrollbar overflow-y-auto pb-10">
        <PageHeader title={mode === "signup" ? "Create account" : "Log in"} subtitle={`Continue as ${role}`} />

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          {mode === "signup" && (
            <Input
              id="fullName"
              label="Full name"
              placeholder="Aarav Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              error={touched.fullName && fullName.trim().length < 2 ? "Enter your full name" : undefined}
            />
          )}

          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            error={touched.email && !emailValid ? "Enter a valid email address" : undefined}
          />

          <div>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              trailing={
                <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            {mode === "signup" && (touched.password || password.length > 0) && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {passwordChecks.map((rule) => (
                  <div key={rule.label} className="flex items-center gap-1.5 text-xs">
                    {rule.passed ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-ink-faint" />
                    )}
                    <span className={rule.passed ? "text-success" : "text-ink-faint"}>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {mode === "signup" && (
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              label="Confirm password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
              error={touched.confirmPassword && !confirmValid ? "Passwords don't match" : undefined}
            />
          )}

          {mode === "signup" && (
            <label className="mt-1 flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-action"
              />
              <span>
                I agree to the <span className="text-accent-soft">Terms of Service</span> and{" "}
                <span className="text-accent-soft">Privacy Policy</span>
              </span>
            </label>
          )}

          {status === "error" && errorMessage && (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-3.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{mode === "signup" ? "Account created!" : "Welcome back!"}</span>
            </div>
          )}

          <div className="mt-auto pt-6">
            <Button type="submit" disabled={!canSubmit} loading={status === "loading"}>
              {mode === "signup" ? "Create account" : "Log in"}
            </Button>

            <p className="mt-5 text-center text-sm text-ink-muted">
              {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                className="font-semibold text-accent-soft"
              >
                {mode === "signup" ? "Log in" : "Create account"}
              </button>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

// Suspense boundary required by useSearchParams() — see app/auth/page.tsx.
// Without it `next build` fails this route outright.
export default function EmailAuthPage() {
  return (
    <Suspense
      fallback={
        <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
          <LoadingState message="Preparing sign-in…" />
        </main>
      }
    >
      <EmailAuthScreen />
    </Suspense>
  );
}

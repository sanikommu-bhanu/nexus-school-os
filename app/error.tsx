"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { reportError } from "@/lib/observability";

/**
 * Route-level error boundary.
 *
 * Without this file, ANY uncaught render error in a client component
 * drops the user onto Next's default error screen — in production a
 * bare "Application error: a client-side exception has occurred" on a
 * white page. That is both alarming and a dead end: there is no way
 * back into the app.
 *
 * `reset()` re-renders the failed segment in place, so a transient
 * failure (a dropped connection mid-read) recovers without a full
 * reload and without losing the user's place in the flow.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    reportError({
      scope: "route-boundary",
      message: error.message,
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [error]);

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame items-center justify-center">
        <ErrorState
          message="Something went wrong on this screen. Your data is safe — nothing was lost."
          onRetry={reset}
        />
        <div className="w-full max-w-[280px] pb-10">
          <Button variant="ghost" onClick={() => router.push("/")}>
            Back to start
          </Button>
        </div>
      </div>
    </main>
  );
}

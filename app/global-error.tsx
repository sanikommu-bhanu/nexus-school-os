"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability";

/**
 * Last-resort boundary: catches errors thrown by the ROOT LAYOUT
 * itself, which app/error.tsx cannot — it lives inside that layout.
 *
 * Because the layout is what failed, this component replaces it
 * entirely and therefore has to render its own <html> and <body>.
 * That also means it cannot rely on the app's stylesheet having been
 * applied, so the styling here is inline and self-contained rather
 * than using Tailwind classes that may never load.
 *
 * This should effectively never render. It exists so that if it ever
 * does, the user sees something deliberate instead of a blank page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError({ scope: "root-layout", message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#120E13",
          color: "#FBF4F7",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 340, textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 1.25rem",
              borderRadius: "50%",
              background: "rgba(237,127,160,0.14)",
              border: "1px solid rgba(237,127,160,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
            aria-hidden="true"
          >
            !
          </div>
          <h1 style={{ fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            NEXUS couldn&apos;t start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#C4B2BC", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            Something failed before the app could load. Your data is safe.
          </p>
          <button
            onClick={reset}
            style={{
              width: "100%",
              padding: "0.85rem 1.5rem",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(135deg,#FF9DB8 0%,#ED7FA0 46%,#C85F80 100%)",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * On-brand 404.
 *
 * Without this, a mistyped or stale URL lands on Next's default
 * unstyled "404 | This page could not be found" — which looks like the
 * app is broken rather than like the address is wrong, and offers no
 * route back in.
 *
 * Deliberately does not guess where the visitor belongs: role is
 * resolved by AuthGuard from their profile, so the honest destination
 * is "/", which re-runs that resolution and forwards them correctly.
 */
export default function NotFound() {
  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame items-center justify-center text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border
            border-action/25 bg-action/15 text-action-light shadow-glow-pink backdrop-blur-md"
        >
          <Compass className="h-6 w-6" strokeWidth={1.75} />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-ink">Page not found</h1>
        <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-ink-muted">
          That address doesn&apos;t exist in NEXUS. It may have moved, or the link may be out of date.
        </p>

        <Link href="/" className="btn-action mt-7 w-full max-w-[280px]">
          Back to NEXUS
        </Link>
      </div>
    </main>
  );
}

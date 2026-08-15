"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js on mount. A no-op (and safe) anywhere the API
 * isn't available — older browsers, some in-app webviews, or if this
 * ever runs outside a secure context (service workers require HTTPS
 * or localhost).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (e.g. unsupported context) should never
      // break the app — this is a pure enhancement.
    });
  }, []);
  return null;
}

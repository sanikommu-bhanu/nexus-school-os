"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "nexus:selectedChildId";

/**
 * Clears the persisted child selection. Called on sign-out: the value
 * lives in localStorage, which survives the session, so without this the
 * NEXT person to sign in on the same device inherits the previous
 * parent's selected child id.
 */
export function clearSelectedChild() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

/** Persists the parent's chosen child across screens (Part 21). */
export function useSelectedChild(defaultId?: string) {
  const [selectedChildId, setSelectedChildIdState] = useState<string | undefined>(undefined);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    setSelectedChildIdState(stored ?? defaultId);
  }, [defaultId]);

  const setSelectedChildId = useCallback((id: string) => {
    setSelectedChildIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, id);
  }, []);

  return { selectedChildId, setSelectedChildId };
}

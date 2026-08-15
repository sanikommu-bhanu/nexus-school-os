"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "nexus:selectedChildId";

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

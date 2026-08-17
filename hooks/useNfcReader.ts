"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ------------------------------------------------------------
// Web NFC is not in TypeScript's DOM lib, so the slice we use is
// declared here rather than pulling in a dependency for three types.
// ------------------------------------------------------------
interface NdefRecordLike {
  recordType: string;
  data?: BufferSource;
  encoding?: string;
}
interface NdefMessageLike {
  records: readonly NdefRecordLike[];
}
interface NdefReadingEventLike extends Event {
  serialNumber: string;
  message: NdefMessageLike;
}
interface NdefReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}
type NdefReaderCtor = new () => NdefReaderLike;

function getNdefReader(): NdefReaderCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader ?? null;
}

export type NfcStatus = "unsupported" | "idle" | "scanning" | "denied" | "error";

/**
 * Reads NFC / RFID cards through the Web NFC API.
 *
 * Availability is narrow — Chrome on Android, over HTTPS, and only
 * after the user grants permission — so this hook always reports
 * `unsupported` honestly rather than pretending. Every caller is
 * expected to offer another capture route alongside it; the point of
 * lib/attendance-capture.ts is that all routes produce the same token.
 *
 * Two things are read from a tap, in order of preference:
 *   1. an NDEF text/url record, which is what a NEXUS-written card has
 *   2. the tag's hardware serial number, so a school's EXISTING
 *      unprogrammed RFID cards still work once enrolled
 */
export function useNfcReader(onToken: (token: string) => void) {
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Kept in a ref so restarting the scan is not required just because
  // the caller re-created its handler on a re-render.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    setStatus(getNdefReader() ? "idle" : "unsupported");
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "scanning" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    const Reader = getNdefReader();
    if (!Reader) {
      setStatus("unsupported");
      return;
    }
    if (abortRef.current) return; // already scanning

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    try {
      const reader = new Reader();
      await reader.scan({ signal: controller.signal });
      setStatus("scanning");

      reader.addEventListener("reading", (event) => {
        const e = event as NdefReadingEventLike;

        for (const record of e.message.records) {
          if (record.recordType !== "text" && record.recordType !== "url") continue;
          if (!record.data) continue;
          try {
            const text = new TextDecoder(record.encoding || "utf-8").decode(record.data);
            if (text.trim()) {
              onTokenRef.current(text);
              return;
            }
          } catch {
            // Unreadable record — fall through to the serial number.
          }
        }

        // No usable NDEF payload: use the tag's own serial. This is what
        // lets a school keep its existing cards instead of reprogramming
        // every one of them.
        if (e.serialNumber) onTokenRef.current(e.serialNumber);
      });
    } catch (err) {
      abortRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      // A refused permission is a normal outcome, not a failure state.
      const denied = err instanceof Error && err.name === "NotAllowedError";
      setStatus(denied ? "denied" : "error");
      setError(
        denied
          ? "NFC permission was declined. You can still scan a card with the camera."
          : message
      );
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { status, error, start, stop, supported: status !== "unsupported" };
}

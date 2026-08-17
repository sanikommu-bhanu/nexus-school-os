// ============================================================
// Automated attendance capture — pure logic, no DOM, no Firestore.
//
// The sensor is deliberately not this module's concern. An RFID/NFC
// tap, a camera reading an ID card, and a typed roll number all
// produce the same thing: a string. Everything downstream of that —
// resolving it to a student, rejecting duplicates, tracking the
// session — is identical, so it lives here and is unit-tested without
// a camera or a phone.
//
// That is what "seamlessly into the ERP" has to mean in practice: the
// capture method is swappable, and the attendance record it produces
// is exactly the one the manual register produces. There is no second
// attendance pipeline to keep in sync.
// ============================================================

export interface ScannableStudent {
  /** The student's userId — the same key the roster and attendance records use. */
  id: string;
  rollNumber?: string;
  name?: string;
}

export type ScanOutcome =
  | { kind: "marked"; student: ScannableStudent }
  /** Already scanned in this session — a second tap is a no-op, not an error. */
  | { kind: "duplicate"; student: ScannableStudent }
  /** Resolved to nobody on this roster (wrong class, unregistered card). */
  | { kind: "unknown"; token: string };

/**
 * Strips the wrappers different sensors add.
 *
 * A QR on an ID card typically encodes a deep link, an NFC tag may
 * carry a URL record, and a human types a bare roll number. Reducing
 * all three to the bare identifier here means the matcher below only
 * has one shape to reason about.
 */
export function normalizeToken(raw: string): string {
  let token = raw.trim();

  // nexus://student/<id> or https://nexus.app/student/<id> or .../join/student/<id>
  const urlish = /(?:nexus:\/\/|https?:\/\/[^/]+\/)(?:.*\/)?student\/([^/?#\s]+)/i.exec(token);
  if (urlish) return urlish[1].trim();

  // "nexus:student:<id>" / "student:<id>"
  const prefixed = /^(?:nexus:)?student:(.+)$/i.exec(token);
  if (prefixed) return prefixed[1].trim();

  return token;
}

/**
 * Finds the student a scanned token refers to.
 *
 * Matches on userId first (what a NEXUS-issued card encodes), then
 * roll number (what a school's existing cards usually carry). Roll
 * numbers are compared case-insensitively and with surrounding
 * whitespace removed, because they are printed and re-typed by humans.
 *
 * Returns null rather than guessing — marking the wrong child present
 * is far worse than asking the teacher to check.
 */
export function resolveScan(
  rawToken: string,
  roster: ScannableStudent[]
): ScannableStudent | null {
  const token = normalizeToken(rawToken);
  if (!token) return null;

  const exactId = roster.find((s) => s.id === token);
  if (exactId) return exactId;

  const lower = token.toLowerCase();
  const byRoll = roster.filter(
    (s) => s.rollNumber && s.rollNumber.trim().toLowerCase() === lower
  );
  // An ambiguous roll number is treated as unresolved for the same
  // reason: better to ask than to mark the wrong student.
  if (byRoll.length === 1) return byRoll[0];

  return null;
}

/**
 * Applies one scan to a session.
 *
 * `scanned` is NOT mutated — the caller decides whether to commit the
 * outcome, which keeps this usable from a React state updater without
 * a hidden side effect.
 */
export function applyScan(
  rawToken: string,
  roster: ScannableStudent[],
  scanned: ReadonlySet<string>
): ScanOutcome {
  const student = resolveScan(rawToken, roster);
  if (!student) return { kind: "unknown", token: normalizeToken(rawToken) };
  if (scanned.has(student.id)) return { kind: "duplicate", student };
  return { kind: "marked", student };
}

export interface SessionSummary {
  scanned: number;
  total: number;
  /** Everyone on the roster who has not been scanned yet. */
  missing: ScannableStudent[];
}

/**
 * Where the session has got to.
 *
 * `missing` is the useful half: at the end of a scan-in, the students
 * who never tapped are precisely the absentees, so the teacher
 * confirms a short list instead of marking a long one.
 */
export function summarizeSession(
  roster: ScannableStudent[],
  scanned: ReadonlySet<string>
): SessionSummary {
  const missing = roster.filter((s) => !scanned.has(s.id));
  return { scanned: roster.length - missing.length, total: roster.length, missing };
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Drops keys whose value is `undefined` before a Firestore write.
 *
 * Firestore's client SDK throws "Unsupported field value: undefined"
 * rather than skipping the field, and every domain type here has
 * genuinely optional fields (a fee structure with no classId is
 * school-wide, a timetable slot with no room, an assignment with no
 * attachment). "Absent" is the correct representation of those, so the
 * key has to go rather than be written as undefined.
 *
 * This was already solved twice in-place — services/user-service.ts had
 * its own copy and app/admin/classes/[classId]/timetable/page.tsx works
 * around it at the call site — while services/fee-service.ts had neither,
 * which made creating a school-wide fee structure (the DEFAULT option in
 * the admin's dropdown) throw every single time. Centralised here so a
 * write service is safe by construction instead of depending on each
 * caller remembering.
 */
export function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Generates a collision-resistant public code, e.g. "SCH-7F82K91".
 * Uses a non-sequential, non-guessable alphabet (no 0/O/1/I ambiguity).
 * Real production code should call this server-side (or via a
 * Firestore transaction with a uniqueness check) — this is the
 * client-safe reference implementation used by the UI/demo layer.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateJoinCode(prefix: string, length = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${prefix}-${code}`;
}

export function generateClassCode(grade: string, section: string, subject: string): string {
  const subjectTag = subject.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, "");
  const random = generateJoinCode("", 4).replace("-", "");
  return `NX${grade}${section}-${subjectTag}-${random}`;
}

/**
 * Coerces a Firestore-shaped timestamp into a real `Date`.
 *
 * Every service in this app declares `createdAt: string` on its
 * interface but writes `serverTimestamp()` — so what comes back from
 * `d.data() as T` is a Firestore `Timestamp`, not the ISO string the
 * type promises. `new Date(timestamp)` on that object yields Invalid
 * Date, which is how a real, correctly-stored record ends up rendering
 * as "Invalid Date" in the UI.
 *
 * Accepts all three shapes that can legitimately reach a render path:
 * a `Timestamp` (normal read), an ISO string (optimistic local value
 * returned by the create functions before any re-read), or a `Date`.
 * Returns null when there is nothing usable, so callers render a dash
 * rather than a broken date.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  // Firestore Timestamp — duck-typed rather than imported so this stays
  // usable from code that never touches the SDK.
  if (typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

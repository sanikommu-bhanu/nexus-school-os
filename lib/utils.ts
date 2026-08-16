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

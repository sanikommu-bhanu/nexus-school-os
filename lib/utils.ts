import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

// ============================================================
// Fee management — schools/{schoolId}/feeStructures/{id} and
// schools/{schoolId}/feePayments/{id}.
//
// There is no payment gateway integration here. Dues are defined by
// an admin (feeStructures) and payments are recorded by an admin
// after money is actually collected (feePayments) — same model as
// attendance being "marked" rather than sensed. This keeps the
// numbers real per the project's no-fake-data rule instead of
// simulating a "Pay Now" flow that doesn't move any money.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { stripUndefined } from "@/lib/utils";
import { MAX_LEDGER } from "@/lib/query-bounds";
import type { FeePayment, FeePaymentMethod, FeeStructure } from "@/types";

export async function createFeeStructure(
  schoolId: string,
  createdBy: string,
  data: { title: string; amount: number; dueDate: string; classId?: string }
): Promise<FeeStructure> {
  if (!db) throw new Error("Firebase isn't configured.");
  const ref = doc(collection(db, "schools", schoolId, "feeStructures"));
  const structure: FeeStructure = {
    id: ref.id,
    schoolId,
    createdBy,
    ...stripUndefined(data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as FeeStructure;
  // A school-wide structure legitimately has NO classId, and the admin
  // fees screen sends `classId: undefined` for exactly that case — the
  // dropdown's default. Writing it unstripped threw "Unsupported field
  // value: undefined", so the most common fee structure could never be
  // created.
  await setDoc(ref, { ...structure, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return structure;
}

export async function getFeeStructuresForSchool(schoolId: string): Promise<FeeStructure[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "schools", schoolId, "feeStructures"), orderBy("dueDate", "asc")));
  return snap.docs.map((d) => d.data() as FeeStructure);
}

/** Fee structures that apply to a given class: school-wide ones plus that class's own. */
export async function getFeeStructuresForClass(schoolId: string, classId: string): Promise<FeeStructure[]> {
  const all = await getFeeStructuresForSchool(schoolId);
  return all.filter((f) => !f.classId || f.classId === classId);
}

export async function recordFeePayment(
  schoolId: string,
  recordedBy: string,
  data: { studentId: string; feeStructureId: string; amountPaid: number; method: FeePaymentMethod; note?: string }
): Promise<FeePayment> {
  if (!db) throw new Error("Firebase isn't configured.");
  const ref = doc(collection(db, "schools", schoolId, "feePayments"));
  const payment: FeePayment = {
    id: ref.id,
    schoolId,
    recordedBy,
    paidAt: new Date().toISOString(),
    // `note` is optional and blank on the admin's record-payment form.
    ...stripUndefined(data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as FeePayment;
  await setDoc(ref, { ...payment, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return payment;
}

export async function getPaymentsForStudent(schoolId: string, studentId: string): Promise<FeePayment[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "feePayments"), where("studentId", "==", studentId))
  );
  return snap.docs
    .map((d) => d.data() as FeePayment)
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

/**
 * A BOUNDED page of payments. This collection is append-only and grows
 * for the life of the school, so reading it whole was the worst of the
 * unbounded queries — it gets slower and more expensive every term.
 */
export async function getAllPaymentsForSchool(schoolId: string, max = MAX_LEDGER): Promise<FeePayment[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "schools", schoolId, "feePayments"), limit(max)));
  return snap.docs.map((d) => d.data() as FeePayment);
}

export interface StudentFeeSummary {
  totalDue: number;
  totalPaid: number;
  balance: number;
  structures: (FeeStructure & { paid: number; isPaid: boolean })[];
}

/** Joins a student's applicable fee structures with what they've actually paid against each. */
export function summarizeStudentFees(structures: FeeStructure[], payments: FeePayment[]): StudentFeeSummary {
  const paidByStructure = new Map<string, number>();
  payments.forEach((p) => paidByStructure.set(p.feeStructureId, (paidByStructure.get(p.feeStructureId) ?? 0) + p.amountPaid));

  const withPaid = structures.map((s) => {
    const paid = paidByStructure.get(s.id) ?? 0;
    return { ...s, paid, isPaid: paid >= s.amount };
  });

  const totalDue = structures.reduce((sum, s) => sum + s.amount, 0);
  const totalPaid = withPaid.reduce((sum, s) => sum + Math.min(s.paid, s.amount), 0);

  return { totalDue, totalPaid, balance: totalDue - totalPaid, structures: withPaid };
}

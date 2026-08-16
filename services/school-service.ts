// ============================================================
// School service — the only place that reads/writes schools/{id}
// and schools/{id}/members/{uid}. Mirrors user-service.ts's pattern.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { generateJoinCode } from "@/lib/utils";
import type { School, SchoolMember, Role } from "@/types";

export async function createSchool(
  ownerId: string,
  data: Pick<School, "name" | "type" | "city" | "state" | "logoURL" | "contactEmail" | "contactPhone">
): Promise<School> {
  if (!db) throw new Error("Firebase isn't configured.");
  // Local const so the null-check narrowing survives into the
  // transaction closure below — `db` is an imported binding, which
  // TypeScript will not keep narrowed across a function boundary.
  const database = db;

  // Collision-resistant code. The uniqueness scan runs BEFORE the
  // transaction: `getDocs` is an ordinary query, not a transactional
  // read, so running it inside the callback gave no atomicity while
  // still re-running on every transaction retry.
  let code = generateJoinCode("SCH");
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getDocs(query(collection(database, "schools"), where("code", "==", code)));
    if (existing.empty) break;
    code = generateJoinCode("SCH");
  }

  const schoolRef = doc(collection(database, "schools"));

  // These two writes CANNOT share a transaction, even though they are
  // logically one operation.
  //
  // The members/{uid} create rule authorises a self-assigned 'admin' role
  // only for the school's owner, and proves ownership with
  //   get(/databases/$(database)/documents/schools/$(schoolId)).data.ownerId
  // Rules evaluate get() against *committed* data, and every write in a
  // transaction is checked against the pre-transaction state — so inside
  // one transaction that get() cannot see the school doc being created
  // alongside it, reads null, and the whole transaction is rejected with
  // permission-denied. Creating a school failed outright, which meant admin
  // onboarding could never complete. (Verified directly against the
  // deployed rules: the two writes succeed in sequence and fail together.)
  //
  // Writing the school first makes the ownership check resolvable. The
  // cost is atomicity, and it is recoverable in the one direction that
  // matters: if the member write fails, the school doc exists with
  // ownerId == this user, so the same rule still authorises the member
  // write on a later attempt. The reverse (a member doc for a school that
  // doesn't exist) is not possible with this ordering.
  await setDoc(schoolRef, {
    id: schoolRef.id,
    ownerId,
    code,
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(database, "schools", schoolRef.id, "members", ownerId), {
      userId: ownerId,
      schoolId: schoolRef.id,
      role: "admin" as Role,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Without this membership the owner is not an admin of their own
    // school: every school-scoped read and the school update itself are
    // gated on isSchoolAdmin/isSchoolMember. Failing loudly with the id
    // beats returning a school the user has no access to.
    throw new Error(
      `School ${schoolRef.id} was created, but granting you admin access to it failed ` +
        `(${err instanceof Error ? err.message : "unknown error"}). Please try again.`
    );
  }

  const snap = await getDoc(schoolRef);
  return snap.data() as School;
}

/** Fields an admin may edit after creation. */
export type SchoolEditableFields = Pick<
  School,
  "name" | "type" | "city" | "state" | "logoURL" | "contactEmail" | "contactPhone"
>;

/**
 * Updates schools/{schoolId}. Admin-only — enforced by firestore.rules
 * (`allow update: if isSchoolAdmin(schoolId)`), not just by the UI.
 *
 * `id`, `ownerId` and `code` are deliberately absent from the editable
 * set: the join code is printed on QR posters and handed to teachers,
 * students and parents, so letting an edit form rewrite it would silently
 * invalidate every code already in circulation.
 *
 * Returns the re-read document so callers can render the stored result
 * rather than assuming their optimistic copy matches what landed.
 */
export async function updateSchool(
  schoolId: string,
  data: Partial<SchoolEditableFields>
): Promise<School> {
  if (!db) throw new Error("Firebase isn't configured.");

  // Firestore rejects explicit `undefined` field values outright, and
  // optional fields (logoURL, contactEmail, contactPhone) arrive as
  // undefined whenever they're blank — see services/user-service.ts.
  const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (Object.keys(payload).length === 0) {
    throw new Error("Nothing to update.");
  }

  const ref = doc(db, "schools", schoolId);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });

  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("School not found after update.");
  return snap.data() as School;
}

export async function getSchoolByCode(code: string): Promise<School | null> {
  if (!db) return null;
  const normalized = code.trim().toUpperCase();
  const snap = await getDocs(query(collection(db, "schools"), where("code", "==", normalized)));
  if (snap.empty) return null;
  return snap.docs[0].data() as School;
}

export async function getSchoolById(schoolId: string): Promise<School | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId));
  return snap.exists() ? (snap.data() as School) : null;
}

export async function addSchoolMember(
  schoolId: string,
  userId: string,
  role: Role
): Promise<{ alreadyMember: boolean }> {
  if (!db) throw new Error("Firebase isn't configured.");
  const memberRef = doc(db, "schools", schoolId, "members", userId);

  // This existence check is an OPTIMISATION, not a precondition, and it
  // must never be allowed to fail the join.
  //
  // The members read rule is `isSchoolMember(schoolId)` — membership in
  // the very collection being read. Someone joining a school is by
  // definition not a member yet, so this read is denied with
  // permission-denied for exactly the people who need to join, and the
  // error propagated out as "Missing or insufficient permissions"
  // before the (perfectly permitted) write was ever attempted.
  //
  // That broke every join-by-code flow: teachers joining a school, and
  // parent-link-service adding a parent to their child's school — which
  // is what gates a parent's access to attendance, assignments,
  // timetable, documents and fees.
  //
  // A denial here is not an error condition, it IS the "not a member
  // yet" answer, so treat it as such and continue to the write. Any
  // other failure is still a real failure and rethrown.
  try {
    const existing = await getDoc(memberRef);
    if (existing.exists()) return { alreadyMember: true };
  } catch (err) {
    if ((err as { code?: string })?.code !== "permission-denied") throw err;
  }

  await setDoc(memberRef, {
    userId,
    schoolId,
    role,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { alreadyMember: false };
}

export async function getSchoolMembers(schoolId: string): Promise<SchoolMember[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "members"));
  return snap.docs.map((d) => d.data() as SchoolMember);
}

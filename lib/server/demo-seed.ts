// ============================================================
// The demo seeder. SERVER ONLY.
//
// WHAT THIS IS AND IS NOT
// It is not a second data architecture. Every document written here
// lands in the collections documented in SCHEMA.md, with the same
// field names and the same deterministic ids the existing services
// use, so the app's own queries, calculations and AI tools read it
// without knowing it was seeded. Nothing here writes a precomputed
// statistic: attendance percentages, submission tallies and class
// counts are all derived by the existing code from the records below.
//
// It uses the Admin SDK because firestore.rules require identity
// documents to be self-written (see lib/server/firebase-admin.ts).
// That bypass exists here and nowhere else; ordinary app traffic is
// unchanged and still fully rule-governed.
//
// WHY IT IS SPLIT INTO PHASES
// Vercel's Hobby plan caps a function at 60s. A single pass writes
// ~2,900 documents and calls the embedding API, which does not
// reliably fit. Each phase below is independently runnable and
// independently re-runnable, so an interrupted seed is resumed by
// re-issuing that phase rather than starting over. Idempotency is not
// bolted on: every id is deterministic, so a re-run addresses the same
// documents. Existence is checked before writing purely so the caller
// can be told honestly what was created versus reused.
//
// SAFETY
//  * Every write is scoped to DEMO_SCHOOL_ID. No code path accepts a
//    school id from a caller.
//  * Reset deletes only documents under the demo school plus
//    demo-tagged identity docs. No wildcard, no "delete everything".
// ============================================================
import type { CollectionReference, Firestore, WriteBatch } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { getAiProvider } from "@/lib/ai/provider";
import { chunkText } from "@/lib/ai/chunk";
import { uploadToCloudinary, isCloudinaryConfigured } from "@/lib/cloudinary";
import {
  ATTENDANCE_DAYS,
  DEMO_ADMIN_UID,
  DEMO_ANNOUNCEMENTS,
  DEMO_ASSIGNMENT_SPECS,
  DEMO_CLASSES,
  DEMO_CLASS_ANNOUNCEMENT,
  DEMO_FEE_STRUCTURES,
  DEMO_POLICY_DOCS,
  DEMO_SCHOOL_CODE,
  DEMO_SCHOOL_ID,
  DEMO_TAG,
  DEMO_TEACHERS,
  DEMO_UID_PREFIX,
  PERIODS,
  TIMETABLE_DAYS,
  attendanceStatusFor,
  buildDemoParents,
  buildDemoStudents,
  gradeFor,
  recentSchoolDays,
  submissionStatusFor,
  type DemoParent,
  type DemoStudent,
} from "@/lib/server/demo-seed-data";

const SCHOOL_NAME = "NEXUS International School";

export const SEED_PHASES = [1, 2, 3, 4] as const;
export type SeedPhase = (typeof SEED_PHASES)[number];

export function isSeedPhase(v: unknown): v is SeedPhase {
  return typeof v === "number" && (SEED_PHASES as readonly number[]).includes(v);
}

export interface PhaseResult {
  phase: SeedPhase;
  status: "success" | "partial";
  schoolId: string;
  created: Record<string, number>;
  reused: Record<string, number>;
  authAccounts: { role: string; email: string; uid: string }[];
  warnings: string[];
  errors: string[];
  nextPhase: SeedPhase | null;
  elapsedMs: number;
}

/**
 * Firestore caps a batch at 500 operations. This accumulates writes and
 * flushes automatically, so callers can queue thousands of attendance
 * records without thinking about it.
 */
class BatchWriter {
  private batch: WriteBatch;
  private pending = 0;
  private total = 0;

  constructor(private db: Firestore) {
    this.batch = db.batch();
  }

  async set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, merge = true) {
    this.batch.set(ref, data, { merge });
    this.pending++;
    this.total++;
    if (this.pending >= 450) await this.flush();
  }

  async delete(ref: FirebaseFirestore.DocumentReference) {
    this.batch.delete(ref);
    this.pending++;
    this.total++;
    if (this.pending >= 450) await this.flush();
  }

  async flush() {
    if (this.pending === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.pending = 0;
  }

  get written() {
    return this.total;
  }
}

/**
 * Ids that already exist in a collection.
 *
 * `.select()` fetches document ids without any field data, so deciding
 * created-vs-reused for a thousand attendance rows costs one metadata
 * query rather than a thousand point reads.
 */
async function existingIds(col: CollectionReference): Promise<Set<string>> {
  const snap = await col.select().get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Tally helper — keeps created/reused bookkeeping out of the seeding logic. */
class Tally {
  created: Record<string, number> = {};
  reused: Record<string, number> = {};
  note(group: string, existed: boolean) {
    const target = existed ? this.reused : this.created;
    target[group] = (target[group] ?? 0) + 1;
  }
}

function stamps() {
  return { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function schoolRefOf(db: Firestore) {
  return db.collection("schools").doc(DEMO_SCHOOL_ID);
}

/**
 * Creates or updates one Firebase Auth user at a fixed uid.
 *
 * A missing password is not fatal — the identity documents are still
 * written, so the school is fully populated and browsable; only the
 * ability to log in as that persona is missing, and the caller is told.
 */
async function upsertAuthUser(
  uid: string,
  email: string,
  displayName: string,
  password: string | undefined,
  warnings: string[]
): Promise<boolean> {
  const auth = adminAuth();
  try {
    await auth.getUser(uid);
    if (password) await auth.updateUser(uid, { email, displayName, password, emailVerified: true });
    else await auth.updateUser(uid, { email, displayName });
    return true;
  } catch {
    if (!password) {
      warnings.push(`No password env var set for ${email} — Auth account not created (records still seeded).`);
      return false;
    }
    await auth.createUser({ uid, email, displayName, password, emailVerified: true });
    return true;
  }
}

function baseResult(phase: SeedPhase, startedAt: number, t: Tally): PhaseResult {
  return {
    phase,
    status: "success",
    schoolId: DEMO_SCHOOL_ID,
    created: t.created,
    reused: t.reused,
    authAccounts: [],
    warnings: [],
    errors: [],
    nextPhase: phase < 4 ? ((phase + 1) as SeedPhase) : null,
    elapsedMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------
// PHASE 1 — school, admin, teachers
// ---------------------------------------------------------------

export async function seedPhase1(): Promise<PhaseResult> {
  const startedAt = Date.now();
  const db = adminDb();
  const w = new BatchWriter(db);
  const t = new Tally();
  const warnings: string[] = [];
  const schoolRef = schoolRefOf(db);

  const schoolExisted = (await schoolRef.get()).exists;
  await w.set(schoolRef, {
    id: DEMO_SCHOOL_ID,
    name: SCHOOL_NAME,
    type: "International Baccalaureate",
    city: "Bengaluru",
    state: "Karnataka",
    contactEmail: "office@demo.example.com",
    contactPhone: "+91 80 4000 1000",
    code: DEMO_SCHOOL_CODE,
    ownerId: DEMO_ADMIN_UID,
    demoTag: DEMO_TAG,
    ...stamps(),
  });
  t.note("school", schoolExisted);

  const usersSeen = await existingIds(db.collection("users"));
  const membersSeen = await existingIds(schoolRef.collection("members"));
  const teachersSeen = await existingIds(db.collection("teachers"));

  const addUser = async (
    uid: string,
    fullName: string,
    email: string,
    role: "admin" | "teacher" | "student" | "parent",
    extra: Record<string, unknown> = {}
  ) => {
    await w.set(db.collection("users").doc(uid), {
      id: uid, fullName, email, role, onboardingComplete: true,
      schoolId: DEMO_SCHOOL_ID, demoTag: DEMO_TAG, ...extra, ...stamps(),
    });
    t.note("users", usersSeen.has(uid));
    await w.set(schoolRef.collection("members").doc(uid), {
      userId: uid, schoolId: DEMO_SCHOOL_ID, role, status: "active", demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("schoolMembers", membersSeen.has(uid));
  };

  await addUser(DEMO_ADMIN_UID, "Demo Administrator", "admin@demo.example.com", "admin");

  for (const teacher of DEMO_TEACHERS) {
    const classIds = DEMO_CLASSES.filter((c) => DEMO_TEACHERS[c.teacherIndex].uid === teacher.uid).map((c) => c.id);
    await addUser(teacher.uid, teacher.fullName, teacher.email, "teacher");
    await w.set(db.collection("teachers").doc(teacher.uid), {
      userId: teacher.uid, schoolId: DEMO_SCHOOL_ID, subject: teacher.subject,
      department: teacher.department, classIds, demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("teachers", teachersSeen.has(teacher.uid));
  }

  await w.flush();

  // Auth accounts for the two personas this phase owns.
  const authAccounts: { role: string; email: string; uid: string }[] = [];
  const demoTeacher = DEMO_TEACHERS[0];
  const personas = [
    { role: "admin", uid: DEMO_ADMIN_UID, email: "admin@demo.example.com", name: "Demo Administrator", pw: process.env.DEMO_ADMIN_PASSWORD },
    { role: "teacher", uid: demoTeacher.uid, email: demoTeacher.email, name: demoTeacher.fullName, pw: process.env.DEMO_TEACHER_PASSWORD },
  ];
  for (const p of personas) {
    if (await upsertAuthUser(p.uid, p.email, p.name, p.pw, warnings)) {
      authAccounts.push({ role: p.role, email: p.email, uid: p.uid });
    }
  }

  const result = baseResult(1, startedAt, t);
  result.authAccounts = authAccounts;
  result.warnings = warnings;
  return result;
}

// ---------------------------------------------------------------
// PHASE 2 — classes, students, parents, links
// ---------------------------------------------------------------

export async function seedPhase2(): Promise<PhaseResult> {
  const startedAt = Date.now();
  const db = adminDb();
  const w = new BatchWriter(db);
  const t = new Tally();
  const warnings: string[] = [];
  const schoolRef = schoolRefOf(db);

  if (!(await schoolRef.get()).exists) {
    const r = baseResult(2, startedAt, t);
    r.status = "partial";
    r.errors = ["Phase 1 has not run: the demo school does not exist yet. Run phase 1 first."];
    r.nextPhase = 1;
    return r;
  }

  const students = buildDemoStudents();
  const parents = buildDemoParents(students);

  const usersSeen = await existingIds(db.collection("users"));
  const membersSeen = await existingIds(schoolRef.collection("members"));
  const classesSeen = await existingIds(schoolRef.collection("classes"));
  const studentsSeen = await existingIds(db.collection("students"));
  const parentsSeen = await existingIds(db.collection("parents"));
  const linksSeen = await existingIds(db.collection("parentStudentLinks"));

  const addUser = async (
    uid: string, fullName: string, email: string,
    role: "student" | "parent", extra: Record<string, unknown> = {}
  ) => {
    await w.set(db.collection("users").doc(uid), {
      id: uid, fullName, email, role, onboardingComplete: true,
      schoolId: DEMO_SCHOOL_ID, demoTag: DEMO_TAG, ...extra, ...stamps(),
    });
    t.note("users", usersSeen.has(uid));
    await w.set(schoolRef.collection("members").doc(uid), {
      userId: uid, schoolId: DEMO_SCHOOL_ID, role, status: "active", demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("schoolMembers", membersSeen.has(uid));
  };

  // ---- Classes + class members ----
  for (const c of DEMO_CLASSES) {
    const teacher = DEMO_TEACHERS[c.teacherIndex];
    const roster = students.filter((s) => s.classId === c.id);
    await w.set(schoolRef.collection("classes").doc(c.id), {
      id: c.id, schoolId: DEMO_SCHOOL_ID, name: c.name, grade: c.grade, section: c.section,
      subject: teacher.subject, teacherId: teacher.uid, teacherName: teacher.fullName,
      code: c.code,
      // A real count of the roster written below, not a decorative
      // number — the class screens render it and the AI reads it.
      studentCount: roster.length,
      demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("classes", classesSeen.has(c.id));

    const classMembers = schoolRef.collection("classes").doc(c.id).collection("members");
    const cmSeen = await existingIds(classMembers);
    await w.set(classMembers.doc(teacher.uid), {
      userId: teacher.uid, classId: c.id, schoolId: DEMO_SCHOOL_ID, role: "teacher", demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("classMembers", cmSeen.has(teacher.uid));
    for (const s of roster) {
      await w.set(classMembers.doc(s.uid), {
        userId: s.uid, classId: c.id, schoolId: DEMO_SCHOOL_ID, role: "student", demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("classMembers", cmSeen.has(s.uid));
    }
  }

  // ---- Students ----
  for (const s of students) {
    await addUser(s.uid, s.fullName, s.email, "student", { primaryClassId: s.classId });
    await w.set(db.collection("students").doc(s.uid), {
      userId: s.uid, schoolId: DEMO_SCHOOL_ID, classId: s.classId, rollNumber: s.rollNumber,
      dateOfBirth: s.dateOfBirth, gender: s.gender, parentLinkCode: s.parentLinkCode,
      demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("students", studentsSeen.has(s.uid));
  }

  // ---- Parents + links ----
  for (const p of parents) {
    await addUser(p.uid, p.fullName, p.email, "parent");
    await w.set(db.collection("parents").doc(p.uid), {
      userId: p.uid, childIds: p.childIds, contactPhone: p.contactPhone, demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("parents", parentsSeen.has(p.uid));

    for (const childId of p.childIds) {
      const linkId = `${p.uid}_${childId}`;
      await w.set(db.collection("parentStudentLinks").doc(linkId), {
        id: linkId, parentId: p.uid, studentId: childId, relationship: p.relationship,
        verified: true, demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("parentLinks", linksSeen.has(linkId));
    }
  }

  await w.flush();

  // Auth accounts for the two personas this phase owns.
  const authAccounts: { role: string; email: string; uid: string }[] = [];
  const demoStudent = students[0];
  const demoParent = parents[0];
  const personas = [
    { role: "student", uid: demoStudent.uid, email: demoStudent.email, name: demoStudent.fullName, pw: process.env.DEMO_STUDENT_PASSWORD },
    { role: "parent", uid: demoParent.uid, email: demoParent.email, name: demoParent.fullName, pw: process.env.DEMO_PARENT_PASSWORD },
  ];
  for (const p of personas) {
    if (await upsertAuthUser(p.uid, p.email, p.name, p.pw, warnings)) {
      authAccounts.push({ role: p.role, email: p.email, uid: p.uid });
    }
  }

  const result = baseResult(2, startedAt, t);
  result.authAccounts = authAccounts;
  result.warnings = warnings;
  return result;
}

// ---------------------------------------------------------------
// PHASE 3 — operational data
// ---------------------------------------------------------------

export async function seedPhase3(): Promise<PhaseResult> {
  const startedAt = Date.now();
  const db = adminDb();
  const w = new BatchWriter(db);
  const t = new Tally();
  const schoolRef = schoolRefOf(db);

  const students = buildDemoStudents();
  const classesSnap = await existingIds(schoolRef.collection("classes"));
  if (classesSnap.size === 0) {
    const r = baseResult(3, startedAt, t);
    r.status = "partial";
    r.errors = ["Phase 2 has not run: no classes exist yet. Run phase 2 first."];
    r.nextPhase = 2;
    return r;
  }

  // ---- Attendance ----
  const attendanceCol = schoolRef.collection("attendance");
  const attSeen = await existingIds(attendanceCol);
  const days = recentSchoolDays(ATTENDANCE_DAYS);
  for (let si = 0; si < students.length; si++) {
    const s = students[si];
    const cls = DEMO_CLASSES.find((c) => c.id === s.classId)!;
    const teacherUid = DEMO_TEACHERS[cls.teacherIndex].uid;
    for (let di = 0; di < days.length; di++) {
      const date = days[di];
      const id = `${s.classId}_${s.uid}_${date}`;
      await w.set(attendanceCol.doc(id), {
        id, schoolId: DEMO_SCHOOL_ID, classId: s.classId, studentId: s.uid, date,
        status: attendanceStatusFor(si, di, s.attendanceProfile),
        markedBy: teacherUid, demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("attendance", attSeen.has(id));
    }
  }
  await w.flush();

  // ---- Assignments + submissions ----
  const assignmentsCol = schoolRef.collection("assignments");
  const asgSeen = await existingIds(assignmentsCol);
  for (const c of DEMO_CLASSES) {
    const teacher = DEMO_TEACHERS[c.teacherIndex];
    const roster = students.filter((s) => s.classId === c.id);

    for (let ai = 0; ai < DEMO_ASSIGNMENT_SPECS.length; ai++) {
      const spec = DEMO_ASSIGNMENT_SPECS[ai];
      const assignmentId = `demo-asg-${c.id}-${spec.idSuffix}`;
      const overdue = spec.dueInDays < 0;

      await w.set(assignmentsCol.doc(assignmentId), {
        id: assignmentId, schoolId: DEMO_SCHOOL_ID, classId: c.id, teacherId: teacher.uid,
        title: spec.title, description: spec.description, subject: teacher.subject,
        dueDate: isoDaysFromNow(spec.dueInDays), demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("assignments", asgSeen.has(assignmentId));

      const subs = assignmentsCol.doc(assignmentId).collection("submissions");
      const subSeen = await existingIds(subs);
      for (const s of roster) {
        const si = students.indexOf(s);
        const status = submissionStatusFor(si, ai, s.attendanceProfile, overdue);
        const subId = `${assignmentId}_${s.uid}`;
        await w.set(subs.doc(subId), {
          id: subId, assignmentId, studentId: s.uid, classId: c.id, status,
          ...(status !== "pending" ? { submittedAt: new Date().toISOString() } : {}),
          ...(status === "graded" ? { grade: gradeFor(si, ai) } : {}),
          demoTag: DEMO_TAG, ...stamps(),
        });
        t.note("submissions", subSeen.has(subId));
      }
    }
  }
  await w.flush();

  // ---- Timetable ----
  // teacherIndex = (classIndex + period) % teacherCount guarantees no
  // teacher is in two rooms at once for a given period, and each class
  // keeps its own room, so there are no room clashes either.
  const timetableCol = schoolRef.collection("timetable");
  const ttSeen = await existingIds(timetableCol);
  for (let ci = 0; ci < DEMO_CLASSES.length; ci++) {
    const c = DEMO_CLASSES[ci];
    for (const day of TIMETABLE_DAYS) {
      for (const p of PERIODS) {
        const teacher = DEMO_TEACHERS[(ci + p.period) % DEMO_TEACHERS.length];
        const slotId = `demo-tt-${c.id}-${day}-${p.period}`;
        await w.set(timetableCol.doc(slotId), {
          id: slotId, schoolId: DEMO_SCHOOL_ID, classId: c.id, teacherId: teacher.uid,
          subject: teacher.subject, day, period: p.period,
          startTime: p.startTime, endTime: p.endTime, room: c.room,
          demoTag: DEMO_TAG, ...stamps(),
        });
        t.note("timetable", ttSeen.has(slotId));
      }
    }
  }
  await w.flush();

  // ---- Announcements ----
  const annCol = schoolRef.collection("announcements");
  const annSeen = await existingIds(annCol);
  for (const a of DEMO_ANNOUNCEMENTS) {
    const id = `demo-ann-${a.idSuffix}`;
    await w.set(annCol.doc(id), {
      id, schoolId: DEMO_SCHOOL_ID, createdBy: DEMO_ADMIN_UID, title: a.title,
      message: a.message, audience: a.audience, priority: a.priority, demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("announcements", annSeen.has(id));
  }
  for (const c of DEMO_CLASSES) {
    const id = `demo-ann-${c.id}-${DEMO_CLASS_ANNOUNCEMENT.idSuffix}`;
    await w.set(annCol.doc(id), {
      id, schoolId: DEMO_SCHOOL_ID, classId: c.id,
      createdBy: DEMO_TEACHERS[c.teacherIndex].uid,
      title: DEMO_CLASS_ANNOUNCEMENT.title, message: DEMO_CLASS_ANNOUNCEMENT.message,
      audience: "class", priority: DEMO_CLASS_ANNOUNCEMENT.priority, demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("announcements", annSeen.has(id));
  }

  // ---- Fees ----
  const feeStructCol = schoolRef.collection("feeStructures");
  const feePayCol = schoolRef.collection("feePayments");
  const fsSeen = await existingIds(feeStructCol);
  const fpSeen = await existingIds(feePayCol);
  for (const f of DEMO_FEE_STRUCTURES) {
    const id = `demo-fee-${f.idSuffix}`;
    await w.set(feeStructCol.doc(id), {
      id, schoolId: DEMO_SCHOOL_ID, title: f.title, amount: f.amount,
      dueDate: isoDaysFromNow(f.dueInDays), createdBy: DEMO_ADMIN_UID, demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("feeStructures", fsSeen.has(id));

    // Roughly two thirds have paid — a real outstanding balance for the
    // fees screen to show, rather than everything settled.
    for (let si = 0; si < students.length; si++) {
      if ((si + f.amount) % 3 === 0) continue;
      const s = students[si];
      const payId = `demo-pay-${f.idSuffix}-${s.uid}`;
      await w.set(feePayCol.doc(payId), {
        id: payId, schoolId: DEMO_SCHOOL_ID, studentId: s.uid, feeStructureId: id,
        amountPaid: f.amount, method: si % 2 === 0 ? "upi" : "cash",
        paidAt: new Date().toISOString(), recordedBy: DEMO_ADMIN_UID,
        demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("feePayments", fpSeen.has(payId));
    }
  }
  await w.flush();

  return baseResult(3, startedAt, t);
}

// ---------------------------------------------------------------
// PHASE 4 — policy documents + RAG
// ---------------------------------------------------------------

/**
 * Policy documents and their knowledge chunks.
 *
 * Reuses the existing pipeline end to end: the same uploader
 * (lib/cloudinary.ts) so a document has a real, openable file rather
 * than a fabricated URL; the same chunker (lib/ai/chunk.ts); the same
 * embedding model via provider.embed(); and the same KnowledgeChunk
 * shape lib/ai/rag.ts reads back. No second RAG system, no second
 * storage system.
 *
 * Resumable per document: one already carrying chunks is skipped, so
 * retrying after a quota failure only does the work that failed.
 * A document whose embedding fails is stored with aiStatus "error" —
 * never a faked "complete" — and reported in `warnings`, leaving the
 * rest of the school untouched.
 */
export async function seedPhase4(): Promise<PhaseResult> {
  const startedAt = Date.now();
  const db = adminDb();
  const w = new BatchWriter(db);
  const t = new Tally();
  const warnings: string[] = [];
  const errors: string[] = [];
  const schoolRef = schoolRefOf(db);

  const docsCol = schoolRef.collection("documents");
  const kbCol = schoolRef.collection("knowledgeChunks");
  const docsSeen = await existingIds(docsCol);
  const chunksSeen = await existingIds(kbCol);

  const provider = getAiProvider();
  const aiOn = provider.isConfigured();
  if (!aiOn) {
    warnings.push("GEMINI_API_KEY is not configured — policy documents are stored, but no embeddings are generated and NEXUS AI cannot answer policy questions until phase 4 is re-run with AI configured.");
  }
  if (!isCloudinaryConfigured) {
    warnings.push("Cloudinary is not configured — policy documents are stored without a downloadable source file.");
  }

  for (const p of DEMO_POLICY_DOCS) {
    const documentId = `demo-doc-${p.idSuffix}`;
    const chunks = chunkText(p.text);

    // Already fully ingested? Skip the expensive work entirely — this is
    // what makes a retry after a rate-limit cheap.
    const alreadyIngested = chunks.length > 0 && chunksSeen.has(`${documentId}_0`);
    if (alreadyIngested) {
      t.note("documents", true);
      for (let i = 0; i < chunks.length; i++) t.note("knowledgeChunks", true);
      continue;
    }

    // Real file bytes via the existing uploader, so "Open original file"
    // on the document screen resolves instead of dead-ending.
    let fileURL = "";
    if (isCloudinaryConfigured) {
      try {
        const file = new File([p.text], `${p.title}.txt`, { type: "text/plain" });
        const uploaded = await uploadToCloudinary(file, `schools/${DEMO_SCHOOL_ID}/documents`);
        fileURL = uploaded.url;
      } catch (err) {
        warnings.push(`Cloudinary upload failed for "${p.title}" — stored without a source file. ${err instanceof Error ? err.message : ""}`.trim());
      }
    }

    let embeddings: number[][] | null = null;
    if (aiOn && chunks.length > 0) {
      try {
        embeddings = await provider.embed(chunks.map((c) => c.text));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Embedding failed for "${p.title}" (${msg}) — document kept, marked "error", retry phase 4 later.`);
      }
    }

    await w.set(docsCol.doc(documentId), {
      id: documentId, schoolId: DEMO_SCHOOL_ID, ownerId: DEMO_SCHOOL_ID,
      uploadedBy: DEMO_ADMIN_UID, documentType: "policy",
      fileName: `${p.title}.txt`,
      fileURL,
      fileSize: p.text.length,
      mimeType: "text/plain",
      // Honest status: only "complete" when chunks were genuinely
      // embedded, "error" when embedding was attempted and failed,
      // "unavailable" when AI simply isn't configured.
      aiStatus: embeddings ? "complete" : aiOn ? "error" : "unavailable",
      aiSummary: p.text.split("\n").find((l) => l.trim().length > 40)?.slice(0, 180) ?? p.title,
      aiPipelineStep: embeddings ? "done" : "uploading",
      demoTag: DEMO_TAG, ...stamps(),
    });
    t.note("documents", docsSeen.has(documentId));

    if (!embeddings) continue;

    for (let i = 0; i < chunks.length; i++) {
      const id = `${documentId}_${i}`;
      await w.set(kbCol.doc(id), {
        id, schoolId: DEMO_SCHOOL_ID, documentId, documentTitle: p.title,
        audience: "school", chunkIndex: chunks[i].index, text: chunks[i].text,
        embedding: embeddings[i], embeddingModel: "gemini-embedding-001",
        demoTag: DEMO_TAG, ...stamps(),
      });
      t.note("knowledgeChunks", chunksSeen.has(id));
    }
  }

  await w.flush();

  const result = baseResult(4, startedAt, t);
  result.warnings = warnings;
  result.errors = errors;
  // Anything not fully embedded means phase 4 is worth running again.
  const embeddedAll = (t.created.knowledgeChunks ?? 0) + (t.reused.knowledgeChunks ?? 0) > 0;
  if (!embeddedAll || warnings.length > 0) {
    result.status = "partial";
    result.nextPhase = 4;
  }
  return result;
}

export async function runSeedPhase(phase: SeedPhase): Promise<PhaseResult> {
  switch (phase) {
    case 1: return seedPhase1();
    case 2: return seedPhase2();
    case 3: return seedPhase3();
    case 4: return seedPhase4();
  }
}

// ---------------------------------------------------------------
// Reset
// ---------------------------------------------------------------

/**
 * Removes the demo school and only the demo school.
 *
 * Bounded by construction: it walks the known subcollections beneath
 * `schools/nexus-demo-school`, and deletes top-level identity docs only
 * where the document carries the demo tag AND the id has the demo
 * prefix. There is no wildcard, no caller-supplied path, and no way to
 * aim it at another school.
 */
export async function resetDemoSchool(): Promise<{ deleted: number; authDeleted: number }> {
  const db = adminDb();
  const w = new BatchWriter(db);
  const schoolRef = schoolRefOf(db);

  const subcollections = [
    "members", "attendance", "timetable", "announcements", "documents",
    "knowledgeChunks", "feeStructures", "feePayments", "notifications",
  ];

  for (const name of subcollections) {
    const snap = await schoolRef.collection(name).get();
    for (const d of snap.docs) await w.delete(d.ref);
  }

  const classes = await schoolRef.collection("classes").get();
  for (const c of classes.docs) {
    const members = await c.ref.collection("members").get();
    for (const m of members.docs) await w.delete(m.ref);
    await w.delete(c.ref);
  }
  const assignments = await schoolRef.collection("assignments").get();
  for (const a of assignments.docs) {
    const subs = await a.ref.collection("submissions").get();
    for (const s of subs.docs) await w.delete(s.ref);
    await w.delete(a.ref);
  }

  await w.delete(schoolRef);

  for (const col of ["users", "teachers", "students", "parents", "parentStudentLinks"]) {
    const snap = await db.collection(col).where("demoTag", "==", DEMO_TAG).get();
    for (const d of snap.docs) {
      if (col === "parentStudentLinks" || d.id.startsWith(DEMO_UID_PREFIX)) await w.delete(d.ref);
    }
  }

  await w.flush();

  let authDeleted = 0;
  const auth = adminAuth();
  const seededStudents = buildDemoStudents();
  const uids = [
    DEMO_ADMIN_UID,
    ...DEMO_TEACHERS.map((t) => t.uid),
    ...seededStudents.map((s: DemoStudent) => s.uid),
    ...buildDemoParents(seededStudents).map((p: DemoParent) => p.uid),
  ].filter((u) => u.startsWith(DEMO_UID_PREFIX));

  for (const uid of uids) {
    try {
      await auth.deleteUser(uid);
      authDeleted++;
    } catch {
      // Only the four personas have Auth accounts; a missing user is
      // the normal case here, not an error.
    }
  }

  return { deleted: w.written, authDeleted };
}

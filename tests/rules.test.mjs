// ============================================================
// NEXUS — Firestore security-rules test suite (Part 34).
//
// These run against the LOCAL Firestore emulator, never a real
// project. They exist to prove the rules actually reject the attacks
// the comments in firestore.rules claim they reject — a rules file
// that merely *looks* strict is worth nothing until something has
// tried to break it.
//
//   npm run emulators   # terminal 1
//   npm run test:rules  # terminal 2
//
// (or `npm run test:rules:ci`, which starts the emulator itself)
// ============================================================
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  addDoc,
  getDocs,
  increment,
  query,
  where,
} from "firebase/firestore";

const PROJECT_ID = "nexus-school-os";
const HOST = process.env.FIRESTORE_EMULATOR_HOST_NAME || "127.0.0.1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT || 8080);

// ---- tiny test harness (no jest/vitest dependency) ----
const results = [];
let currentGroup = "";
function group(name) {
  currentGroup = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}
async function it(name, fn) {
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push({ group: currentGroup, name, ok: false, err });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`      ${String(err && err.message ? err.message : err).split("\n")[0]}`);
  }
}

// ---- fixture uids ----
const OWNER = "uid_owner_admin";
const TEACHER = "uid_teacher";
const TEACHER2 = "uid_teacher_other";
const STUDENT = "uid_student";
const PARENT = "uid_parent";
const OUTSIDER = "uid_outsider"; // signed in, but member of nothing
const SCHOOL = "school_1";
const SCHOOL_B = "school_2";
const CLASS = "class_1";
const CONVO = "convo_1";

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host: HOST,
    port: PORT,
  },
});

await testEnv.clearFirestore();

// ---- seed a realistic school, bypassing rules ----
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "schools", SCHOOL), {
    id: SCHOOL,
    ownerId: OWNER,
    name: "Nexus Public School",
    code: "SCH-TEST01",
  });
  await setDoc(doc(db, "schools", SCHOOL_B), {
    id: SCHOOL_B,
    ownerId: "uid_other_owner",
    name: "Rival School",
    code: "SCH-TEST02",
  });

  for (const [uid, role] of [
    [OWNER, "admin"],
    [TEACHER, "teacher"],
    [TEACHER2, "teacher"],
    [STUDENT, "student"],
    [PARENT, "parent"],
  ]) {
    await setDoc(doc(db, "schools", SCHOOL, "members", uid), {
      userId: uid,
      schoolId: SCHOOL,
      role,
      status: "active",
    });
  }

  await setDoc(doc(db, "schools", SCHOOL, "classes", CLASS), {
    id: CLASS,
    schoolId: SCHOOL,
    teacherId: TEACHER,
    name: "10-A",
    code: "NX-10A-MATH-42",
    studentCount: 1,
  });

  await setDoc(doc(db, "users", STUDENT), {
    id: STUDENT,
    fullName: "Aarav Sharma",
    email: "aarav@example.com",
    role: "student",
    schoolId: SCHOOL,
    onboardingComplete: true,
  });
  await setDoc(doc(db, "students", STUDENT), {
    userId: STUDENT,
    schoolId: SCHOOL,
    classId: CLASS,
    parentLinkCode: "PL-SECRET-1",
    dateOfBirth: "2010-04-02",
  });

  // A conversation between TEACHER and PARENT only.
  await setDoc(doc(db, "schools", SCHOOL, "conversations", CONVO), {
    id: CONVO,
    schoolId: SCHOOL,
    participantIds: [TEACHER, PARENT],
    unreadFor: [],
  });
  await setDoc(doc(db, "schools", SCHOOL, "conversations", CONVO, "messages", "m1"), {
    id: "m1",
    conversationId: CONVO,
    senderId: TEACHER,
    text: "Hello, about Aarav's progress…",
  });

  // A timetable slot owned by TEACHER's class.
  await setDoc(doc(db, "schools", SCHOOL, "timetable", "slot_1"), {
    id: "slot_1",
    schoolId: SCHOOL,
    classId: CLASS,
    teacherId: TEACHER,
    subject: "Mathematics",
    day: "MO",
    period: 1,
    startTime: "09:00",
    endTime: "09:45",
  });
});

const asOwner = testEnv.authenticatedContext(OWNER).firestore();
const asTeacher = testEnv.authenticatedContext(TEACHER).firestore();
const asTeacher2 = testEnv.authenticatedContext(TEACHER2).firestore();
const asStudent = testEnv.authenticatedContext(STUDENT).firestore();
const asParent = testEnv.authenticatedContext(PARENT).firestore();
const asOutsider = testEnv.authenticatedContext(OUTSIDER).firestore();
const asAnon = testEnv.unauthenticatedContext().firestore();

// ============================================================
group("schools/{id}/members — role lockdown");
// ============================================================

await it("outsider CANNOT self-create a members doc with role:admin (privilege escalation)", async () => {
  await assertFails(
    setDoc(doc(asOutsider, "schools", SCHOOL, "members", OUTSIDER), {
      userId: OUTSIDER,
      schoolId: SCHOOL,
      role: "admin",
      status: "active",
    })
  );
});

await it("outsider CAN self-join with a non-privileged role (student)", async () => {
  await assertSucceeds(
    setDoc(doc(asOutsider, "schools", SCHOOL, "members", OUTSIDER), {
      userId: OUTSIDER,
      schoolId: SCHOOL,
      role: "student",
      status: "active",
    })
  );
});

await it("school owner CAN create their own admin member doc (the createSchool path)", async () => {
  const ownerCtx = testEnv.authenticatedContext("uid_other_owner").firestore();
  await assertSucceeds(
    setDoc(doc(ownerCtx, "schools", SCHOOL_B, "members", "uid_other_owner"), {
      userId: "uid_other_owner",
      schoolId: SCHOOL_B,
      role: "admin",
      status: "active",
    })
  );
});

await it("existing teacher CANNOT self-update their role to admin", async () => {
  await assertFails(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "members", TEACHER), { role: "admin" })
  );
});

await it("existing student CANNOT self-update their role to admin", async () => {
  await assertFails(
    updateDoc(doc(asStudent, "schools", SCHOOL, "members", STUDENT), { role: "admin" })
  );
});

await it("member CAN self-update a non-role field (role unchanged)", async () => {
  await assertSucceeds(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "members", TEACHER), {
      role: "teacher",
      status: "active",
    })
  );
});

await it("school admin CAN change another member's role", async () => {
  await assertSucceeds(
    updateDoc(doc(asOwner, "schools", SCHOOL, "members", STUDENT), { role: "student" })
  );
});

await it("teacher CANNOT create a members doc for somebody else", async () => {
  await assertFails(
    setDoc(doc(asTeacher, "schools", SCHOOL, "members", "uid_victim"), {
      userId: "uid_victim",
      schoolId: SCHOOL,
      role: "student",
      status: "active",
    })
  );
});

// ============================================================
group("conversations / messages — participant isolation");
// ============================================================

await it("non-participant CANNOT read the conversation doc", async () => {
  await assertFails(getDoc(doc(asStudent, "schools", SCHOOL, "conversations", CONVO)));
});

await it("non-participant CANNOT read messages in someone else's conversation", async () => {
  await assertFails(
    getDoc(doc(asStudent, "schools", SCHOOL, "conversations", CONVO, "messages", "m1"))
  );
});

await it("non-participant CANNOT write a message into someone else's conversation", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "conversations", CONVO, "messages"), {
      conversationId: CONVO,
      senderId: STUDENT,
      text: "injected message",
    })
  );
});

await it("non-participant CANNOT write a message while spoofing a participant's senderId", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "conversations", CONVO, "messages"), {
      conversationId: CONVO,
      senderId: TEACHER,
      text: "spoofed as the teacher",
    })
  );
});

await it("participant CAN write a message into their own conversation", async () => {
  await assertSucceeds(
    addDoc(collection(asParent, "schools", SCHOOL, "conversations", CONVO, "messages"), {
      conversationId: CONVO,
      senderId: PARENT,
      text: "Thanks for the update!",
    })
  );
});

await it("participant CANNOT forge a message as the OTHER participant", async () => {
  await assertFails(
    addDoc(collection(asParent, "schools", SCHOOL, "conversations", CONVO, "messages"), {
      conversationId: CONVO,
      senderId: TEACHER,
      text: "forged",
    })
  );
});

await it("participant CANNOT re-parent the conversation (add a third party)", async () => {
  await assertFails(
    updateDoc(doc(asParent, "schools", SCHOOL, "conversations", CONVO), {
      participantIds: [TEACHER, PARENT, OUTSIDER],
    })
  );
});

await it("participant CAN mark the conversation read (unreadFor only)", async () => {
  await assertSucceeds(
    updateDoc(doc(asParent, "schools", SCHOOL, "conversations", CONVO), {
      participantIds: [TEACHER, PARENT],
      unreadFor: [],
    })
  );
});

await it("messages are immutable — even a participant cannot edit one", async () => {
  await assertFails(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "conversations", CONVO, "messages", "m1"), {
      text: "rewritten history",
    })
  );
});

// ============================================================
group("users / students — PII and credential protection");
// ============================================================

await it("user CANNOT change their own role field", async () => {
  await assertFails(updateDoc(doc(asStudent, "users", STUDENT), { role: "admin" }));
});

await it("user CAN update a non-role field on their own profile", async () => {
  await assertSucceeds(
    updateDoc(doc(asStudent, "users", STUDENT), { role: "student", fullName: "Aarav S." })
  );
});

await it("fellow school member CAN read a user profile (roster views)", async () => {
  await assertSucceeds(getDoc(doc(asTeacher, "users", STUDENT)));
});

await it("outsider CANNOT read a user profile from a school they don't belong to", async () => {
  const stranger = testEnv.authenticatedContext("uid_total_stranger").firestore();
  await assertFails(getDoc(doc(stranger, "users", STUDENT)));
});

await it("another school member CANNOT overwrite a student's parentLinkCode (credential)", async () => {
  await assertFails(
    updateDoc(doc(asTeacher2, "students", STUDENT), { parentLinkCode: "PL-ATTACKER" })
  );
});

await it("anonymous (signed-out) user CANNOT read anything", async () => {
  await assertFails(getDoc(doc(asAnon, "schools", SCHOOL)));
});

await it("parentLinkPreviews cannot be enumerated (list denied)", async () => {
  await assertFails(getDocs(collection(asOutsider, "parentLinkPreviews")));
});

// ============================================================
group("cross-tenant isolation");
// ============================================================

await it("member of school A CANNOT read school B's attendance", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL_B, "attendance", "x"), {
      id: "x",
      schoolId: SCHOOL_B,
      classId: "c",
      studentId: "s",
      date: "2026-01-01",
      status: "present",
      markedBy: "t",
    });
  });
  await assertFails(getDoc(doc(asTeacher, "schools", SCHOOL_B, "attendance", "x")));
});

await it("member of school A CANNOT read school B's knowledge chunks (RAG isolation)", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL_B, "knowledgeChunks", "k"), {
      id: "k",
      schoolId: SCHOOL_B,
      audience: "school",
      text: "rival school secrets",
    });
  });
  await assertFails(getDoc(doc(asTeacher, "schools", SCHOOL_B, "knowledgeChunks", "k")));
});

// ============================================================
group("attendance / assignments — write authority");
// ============================================================

await it("student CANNOT mark their own attendance present", async () => {
  await assertFails(
    setDoc(doc(asStudent, "schools", SCHOOL, "attendance", `${CLASS}_${STUDENT}_2026-01-02`), {
      id: `${CLASS}_${STUDENT}_2026-01-02`,
      schoolId: SCHOOL,
      classId: CLASS,
      studentId: STUDENT,
      date: "2026-01-02",
      status: "present",
      markedBy: STUDENT,
    })
  );
});

await it("the class's own teacher CAN mark attendance", async () => {
  await assertSucceeds(
    setDoc(doc(asTeacher, "schools", SCHOOL, "attendance", `${CLASS}_${STUDENT}_2026-01-02`), {
      id: `${CLASS}_${STUDENT}_2026-01-02`,
      schoolId: SCHOOL,
      classId: CLASS,
      studentId: STUDENT,
      date: "2026-01-02",
      status: "present",
      markedBy: TEACHER,
    })
  );
});

await it("a DIFFERENT teacher CANNOT mark attendance for a class they don't own", async () => {
  await assertFails(
    setDoc(doc(asTeacher2, "schools", SCHOOL, "attendance", `${CLASS}_${STUDENT}_2026-01-03`), {
      id: `${CLASS}_${STUDENT}_2026-01-03`,
      schoolId: SCHOOL,
      classId: CLASS,
      studentId: STUDENT,
      date: "2026-01-03",
      status: "absent",
      markedBy: TEACHER2,
    })
  );
});

await it("student CANNOT create an assignment", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "assignments"), {
      schoolId: SCHOOL,
      classId: CLASS,
      teacherId: STUDENT,
      title: "fake",
      dueDate: "2026-02-01",
    })
  );
});

await it("student CANNOT grade their own submission", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "schools", SCHOOL, "assignments", "a1"), {
      id: "a1",
      schoolId: SCHOOL,
      classId: CLASS,
      teacherId: TEACHER,
      title: "Algebra worksheet",
      dueDate: "2026-02-01",
    });
    await setDoc(doc(db, "schools", SCHOOL, "assignments", "a1", "submissions", `a1_${STUDENT}`), {
      id: `a1_${STUDENT}`,
      assignmentId: "a1",
      studentId: STUDENT,
      classId: CLASS,
      status: "pending",
    });
  });
  await assertFails(
    updateDoc(doc(asStudent, "schools", SCHOOL, "assignments", "a1", "submissions", `a1_${STUDENT}`), {
      grade: "A+",
    })
  );
});

await it("student CAN mark their own submission as submitted", async () => {
  await assertSucceeds(
    updateDoc(doc(asStudent, "schools", SCHOOL, "assignments", "a1", "submissions", `a1_${STUDENT}`), {
      status: "submitted",
      submittedAt: new Date().toISOString(),
    })
  );
});

// ============================================================
group("fees — no client-side 'mark as paid'");
// ============================================================

await it("student CANNOT record a fee payment for themself", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "feePayments"), {
      schoolId: SCHOOL,
      studentId: STUDENT,
      feeStructureId: "f1",
      amountPaid: 50000,
      method: "cash",
      recordedBy: STUDENT,
    })
  );
});

await it("admin CAN record a fee payment", async () => {
  await assertSucceeds(
    addDoc(collection(asOwner, "schools", SCHOOL, "feePayments"), {
      schoolId: SCHOOL,
      studentId: STUDENT,
      feeStructureId: "f1",
      amountPaid: 50000,
      method: "cash",
      recordedBy: OWNER,
    })
  );
});

// ============================================================
group("notifications — recipient isolation");
// ============================================================

await it("user CANNOT read another user's notification", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL, "notifications", "n1"), {
      id: "n1",
      schoolId: SCHOOL,
      recipientId: TEACHER,
      type: "system",
      title: "private",
      message: "for the teacher only",
      read: false,
    });
  });
  await assertFails(getDoc(doc(asStudent, "schools", SCHOOL, "notifications", "n1")));
});

await it("recipient CAN read and mark their own notification read", async () => {
  await assertSucceeds(getDoc(doc(asTeacher, "schools", SCHOOL, "notifications", "n1")));
  await assertSucceeds(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "notifications", "n1"), { read: true })
  );
});

await it("a student CANNOT forge a notification addressed to someone else", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "notifications"), {
      schoolId: SCHOOL,
      recipientId: TEACHER,
      type: "system",
      title: "Phishing",
      message: "Click here to reset your password",
      read: false,
    })
  );
});

await it("staff (teacher) CAN notify a student — the attendance/assignment path", async () => {
  await assertSucceeds(
    addDoc(collection(asTeacher, "schools", SCHOOL, "notifications"), {
      schoolId: SCHOOL,
      recipientId: STUDENT,
      type: "attendance",
      title: "Marked absent today",
      message: "Your attendance for 2026-01-03 was recorded as absent.",
      read: false,
    })
  );
});

await it("a notification cannot be written into a DIFFERENT school's collection", async () => {
  await assertFails(
    addDoc(collection(asTeacher, "schools", SCHOOL, "notifications"), {
      schoolId: SCHOOL_B,
      recipientId: STUDENT,
      type: "system",
      title: "mismatched schoolId",
      message: "…",
      read: false,
    })
  );
});

await it("recipient CANNOT rewrite the CONTENT of a notification they received", async () => {
  await assertFails(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "notifications", "n1"), {
      title: "Rewritten by recipient",
      message: "tampered",
    })
  );
});

// ============================================================
group("timetable — write authority");
// ============================================================

await it("the class's own teacher CAN delete their timetable slot", async () => {
  await assertSucceeds(deleteDoc(doc(asTeacher, "schools", SCHOOL, "timetable", "slot_1")));
});

await it("a DIFFERENT teacher CANNOT delete a slot for a class they don't own", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL, "timetable", "slot_2"), {
      id: "slot_2",
      schoolId: SCHOOL,
      classId: CLASS,
      teacherId: TEACHER,
      subject: "Mathematics",
      day: "TU",
      period: 3,
      startTime: "11:00",
      endTime: "11:45",
    });
  });
  await assertFails(deleteDoc(doc(asTeacher2, "schools", SCHOOL, "timetable", "slot_2")));
});

await it("a teacher CANNOT move a slot into a class they don't teach", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL, "classes", "class_2"), {
      id: "class_2",
      schoolId: SCHOOL,
      teacherId: TEACHER2,
      name: "9-B",
      code: "NX-9B-SCI-11",
      studentCount: 0,
    });
  });
  await assertFails(
    updateDoc(doc(asTeacher, "schools", SCHOOL, "timetable", "slot_2"), { classId: "class_2" })
  );
});

await it("a student CANNOT create a timetable slot", async () => {
  await assertFails(
    addDoc(collection(asStudent, "schools", SCHOOL, "timetable"), {
      schoolId: SCHOOL,
      classId: CLASS,
      teacherId: STUDENT,
      subject: "Free period",
      day: "MO",
      period: 2,
      startTime: "10:00",
      endTime: "10:45",
    })
  );
});

// ============================================================
group("join-by-code — the paths onboarding actually depends on");
// ============================================================

// These four cover failures that made whole flows impossible rather than
// merely insecure, and none of them were exercised before: a rules file
// that is airtight but denies the app's own primary path is still broken.

await it("a brand-new user CAN resolve a class by code via a collectionGroup query", async () => {
  // getClassByCode() (services/class-service.ts) — the entire Student
  // Join flow. A collectionGroup query is only authorised by a rule with
  // a recursive wildcard; the per-school classes rule does not cover it,
  // so this was permission-denied for every student trying to join.
  const snap = await assertSucceeds(
    getDocs(query(collectionGroup(asOutsider, "classes"), where("code", "==", "NX-10A-MATH-42")))
  );
  if (snap.empty) throw new Error("query allowed but matched no class — check the fixture code value");
});

await it("a user CAN read their own school membership doc before being a member elsewhere", async () => {
  // addSchoolMember()'s idempotency check. Gated solely on
  // isSchoolMember this is circular and denies exactly the joiners.
  await assertSucceeds(getDoc(doc(asOutsider, "schools", SCHOOL, "members", OUTSIDER)));
});

await it("a user CANNOT read someone else's school membership doc without being a member", async () => {
  await assertFails(getDoc(doc(asOutsider, "schools", SCHOOL_B, "members", OWNER)));
});

await it("a joining student CAN self-create their school membership with role:student", async () => {
  // joinClassAsStudent()'s first write. Students were the one role that
  // never got a schools/{id}/members record, which denied them every
  // isSchoolMember-gated read in the app (see the two assertions below).
  const joiner = testEnv.authenticatedContext("uid_new_student").firestore();
  await assertSucceeds(
    setDoc(doc(joiner, "schools", SCHOOL, "members", "uid_new_student"), {
      userId: "uid_new_student",
      schoolId: SCHOOL,
      role: "student",
      status: "active",
    })
  );
});

await it("a student WITHOUT school membership cannot read school-scoped data", async () => {
  await assertFails(getDocs(collection(asOutsider, "schools", SCHOOL_B, "timetable")));
});

await it("a student WITH school membership CAN read the timetable", async () => {
  await assertSucceeds(getDocs(collection(asStudent, "schools", SCHOOL, "timetable")));
});

await it("a class member CAN increment studentCount by exactly 1 (the join counter)", async () => {
  // joinClassAsStudent()'s second write. STUDENT is seeded as a class
  // member below; without this grant the join half-committed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL, "classes", CLASS, "members", STUDENT), {
      userId: STUDENT,
      classId: CLASS,
      schoolId: SCHOOL,
      role: "student",
    });
  });
  await assertSucceeds(
    updateDoc(doc(asStudent, "schools", SCHOOL, "classes", CLASS), { studentCount: increment(1) })
  );
});

await it("a class member CANNOT use the studentCount grant to rewrite anything else", async () => {
  await assertFails(
    updateDoc(doc(asStudent, "schools", SCHOOL, "classes", CLASS), {
      studentCount: increment(1),
      teacherId: STUDENT,
    })
  );
});

await it("a class member CANNOT set studentCount to an arbitrary value", async () => {
  await assertFails(updateDoc(doc(asStudent, "schools", SCHOOL, "classes", CLASS), { studentCount: 9999 }));
});

await it("a non-member CANNOT touch studentCount at all", async () => {
  await assertFails(
    updateDoc(doc(asOutsider, "schools", SCHOOL, "classes", CLASS), { studentCount: increment(1) })
  );
});

// ============================================================
group("admin acting on behalf of staff — the /admin/classes create flow");
// ============================================================

await it("an admin CAN create a class whose teacherId is someone else", async () => {
  // The admin Create Class form picks a teacher, so teacherId is never
  // the admin's own uid. A self-only create rule denied every one.
  await assertSucceeds(
    setDoc(doc(asOwner, "schools", SCHOOL, "classes", "class_admin_made"), {
      id: "class_admin_made",
      schoolId: SCHOOL,
      teacherId: TEACHER,
      name: "8-C",
      code: "NX-8C-ENG-77",
      studentCount: 0,
    })
  );
});

await it("an admin CAN seed the teacher's class-membership row for that class", async () => {
  await assertSucceeds(
    setDoc(doc(asOwner, "schools", SCHOOL, "classes", "class_admin_made", "members", TEACHER), {
      userId: TEACHER,
      classId: "class_admin_made",
      schoolId: SCHOOL,
      role: "teacher",
    })
  );
});

await it("a non-admin member CANNOT create a class for a different teacher", async () => {
  await assertFails(
    setDoc(doc(asTeacher2, "schools", SCHOOL, "classes", "class_hijack"), {
      id: "class_hijack",
      schoolId: SCHOOL,
      teacherId: TEACHER,
      name: "8-D",
      code: "NX-8D-ENG-78",
      studentCount: 0,
    })
  );
});

await it("an admin CAN append to a teacher's classIds", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "teachers", TEACHER), {
      userId: TEACHER,
      schoolId: SCHOOL,
      subject: "Mathematics",
      classIds: [],
    });
  });
  await assertSucceeds(updateDoc(doc(asOwner, "teachers", TEACHER), { classIds: ["class_admin_made"] }));
});

await it("an admin CANNOT use that grant to rewrite a teacher's other fields", async () => {
  await assertFails(updateDoc(doc(asOwner, "teachers", TEACHER), { subject: "Nothing", classIds: [] }));
});

await it("a fellow teacher CANNOT touch another teacher's classIds", async () => {
  await assertFails(updateDoc(doc(asTeacher2, "teachers", TEACHER), { classIds: ["x"] }));
});

// ============================================================
group("assignment submissions — the student's own hand-in path");
// ============================================================

await it("a student CAN create their OWN submission row when none was seeded", async () => {
  // Late joiners have no seeded row, so "mark as submitted" is a create.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "schools", SCHOOL, "assignments", "assign_1"), {
      id: "assign_1",
      schoolId: SCHOOL,
      classId: CLASS,
      teacherId: TEACHER,
      title: "Chapter 4 problems",
      dueDate: "2099-01-01",
    });
  });
  await assertSucceeds(
    setDoc(doc(asStudent, "schools", SCHOOL, "assignments", "assign_1", "submissions", `assign_1_${STUDENT}`), {
      id: `assign_1_${STUDENT}`,
      assignmentId: "assign_1",
      studentId: STUDENT,
      classId: CLASS,
      status: "submitted",
    })
  );
});

await it("a student CANNOT create a submission row on someone else's behalf", async () => {
  await assertFails(
    setDoc(doc(asStudent, "schools", SCHOOL, "assignments", "assign_1", "submissions", `assign_1_other`), {
      id: "assign_1_other",
      assignmentId: "assign_1",
      studentId: "uid_someone_else",
      classId: CLASS,
      status: "submitted",
    })
  );
});

await it("a student CANNOT self-create a submission carrying a grade", async () => {
  await assertFails(
    setDoc(doc(asStudent, "schools", SCHOOL, "assignments", "assign_1", "submissions", `assign_1_graded`), {
      id: "assign_1_graded",
      assignmentId: "assign_1",
      studentId: STUDENT,
      classId: CLASS,
      status: "graded",
      grade: "A+",
    })
  );
});

// ---- summary ----
await testEnv.cleanup();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n\x1b[1m${results.length - failed.length}/${results.length} passed\x1b[0m` +
    (failed.length ? `  \x1b[31m(${failed.length} failed)\x1b[0m` : "")
);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  ${f.group} › ${f.name}`);
  process.exit(1);
}

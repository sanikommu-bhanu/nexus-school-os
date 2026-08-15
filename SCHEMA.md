# NEXUS — Firestore Schema (as implemented)

This is the schema the Phase 2 services actually read/write — matches `types/index.ts` field-for-field, documented here as the deploy reference.

```
users/{userId}
  id, fullName, email, phone?, photoURL?, role, onboardingComplete,
  schoolId?, primaryClassId?, createdAt, updatedAt

schools/{schoolId}
  id, name, type, city, state, logoURL?, contactEmail?, contactPhone?,
  code (public join code, e.g. SCH-7F82K91), ownerId, createdAt, updatedAt

  schools/{schoolId}/members/{userId}
    userId, schoolId, role, status ('active'|'pending'|'removed'),
    createdAt, updatedAt

  schools/{schoolId}/classes/{classId}
    id, schoolId, name, grade, section, subject, teacherId,
    code (e.g. NX10A-MATH-42), studentCount, createdAt, updatedAt

    schools/{schoolId}/classes/{classId}/members/{userId}
      userId, classId, schoolId, role ('teacher'|'student'),
      createdAt, updatedAt

teachers/{userId}
  userId, schoolId, subject, department?, classIds[], createdAt, updatedAt

students/{userId}
  userId, schoolId, classId, rollNumber?, dateOfBirth?, gender?,
  parentLinkCode (public, e.g. NXP-7F82K9), createdAt, updatedAt

parents/{userId}
  userId, childIds[] (student userIds), contactPhone?, createdAt, updatedAt

parentStudentLinks/{linkId}
  id, parentId, studentId, relationship, verified, createdAt, updatedAt
```

## Why public codes live on the entity, not a separate collection

`schools.code`, `classes.code`, and `students.parentLinkCode` are stored directly on their owning document rather than in a lookup table. Reads are `where(code, '==', value)` queries (see `firestore.indexes.json` for the required indexes) — this keeps one document per entity instead of a doc-plus-pointer pair that could drift out of sync.

## Why membership is a subcollection, not an array field

`schools/{id}/members` and `classes/{id}/members` are subcollections keyed by `userId`, not arrays on the parent document. Two reasons:

1. **Idempotent joins.** `setDoc` on `members/{uid}` with no merge is naturally "create once" — `class-service.ts` and `school-service.ts` check `exists()` first and return `{ alreadyMember: true }` instead of writing a duplicate, which is what stops a double-scanned QR from creating two memberships.
2. **Security rules need it.** Firestore rules can check `exists()` on a specific subcollection doc cheaply; checking "is this uid in this array" would require reading and scanning the whole parent document on every rule evaluation.

## What enforces "one source of truth" end to end

- `services/user-service.ts` — only writer of `users/{uid}`
- `services/school-service.ts` — only writer of `schools/{id}` and its `members`
- `services/class-service.ts` — only writer of `classes/{id}` and its `members`
- `services/teacher-service.ts` / `student-service.ts` — only writers of `teachers/{uid}` / `students/{uid}`
- `services/parent-link-service.ts` — only writer of `parentStudentLinks` and `parents/{uid}`

No screen calls `doc()`/`setDoc()` directly. That's the actual mechanism, not just a convention — `firestore.rules` then backs it up server-side so a compromised or buggy client can't bypass it.

---

## Phase 3 additions

All of the below live under `schools/{schoolId}/...` — nothing duplicates
canonical identity/roster data introduced in Phase 1/2; they only ever
reference it by id.

| Collection | Doc id | Written by | Notes |
|---|---|---|---|
| `attendance` | `${classId}_${studentId}_${date}` | `services/attendance-service.ts` | Deterministic id makes "one record per student/class/day" and safe re-edit free — writing the same day again overwrites, never duplicates. |
| `assignments` | auto | `services/assignment-service.ts` | On create, seeds one `submissions/{assignmentId_studentId}` doc per enrolled student as `pending` — submission counts are always real. |
| `assignments/{id}/submissions` | `${assignmentId}_${studentId}` | seeded by teacher create; updated by the student or teacher | |
| `timetable` | auto | `services/timetable-service.ts` | Single shared source for Admin/Teacher/Student/Parent schedule views. `detectConflicts()` checks same day+period for teacher/class/room clashes before a slot is created. |
| `documents` | auto | `services/document-service.ts` | Bytes in Firebase Storage at `schools/{schoolId}/documents/...`, metadata here. `aiStatus` is `"unavailable"` (never a faked `"complete"`) when no AI key is configured. |
| `announcements` | auto | `services/announcement-service.ts` | `audience` decides fan-out: resolves to actual recipient uids before writing `notifications`, never broadcasts blindly. |
| `notifications` | auto | written by attendance/assignment/announcement services, never directly by a screen | Rules restrict read/update to `recipientId == request.auth.uid`. |
| `conversations`, `conversations/{id}/messages` | auto | messaging foundation (Part 19) | `participantIds` gates all reads; created only by one of the two participants. |
| `feeStructures` | auto | dues an admin defines — school-wide or scoped to one `classId` | read: any school member. write: admin only. |
| `feePayments` | auto | payments an admin records after money is actually collected (cash/UPI/etc. at the school office — no gateway) | read: any school member (app narrows to the relevant student). write: admin only. |

### Why AI never gets raw Firestore access

`services/ai-tools-service.ts` is the only code path between a chat
question and Firestore. Every exported function under `aiTools` takes
an `AiContext` (uid/role/schoolId/classIds) that's resolved server-side
from the *caller's own* profile — a student's context can't be pointed
at another student's data, because the tool functions only ever query
using ids already inside that context, not ids supplied by the LLM or
the user's raw text. If `NEXT_PUBLIC_GEMINI_API_KEY` isn't set, answers
still come from real tool calls, just phrased by a deterministic
template instead of an LLM — surfaced to the UI via `grounded: false`
when a question falls outside what the template layer can answer
(e.g. open-ended policy questions), rather than ever faking a result.

// ============================================================
// NEXUS AI — controlled tool registry (Part 3 & Part 4).
//
// The LLM never gets raw Firestore access. It only ever gets to
// "call" one of the named tools below, and every tool:
//   1. verifies authentication      -> ctx.uid comes from Firebase Auth
//   2. verifies role                -> ctx.role, checked per tool
//   3. verifies school membership   -> every query is pinned to ctx.schoolId,
//                                       never to a schoolId passed in params
//   4. verifies entity ownership    -> classId/studentId params are checked
//                                       against ctx before any query runs
//   5. executes a controlled query  -> reuses the existing services/*.ts
//                                       functions, which are additionally
//                                       enforced by firestore.rules
//   6. returns only allowed fields  -> each tool shapes its own return type
//
// This file is the single place new AI capabilities get added — the
// intent resolver (ai-tools-service.ts) only ever calls into here.
// ============================================================
import { getSchoolMembers } from "@/services/school-service";
import { getClassById, getClassesForTeacher, getClassMembers, getClassesForSchool } from "@/services/class-service";
import {
  getAttendanceForClassRange,
  getAttendanceForStudent,
  summarizeAttendance,
} from "@/services/attendance-service";
import { getTeacherProfile, getTeachersForSchool } from "@/services/teacher-service";
import { getStudentProfile, getStudentsForClass } from "@/services/student-service";
import { getAssignmentsForClass, getAssignmentsForClasses } from "@/services/assignment-service";
import { getTimetableForClass, getTimetableForTeacher, getSchoolTimetable } from "@/services/timetable-service";
import { getCurrentUserProfile, getUserProfiles } from "@/services/user-service";
import { getChildrenForParent } from "@/services/parent-link-service";
import { getSchoolAnnouncements, getAnnouncementsForClass } from "@/services/announcement-service";
import { getSchoolDocuments, getDocumentsForClass } from "@/services/document-service";
import type { Role } from "@/types";

export interface AiContext {
  uid: string;
  role: Role;
  schoolId: string;
  /** Teacher's own classes, or the student's/child's single class. */
  classIds: string[];
  /** Parent only: every linked child's uid. */
  childIds?: string[];
  /** Parent only: the currently-selected child for self-scoped tools. Defaults to childIds[0]. */
  subjectId?: string;
}

export class ToolPermissionError extends Error {
  constructor(message = "Not permitted") {
    super(message);
    this.name = "ToolPermissionError";
  }
}

const LOW_ATTENDANCE_THRESHOLD = 75;

// ------------------------------------------------------------
// Ownership guards — shared by multiple tools below.
// ------------------------------------------------------------
function requireRole(ctx: AiContext, ...roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new ToolPermissionError(`Requires role: ${roles.join(" or ")}`);
}

/** A classId is only "owned" by ctx if it's the teacher's/student's class, or ctx is admin. */
function requireOwnClass(ctx: AiContext, classId: string) {
  if (ctx.role === "admin") return;
  if (ctx.classIds.includes(classId)) return;
  throw new ToolPermissionError("You don't have access to this class.");
}

/** A studentId is only reachable if it's the caller, a linked child, or (via class check) their own student. */
async function requireOwnStudent(ctx: AiContext, studentId: string): Promise<void> {
  if (ctx.role === "admin") return;
  if (ctx.role === "student" && ctx.uid === studentId) return;
  if (ctx.role === "parent" && (ctx.childIds ?? []).includes(studentId)) return;
  if (ctx.role === "teacher") {
    const profile = await getStudentProfile(studentId);
    if (profile && ctx.classIds.includes(profile.classId)) return;
  }
  throw new ToolPermissionError("You don't have access to this student.");
}

/**
 * Exported for services/ai-actions-service.ts — actions that target a
 * student (message their parent, add a support note) need the exact
 * same ownership check tools use, re-run at confirm time rather than
 * trusted from when the action was first proposed.
 */
export async function requireSameSchoolRelationship(ctx: AiContext, studentId: string): Promise<void> {
  return requireOwnStudent(ctx, studentId);
}

// ------------------------------------------------------------
// Tool registry
// ------------------------------------------------------------
export const aiToolRegistry = {
  /** School-wide member counts. Admin only. */
  async getSchoolOverview(ctx: AiContext) {
    requireRole(ctx, "admin");
    const members = await getSchoolMembers(ctx.schoolId);
    return {
      teachers: members.filter((m) => m.role === "teacher").length,
      students: members.filter((m) => m.role === "student").length,
      parents: members.filter((m) => m.role === "parent").length,
    };
  },

  /** School-wide attendance summary across every class. Admin only. */
  async getSchoolAttendance(ctx: AiContext) {
    requireRole(ctx, "admin");
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const classes = await getClassesForSchool(ctx.schoolId);
    let below = 0;
    let classesChecked = 0;
    for (const c of classes) {
      const records = await getAttendanceForClassRange(ctx.schoolId, c.id, since);
      if (records.length === 0) continue;
      classesChecked += 1;
      const byStudent = new Map<string, typeof records>();
      records.forEach((r) => byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]));
      byStudent.forEach((recs) => {
        if (summarizeAttendance(recs).percentPresent < LOW_ATTENDANCE_THRESHOLD) below += 1;
      });
    }
    return { classesChecked, totalClasses: classes.length, studentsBelowThreshold: below };
  },

  /** Attendance for one class. Teacher (own class) or admin. */
  async getClassAttendance(ctx: AiContext, params: { classId: string }) {
    requireRole(ctx, "teacher", "admin");
    await requireOwnClass(ctx, params.classId);
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const records = await getAttendanceForClassRange(ctx.schoolId, params.classId, since);
    const byStudent = new Map<string, typeof records>();
    records.forEach((r) => byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]));
    const perStudent = Array.from(byStudent.entries()).map(([studentId, recs]) => ({
      studentId,
      ...summarizeAttendance(recs),
    }));
    return { classId: params.classId, perStudent, studentsBelowThreshold: perStudent.filter((s) => s.percentPresent < LOW_ATTENDANCE_THRESHOLD).length };
  },

  /** One student's attendance. Self / linked parent / owning teacher / admin. */
  async getStudentAttendance(ctx: AiContext, params: { studentId: string }) {
    await requireOwnStudent(ctx, params.studentId);
    const records = await getAttendanceForStudent(ctx.schoolId, params.studentId);
    return summarizeAttendance(records);
  },

  /** One student's assignments (all their class's assignments + due status). Self / parent / teacher / admin. */
  async getStudentAssignments(ctx: AiContext, params: { studentId: string }) {
    await requireOwnStudent(ctx, params.studentId);
    const profile = await getStudentProfile(params.studentId);
    if (!profile) return [];
    return getAssignmentsForClass(ctx.schoolId, profile.classId);
  },

  /** All assignments for a class. Owning teacher or admin. */
  async getClassAssignments(ctx: AiContext, params: { classId: string }) {
    requireRole(ctx, "teacher", "admin");
    await requireOwnClass(ctx, params.classId);
    return getAssignmentsForClass(ctx.schoolId, params.classId);
  },

  /** Timetable. Admin gets the full school grid; others get their own scope. */
  async getTimetable(ctx: AiContext) {
    if (ctx.role === "admin") return getSchoolTimetable(ctx.schoolId);
    if (ctx.role === "teacher") return getTimetableForTeacher(ctx.schoolId, ctx.uid);
    if (ctx.classIds.length > 0) return getTimetableForClass(ctx.schoolId, ctx.classIds[0]);
    return [];
  },

  /** A student's class schedule. Self / parent / owning teacher / admin. */
  async getStudentSchedule(ctx: AiContext, params: { studentId: string }) {
    await requireOwnStudent(ctx, params.studentId);
    const profile = await getStudentProfile(params.studentId);
    if (!profile) return [];
    return getTimetableForClass(ctx.schoolId, profile.classId);
  },

  /** A teacher's own schedule. Self or admin. */
  async getTeacherSchedule(ctx: AiContext, params: { teacherId: string }) {
    if (ctx.role !== "admin" && ctx.uid !== params.teacherId) throw new ToolPermissionError("You can only view your own schedule.");
    return getTimetableForTeacher(ctx.schoolId, params.teacherId);
  },

  /** Announcements visible to the caller's scope. */
  async getAnnouncements(ctx: AiContext) {
    if (ctx.role === "admin") return getSchoolAnnouncements(ctx.schoolId);
    if (ctx.classIds.length > 0) {
      const [schoolWide, classScoped] = await Promise.all([
        getSchoolAnnouncements(ctx.schoolId),
        getAnnouncementsForClass(ctx.schoolId, ctx.classIds[0]),
      ]);
      return [...schoolWide, ...classScoped];
    }
    return getSchoolAnnouncements(ctx.schoolId);
  },

  /** Notifications are always self-scoped — no params, no cross-user access. */
  async getNotifications(ctx: AiContext) {
    // Notifications subscribe live via a listener in the existing service;
    // the AI tool surface only needs "do you have unread ones", which the
    // caller (ai-tools-service) can pull from the same subscription it
    // already runs for the bell icon — kept as a stub here so the tool
    // exists and is wired for a future direct Firestore read if needed.
    return { note: "Use the live notification subscription already running in the app shell for this user." };
  },

  /** A student's profile fields (no sensitive fields beyond what the caller already sees in class rosters). */
  async getStudentProfile(ctx: AiContext, params: { studentId: string }) {
    await requireOwnStudent(ctx, params.studentId);
    const profile = await getStudentProfile(params.studentId);
    const user = await getCurrentUserProfile(params.studentId);
    if (!profile || !user) return null;
    return {
      fullName: user.fullName,
      classId: profile.classId,
      rollNumber: profile.rollNumber,
    };
  },

  /** Roster for a class. Owning teacher or admin. */
  async getClassStudents(ctx: AiContext, params: { classId: string }) {
    requireRole(ctx, "teacher", "admin");
    await requireOwnClass(ctx, params.classId);
    const students = await getStudentsForClass(ctx.schoolId, params.classId);
    const users = await getUserProfiles(students.map((s) => s.userId));
    return students.map((s) => ({
      studentId: s.userId,
      fullName: users.get(s.userId)?.fullName ?? "Unknown",
      rollNumber: s.rollNumber,
    }));
  },

  /** A teacher's own classes. Self or admin. */
  async getTeacherClasses(ctx: AiContext, params: { teacherId: string }) {
    if (ctx.role !== "admin" && ctx.uid !== params.teacherId) throw new ToolPermissionError("You can only view your own classes.");
    return getClassesForTeacher(ctx.schoolId, params.teacherId);
  },

  /** A parent's linked children. Self only. */
  async getLinkedChildren(ctx: AiContext) {
    requireRole(ctx, "parent");
    const childIds = await getChildrenForParent(ctx.uid);
    const users = await getUserProfiles(childIds);
    return childIds.map((id) => ({ studentId: id, fullName: users.get(id)?.fullName ?? "Unknown" }));
  },

  /**
   * RAG entry point (Part 8-11). Retrieval itself — chunking, embedding,
   * multi-tenant + role filtering, ranking — lives in lib/ai/rag.ts so
   * that module can be unit-tested and reused outside the tool surface;
   * this wrapper only exists so searchSchoolKnowledge sits alongside the
   * other tools with the same ctx-in/permission-checked shape.
   */
  async searchSchoolKnowledge(ctx: AiContext, params: { query: string }) {
    const { retrieveRelevantChunks } = await import("@/lib/ai/rag");
    const chunks = await retrieveRelevantChunks(ctx, params.query);
    return { chunks };
  },

  /** Document metadata (never file bytes) visible to the caller's scope. */
  async getDocumentMetadata(ctx: AiContext) {
    if (ctx.role === "admin") return getSchoolDocuments(ctx.schoolId);
    if (ctx.classIds.length > 0) return getDocumentsForClass(ctx.schoolId, ctx.classIds[0]);
    return [];
  },

  /**
   * Structured directory search (Part 24, Smart Search) — name/title
   * matching over classes, students, teachers, and documents, scoped
   * to exactly what this ctx is already allowed to see. Reuses the
   * same *-service.ts functions as every other tool here rather than
   * a raw Firestore query, so a search never returns more than the
   * caller's role would already be shown elsewhere in the app.
   */
  async searchDirectory(ctx: AiContext, params: { query: string }) {
    const q = params.query.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: { type: "class" | "student" | "teacher" | "document"; id: string; label: string; subtitle?: string; href: string }[] = [];

    const classes =
      ctx.role === "admin"
        ? await getClassesForSchool(ctx.schoolId)
        : (await Promise.all(ctx.classIds.map((id) => getClassById(ctx.schoolId, id)))).filter((c): c is NonNullable<typeof c> => Boolean(c));

    for (const c of classes) {
      if (c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)) {
        results.push({ type: "class", id: c.id, label: c.name, subtitle: c.subject, href: ctx.role === "admin" ? `/admin/classes/${c.id}` : `/teacher/classes/${c.id}` });
      }
    }

    if (ctx.role === "teacher" || ctx.role === "admin") {
      const classIds = ctx.role === "admin" ? classes.map((c) => c.id) : ctx.classIds;
      for (const classId of classIds.slice(0, 12)) {
        const students = await getStudentsForClass(ctx.schoolId, classId);
        if (students.length === 0) continue;
        const users = await getUserProfiles(students.map((s) => s.userId));
        for (const s of students) {
          const name = users.get(s.userId)?.fullName ?? "";
          if (name.toLowerCase().includes(q)) {
            results.push({
              type: "student",
              id: s.userId,
              label: name,
              subtitle: s.rollNumber ? `Roll ${s.rollNumber}` : undefined,
              href: ctx.role === "admin" ? `/admin/students/${s.userId}` : `/teacher/classes/${classId}`,
            });
          }
        }
      }
    }

    if (ctx.role === "admin") {
      const teachers = await getTeachersForSchool(ctx.schoolId);
      const users = await getUserProfiles(teachers.map((t) => t.userId));
      for (const t of teachers) {
        const name = users.get(t.userId)?.fullName ?? "";
        if (name.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q)) {
          results.push({ type: "teacher", id: t.userId, label: name, subtitle: t.subject, href: `/admin/teachers/${t.userId}` });
        }
      }
    }

    const docs = ctx.role === "admin" ? await getSchoolDocuments(ctx.schoolId) : ctx.classIds.length > 0 ? await getDocumentsForClass(ctx.schoolId, ctx.classIds[0]) : [];
    for (const d of docs) {
      if (d.fileName.toLowerCase().includes(q)) {
        results.push({
          type: "document",
          id: d.id,
          label: d.fileName,
          subtitle: d.documentType.replace("_", " "),
          href: ctx.role === "admin" ? `/admin/operations/documents/${d.id}` : `/admin/operations?tab=documents`,
        });
      }
    }

    return results.slice(0, 8);
  },
};

export type ToolName = keyof typeof aiToolRegistry;

/**
 * The single entry point every caller (chat UI, insight jobs, etc.) should
 * use instead of calling registry functions directly — this is the
 * "PERMISSION CHECK -> FIRESTORE QUERY -> SANITIZED RESULT" segment of the
 * Part 4 flow, in one place, with a uniform error shape.
 */
export async function callTool<T extends ToolName>(
  name: T,
  ctx: AiContext,
  params?: Parameters<(typeof aiToolRegistry)[T]>[1]
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    // @ts-expect-error — params is optional per-tool, checked at each tool's own signature.
    const data = await aiToolRegistry[name](ctx, params);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ToolPermissionError) return { ok: false, error: err.message };
    return { ok: false, error: "That request couldn't be completed." };
  }
}

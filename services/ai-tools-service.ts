// ============================================================
// NEXUS AI — intent resolver + gateway (Part 4).
//
//   user question -> intent -> ALLOWED TOOL SELECTION (ai-tool-registry.ts)
//                 -> PERMISSION CHECK -> Firestore -> SANITIZED RESULT
//                 -> Gemini phrasing (optional) -> structured answer
//
// This file never talks to Firestore directly — every fact comes back
// through services/ai-tool-registry.ts, so the permission checks live
// in exactly one place. If GEMINI_API_KEY isn't configured server-side,
// we skip the "generate prose with an LLM" step (app/api/ai/ask/route.ts
// returns configured:false) and instead render the tool result with a
// deterministic template — real, grounded, role-scoped information,
// just not LLM-phrased. We never show a fake "AI complete" — see the
// `grounded` flag surfaced to the UI.
// ============================================================
import { getTeacherProfile } from "@/services/teacher-service";
import { getCurrentUserProfile } from "@/services/user-service";
import { getChildrenForParent } from "@/services/parent-link-service";
import { getClassById } from "@/services/class-service";
import { aiToolRegistry, callTool } from "@/services/ai-tool-registry";
import type { AiContext } from "@/services/ai-tool-registry";
import type { AiAction } from "@/services/ai-actions-service";
import type { Role } from "@/types";

export type { AiContext };
export type { AiAction };

export interface AiAnswer {
  /** Short card title, e.g. "Attendance Alert". Falls back to a generic label in the UI when absent. */
  title?: string;
  text: string;
  grounded: boolean; // true if backed by an actual tool call this turn
  /** Suggested next steps — navigate immediately, or require explicit confirm before writing anything (Part 5-7). */
  actions?: AiAction[];
  /** True only when NEXUS AI itself failed to respond (network/provider/tool crash) — distinct from a normal "no data" answer. */
  unavailable?: boolean;
  /** True when Gemini phrasing was skipped this turn specifically because of a rate limit (Part 26) — the answer shown is still real, just the deterministic template instead of LLM-phrased prose. */
  rateLimited?: boolean;
}

function action(a: AiAction): AiAction {
  return a;
}

const LOW_ATTENDANCE_THRESHOLD = 75;

/**
 * Asks the server-only Gemini route to phrase `facts` naturally. Falls
 * back to `fallback` (the existing deterministic sentence) whenever no
 * key is configured, the request fails, or the model can't be reached —
 * so the AI screen never regresses below what it already does today.
 * Also reports whether the fallback happened specifically because of
 * a rate limit (Part 26), so the UI can say something honest like
 * "AI is busy — showing a quick answer" instead of staying silent
 * about why the phrasing looks a little more templated than usual.
 */
async function tryPhrase(role: Role, question: string, facts: string, fallback: string): Promise<{ text: string; rateLimited: boolean }> {
  try {
    const res = await fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, facts, role }),
    });
    if (res.status === 429) return { text: fallback, rateLimited: true };
    if (!res.ok) return { text: fallback, rateLimited: false };
    const data = await res.json();
    return data.configured && data.text ? { text: data.text as string, rateLimited: false } : { text: fallback, rateLimited: false };
  } catch {
    return { text: fallback, rateLimited: false };
  }
}

/** Convenience wrapper for the common "phrase + spread into AiAnswer" shape used by every resolver below. */
async function phraseAnswer(
  ctx: AiContext,
  question: string,
  facts: string,
  fallback: string,
  rest: Omit<AiAnswer, "text" | "rateLimited">
): Promise<AiAnswer> {
  const { text, rateLimited } = await tryPhrase(ctx.role, question, facts, fallback);
  return { ...rest, text, rateLimited };
}

/** Resolves attendance-flavored questions to the right tool for the caller's role. */
async function resolveAttendance(ctx: AiContext, question: string): Promise<AiAnswer> {
  if (ctx.role === "student") {
    const result = await callTool("getStudentAttendance", ctx, { studentId: ctx.uid });
    if (!result.ok) return { grounded: false, text: result.error };
    const s = result.data as ReturnType<typeof summarize>;
    const fallback =
      s.total === 0
        ? "No attendance has been recorded yet, so there's nothing to report."
        : `Your attendance is ${s.percentPresent}% over the last ${s.total} recorded days (${s.present} present, ${s.absent} absent, ${s.late} late).`;
    const facts = `attendancePercent=${s.percentPresent}, totalDaysRecorded=${s.total}, present=${s.present}, absent=${s.absent}, late=${s.late}`;
    return phraseAnswer(ctx, question, facts, fallback, {
      title: "Your Attendance",
      grounded: true,
      actions: [action({ id: "view-attendance", kind: "navigate", label: "View Attendance", href: "/student/attendance" })],
    });
  }

  if (ctx.role === "parent") {
    const subjectId = ctx.subjectId;
    if (!subjectId) return { grounded: true, text: "No linked child found on this account yet." };
    const result = await callTool("getStudentAttendance", ctx, { studentId: subjectId });
    if (!result.ok) return { grounded: false, text: result.error };
    const s = result.data as ReturnType<typeof summarize>;
    const fallback =
      s.total === 0
        ? "No attendance has been recorded for your child yet."
        : `Your child's attendance is ${s.percentPresent}% over the last ${s.total} recorded days.`;
    const facts = `childAttendancePercent=${s.percentPresent}, totalDaysRecorded=${s.total}`;
    const declined = s.percentPresent < LOW_ATTENDANCE_THRESHOLD;
    const actions: AiAction[] = [action({ id: "view-attendance", kind: "navigate", label: "View Attendance", href: "/parent/dashboard" })];
    if (declined && ctx.classIds[0]) {
      const cls = await getClassById(ctx.schoolId, ctx.classIds[0]).catch(() => null);
      if (cls?.teacherId) {
        actions.push(
          action({
            id: "contact-teacher",
            kind: "confirm",
            label: "Contact Teacher",
            type: "message_teacher",
            payload: { teacherId: cls.teacherId, text: `Hi — I noticed my child's attendance is currently ${s.percentPresent}%. Could we talk about how I can help?` },
            confirmTitle: "Message the class teacher?",
            confirmBody: "Sends a message about your child's attendance to their teacher.",
          })
        );
      }
    }
    return phraseAnswer(ctx, question, facts, fallback, {
      title: declined ? "Attendance Has Declined" : "Your Child's Attendance",
      grounded: true,
      actions,
    });
  }

  if (ctx.role === "teacher") {
    const results: { classId: string; studentsBelowThreshold: number; perStudent: { studentId: string; percentPresent: number }[] }[] = [];
    for (const classId of ctx.classIds) {
      const r = await callTool("getClassAttendance", ctx, { classId });
      if (r.ok) results.push({ classId, ...(r.data as { studentsBelowThreshold: number; perStudent: { studentId: string; percentPresent: number }[] }) });
    }
    const flagged = results.filter((c) => c.studentsBelowThreshold > 0);
    if (flagged.length === 0) {
      return phraseAnswer(ctx, question, "studentsBelowThreshold=0", "No students in your classes are currently below the 75% attendance threshold.", {
        title: "Attendance",
        grounded: true,
      });
    }
    const fallback = `Attendance concern in ${flagged.length} class${flagged.length > 1 ? "es" : ""}: ${flagged
      .map((c) => `${c.studentsBelowThreshold} student(s) below 75%`)
      .join(", ")}.`;
    const facts = flagged.map((c) => `class ${c.classId}: ${c.studentsBelowThreshold} student(s) below 75% attendance`).join("; ");
    const primaryClassId = flagged[0].classId;
    const primaryStudent = flagged[0].perStudent.find((s) => s.percentPresent < LOW_ATTENDANCE_THRESHOLD);
    const actions: AiAction[] = [action({ id: "view-roster", kind: "navigate", label: "View Students", href: `/teacher/classes/${primaryClassId}` })];
    if (primaryStudent) {
      actions.push(
        action({
          id: "message-parent",
          kind: "confirm",
          label: "Message Parent",
          type: "message_parent",
          payload: { studentId: primaryStudent.studentId, text: `Hi — I wanted to flag that your child's attendance is currently ${primaryStudent.percentPresent}%, below our 75% threshold. Please reach out if there's anything the school can help with.` },
          confirmTitle: "Send attendance message?",
          confirmBody: `Sends a message about attendance (${primaryStudent.percentPresent}%) to this student's parent(s).`,
        }),
        action({
          id: "support-note",
          kind: "confirm",
          label: "Create Support Note",
          type: "create_support_note",
          payload: { studentId: primaryStudent.studentId, note: `Attendance flagged at ${primaryStudent.percentPresent}%, below the 75% threshold, on ${new Date().toLocaleDateString()}.` },
          confirmTitle: "Save a support note?",
          confirmBody: "Adds an internal note to this student's record for staff follow-up. Not visible to the student or parent.",
        })
      );
    }
    return phraseAnswer(ctx, question, facts, fallback, { title: "Attendance Alert", grounded: true, actions });
  }

  // admin
  const result = await callTool("getSchoolAttendance", ctx);
  if (!result.ok) return { grounded: false, text: result.error };
  const { studentsBelowThreshold, classesChecked } = result.data as { studentsBelowThreshold: number; classesChecked: number };
  const fallback =
    classesChecked === 0
      ? "No attendance has been recorded across the school yet."
      : `${studentsBelowThreshold} student(s) across ${classesChecked} class(es) are below the 75% attendance threshold.`;
  const facts = `studentsBelowThreshold=${studentsBelowThreshold}, classesChecked=${classesChecked}`;
  return phraseAnswer(ctx, question, facts, fallback, {
    title: studentsBelowThreshold > 0 ? "Attendance Alert" : "Attendance",
    grounded: true,
    actions:
      studentsBelowThreshold > 0
        ? [
            action({ id: "view-analytics", kind: "navigate", label: "View Analytics", href: "/admin/analytics" }),
            action({ id: "view-classes", kind: "navigate", label: "View Classes", href: "/admin/classes" }),
          ]
        : undefined,
  });
}

// small local helper purely for typing the shared summary shape above
function summarize() {
  return { total: 0, present: 0, absent: 0, late: 0, percentPresent: 0 };
}

async function resolveSchedule(ctx: AiContext, question: string): Promise<AiAnswer> {
  const result = await callTool("getTimetable", ctx);
  if (!result.ok) return { grounded: false, text: result.error };
  const slots = result.data as any[];
  if (!slots || slots.length === 0) return { grounded: true, text: "No timetable entries are set up yet." };
  const today = new Date().toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase();
  const todays = slots.filter((s) => s.day === today).sort((a, b) => a.period - b.period);
  if (todays.length === 0) return { grounded: true, text: "Nothing scheduled for today." };
  const fallback = `Today: ${todays.map((s) => `${s.startTime} ${s.subject}`).join(", ")}.`;
  const facts = todays.map((s) => `${s.startTime}-${s.endTime} ${s.subject}`).join("; ");
  return phraseAnswer(ctx, question, facts, fallback, { grounded: true });
}

async function resolveAssignments(ctx: AiContext, question: string): Promise<AiAnswer> {
  let assignments: any[] = [];
  if (ctx.role === "student") {
    const r = await callTool("getStudentAssignments", ctx, { studentId: ctx.uid });
    if (!r.ok) return { grounded: false, text: r.error };
    assignments = r.data as any[];
  } else if (ctx.role === "parent" && ctx.subjectId) {
    const r = await callTool("getStudentAssignments", ctx, { studentId: ctx.subjectId });
    if (!r.ok) return { grounded: false, text: r.error };
    assignments = r.data as any[];
  } else if (ctx.role === "teacher" || ctx.role === "admin") {
    for (const classId of ctx.classIds) {
      const r = await callTool("getClassAssignments", ctx, { classId });
      if (r.ok) assignments.push(...(r.data as any[]));
    }
  }

  if (!assignments || assignments.length === 0) return { grounded: true, text: "No assignments found." };
  const upcoming = assignments
    .filter((a) => new Date(a.dueDate).getTime() >= Date.now())
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const fallback =
    upcoming.length === 0
      ? "No upcoming assignments due."
      : `Upcoming: ${upcoming
          .slice(0, 3)
          .map((a) => `"${a.title}" due ${new Date(a.dueDate).toLocaleDateString()}`)
          .join("; ")}.`;
  if (upcoming.length === 0) return { title: "Assignments", grounded: true, text: fallback };
  const facts = upcoming.slice(0, 5).map((a) => `"${a.title}" due ${new Date(a.dueDate).toLocaleDateString()}`).join("; ");
  const { text, rateLimited } = await tryPhrase(ctx.role, question, facts, fallback);
  const actions: AiAction[] =
    ctx.role === "student"
      ? [
          action({ id: "view-assignments", kind: "navigate", label: "View Assignments", href: "/student/assignments" }),
          action({ id: "study-plan", kind: "navigate", label: "Create Study Plan", href: "/student/ai?prompt=Create a revision plan for my pending assignments" }),
        ]
      : [action({ id: "view-assignments", kind: "navigate", label: "View Assignments", href: ctx.role === "parent" ? "/parent/dashboard" : "/teacher/assignments" })];
  return { title: `${upcoming.length} Pending Assignment${upcoming.length > 1 ? "s" : ""}`, grounded: true, text, rateLimited, actions };
}

async function resolveAnnouncements(ctx: AiContext, question: string): Promise<AiAnswer> {
  const result = await callTool("getAnnouncements", ctx);
  if (!result.ok) return { grounded: false, text: result.error };
  const items = (result.data as any[]).slice(0, 5);
  if (items.length === 0) return { grounded: true, text: "No announcements right now." };
  const fallback = `Recent: ${items.map((a) => a.title).join("; ")}.`;
  const facts = items.map((a) => `"${a.title}" (${a.priority})`).join("; ");
  return phraseAnswer(ctx, question, facts, fallback, { grounded: true });
}

async function resolveRoster(ctx: AiContext, question: string): Promise<AiAnswer> {
  if (ctx.role !== "teacher" && ctx.role !== "admin") {
    return { grounded: false, text: "Class rosters are only available to teachers and admins." };
  }
  const classId = ctx.classIds[0];
  if (!classId) return { grounded: true, text: "No class is assigned to your account yet." };
  const result = await callTool("getClassStudents", ctx, { classId });
  if (!result.ok) return { grounded: false, text: result.error };
  const students = result.data as any[];
  const fallback = `${students.length} student(s) in this class.`;
  const facts = `studentCount=${students.length}`;
  return phraseAnswer(ctx, question, facts, fallback, { grounded: true });
}

async function resolvePolicyQuestion(ctx: AiContext, question: string): Promise<AiAnswer> {
  const result = await callTool("searchSchoolKnowledge", ctx, { query: question });
  if (!result.ok) return { grounded: false, text: result.error };
  const { chunks } = result.data as { chunks: { text: string; documentTitle: string; documentId: string; score: number }[] };

  if (chunks.length === 0) {
    return { grounded: false, text: "I couldn't find this information in your school's available documents." };
  }

  const facts = chunks.map((c, i) => `[Source ${i + 1}: ${c.documentTitle}] ${c.text}`).join("\n\n");
  const fallback = `Based on ${chunks[0].documentTitle}: ${chunks[0].text.slice(0, 220)}${chunks[0].text.length > 220 ? "…" : ""}`;
  const phrased = await tryPhrase(ctx.role, question, facts, fallback);
  const citationLine = `\n\nSource: ${chunks[0].documentTitle}`;
  return { grounded: true, text: phrased.text + citationLine, rateLimited: phrased.rateLimited };
}

async function resolveLinkedChildren(ctx: AiContext, question: string): Promise<AiAnswer> {
  if (ctx.role !== "parent") return { grounded: false, text: "This is only available to parent accounts." };
  const result = await callTool("getLinkedChildren", ctx);
  if (!result.ok) return { grounded: false, text: result.error };
  const children = result.data as { fullName: string }[];
  if (children.length === 0) return { grounded: true, text: "No children are linked to your account yet." };
  const fallback = `Linked: ${children.map((c) => c.fullName).join(", ")}.`;
  return phraseAnswer(ctx, question, fallback, fallback, { grounded: true });
}

export async function askNexus(ctx: AiContext, question: string): Promise<AiAnswer> {
  const q = question.toLowerCase();

  try {
    if (q.includes("attendance") || q.includes("75%") || q.includes("below")) {
      return await resolveAttendance(ctx, question);
    }

    if (q.includes("student") && (q.includes("class") || q.includes("roster") || q.includes("how many"))) {
      return await resolveRoster(ctx, question);
    }

    if (q.includes("child") || q.includes("children")) {
      return await resolveLinkedChildren(ctx, question);
    }

    if (q.includes("announcement") || q.includes("notice") || q.includes("circular")) {
      return await resolveAnnouncements(ctx, question);
    }

    if (q.includes("schedule") || q.includes("today") || q.includes("timetable") || q.includes("class")) {
      return await resolveSchedule(ctx, question);
    }

    if (q.includes("assignment")) {
      return await resolveAssignments(ctx, question);
    }

    if (q.includes("policy") || q.includes("handbook") || q.includes("rule") || q.includes("minimum") || q.includes("requirement")) {
      return await resolvePolicyQuestion(ctx, question);
    }

    return {
      grounded: false,
      text:
        "I can answer questions about attendance, today's schedule, assignments, announcements, and rosters right now using your live school data. Try asking one of those, or connect a Gemini API key for open-ended answers.",
    };
  } catch (err) {
    return { grounded: false, unavailable: true, text: "NEXUS AI ran into a problem answering that. Please try again." };
  }
}

/** Builds an AiContext for the logged-in user, resolving their class scope and (for parents) every linked child by role. */
export async function buildAiContext(uid: string): Promise<AiContext | null> {
  const profile = await getCurrentUserProfile(uid);
  if (!profile || !profile.schoolId) return null;

  let classIds: string[] = [];
  let childIds: string[] | undefined;
  let subjectId: string | undefined;

  if (profile.role === "teacher") {
    const t = await getTeacherProfile(uid);
    classIds = t?.classIds ?? [];
  } else if (profile.role === "student" && profile.primaryClassId) {
    classIds = [profile.primaryClassId];
  } else if (profile.role === "parent") {
    childIds = await getChildrenForParent(uid);
    subjectId = childIds[0];
    if (subjectId) {
      const childProfile = await getCurrentUserProfile(subjectId);
      if (childProfile?.primaryClassId) classIds = [childProfile.primaryClassId];
    }
  }

  return { uid, role: profile.role, schoolId: profile.schoolId, classIds, childIds, subjectId };
}

// Re-exported so existing callers (and Pass 3/4 additions) can reach the
// full tool surface without importing the registry module directly.
export { aiToolRegistry, callTool };

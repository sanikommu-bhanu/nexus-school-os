// ============================================================
// NEXUS AI — Actions layer (Part 5, 6, 7).
//
// The chat resolvers in ai-tools-service.ts attach `AiAction[]` to an
// answer. Every action is one of two kinds:
//
//   "navigate"  — pure UI convenience, no data is touched. Safe to
//                 fire immediately (router.push).
//
//   "confirm"   — consequential: sends a message, publishes an
//                 announcement, or writes a note. These NEVER execute
//                 on tap. The UI must render the PROPOSED ACTION sheet
//                 (see the confirm sheet in components/ai/NexusAiChat.tsx)
//                 and call executeAiAction only after the user taps the
//                 explicit confirm button. This file is the one place
//                 that boundary is enforced in code — no resolver, and
//                 no UI component, is allowed to call a *-service.ts
//                 write function directly on the AI's behalf.
//
// Every execute* function re-derives and re-checks permission from
// AiContext before writing anything — it never trusts that the
// resolver which proposed the action already checked, because the
// confirm step may run seconds later after state could have changed.
// ============================================================
import type { AiContext } from "@/services/ai-tool-registry";
import { requireSameSchoolRelationship } from "@/services/ai-tool-registry";
import { getOrCreateConversation, sendMessage } from "@/services/messaging-service";
import { createAnnouncement } from "@/services/announcement-service";
import { createSupportNote } from "@/services/support-note-service";
import { getParentsForStudent } from "@/services/parent-link-service";

export type AiActionKind = "navigate" | "confirm";

export type AiActionType =
  | "message_parent"
  | "message_teacher"
  | "create_announcement"
  | "create_support_note";

export interface AiAction {
  id: string;
  label: string;
  kind: AiActionKind;
  /** navigate actions only */
  href?: string;
  /** confirm actions only — what gets executed after the user taps "Send"/"Confirm" */
  type?: AiActionType;
  payload?: Record<string, unknown>;
  /** Shown in the PROPOSED ACTION card so the user knows exactly what will happen. */
  confirmTitle?: string;
  confirmBody?: string;
  destructive?: boolean;
}

export interface AiActionResult {
  ok: boolean;
  message: string;
}

/**
 * The single execution entry point. Called ONLY after the user has
 * explicitly confirmed in the UI (see ActionConfirmSheet's onConfirm).
 * Re-checks permission every time — never assumes the propose step's
 * checks are still valid.
 */
export async function executeAiAction(ctx: AiContext, action: AiAction): Promise<AiActionResult> {
  if (action.kind !== "confirm" || !action.type) {
    return { ok: false, message: "This action can't be executed directly." };
  }

  try {
    switch (action.type) {
      case "message_parent":
        return await executeMessageParent(ctx, action.payload as { studentId: string; text: string });
      case "message_teacher":
        return await executeMessageTeacher(ctx, action.payload as { teacherId: string; text: string });
      case "create_announcement":
        return await executeCreateAnnouncement(
          ctx,
          action.payload as { title: string; message: string; audience: "school" | "class"; classId?: string }
        );
      case "create_support_note":
        return await executeCreateSupportNote(ctx, action.payload as { studentId: string; note: string });
      default:
        return { ok: false, message: "Unknown action." };
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "That action couldn't be completed." };
  }
}

// ------------------------------------------------------------
// Individual executors — each re-verifies role + relationship
// before writing, same standard as ai-tool-registry.ts.
// ------------------------------------------------------------

async function executeMessageParent(ctx: AiContext, payload: { studentId: string; text: string }): Promise<AiActionResult> {
  if (ctx.role !== "teacher" && ctx.role !== "admin") return { ok: false, message: "Only teachers and admins can message parents." };
  await requireSameSchoolRelationship(ctx, payload.studentId);

  const parentIds = await getParentsForStudent(payload.studentId);
  if (parentIds.length === 0) return { ok: false, message: "No parent is linked to this student yet." };

  for (const parentId of parentIds) {
    const conversationId = await getOrCreateConversation(ctx.schoolId, ctx.uid, parentId);
    await sendMessage(ctx.schoolId, conversationId, ctx.uid, parentId, payload.text);
  }
  return { ok: true, message: `Message sent to ${parentIds.length > 1 ? "both parents" : "the parent"}.` };
}

async function executeMessageTeacher(ctx: AiContext, payload: { teacherId: string; text: string }): Promise<AiActionResult> {
  if (ctx.role !== "parent" && ctx.role !== "student") return { ok: false, message: "Only students and parents can message a teacher this way." };
  const conversationId = await getOrCreateConversation(ctx.schoolId, ctx.uid, payload.teacherId);
  await sendMessage(ctx.schoolId, conversationId, ctx.uid, payload.teacherId, payload.text);
  return { ok: true, message: "Message sent to the teacher." };
}

async function executeCreateAnnouncement(
  ctx: AiContext,
  payload: { title: string; message: string; audience: "school" | "class"; classId?: string }
): Promise<AiActionResult> {
  if (ctx.role !== "admin" && ctx.role !== "teacher") return { ok: false, message: "Only admins and teachers can publish announcements." };
  if (payload.audience === "class") {
    if (!payload.classId || (ctx.role === "teacher" && !ctx.classIds.includes(payload.classId))) {
      return { ok: false, message: "You can only announce to your own class." };
    }
  } else if (ctx.role !== "admin") {
    return { ok: false, message: "Only admins can announce to the whole school." };
  }
  await createAnnouncement(ctx.schoolId, ctx.uid, {
    title: payload.title,
    message: payload.message,
    audience: payload.audience,
    priority: "normal",
    classId: payload.classId,
  });
  return { ok: true, message: "Announcement published." };
}

async function executeCreateSupportNote(ctx: AiContext, payload: { studentId: string; note: string }): Promise<AiActionResult> {
  if (ctx.role !== "teacher" && ctx.role !== "admin") return { ok: false, message: "Only teachers and admins can create support notes." };
  await requireSameSchoolRelationship(ctx, payload.studentId);
  await createSupportNote(ctx.schoolId, payload.studentId, ctx.uid, payload.note);
  return { ok: true, message: "Support note saved to the student's record." };
}

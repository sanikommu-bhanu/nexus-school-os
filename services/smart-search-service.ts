// ============================================================
// Smart Search (Part 24).
//
//   query -> structured directory match (classes/students/teachers/docs)
//         -> if none: school knowledge (RAG) match
//         -> if none: reasoning (the same resolvers askNexus uses)
//
// Each branch is tried in order and the first one that finds
// something real wins — this is a routing decision based on what
// actually exists, not a model guessing which mode to use. All three
// branches go through the same permission-checked tool registry
// (searchDirectory / searchSchoolKnowledge) or askNexus, so Smart
// Search never has a wider blast radius than the chat already had.
// ============================================================
import { callTool } from "@/services/ai-tool-registry";
import type { AiContext } from "@/services/ai-tool-registry";
import { askNexus, type AiAnswer } from "@/services/ai-tools-service";

export interface DirectoryHit {
  type: "class" | "student" | "teacher" | "document";
  id: string;
  label: string;
  subtitle?: string;
  href: string;
}

export type SmartSearchResult =
  | { kind: "structured"; hits: DirectoryHit[] }
  | { kind: "document"; chunks: { text: string; documentTitle: string; score: number }[] }
  | { kind: "reasoning"; answer: AiAnswer }
  | { kind: "empty" };

export async function smartSearch(ctx: AiContext, query: string): Promise<SmartSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: "empty" };

  // 1. Structured directory match — fastest and most precise when the
  // query is literally a name/title the caller already has access to.
  const dirResult = await callTool("searchDirectory", ctx, { query: trimmed });
  if (dirResult.ok) {
    const hits = dirResult.data as DirectoryHit[];
    if (hits.length > 0) return { kind: "structured", hits };
  }

  // 2. School knowledge (RAG) — policy/handbook/document-flavored queries.
  const ragResult = await callTool("searchSchoolKnowledge", ctx, { query: trimmed });
  if (ragResult.ok) {
    const { chunks } = ragResult.data as { chunks: { text: string; documentTitle: string; score: number }[] };
    if (chunks.length > 0) return { kind: "document", chunks };
  }

  // 3. Reasoning — the same intent resolvers the chat uses (attendance,
  // schedule, assignments, announcements, rosters).
  const answer = await askNexus(ctx, trimmed);
  if (!answer.unavailable && answer.grounded) return { kind: "reasoning", answer };

  return { kind: "empty" };
}

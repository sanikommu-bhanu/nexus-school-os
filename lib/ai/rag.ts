// ============================================================
// RAG orchestration (Parts 8, 10, 11).
//
//   DOCUMENT -> chunk -> embed -> store         (ingestDocumentText)
//   QUESTION -> retrieve -> filter by school
//            -> filter by permission -> rank
//            -> return with citations           (retrieveRelevantChunks)
//
// Multi-tenancy (Part 10) is enforced twice: structurally, because
// getSchoolChunks only ever reads schools/{schoolId}/knowledgeChunks
// for the caller's own schoolId (see knowledge-service.ts) — and
// again here, by role/audience, so a teacher can't retrieve an
// admin-only chunk just because it happens to live in their school.
// ============================================================
import { chunkText, cosineSimilarity } from "@/lib/ai/chunk";
import { saveKnowledgeChunks, getSchoolChunks, deleteChunksForDocument } from "@/services/knowledge-service";
import type { AiContext } from "@/services/ai-tool-registry";
import type { KnowledgeAudience, KnowledgeChunk } from "@/types";

const EMBEDDING_BATCH_SIZE = 50;
const TOP_K = 4;
const MIN_SIMILARITY = 0.55; // below this, treat as "no relevant source" rather than force a weak match
const MIN_KEYWORD_OVERLAP = 2; // fallback-mode minimum shared significant words

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
  method: "embedding" | "keyword";
}

async function embedTexts(texts: string[]): Promise<{ embeddings: number[][]; model: string } | null> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const res = await fetch("/api/ai/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: batch }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.configured || !data.embeddings) return null;
    out.push(...data.embeddings);
  }
  return { embeddings: out, model: "gemini-embedding-001" };
}

/**
 * Chunks, embeds (if a provider is configured — otherwise stores
 * chunks with an empty embedding so keyword fallback search still
 * works), and stores one document's text. Safe to call again for the
 * same documentId — old chunks are replaced, never duplicated.
 */
export async function ingestDocumentText(params: {
  schoolId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  audience: KnowledgeAudience;
  classId?: string;
}): Promise<{ chunkCount: number; embedded: boolean }> {
  const chunks = chunkText(params.text);
  if (chunks.length === 0) return { chunkCount: 0, embedded: false };

  await deleteChunksForDocument(params.schoolId, params.documentId);

  const embedResult = await embedTexts(chunks.map((c) => c.text));

  await saveKnowledgeChunks(
    chunks.map((c, i) => ({
      schoolId: params.schoolId,
      documentId: params.documentId,
      documentTitle: params.documentTitle,
      classId: params.classId,
      audience: params.audience,
      chunkIndex: c.index,
      text: c.text,
      embedding: embedResult?.embeddings[i] ?? [],
      embeddingModel: embedResult?.model ?? "none",
    }))
  );

  return { chunkCount: chunks.length, embedded: Boolean(embedResult) };
}

/** True if a chunk's audience/classId is retrievable by this ctx. Mirrors announcement scoping. */
function isRetrievable(ctx: AiContext, chunk: KnowledgeChunk): boolean {
  if (ctx.role === "admin") return true;
  if (chunk.audience === "school") return true;
  if (chunk.audience === ctx.role) return true;
  if (chunk.audience === "class") return Boolean(chunk.classId && ctx.classIds.includes(chunk.classId));
  return false;
}

function significantWords(text: string): Set<string> {
  const stop = new Set(["the", "a", "an", "is", "are", "of", "to", "for", "and", "in", "on", "at", "what", "how", "does", "do"]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
  );
}

function keywordScore(query: Set<string>, text: string): number {
  const words = significantWords(text);
  let overlap = 0;
  query.forEach((w) => {
    if (words.has(w)) overlap += 1;
  });
  return overlap;
}

/**
 * Retrieves the top matching chunks for a question, already filtered
 * to this school and this caller's permission scope. Returns an empty
 * array — never a guess — when nothing clears the relevance bar, so
 * callers can honestly say "I couldn't find this in your school's
 * available documents" instead of fabricating an answer.
 */
export async function retrieveRelevantChunks(ctx: AiContext, questionText: string): Promise<RetrievedChunk[]> {
  const allChunks = await getSchoolChunks(ctx.schoolId);
  const allowed = allChunks.filter((c) => isRetrievable(ctx, c));
  if (allowed.length === 0) return [];

  const hasEmbeddings = allowed.some((c) => c.embedding.length > 0);

  if (hasEmbeddings) {
    const embedded = allowed.filter((c) => c.embedding.length > 0);
    const queryEmbed = await embedTexts([questionText]);
    if (queryEmbed) {
      const qVec = queryEmbed.embeddings[0];
      const scored = embedded
        .map((c) => ({ chunk: c, score: cosineSimilarity(qVec, c.embedding) }))
        .filter((s) => s.score >= MIN_SIMILARITY)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K);
      return scored.map((s) => ({
        chunkId: s.chunk.id,
        documentId: s.chunk.documentId,
        documentTitle: s.chunk.documentTitle,
        text: s.chunk.text,
        score: s.score,
        method: "embedding" as const,
      }));
    }
    // embedding call failed at query time — fall through to keyword search
    // over the same allowed set rather than surfacing an error for what
    // is still an answerable question.
  }

  const queryWords = significantWords(questionText);
  const scored = allowed
    .map((c) => ({ chunk: c, score: keywordScore(queryWords, c.text) }))
    .filter((s) => s.score >= MIN_KEYWORD_OVERLAP)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return scored.map((s) => ({
    chunkId: s.chunk.id,
    documentId: s.chunk.documentId,
    documentTitle: s.chunk.documentTitle,
    text: s.chunk.text,
    score: s.score,
    method: "keyword" as const,
  }));
}

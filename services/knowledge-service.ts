// ============================================================
// Knowledge chunk storage (Part 9/10) — the "free-compatible retrieval
// abstraction" called for in the brief: embeddings + metadata stored
// as normal Firestore documents, ranked with in-memory cosine
// similarity rather than a paid vector database.
//
// Every chunk is written under schools/{schoolId}/knowledgeChunks —
// there is no cross-school collection, so a School A query can
// structurally never return School B's rows regardless of app logic.
// This is what Part 10 means by baking multi-tenancy into storage,
// not just into a query filter.
//
// RETRIEVAL SEAM / scale note (Part 9).
// `getSchoolChunks` is the single retrieval entry point: nothing above
// it knows that ranking happens with in-memory cosine similarity, so
// moving to pgvector / Vertex Matching Engine / Pinecone means
// reimplementing this one function, with no change to lib/ai/rag.ts or
// any caller.
//
// Until then the cost is bounded two ways rather than unbounded:
//   1. audience filtering runs in the QUERY, so a caller never
//      downloads chunks it has no permission to use;
//   2. `limit(MAX_SCAN_CHUNKS)` caps the worst-case scan.
// That keeps this honest at demo-to-mid scale (thousands of chunks).
// Beyond that, approximate-nearest-neighbour search is required —
// exact cosine over every candidate is O(n) per question no matter how
// well the candidate set is filtered.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, limit, getDocs, serverTimestamp, deleteDoc, writeBatch } from "firebase/firestore";
import type { KnowledgeAudience, KnowledgeChunk } from "@/types";

export interface NewKnowledgeChunk {
  schoolId: string;
  documentId: string;
  documentTitle: string;
  classId?: string;
  audience: KnowledgeAudience;
  chunkIndex: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
}

/** Writes a batch of chunks for one document in as few round-trips as Firestore's 500-write batch limit allows. */
export async function saveKnowledgeChunks(chunks: NewKnowledgeChunk[]): Promise<void> {
  if (!db || chunks.length === 0) return;
  const BATCH_LIMIT = 450;

  for (let i = 0; i < chunks.length; i += BATCH_LIMIT) {
    const slice = chunks.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const chunk of slice) {
      const ref = doc(collection(db, "schools", chunk.schoolId, "knowledgeChunks"));
      const record: KnowledgeChunk = {
        id: ref.id,
        ...chunk,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(ref, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Hard ceiling on how many chunks one retrieval may scan.
 *
 * Bounds both the Firestore read cost and the in-memory cosine pass, so
 * a school that grows its knowledge base to 50k chunks degrades to
 * "ranks over the most recent MAX_SCAN_CHUNKS" instead of getting
 * slower and more expensive without limit. Raising this past a few
 * thousand is the signal to move to a real vector index — see the
 * retrieval seam note at the top of this file.
 */
export const MAX_SCAN_CHUNKS = 1500;

export interface ChunkQueryOptions {
  /**
   * Restrict to these audiences at the DATABASE level. This is a cost
   * and latency optimisation, NOT the security boundary: callers still
   * re-check every returned chunk against the caller's context (see
   * `isRetrievable` in lib/ai/rag.ts). Omit to read every audience.
   */
  audiences?: KnowledgeAudience[];
  /** Defaults to MAX_SCAN_CHUNKS. */
  max?: number;
}

/**
 * Candidate chunks for a school, narrowed at the database.
 *
 * Previously this read the entire knowledgeChunks collection on every
 * question and filtered afterwards in memory — so a student's question
 * still paid to download teacher- and admin-only chunks before
 * discarding them. Pushing the audience filter into the query means a
 * caller only ever reads rows it could actually use, and `limit()`
 * caps the worst case.
 */
export async function getSchoolChunks(
  schoolId: string,
  options: ChunkQueryOptions = {}
): Promise<KnowledgeChunk[]> {
  if (!db) return [];

  const max = options.max ?? MAX_SCAN_CHUNKS;
  const base = collection(db, "schools", schoolId, "knowledgeChunks");

  // Firestore caps `in` at 30 values; the audience union is at most 3
  // (school + the caller's own role + class), so this never overflows.
  // An empty array would be an invalid query, so treat it as "no filter".
  const audiences = options.audiences?.length ? options.audiences : null;

  const q = audiences
    ? query(base, where("audience", "in", audiences), limit(max))
    : query(base, limit(max));

  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as KnowledgeChunk);
}

/** Removes every chunk belonging to one document — used when a document is deleted or re-ingested. */
export async function deleteChunksForDocument(schoolId: string, documentId: string): Promise<void> {
  if (!db) return;
  const snap = await getDocs(query(collection(db, "schools", schoolId, "knowledgeChunks"), where("documentId", "==", documentId)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

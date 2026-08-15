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
// Scale note (Part 9): this reads the school's whole knowledge base
// into memory per query. Fine for a demo-scale school handbook (tens
// to low hundreds of chunks); swap the body of `getSchoolChunks` for
// a real vector backend later without touching callers.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp, deleteDoc, writeBatch } from "firebase/firestore";
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

/** All chunks for a school — the only collection query this module makes; every downstream filter runs in memory. */
export async function getSchoolChunks(schoolId: string): Promise<KnowledgeChunk[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "knowledgeChunks"));
  return snap.docs.map((d) => d.data() as KnowledgeChunk);
}

/** Removes every chunk belonging to one document — used when a document is deleted or re-ingested. */
export async function deleteChunksForDocument(schoolId: string, documentId: string): Promise<void> {
  if (!db) return;
  const snap = await getDocs(query(collection(db, "schools", schoolId, "knowledgeChunks"), where("documentId", "==", documentId)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

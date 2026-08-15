// ============================================================
// AI conversation memory (Part 25) — schools/{schoolId}/aiConversations/{uid}/messages
//
// Self-scoped by design (see firestore.rules): a user's chat history
// is never cross-readable, not even by an admin. This is what lets
// NEXUS AI chat survive a reload/app restart without a server-side
// session store — the free-tier-compatible answer to "conversation
// memory" is just... Firestore, scoped the same way everything else
// in this app is scoped.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, deleteDoc, collection, query, orderBy, limit as fbLimit, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import type { AiMessageRecord } from "@/types";

const HISTORY_LIMIT = 40; // most-recent turns kept — enough context, bounded read cost

export async function getConversationHistory(schoolId: string, uid: string): Promise<AiMessageRecord[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "aiConversations", uid, "messages"), orderBy("createdAt", "desc"), fbLimit(HISTORY_LIMIT))
  );
  return snap.docs.map((d) => d.data() as AiMessageRecord).reverse();
}

export async function appendConversationMessage(
  schoolId: string,
  uid: string,
  message: Omit<AiMessageRecord, "id" | "uid" | "createdAt" | "updatedAt">
): Promise<void> {
  if (!db) return;
  const ref = doc(collection(db, "schools", schoolId, "aiConversations", uid, "messages"));
  const record: AiMessageRecord = {
    id: ref.id,
    uid,
    ...message,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Firestore's client SDK rejects explicit `undefined` field values
  // (no ignoreUndefinedProperties set — see lib/firebase.ts), and
  // AiAnswer's title/unavailable/rateLimited are frequently unset —
  // e.g. every grounded answer without a card title. Strip those keys
  // entirely rather than writing `title: undefined` and having the
  // whole append silently fail via the catch below.
  const payload: Record<string, unknown> = { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  // Best-effort: a failed write here should never block the chat UI —
  // the message is already shown from local state either way.
  await setDoc(ref, payload).catch(() => {});
}

/** Clears a user's own conversation history — the "New conversation" action. */
export async function clearConversationHistory(schoolId: string, uid: string): Promise<void> {
  if (!db) return;
  const snap = await getDocs(collection(db, "schools", schoolId, "aiConversations", uid, "messages"));
  const BATCH_LIMIT = 450;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

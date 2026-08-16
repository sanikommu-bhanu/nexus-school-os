// ============================================================
// Messaging service — schools/{schoolId}/conversations/{id}
// and .../conversations/{id}/messages/{id}. Part 19/26.
//
// Relationship-based, not open messaging: a conversation is only
// ever created between two participant uids that a screen already
// resolved through a real relationship (class roster, parent link).
// This service never lets the caller message an arbitrary uid it
// hasn't been handed by another service — see the *-service.ts
// callers of getOrCreateConversation for where that check lives.
// firestore.rules backs this up server-side: only a participant can
// read/write a conversation, and only the two uids present at create
// time can ever belong to it (conversations are never re-parented).
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  orderBy,
  arrayRemove,
  arrayUnion,
  Unsubscribe,
} from "firebase/firestore";
import { createNotification } from "@/services/notification-service";
import type { ConversationMeta, MessageItem } from "@/types";

/**
 * Finds the existing 1:1 conversation between two uids, or creates
 * one. Idempotent — safe to call every time a "Message X" button is
 * tapped, same pattern as the class/school join flows.
 */
export async function getOrCreateConversation(schoolId: string, uidA: string, uidB: string): Promise<string> {
  if (!db) throw new Error("Firebase isn't configured.");

  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "conversations"), where("participantIds", "array-contains", uidA))
  );
  const existing = snap.docs.find((d) => (d.data().participantIds as string[]).includes(uidB));
  if (existing) return existing.id;

  const ref = doc(collection(db, "schools", schoolId, "conversations"));
  const convo: ConversationMeta = {
    id: ref.id,
    schoolId,
    participantIds: [uidA, uidB],
    unreadFor: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { ...convo, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function getConversation(schoolId: string, conversationId: string): Promise<ConversationMeta | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId, "conversations", conversationId));
  return snap.exists() ? (snap.data() as ConversationMeta) : null;
}

export function subscribeToConversations(
  schoolId: string,
  uid: string,
  onChange: (items: ConversationMeta[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "schools", schoolId, "conversations"),
    where("participantIds", "array-contains", uid),
    orderBy("updatedAt", "desc")
  );
  // The error callback is not optional in practice. This query needs the
  // participantIds+updatedAt composite index (see firestore.indexes.json —
  // it was missing entirely), and onSnapshot reports a missing index or a
  // rules denial ONLY through this callback. With no handler the failure
  // was completely silent: onChange never fired, so every screen driven by
  // this subscription sat on its spinner forever with no error anywhere in
  // the UI.
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as ConversationMeta)),
    (err) => onError?.(err)
  );
}

export function subscribeToMessages(
  schoolId: string,
  conversationId: string,
  onChange: (items: MessageItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "schools", schoolId, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as MessageItem)),
    (err) => onError?.(err)
  );
}

export async function sendMessage(
  schoolId: string,
  conversationId: string,
  senderId: string,
  recipientId: string,
  text: string
): Promise<void> {
  if (!db) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  const msgRef = doc(collection(db, "schools", schoolId, "conversations", conversationId, "messages"));
  await setDoc(msgRef, {
    id: msgRef.id,
    conversationId,
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "schools", schoolId, "conversations", conversationId), {
    lastMessage: trimmed.slice(0, 140),
    lastMessageAt: new Date().toISOString(),
    lastSenderId: senderId,
    unreadFor: arrayUnion(recipientId),
    updatedAt: serverTimestamp(),
  });

  await createNotification(schoolId, recipientId, {
    type: "system",
    title: "New message",
    message: trimmed.slice(0, 140),
    relatedEntityId: conversationId,
  }).catch(() => {});
}

export async function markConversationRead(schoolId: string, conversationId: string, uid: string): Promise<void> {
  if (!db) return;
  // Note the absent `updatedAt`. The conversation list is ordered by
  // updatedAt desc, so touching it here — on a pure read — reshuffled the
  // list every time a thread was merely opened: reading a months-old
  // conversation jumped it above genuinely recent ones. updatedAt means
  // "when did this conversation last have activity", and marking your own
  // copy read is not activity.
  await updateDoc(doc(db, "schools", schoolId, "conversations", conversationId), {
    unreadFor: arrayRemove(uid),
  });
}

export function otherParticipant(convo: ConversationMeta, uid: string): string | undefined {
  return convo.participantIds.find((id) => id !== uid);
}

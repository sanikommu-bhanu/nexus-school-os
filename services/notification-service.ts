// ============================================================
// Notification service — schools/{schoolId}/notifications/{id}
// Part 18. Written by other services (attendance, assignment,
// announcement...) whenever something notification-worthy happens;
// never written directly by a screen.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  orderBy,
  limit as fbLimit,
  Unsubscribe,
} from "firebase/firestore";
import type { NotificationItem, NotificationType } from "@/types";

export async function createNotification(
  schoolId: string,
  recipientId: string,
  data: { type: NotificationType; title: string; message: string; relatedEntityId?: string }
): Promise<void> {
  if (!db) return;
  const ref = doc(collection(db, "schools", schoolId, "notifications"));
  await setDoc(ref, {
    id: ref.id,
    schoolId,
    recipientId,
    read: false,
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(
  schoolId: string,
  recipientId: string,
  onChange: (items: NotificationItem[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "schools", schoolId, "notifications"),
    where("recipientId", "==", recipientId),
    orderBy("createdAt", "desc"),
    fbLimit(50)
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data() as NotificationItem)));
}

export async function markNotificationRead(schoolId: string, notificationId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "schools", schoolId, "notifications", notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(schoolId: string, recipientId: string): Promise<void> {
  if (!db) return;
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "notifications"),
      where("recipientId", "==", recipientId),
      where("read", "==", false)
    )
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true, updatedAt: serverTimestamp() }));
  await batch.commit();
}

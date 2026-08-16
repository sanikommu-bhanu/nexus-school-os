// ============================================================
// Announcement service — schools/{schoolId}/announcements/{id}
// Part 17. Audience targeting decides who gets a notification;
// the announcement feed itself is filtered client-side per the
// viewer's role/class, matching what firestore.rules allows them
// to read.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, getDocs, serverTimestamp, orderBy, limit as fbLimit } from "firebase/firestore";
import { getSchoolMembers } from "@/services/school-service";
import { getClassMembers } from "@/services/class-service";
import { createNotification } from "@/services/notification-service";
import { stripUndefined } from "@/lib/utils";
import type { Announcement, AnnouncementAudience, AnnouncementPriority } from "@/types";

export async function createAnnouncement(
  schoolId: string,
  createdBy: string,
  data: {
    title: string;
    message: string;
    audience: AnnouncementAudience;
    priority: AnnouncementPriority;
    classId?: string;
    attachmentURL?: string;
  }
): Promise<Announcement> {
  if (!db) throw new Error("Firebase isn't configured.");
  const ref = doc(collection(db, "schools", schoolId, "announcements"));
  const announcement: Announcement = {
    id: ref.id,
    schoolId,
    createdBy,
    // classId is absent on school-wide announcements and attachmentURL on
    // most of them; Firestore rejects an explicit undefined outright.
    ...stripUndefined(data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Announcement;
  await setDoc(ref, { ...announcement, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  // Fan out notifications to the actual resolved audience only.
  let recipientIds: string[] = [];
  if (data.audience === "class" && data.classId) {
    recipientIds = (await getClassMembers(schoolId, data.classId)).map((m) => m.userId);
  } else {
    const members = await getSchoolMembers(schoolId);
    const roleFilter = data.audience === "school" ? null : data.audience;
    recipientIds = members
      .filter((m) => roleFilter === null || m.role === roleFilter)
      .map((m) => m.userId);
  }

  await Promise.all(
    recipientIds.map((uid) =>
      createNotification(schoolId, uid, {
        type: "announcement",
        title: data.title,
        message: data.message.slice(0, 140),
        relatedEntityId: ref.id,
      }).catch(() => {})
    )
  );

  return announcement;
}

export async function getSchoolAnnouncements(schoolId: string, limitCount = 30): Promise<Announcement[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "announcements"), orderBy("createdAt", "desc"), fbLimit(limitCount))
  );
  return snap.docs.map((d) => d.data() as Announcement);
}

/**
 * Class-scoped feed: this class's own announcements plus whole-school
 * ones, newest first. Filtered client-side from the same collection —
 * matches what firestore.rules already lets a class member read, so
 * there's no second "class announcements" collection to keep in sync.
 */
export async function getAnnouncementsForClass(schoolId: string, classId: string, limitCount = 30): Promise<Announcement[]> {
  const all = await getSchoolAnnouncements(schoolId, limitCount * 2);
  return all
    .filter((a) => a.audience === "school" || (a.audience === "class" && a.classId === classId))
    .slice(0, limitCount);
}

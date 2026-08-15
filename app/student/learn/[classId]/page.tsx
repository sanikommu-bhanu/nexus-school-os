"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { ListRow } from "@/components/ui/ListRow";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { getTeacherProfile } from "@/services/teacher-service";
import { getUserProfiles } from "@/services/user-service";
import { getAssignmentsForClass } from "@/services/assignment-service";
import { getAttendanceForStudent, summarizeAttendance } from "@/services/attendance-service";
import { getDocumentsForClass } from "@/services/document-service";
import { getAnnouncementsForClass } from "@/services/announcement-service";
import { getOrCreateConversation } from "@/services/messaging-service";
import type { Announcement, Assignment, ClassEntity, DocumentMeta } from "@/types";
import { FileText, MessageCircle, Megaphone } from "lucide-react";

export default function StudentClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const router = useRouter();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [teacherName, setTeacherName] = useState<string>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const messageTeacher = async () => {
    if (!profile?.schoolId || !profile.id || !cls?.teacherId) return;
    setMessaging(true);
    setMessageError(null);
    try {
      const id = await getOrCreateConversation(profile.schoolId, profile.id, cls.teacherId);
      router.push(`/student/messages/${id}`);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Couldn't open the conversation. Try again.");
    } finally {
      setMessaging(false);
    }
  };

  const loadClassDetail = () => {
    if (!profile?.schoolId || !classId || !profile.id) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const c = await getClassById(profile.schoolId!, classId);
        if (!c) { setLoading(false); return; }
        setCls(c);
        const [teacher, a, d, records, ann] = await Promise.all([
          getTeacherProfile(c.teacherId),
          getAssignmentsForClass(profile.schoolId!, classId),
          getDocumentsForClass(profile.schoolId!, classId),
          getAttendanceForStudent(profile.schoolId!, profile.id),
          getAnnouncementsForClass(profile.schoolId!, classId),
        ]);
        if (teacher) {
          const users = await getUserProfiles([teacher.userId]);
          setTeacherName(users.get(teacher.userId)?.fullName);
        }
        setAssignments(a);
        setDocs(d);
        setAnnouncements(ann);
        const myRecords = records.filter((r) => r.classId === classId);
        setAttendancePct(myRecords.length > 0 ? summarizeAttendance(myRecords).percentPresent : null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load this class.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadClassDetail, [profile?.schoolId, profile?.id, classId]);

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title={cls?.name ?? "Class"} subtitle={cls?.subject} />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadClassDetail} />
        ) : !cls ? (
          <EmptyState title="Class not found" />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Teacher" value={teacherName ?? "—"} />
              <Stat label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} />
            </GlassSurface>

            <div className="mt-4">
              <button onClick={messageTeacher} disabled={messaging || !cls.teacherId} className="w-full text-left disabled:opacity-50">
                <GlassSurface rounded="2xl">
                  <ListRow
                    leading={<MessageCircle className="h-5 w-5 text-accent-soft" />}
                    title={teacherName ? `Message ${teacherName}` : "Message Teacher"}
                    subtitle={messaging ? "Opening conversation…" : "Ask about class or assignments"}
                  />
                </GlassSurface>
              </button>
              {messageError && <p className="mt-1 text-xs font-medium text-danger">{messageError}</p>}
            </div>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Assignments</p>
              {assignments.length === 0 ? (
                <EmptyState title="No assignments yet" />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {assignments.map((a) => (
                    <ListRow key={a.id} title={a.title} subtitle={`Due ${new Date(a.dueDate).toLocaleDateString()}`} trailing={<Badge tone="accent">{a.subject}</Badge>} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Announcements</p>
              {announcements.length === 0 ? (
                <EmptyState icon={<Megaphone className="h-5.5 w-5.5" />} title="No announcements yet" />
              ) : (
                <div className="flex flex-col gap-3">
                  {announcements.map((a) => (
                    <GlassSurface key={a.id} rounded="2xl" className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-ink">{a.title}</p>
                      <p className="text-sm text-ink-muted">{a.message}</p>
                    </GlassSurface>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Resources</p>
              {docs.length === 0 ? (
                <EmptyState icon={<FileText className="h-5.5 w-5.5" />} title="No documents yet" />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {docs.map((d) => (
                    <ListRow key={d.id} leading={<FileText className="h-5 w-5 text-ink-faint" />} title={d.fileName} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-4 text-center">
      <p className="truncate text-lg font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}

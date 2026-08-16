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
import { getAssignmentsForClass, getSubmissionsForStudent, submitAssignment } from "@/services/assignment-service";
import { getAttendanceForStudent, summarizeAttendance } from "@/services/attendance-service";
import { getDocumentsForClass } from "@/services/document-service";
import { getAnnouncementsForClass } from "@/services/announcement-service";
import { getOrCreateConversation } from "@/services/messaging-service";
import type { Announcement, Assignment, ClassEntity, DocumentMeta, SubmissionStatus } from "@/types";
import { FileText, MessageCircle, Megaphone, Check } from "lucide-react";

/** Badge tone + label for a submission state. "pending" is the seeded default. */
function submissionBadge(status: SubmissionStatus | undefined) {
  switch (status) {
    case "graded":
      return { tone: "success" as const, label: "Graded" };
    case "submitted":
      return { tone: "success" as const, label: "Submitted" };
    case "late":
      return { tone: "warning" as const, label: "Submitted late" };
    default:
      return { tone: "neutral" as const, label: "Not submitted" };
  }
}

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
  /** assignmentId -> this student's own submission status. */
  const [submissions, setSubmissions] = useState<Map<string, SubmissionStatus>>(new Map());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (assignment: Assignment) => {
    if (!profile?.schoolId || !profile.id) return;
    setSubmitting(assignment.id);
    setSubmitError(null);
    try {
      const status = await submitAssignment(profile.schoolId, assignment, profile.id);
      setSubmissions((m) => new Map(m).set(assignment.id, status));
    } catch (err) {
      setSubmitError(
        err instanceof Error ? `Couldn't record your submission: ${err.message}` : "Couldn't record your submission."
      );
    } finally {
      setSubmitting(null);
    }
  };

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

        // Best-effort: the assignment list is still worth showing if the
        // student's own submission rows can't be read.
        const mine = await getSubmissionsForStudent(profile.schoolId!, profile.id, a.map((x) => x.id)).catch(() => []);
        setSubmissions(new Map(mine.map((s) => [s.assignmentId, s.status])));
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
              {submitError && <p className="mb-2 text-xs font-medium text-danger">{submitError}</p>}
              {assignments.length === 0 ? (
                <EmptyState title="No assignments yet" />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {assignments.map((a) => {
                    const status = submissions.get(a.id);
                    const done = status === "submitted" || status === "late" || status === "graded";
                    const badge = submissionBadge(status);
                    return (
                      <div key={a.id} className="py-3 first:pt-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{a.title}</p>
                            <p className="text-xs text-ink-muted">Due {new Date(a.dueDate).toLocaleDateString()}</p>
                          </div>
                          <Badge tone="accent">{a.subject}</Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          {/* Marking work submitted is the student's half of
                              a lifecycle that was fully modelled (seeded
                              rows, rules, statuses) but had no UI anywhere,
                              so a teacher's submission counts could never
                              move off zero. */}
                          {!done && (
                            <button
                              onClick={() => handleSubmit(a)}
                              disabled={submitting === a.id}
                              className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-soft disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {submitting === a.id ? "Saving…" : "Mark as submitted"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

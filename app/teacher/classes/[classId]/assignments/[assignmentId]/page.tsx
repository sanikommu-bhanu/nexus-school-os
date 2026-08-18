"use client";

// ============================================================
// Assignment detail + grading (the other half of Part 13).
//
// createAssignment seeds one "pending" submission row per enrolled
// student, and the class workspace has always shown a real
// "3 of 12 submitted" tally from those rows — but there was no screen
// behind it. A teacher could create an assignment and watch the count
// move, and then had nowhere to go: getSubmissionsForAssignment() was
// only ever reached by getSubmissionCounts(), and markSubmission()
// only by the student's own hand-in. This is the missing reader.
//
// Nothing here fabricates a roster entry: a student with no submission
// row (one who joined the class after the assignment was created) is
// shown as pending rather than skipped, which is exactly the case the
// submissions create rule in firestore.rules was widened to allow.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  getAssignmentById,
  getSubmissionsForAssignment,
  gradeSubmission,
} from "@/services/assignment-service";
import { getStudentsForClass } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import type { Assignment, AssignmentSubmission, SubmissionStatus, UserProfile } from "@/types";
import { Users } from "lucide-react";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Not handed in",
  submitted: "Submitted",
  late: "Late",
  graded: "Graded",
};

const STATUS_TONE: Record<SubmissionStatus, "accent" | "warning" | "success" | "danger"> = {
  pending: "danger",
  submitted: "accent",
  late: "warning",
  graded: "success",
};

interface Row {
  studentId: string;
  user?: UserProfile;
  status: SubmissionStatus;
  grade: string;
}

export default function TeacherAssignmentDetailPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>();
  const { profile } = useAuthUser();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  // Grade text being edited, keyed by studentId. Kept apart from `rows`
  // so a save that fails can fall back to the last saved value rather
  // than leaving the field showing something that was never written.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    if (!profile?.schoolId || !classId || !assignmentId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const a = await getAssignmentById(profile.schoolId!, assignmentId);
        if (!a) {
          setLoading(false);
          return;
        }
        setAssignment(a);

        const [roster, submissions] = await Promise.all([
          getStudentsForClass(profile.schoolId!, classId),
          getSubmissionsForAssignment(profile.schoolId!, assignmentId),
        ]);
        const users = await getUserProfiles(roster.map((s) => s.userId));
        const byStudent = new Map(submissions.map((s: AssignmentSubmission) => [s.studentId, s]));

        const merged: Row[] = roster.map((s) => {
          const sub = byStudent.get(s.userId);
          return {
            studentId: s.userId,
            user: users.get(s.userId),
            status: sub?.status ?? "pending",
            grade: sub?.grade ?? "",
          };
        });
        setRows(merged);
        setDrafts(Object.fromEntries(merged.map((r) => [r.studentId, r.grade])));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load this assignment.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, [profile?.schoolId, classId, assignmentId]);

  const tally = useMemo(() => {
    const handedIn = rows.filter((r) => r.status !== "pending").length;
    const graded = rows.filter((r) => r.status === "graded").length;
    return { handedIn, graded, total: rows.length };
  }, [rows]);

  const save = async (row: Row) => {
    if (!profile?.schoolId) return;
    const next = drafts[row.studentId] ?? "";
    setSaving(row.studentId);
    setSaveError(null);
    try {
      await gradeSubmission(profile.schoolId, assignmentId, row.studentId, classId, next, row.status);
      // Mirror locally what gradeSubmission just wrote, so the badge and
      // the tally move without a full refetch.
      setRows((prev) =>
        prev.map((r) =>
          r.studentId === row.studentId
            ? {
                ...r,
                grade: next.trim(),
                status: next.trim() ? "graded" : r.status === "graded" ? "submitted" : r.status,
              }
            : r
        )
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save that grade.");
      setDrafts((d) => ({ ...d, [row.studentId]: row.grade }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader
          title={assignment?.title ?? "Assignment"}
          subtitle={assignment ? `Due ${new Date(assignment.dueDate).toLocaleDateString()}` : undefined}
        />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : !assignment ? (
          <EmptyState title="Assignment not found" />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat size="lg" label="Handed in" value={`${tally.handedIn}/${tally.total}`} />
              <Stat size="lg" label="Graded" value={`${tally.graded}/${tally.total}`} />
              <Stat size="lg" label="Subject" value={assignment.subject} />
            </GlassSurface>

            {assignment.description && (
              <GlassSurface rounded="2xl" className="mt-5">
                <p className="text-sm text-ink-muted">{assignment.description}</p>
              </GlassSurface>
            )}

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Submissions</p>
              {saveError && <p className="mb-2 text-xs font-medium text-danger">{saveError}</p>}

              {rows.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5.5 w-5.5" />}
                  title="No students yet"
                  message="Share the class code so students can join and hand work in."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {rows.map((r) => {
                    const draft = drafts[r.studentId] ?? "";
                    const dirty = draft.trim() !== r.grade.trim();
                    return (
                      <GlassSurface key={r.studentId} rounded="2xl" className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.user?.fullName ?? "Student"} src={r.user?.photoURL} size="sm" />
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                            {r.user?.fullName ?? "Student"}
                          </p>
                          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </div>
                        <div className="flex items-end gap-2">
                          <Input
                            id={`grade-${r.studentId}`}
                            label="Grade"
                            value={draft}
                            placeholder="e.g. 17/20"
                            aria-label={`Grade for ${r.user?.fullName ?? "student"}`}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.studentId]: e.target.value }))}
                          />
                          <Button
                            fullWidth={false}
                            variant="ghost"
                            className="shrink-0 px-4"
                            disabled={!dirty}
                            loading={saving === r.studentId}
                            onClick={() => save(r)}
                          >
                            Save
                          </Button>
                        </div>
                      </GlassSurface>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

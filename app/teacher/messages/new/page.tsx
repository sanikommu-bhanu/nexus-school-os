"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForTeacher, getClassMembers } from "@/services/class-service";
import { getUserProfiles } from "@/services/user-service";
import { getParentsForStudent } from "@/services/parent-link-service";
import { getOrCreateConversation } from "@/services/messaging-service";
import { Users } from "lucide-react";

interface Contact {
  uid: string;
  name: string;
  photoURL?: string;
  subtitle: string;
}

export default function TeacherNewMessagePage() {
  const { profile } = useAuthUser();
  const router = useRouter();
  const [students, setStudents] = useState<Contact[]>([]);
  const [parents, setParents] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const loadContacts = () => {
    if (!profile?.schoolId || !profile.id) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const classes = await getClassesForTeacher(profile.schoolId!, profile.id);
        const memberLists = await Promise.all(classes.map((c) => getClassMembers(profile.schoolId!, c.id)));
        const studentIds = Array.from(
          new Set(memberLists.flat().filter((m) => m.role === "student").map((m) => m.userId))
        );
        const users = await getUserProfiles(studentIds);

        const parentEntries = (
          await Promise.all(
            studentIds.map(async (sid) => {
              const parentIds = await getParentsForStudent(sid);
              return parentIds.map((pid) => ({ pid, studentName: users.get(sid)?.fullName ?? "Student" }));
            })
          )
        ).flat();
        const parentUsers = await getUserProfiles(parentEntries.map((p) => p.pid));

        setStudents(
          studentIds.map((sid) => ({
            uid: sid,
            name: users.get(sid)?.fullName ?? "Student",
            photoURL: users.get(sid)?.photoURL,
            subtitle: "Student",
          }))
        );
        setParents(
          parentEntries.map((p) => ({
            uid: p.pid,
            name: parentUsers.get(p.pid)?.fullName ?? "Parent",
            photoURL: parentUsers.get(p.pid)?.photoURL,
            subtitle: `${p.studentName}'s parent`,
          }))
        );
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load your contacts.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadContacts, [profile?.schoolId, profile?.id]);

  const startConversation = async (uid: string) => {
    if (!profile?.schoolId || !profile.id) return;
    setStarting(uid);
    setStartError(null);
    try {
      const id = await getOrCreateConversation(profile.schoolId, profile.id, uid);
      router.push(`/teacher/messages/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start this conversation. Try again.");
    } finally {
      setStarting(null);
    }
  };

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="New Message" subtitle="Choose a student or parent" />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadContacts} />
        ) : students.length === 0 && parents.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5.5 w-5.5" />}
            title="No contacts yet"
            message="Students and parents will appear here once they join your classes."
          />
        ) : (
          <>
            {startError && <p className="mb-3 text-xs font-medium text-danger">{startError}</p>}
            {parents.length > 0 && (
              <>
                <p className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Parents</p>
                <div className="flex flex-col divide-y divide-white/6">
                  {parents.map((p) => (
                    <button
                      key={p.uid}
                      onClick={() => startConversation(p.uid)}
                      disabled={starting === p.uid}
                      className="w-full text-left disabled:opacity-50"
                    >
                      <ListRow leading={<Avatar name={p.name} src={p.photoURL} size="sm" />} title={p.name} subtitle={p.subtitle} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {students.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-faint">Students</p>
                <div className="flex flex-col divide-y divide-white/6">
                  {students.map((s) => (
                    <button
                      key={s.uid}
                      onClick={() => startConversation(s.uid)}
                      disabled={starting === s.uid}
                      className="w-full text-left disabled:opacity-50"
                    >
                      <ListRow leading={<Avatar name={s.name} src={s.photoURL} size="sm" />} title={s.name} subtitle={s.subtitle} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

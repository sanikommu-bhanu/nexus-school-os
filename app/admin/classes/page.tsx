"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForSchool, createClass } from "@/services/class-service";
import { getTeachersForSchool } from "@/services/teacher-service";
import { getUserProfiles } from "@/services/user-service";
import { attachClassToTeacher } from "@/services/teacher-service";
import type { ClassEntity, TeacherProfile, UserProfile } from "@/types";
import { Layers, Plus } from "lucide-react";

function AdminClassesScreen() {
  const { profile } = useAuthUser();
  const params = useSearchParams();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(params.get("new") === "1");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({ grade: "", section: "", subject: "", teacherId: "" });

  const load = async () => {
    if (!profile?.schoolId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [c, t] = await Promise.all([getClassesForSchool(profile.schoolId), getTeachersForSchool(profile.schoolId)]);
      const u = await getUserProfiles(t.map((x) => x.userId));
      setClasses(c);
      setTeachers(t);
      setUsers(u);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load classes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.schoolId]);

  const handleCreate = async () => {
    if (!profile?.schoolId || !form.grade || !form.section || !form.subject || !form.teacherId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createClass(profile.schoolId, form.teacherId, {
        name: `${form.grade}-${form.section}`,
        grade: form.grade,
        section: form.section,
        subject: form.subject,
      });
      await attachClassToTeacher(form.teacherId, created.id);
      setShowForm(false);
      setForm({ grade: "", section: "", subject: "", teacherId: "" });
      router.replace("/admin/classes");
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't create this class. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader
          title="Classes"
          subtitle={`${classes.length} total`}
          trailing={
            <button onClick={() => setShowForm((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full glass-surface">
              <Plus className="h-4.5 w-4.5" />
            </button>
          }
        />

        {showForm && (
          <GlassSurface rounded="2xl" className="mb-5 flex flex-col gap-3">
            <p className="text-sm font-semibold text-ink">Create Class</p>
            <div className="flex gap-3">
              <Input placeholder="Grade (10)" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
              <Input placeholder="Section (A)" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <select
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
              className="input-glass"
            >
              <option value="">Assign teacher…</option>
              {teachers.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {users.get(t.userId)?.fullName ?? "Teacher"}
                </option>
              ))}
            </select>
            {saveError && <p className="text-xs font-medium text-danger">{saveError}</p>}
            <Button onClick={handleCreate} loading={saving} disabled={!form.grade || !form.section || !form.subject || !form.teacherId}>
              Create Class
            </Button>
          </GlassSurface>
        )}

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : classes.length === 0 ? (
          <EmptyState icon={<Layers className="h-5.5 w-5.5" />} title="No classes yet" message="Create your first class to get started." />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {classes.map((c) => (
              <ListRow
                key={c.id}
                href={`/admin/classes/${c.id}`}
                title={c.name}
                subtitle={`${c.subject} · ${c.studentCount} students`}
              />
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

// Suspense boundary required by useSearchParams() — see app/auth/page.tsx.
// Without it `next build` fails this route outright.
export default function AdminClassesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AdminClassesScreen />
    </Suspense>
  );
}

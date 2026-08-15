"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConnectionSuccess } from "@/components/ui/ConnectionSuccess";
import { useAuthUser } from "@/hooks/useAuthUser";
import { createAssignment } from "@/services/assignment-service";

export default function NewAssignmentPage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", subject: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!profile?.schoolId || !form.title || !form.dueDate) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createAssignment(profile.schoolId, profile.id, { classId, ...form });
      setDone(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't create this assignment. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="New Assignment" />
        {done ? (
          <ConnectionSuccess heading="Assignment created" subheading="Students in this class can now see it." ctaLabel="Back to class" onContinue={() => router.replace(`/teacher/classes/${classId}`)} />
        ) : (
          <div className="flex flex-col gap-4">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Chapter 4 Problem Set" />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-glass min-h-[110px] resize-none"
                placeholder="What should students do?"
              />
            </div>
            <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Mathematics" />
            <Input label="Due date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            {saveError && <p className="text-xs font-medium text-danger">{saveError}</p>}
            <Button onClick={handleSubmit} loading={saving} disabled={!form.title || !form.dueDate}>
              Create Assignment
            </Button>
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

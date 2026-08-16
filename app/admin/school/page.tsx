"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { ListRow } from "@/components/ui/ListRow";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolById, updateSchool } from "@/services/school-service";
import type { School } from "@/types";
import {
  Users,
  GraduationCap,
  HeartHandshake,
  Layers,
  IndianRupee,
  Pencil,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// Same list the create-school step offers, so a school's type can't drift
// into a value the rest of the app doesn't recognise.
const SCHOOL_TYPES = ["CBSE", "ICSE", "State Board", "IB", "International", "Other"];

interface EditForm {
  name: string;
  type: string;
  city: string;
  state: string;
  contactEmail: string;
  contactPhone: string;
}

function formFromSchool(s: School): EditForm {
  return {
    name: s.name ?? "",
    type: s.type ?? SCHOOL_TYPES[0],
    city: s.city ?? "",
    state: s.state ?? "",
    contactEmail: s.contactEmail ?? "",
    contactPhone: s.contactPhone ?? "",
  };
}

export default function AdminSchoolPage() {
  const { profile } = useAuthUser();
  const [school, setSchool] = useState<School | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () => {
    if (!profile?.schoolId) return;
    setLoadError(null);
    getSchoolById(profile.schoolId)
      .then((s) => {
        // A null result is a real outcome (missing/unreadable doc), not a
        // reason to keep spinning forever as this screen used to.
        if (!s) {
          setLoadError("We couldn't find your school. It may have been removed.");
          return;
        }
        setSchool(s);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Couldn't load your school details.")
      );
  };

  useEffect(load, [profile?.schoolId]);

  const startEditing = () => {
    if (!school) return;
    setForm(formFromSchool(school));
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm(null);
    setSaveError(null);
  };

  const canSave =
    !!form && form.name.trim().length > 1 && form.city.trim().length > 0 && form.state.trim().length > 0;

  const save = async () => {
    if (!form || !school || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Optional contact fields collapse to undefined when blank so
      // updateSchool drops them instead of writing empty strings.
      const updated = await updateSchool(school.id, {
        name: form.name.trim(),
        type: form.type,
        city: form.city.trim(),
        state: form.state.trim(),
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      });
      // Render what Firestore actually stored, not the local draft.
      setSchool(updated);
      setEditing(false);
      setForm(null);
      setSaved(true);
    } catch (err) {
      // Previously there was no save path at all; now a rejected write
      // (e.g. firestore.rules refusing a non-admin) says so instead of
      // leaving the admin to guess whether anything happened.
      setSaveError(
        err instanceof Error ? `Couldn't save your changes: ${err.message}` : "Couldn't save your changes."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="School" subtitle={school?.name} showBack={false} />

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : !school ? (
          <LoadingState message="Loading school details…" />
        ) : (
          <>
            <QRDisplay
              value={`https://nexus.app/join/school/${school.code}`}
              code={school.code}
              label="School Code"
            />

            <div className="mt-6 mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Details</p>
              {!editing && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-soft"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>

            {saved && !editing && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-3.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>School details updated.</span>
              </div>
            )}

            {editing && form ? (
              <GlassSurface rounded="2xl" className="flex flex-col gap-4">
                <Input
                  label="School name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  error={form.name.trim().length < 2 ? "Enter the school name" : undefined}
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-muted">School type</label>
                  <div className="flex flex-wrap gap-2">
                    {SCHOOL_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm({ ...form, type: t })}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          form.type === t ? "bg-action text-white" : "glass-surface text-ink-muted"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="City"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    error={!form.city.trim() ? "Required" : undefined}
                  />
                  <Input
                    label="State"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    error={!form.state.trim() ? "Required" : undefined}
                  />
                </div>

                <Input
                  label="Contact email (optional)"
                  type="email"
                  placeholder="office@school.edu"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
                <Input
                  label="Contact phone (optional)"
                  placeholder="+91 98765 43210"
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />

                {saveError && (
                  <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={cancelEditing}
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-white/8 py-3 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <Button onClick={save} loading={saving} disabled={!canSave}>
                    Save changes
                  </Button>
                </div>
              </GlassSurface>
            ) : (
              <GlassSurface rounded="2xl" className="flex flex-col divide-y divide-white/8" padded={false}>
                <Row label="School ID" value={school.id.slice(0, 10) + "…"} />
                <Row label="Type" value={school.type} />
                <Row label="Location" value={`${school.city}, ${school.state}`} />
                {school.contactEmail && <Row label="Contact email" value={school.contactEmail} />}
                {school.contactPhone && <Row label="Contact phone" value={school.contactPhone} />}
              </GlassSurface>
            )}

            <div className="mt-7 flex flex-col gap-1">
              <ListRow
                href="/admin/teachers"
                leading={<IconChip icon={Users} />}
                title="Teachers"
                subtitle="Manage teaching staff"
              />
              <ListRow
                href="/admin/classes"
                leading={<IconChip icon={Layers} />}
                title="Classes"
                subtitle="Sections, subjects & rosters"
              />
              <ListRow
                href="/admin/students"
                leading={<IconChip icon={GraduationCap} />}
                title="Students"
                subtitle="Search & manage students"
              />
              <ListRow
                href="/admin/school/parents"
                leading={<IconChip icon={HeartHandshake} />}
                title="Parents"
                subtitle="Connected guardian accounts"
              />
              <ListRow
                href="/admin/school/fees"
                leading={<IconChip icon={IndianRupee} />}
                title="Fee Management"
                subtitle="Dues, collection & payment records"
              />
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function IconChip({ icon: Icon }: { icon: any }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
      <Icon className="h-4.5 w-4.5 text-accent-soft" />
    </div>
  );
}

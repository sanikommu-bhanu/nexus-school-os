"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolById } from "@/services/school-service";
import type { School } from "@/types";
import { Users, GraduationCap, HeartHandshake, Layers, IndianRupee } from "lucide-react";

export default function AdminSchoolPage() {
  const { profile } = useAuthUser();
  const [school, setSchool] = useState<School | null>(null);

  useEffect(() => {
    if (!profile?.schoolId) return;
    getSchoolById(profile.schoolId).then(setSchool);
  }, [profile?.schoolId]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="School" subtitle={school?.name} showBack={false} />

        {!school ? (
          <LoadingState message="Loading school details…" />
        ) : (
          <>
            <QRDisplay
              value={`https://nexus.app/join/school/${school.code}`}
              code={school.code}
              label="School Code"
            />

            <GlassSurface rounded="2xl" className="mt-5 flex flex-col divide-y divide-white/8" padded={false}>
              <Row label="School ID" value={school.id.slice(0, 10) + "…"} />
              <Row label="Type" value={school.type} />
              <Row label="Location" value={`${school.city}, ${school.state}`} />
            </GlassSurface>

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

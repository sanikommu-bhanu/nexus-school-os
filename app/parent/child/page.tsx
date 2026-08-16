"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { getChildSnapshots, type ChildSnapshot } from "@/services/parent-view-service";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function ParentChildSwitcherPage() {
  const { profile } = useAuthUser();
  const [children, setChildren] = useState<ChildSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const router = useRouter();

  useEffect(() => {
    if (!profile?.id) return;
    getChildSnapshots(profile.id)
      .then((c) => {
        setChildren(c);
      })
      // Without a catch, a rejected read left `loading` true forever and
      // this screen spun permanently instead of saying anything.
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load your children."))
      .finally(() => setLoading(false));
  }, [profile?.id]);

  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent">
        <PageHeader title="My Children" />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : children.length === 0 ? (
          <EmptyState title="No children connected" message="Connect a child using a parent code or QR." />
        ) : (
          <div className="flex flex-col gap-3">
            {children.map((c) => {
              const active = c.studentId === selectedChildId;
              return (
                <button
                  key={c.studentId}
                  onClick={() => {
                    setSelectedChildId(c.studentId);
                    router.push("/parent");
                  }}
                  className={cn("glass-surface flex items-center gap-3 rounded-2xl p-4 text-left", active && "ring-1 ring-accent/50")}
                >
                  <Avatar name={c.name} src={c.photoURL} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">{c.name}</p>
                    <p className="text-xs text-ink-muted">{c.cls?.name ?? "No class"}</p>
                  </div>
                  {active && <Check className="h-4.5 w-4.5 text-accent-soft" />}
                </button>
              );
            })}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

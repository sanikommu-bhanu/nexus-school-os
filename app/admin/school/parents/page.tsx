"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolMembers } from "@/services/school-service";
import { getUserProfiles } from "@/services/user-service";
import { Search, HeartHandshake } from "lucide-react";
import type { UserProfile } from "@/types";

/**
 * Connected guardian accounts for this school.
 *
 * The admin School screen has always linked here, but the route didn't
 * exist — the row 404'd. Built from data an admin can actually read:
 * schools/{id}/members (readable by any school member) narrowed to
 * role === "parent", joined to users/{uid} for names.
 *
 * Deliberately NOT a parent→child mapping: parentStudentLinks is
 * readable only by the two parties on the link (see firestore.rules), so
 * an admin listing children here would either be empty or require
 * widening access to the family graph. Per-child guardians already
 * surface where they belong — on the student's own detail screen.
 */
export default function AdminParentsPage() {
  const { profile } = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parents, setParents] = useState<UserProfile[]>([]);
  const [q, setQ] = useState("");

  const load = () => {
    if (!profile?.schoolId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const members = await getSchoolMembers(profile.schoolId!);
        const parentIds = members.filter((m) => m.role === "parent" && m.status !== "removed").map((m) => m.userId);
        const users = await getUserProfiles(parentIds);
        // Keep the membership list as the source of truth for who counts
        // as a parent here; a missing users/{uid} doc just means we have
        // no name to show, not that the account isn't connected.
        setParents(parentIds.map((id) => users.get(id)).filter((u): u is UserProfile => !!u));
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load connected parents.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(load, [profile?.schoolId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return parents;
    return parents.filter(
      (p) => (p.fullName ?? "").toLowerCase().includes(term) || (p.email ?? "").toLowerCase().includes(term)
    );
  }, [parents, q]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Parents" subtitle="Connected guardian accounts" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parents…"
          trailing={<Search className="h-4 w-4" />}
        />

        <div className="mt-4 flex flex-col divide-y divide-white/6">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<HeartHandshake className="h-5.5 w-5.5" />}
              title={parents.length === 0 ? "No parents connected yet" : "No parents found"}
              message={
                parents.length === 0
                  ? "Parents appear here once they connect using the link code shown on their child's setup screen."
                  : undefined
              }
            />
          ) : (
            filtered.map((p) => (
              <ListRow
                key={p.id}
                leading={<Avatar name={p.fullName || "Parent"} src={p.photoURL} />}
                title={p.fullName || "Parent"}
                subtitle={p.email ?? p.phone ?? "No contact details"}
              />
            ))
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}

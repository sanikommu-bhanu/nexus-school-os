"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRScanner } from "@/components/ui/QRScanner";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { resolveParentLinkCode, linkParentToStudent, type ChildPreview } from "@/services/parent-link-service";

function extractCode(scanned: string): string {
  const parts = scanned.trim().split("/");
  return parts[parts.length - 1].toUpperCase();
}

const RELATIONSHIPS = ["Mother", "Father", "Guardian"];

function ConnectChildContent() {
  const router = useRouter();
  const { user } = useAuthUser();

  const [preview, setPreview] = useState<ChildPreview | null>(null);
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [linking, setLinking] = useState(false);

  const handleResult = async (raw: string) => {
    if (checking) return;
    setChecking(true);
    setError(null);

    // Unhandled, a rejected lookup left `checking` true forever — the
    // screen stayed on "Checking code…" with no error and no way back.
    try {
      const code = extractCode(raw);
      const child = await resolveParentLinkCode(code);

      if (!child) {
        setError("That code isn't valid. Ask your child for the correct code.");
        return;
      }

      setPreview(child);
    } catch (err) {
      setError(`We couldn't check that code: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setChecking(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !user) return;
    setLinking(true);
    setError(null);
    try {
      await linkParentToStudent(user.uid, preview.studentId, preview.schoolId, relationship);
      router.push(`/setup/parent/connect-child/success?name=${encodeURIComponent(preview.name)}&className=${encodeURIComponent(preview.className)}`);
    } catch (err) {
      // Naming the real failure matters here: linking also grants school
      // membership and stamps schoolId on the profile, and if that half
      // fails the parent lands on a dashboard with no data. A bare
      // "please try again" gave them nothing to act on.
      setError(`We couldn't connect you: ${err instanceof Error ? err.message : "unknown error"}`);
      setLinking(false);
    }
  };

  if (preview) {
    return (
      <main className="nexus-atmosphere">
        <div className="screen-frame">
          <PageHeader title="Confirm your child" onBack={() => setPreview(null)} />

          <GlassSurface rounded="3xl" className="flex flex-col items-center gap-3 text-center">
            <Avatar name={preview.name} size="xl" />
            <div>
              <p className="text-lg font-semibold text-ink">{preview.name}</p>
              <p className="text-sm text-ink-muted">
                {preview.schoolName} · {preview.className}
              </p>
            </div>
          </GlassSurface>

          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Relationship</label>
            <div className="flex gap-2">
              {RELATIONSHIPS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRelationship(r)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    relationship === r ? "bg-action text-white" : "glass-surface text-ink-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-auto pb-10 pt-8">
            <Button onClick={handleConfirm} loading={linking}>
              Connect
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Parent Connect" subtitle="Scan QR or enter code given by your child" showBack={false} />

        <div className="flex flex-1 flex-col items-center justify-center">
          <QRScanner onResult={handleResult} manualPlaceholder="NXP-7F82K9" />
          {checking && <p className="mt-4 text-sm text-ink-muted">Checking code…</p>}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ConnectChildPage() {
  return (
    <AuthGuard allowRoles={["parent"]} requireOnboarded={false}>
      <ConnectChildContent />
    </AuthGuard>
  );
}

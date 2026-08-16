"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { clearSelectedChild } from "@/hooks/useSelectedChild";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthUser } from "@/hooks/useAuthUser";
import { LogOut, Bell, Lock, Palette, HelpCircle, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ProfileScreen({ extra }: { extra?: ReactNode }) {
  const { profile } = useAuthUser();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Order matters: clear device-local state BEFORE the auth listener
      // starts tearing screens down, so nothing re-persists it on the way
      // out and the next person to sign in on this device doesn't inherit
      // the previous parent's selected child.
      clearSelectedChild();
      if (auth) await signOut(auth);
      // Straight to role selection, not /onboarding: signing out is not
      // the same as being a first-time visitor, and the intro carousel is
      // pure friction for someone who just wants to switch accounts.
      // AuthGuard sends unauthenticated users to /role too, so whichever
      // of the two navigations lands first, the destination is the same.
      router.replace("/role");
    } catch (err) {
      // signOut() can reject (no network on token revocation). Previously
      // it was awaited unguarded, so a failure skipped the redirect and
      // left the button looking dead with the user still signed in.
      setSignOutError(err instanceof Error ? `Couldn't sign you out: ${err.message}` : "Couldn't sign you out.");
      setSigningOut(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile" showBack={false} />
      <div className="flex flex-col items-center py-4 text-center">
        <Avatar name={profile?.fullName ?? "You"} src={profile?.photoURL} size="xl" />
        <h2 className="mt-3 text-lg font-bold text-ink">{profile?.fullName}</h2>
        <p className="text-sm text-ink-muted">{profile?.email}</p>
      </div>

      {extra}

      <GlassSurface rounded="2xl" className="mt-6 flex flex-col divide-y divide-white/8" padded={false}>
        <SettingRow icon={Bell} label="Notifications" />
        <SettingRow icon={Lock} label="Privacy" />
        <SettingRow icon={Palette} label="Appearance" />
        <SettingRow icon={HelpCircle} label="Help" />
        <SettingRow icon={Info} label="About NEXUS" />
      </GlassSurface>

      <div className="mt-8">
        {signOutError && <p className="mb-2 text-center text-sm font-medium text-danger">{signOutError}</p>}
        <Button variant="ghost" onClick={handleSignOut} loading={signingOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </>
  );
}

function SettingRow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex items-center gap-3 px-4 py-3.5 text-left">
      <Icon className="h-4.5 w-4.5 text-ink-muted" />
      <span className="flex-1 text-sm font-medium text-ink">{label}</span>
    </button>
  );
}

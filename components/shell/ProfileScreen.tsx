"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
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

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
    router.replace("/onboarding");
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
        <Button variant="ghost" onClick={handleSignOut}>
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

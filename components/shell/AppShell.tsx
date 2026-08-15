import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import type { Role } from "@/types";

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame pb-28">{children}</div>
      <BottomNav role={role} />
    </main>
  );
}

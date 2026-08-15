"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { ConnectionSuccess } from "@/components/ui/ConnectionSuccess";

function ParentSuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name") ?? "your child";
  const className = params.get("className") ?? "";

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <ConnectionSuccess
          heading="You are now connected!"
          subheading={className ? `${name} · ${className}` : name}
          ctaLabel="Go to Dashboard"
          onContinue={() => router.replace("/parent")}
        />
      </div>
    </main>
  );
}

export default function ParentConnectSuccessPage() {
  return (
    <AuthGuard allowRoles={["parent"]}>
      <ParentSuccessContent />
    </AuthGuard>
  );
}

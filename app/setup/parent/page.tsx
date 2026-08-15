"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ParentSetupIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/setup/parent/profile");
  }, [router]);
  return null;
}

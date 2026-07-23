"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { homePath, useAuth } from "@/lib/auth";

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? homePath(user.role) : "/login");
  }, [ready, user, router]);

  return <div className="p-10 text-center text-sm text-neutral-400">Loading</div>;
}

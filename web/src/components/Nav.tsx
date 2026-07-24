"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { homePath, useAuth } from "@/lib/auth";

export default function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href={user ? homePath(user.role) : "/"} className="font-semibold">
          osmio
        </Link>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            {user.role === "student" && (
              <>
                <Link href="/assignments" className="text-neutral-600 hover:text-black">
                  Assignments
                </Link>
                <Link href="/attendance" className="text-neutral-600 hover:text-black">
                  Attendance
                </Link>
              </>
            )}
            <Link href="/calendar" className="text-neutral-600 hover:text-black">
              Calendar
            </Link>
            <span className="text-neutral-500">
              {user.full_name || user.email} ({user.role})
            </span>
            <button type="button" onClick={signOut} className="text-neutral-600 hover:text-black">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

"use client";

import { usePathname } from "next/navigation";

import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The themed dashboard and per-course pages ship their own header; the rest use the shared nav.
  const ownsHeader = pathname === "/teach" || /^\/teach\/courses\/[^/]+$/.test(pathname);
  return (
    <RequireRole role="instructor">
      {!ownsHeader && <Nav />}
      {children}
    </RequireRole>
  );
}

"use client";

import { usePathname } from "next/navigation";

import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Pages that ship their own full-width header (/learn, an assignment detail) skip the shared nav.
  const ownsHeader = pathname === "/learn" || /^\/assignments\/[^/]+$/.test(pathname);
  return (
    <RequireRole role="student">
      {!ownsHeader && <Nav />}
      {children}
    </RequireRole>
  );
}

"use client";

import { usePathname } from "next/navigation";

import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The student home (/learn) ships its own full-width header; other pages use the shared nav.
  return (
    <RequireRole role="student">
      {pathname !== "/learn" && <Nav />}
      {children}
    </RequireRole>
  );
}

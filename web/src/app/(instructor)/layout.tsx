import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="instructor">
      <Nav />
      {children}
    </RequireRole>
  );
}

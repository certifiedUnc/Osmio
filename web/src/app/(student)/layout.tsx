import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="student">
      <Nav />
      {children}
    </RequireRole>
  );
}

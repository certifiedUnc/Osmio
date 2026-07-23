import Nav from "@/components/Nav";
import { RequireRole } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <Nav />
      {children}
    </RequireRole>
  );
}

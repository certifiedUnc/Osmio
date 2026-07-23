"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getMe, login as apiLogin, register as apiRegister, type AuthResult, type Role, type User } from "./api";

const STORAGE_KEY = "osmio.auth";

export function homePath(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "instructor") return "/teach";
  return "/learn";
}

interface AuthState {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, fullName: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string; user: User };
        setToken(parsed.token);
        setUser(parsed.user);
        // Confirm the token is still valid; drop it if not.
        getMe(parsed.token)
          .then((u) => active && setUser(u))
          .catch(() => {
            if (active) {
              localStorage.removeItem(STORAGE_KEY);
              setToken(null);
              setUser(null);
            }
          })
          .finally(() => active && setReady(true));
        return;
      }
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((res: AuthResult) => {
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.access_token, user: res.user }));
    return res.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => persist(await apiLogin(email, password)),
    [persist],
  );
  const register = useCallback(
    async (email: string, password: string, fullName: string) =>
      persist(await apiRegister(email, password, fullName)),
    [persist],
  );
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Client-side guard for a role's pages. UX only; the API enforces real access.
export function RequireRole({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { user, token, ready } = useAuth();
  const router = useRouter();
  const roles = Array.isArray(role) ? role : [role];
  const allowed = user ? roles.includes(user.role) : false;

  useEffect(() => {
    if (!ready) return;
    if (!token || !user) {
      router.replace("/login");
    } else if (!roles.includes(user.role)) {
      router.replace(homePath(user.role));
    }
    // roles is derived from a stable prop; re-running on auth changes is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user, router]);

  if (!ready) return <div className="p-10 text-center text-sm text-neutral-400">Loading</div>;
  if (!token || !user || !allowed) return null;
  return <>{children}</>;
}

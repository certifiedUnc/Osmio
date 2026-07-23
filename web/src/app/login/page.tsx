"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { homePath, useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      router.replace(homePath(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col px-6 py-20">
      <h1 className="text-2xl font-semibold text-neutral-900">Sign in to osmio</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        {error && (
          <p role="alert" className="rounded bg-red-50 px-2 py-1 text-sm text-red-700">
            {error}
          </p>
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 rounded border border-neutral-200 p-3 text-xs text-neutral-500">
        <p className="font-medium text-neutral-600">Demo accounts (password: password)</p>
        <ul className="mt-1 space-y-0.5">
          <li>admin@osmio.dev</li>
          <li>instructor@osmio.dev</li>
          <li>student@osmio.dev</li>
        </ul>
      </div>
    </main>
  );
}

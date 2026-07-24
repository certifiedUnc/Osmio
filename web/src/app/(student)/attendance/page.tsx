"use client";

import { useEffect, useState } from "react";

import { ApiError, markAttendance } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function MarkAttendancePage() {
  const { token } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from ?code= when the student arrives by scanning the QR.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCode(c.toUpperCase());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await markAttendance(code.trim().toUpperCase(), token);
      setResult(r.lecture_title);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark attendance.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return null;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Mark attendance</h1>
      {result ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          You are marked present for <span className="font-medium">{result}</span>.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Marking" : "Mark present"}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      )}
    </main>
  );
}

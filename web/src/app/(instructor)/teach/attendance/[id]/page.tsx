"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useState } from "react";

import { getAttendanceRoster, type AttendanceRoster } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sessionId = Number(id);
  const { token } = useAuth();
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    getAttendanceRoster(sessionId, token)
      .then(setRoster)
      .catch(() => setError("Could not load attendance."));
  }, [token, sessionId]);

  // Poll so present students appear live.
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const code = roster?.code;
  useEffect(() => {
    if (!code) return;
    const url = `${window.location.origin}/attendance?code=${code}`;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => {});
  }, [code]);

  if (!token) return null;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-neutral-600">{error}</main>;
  if (!roster) return <main className="mx-auto max-w-3xl p-6 text-sm text-neutral-400">Loading</main>;

  const present = roster.students.filter((s) => s.present).length;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/teach" className="text-sm text-neutral-500 hover:text-neutral-800">
        &larr; Teaching
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Attendance</h1>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Students scan this, or enter the code</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Attendance QR code" width={240} height={240} className="mx-auto mt-3" />
          )}
          <p className="mt-3 font-mono text-3xl font-bold tracking-widest text-neutral-900">
            {roster.code}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Valid until {new Date(roster.expires_at).toLocaleTimeString()}
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Roster</h2>
            <span className="text-sm text-neutral-500">
              {present} / {roster.students.length} present
            </span>
          </div>
          <ul className="mt-2 divide-y divide-neutral-100">
            {roster.students.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-neutral-800">{s.full_name || s.email}</span>
                {s.present ? (
                  <span className="font-medium text-green-700">Present</span>
                ) : (
                  <span className="text-neutral-400">Absent</span>
                )}
              </li>
            ))}
            {roster.students.length === 0 && (
              <li className="py-2 text-sm text-neutral-400">No students enrolled.</li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}

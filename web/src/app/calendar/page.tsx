"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCalendar, type CalendarEvent } from "@/lib/api";
import { RequireRole, useAuth } from "@/lib/auth";
import Nav from "@/components/Nav";

const TYPE_STYLE: Record<CalendarEvent["type"], string> = {
  lecture: "bg-sky-100 text-sky-800",
  assignment: "bg-amber-100 text-amber-800",
  exam: "bg-red-100 text-red-800",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  return (
    <RequireRole role={["student", "instructor", "admin"]}>
      <Nav />
      <CalendarView />
    </RequireRole>
  );
}

function CalendarView() {
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (!token) return;
    getCalendar(token)
      .then(setEvents)
      .catch(() => setError("Could not load your calendar."));
  }, [token]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dateKey(new Date(e.at));
      const arr = m.get(k);
      if (arr) arr.push(e);
      else m.set(k, [e]);
    }
    return m;
  }, [events]);

  const days = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    start.setDate(1 - start.getDay()); // back up to the Sunday of the first week
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = dateKey(new Date());

  if (!token) return null;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50"
          >
            Prev
          </button>
          <span className="w-40 text-center text-sm font-medium text-neutral-800">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-sky-400" /> Lecture
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-amber-400" /> Assignment due
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-red-400" /> Exam
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-neutral-50 px-2 py-1 text-center text-xs font-medium text-neutral-500">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = dateKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayEvents = byDay.get(key) ?? [];
          return (
            <div key={key} className={`min-h-[96px] bg-white p-1 ${inMonth ? "" : "text-neutral-300"}`}>
              <div className={`px-1 text-xs ${key === todayKey ? "font-bold text-sky-700" : "text-neutral-400"}`}>
                {day.getDate()}
              </div>
              <div className="mt-1 space-y-1">
                {dayEvents.map((e) => {
                  const chip = (
                    <span
                      className={`block truncate rounded px-1 py-0.5 text-[11px] ${TYPE_STYLE[e.type]}`}
                      title={`${e.course_code}: ${e.title}`}
                    >
                      {timeLabel(e.at)} {e.title}
                    </span>
                  );
                  return e.link ? (
                    <Link key={`${e.type}-${e.id}`} href={e.link}>
                      {chip}
                    </Link>
                  ) : (
                    <div key={`${e.type}-${e.id}`}>{chip}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

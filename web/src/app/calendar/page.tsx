"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteAssignment,
  deleteExam,
  getCalendar,
  updateAssignment,
  updateExam,
  updateLecture,
  type CalendarEvent,
} from "@/lib/api";
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
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const { token, user } = useAuth();
  const canEdit = user?.role === "instructor" || user?.role === "admin";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setEvents(await getCalendar(token));
    } catch {
      setError("Could not load your calendar.");
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = dateKey(new Date());

  function pick(e: CalendarEvent) {
    setSelected(e);
    setEditWhen(toLocalInput(e.at));
    setEditError(null);
  }

  async function run(action: () => Promise<unknown>) {
    setEditError(null);
    try {
      await action();
      await refresh();
      setSelected(null);
    } catch {
      setEditError("That change could not be saved.");
    }
  }

  function reschedule() {
    if (!selected || !token || !editWhen) return;
    const iso = new Date(editWhen).toISOString();
    if (selected.type === "lecture") return run(() => updateLecture(selected.id, { scheduled_at: iso }, token));
    if (selected.type === "assignment") return run(() => updateAssignment(selected.id, { due_at: iso }, token));
    return run(() => updateExam(selected.id, { starts_at: iso }, token));
  }

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
        {canEdit && <span className="text-neutral-400">Click an event to reschedule, cancel, or delete.</span>}
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
                  const cancelled = e.type === "lecture" && e.cancelled;
                  const label = `${timeLabel(e.at)} ${e.title}${cancelled ? " (cancelled)" : ""}`;
                  const cls = `block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${TYPE_STYLE[e.type]} ${cancelled ? "line-through opacity-60" : ""}`;
                  const eventKey = `${e.type}-${e.id}`;
                  if (canEdit) {
                    return (
                      <button key={eventKey} type="button" onClick={() => pick(e)} className={cls} title={`${e.course_code}: ${e.title}`}>
                        {label}
                      </button>
                    );
                  }
                  return e.link ? (
                    <Link key={eventKey} href={e.link} className={cls} title={`${e.course_code}: ${e.title}`}>
                      {label}
                    </Link>
                  ) : (
                    <span key={eventKey} className={cls} title={`${e.course_code}: ${e.title}`}>
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && selected && (
        <div className="mt-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-neutral-900">
                {selected.course_code}: {selected.title}{" "}
                <span className="text-xs font-normal text-neutral-400">({selected.type})</span>
              </p>
              {selected.type === "lecture" && selected.link && (
                <Link href={selected.link} className="text-xs text-sky-700 hover:underline">
                  Open lecture
                </Link>
              )}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-sm text-neutral-500 hover:text-black">
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-neutral-500">
              Reschedule
              <input
                type="datetime-local"
                value={editWhen}
                onChange={(ev) => setEditWhen(ev.target.value)}
                className="ml-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={reschedule}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Save
            </button>

            {selected.type === "lecture" ? (
              <button
                type="button"
                onClick={() => run(() => updateLecture(selected.id, { cancelled: !selected.cancelled }, token))}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                {selected.cancelled ? "Un-cancel lecture" : "Cancel lecture"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    selected.type === "assignment"
                      ? deleteAssignment(selected.id, token)
                      : deleteExam(selected.id, token),
                  )
                }
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
          {editError && <p className="mt-2 text-xs text-red-700">{editError}</p>}
        </div>
      )}
    </main>
  );
}

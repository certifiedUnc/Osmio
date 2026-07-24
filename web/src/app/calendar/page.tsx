"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { homePath, RequireRole, useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const TEAL = "#0FB5A6";
const META = {
  lecture: { c: "#0FB5A6", bg: "#E4F4F1", name: "Lectures" },
  assignment: { c: "#F59E0B", bg: "#FDF0DD", name: "Assignments" },
  exam: { c: "#E11D48", bg: "#FCE4EA", name: "Exams" },
} as const;

const THEMES = {
  light: {
    "--bg": "#F5F7F8", "--surface": "#ffffff", "--surface2": "#F1F5F5", "--border": "#E7EBEF",
    "--border-soft": "#F0F3F4", "--text": "#0F172A", "--muted": "#64748B", "--faint": "#94A3B8",
    "--track": "#EEF2F1", "--nav-active": "#EEF2F1", "--header-bg": "rgba(255,255,255,.85)",
    "--teal-soft": "#E4F4F1", "--teal-text": "#0B8F84", "--grid-line": "#EEF1F3", "--cell-muted": "#FAFBFC",
  },
  dark: {
    "--bg": "#0b1522", "--surface": "#101f31", "--surface2": "#17293c", "--border": "#24384e",
    "--border-soft": "#1c2c40", "--text": "#F1F5F9", "--muted": "#94A3B8", "--faint": "#7089a3",
    "--track": "#17293c", "--nav-active": "#22374f", "--header-bg": "rgba(11,21,34,.85)",
    "--teal-soft": "rgba(15,181,166,.16)", "--teal-text": "#2ee6d6", "--grid-line": "#1b2b3f", "--cell-muted": "#0d1a2a",
  },
} as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ROW = 52;
const START_HOUR = 7;
const END_HOUR = 21;
const GRID_H = (END_HOUR - START_HOUR) * ROW;

type View = "day" | "week" | "month";

interface Ev {
  key: string;
  type: CalendarEvent["type"];
  id: number;
  title: string;
  start: Date;
  end: Date | null;
  courseCode: string;
  link: string | null;
  cancelled: boolean;
}

function fmtTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h < 12 ? "am" : "pm";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  return addDays(d, -d.getDay());
}
function pxAt(d: Date) {
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
  return Math.max(0, Math.min(GRID_H, (mins / 60) * ROW));
}
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CalendarPage() {
  return (
    <RequireRole role={["student", "instructor", "admin"]}>
      <CalendarView />
    </RequireRole>
  );
}

function CalendarView() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [raw, setRaw] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<Ev | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const load = useCallback(() => {
    if (token) getCalendar(token).then(setRaw).catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const events = useMemo<Ev[]>(
    () =>
      raw.map((e) => ({
        key: `${e.type}-${e.id}`,
        type: e.type,
        id: e.id,
        title: e.title,
        start: new Date(e.at),
        end: e.end ? new Date(e.end) : null,
        courseCode: e.course_code,
        link: e.link,
        cancelled: e.cancelled,
      })),
    [raw],
  );

  const canEdit = user?.role === "instructor" || user?.role === "admin";
  const eventsOn = useCallback(
    (day: Date) =>
      events
        .filter((e) => sameDay(e.start, day))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events],
  );

  const columns = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    return [];
  }, [view, anchor]);

  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const rangeLabel = useMemo(() => {
    if (view === "day") return `${FULL[anchor.getDay()]}, ${anchor.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
    if (view === "month") return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
  }, [view, anchor]);

  function shift(dir: number) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  }

  async function editAction(fn: () => Promise<unknown>) {
    if (!token) return;
    try {
      await fn();
      load();
      setSelected(null);
    } catch {
      /* leave modal open */
    }
  }

  if (!token || !user) return null;
  const c = THEMES[theme];
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const now = new Date();

  const navItems = [
    { label: "Courses", href: homePath(user.role), active: false },
    { label: "Calendar", href: "/calendar", active: true },
  ];

  return (
    <div className={instrument.className} style={{ ...(c as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 66, background: "var(--header-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 38 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: TEAL }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#062b28" /></svg>
            </span>
            <span className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px", color: "var(--text)" }}>osmio</span>
          </div>
          <nav style={{ display: "flex", gap: 6 }}>
            {navItems.map((n) => (
              <Link key={n.label} href={n.href} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, textDecoration: "none", fontWeight: n.active ? 600 : 500, color: n.active ? "var(--text)" : "var(--muted)", background: n.active ? "var(--nav-active)" : "transparent" }}>{n.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            {theme === "light" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px 5px 5px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", fontWeight: 600, fontSize: 13 }}>{initial}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{user.full_name || user.email}</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--teal-text)", background: "var(--teal-soft)", padding: "2px 8px", borderRadius: 6 }}>{user.role}</span>
          </div>
          <button type="button" onClick={() => { logout(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", border: "none", background: "transparent", cursor: "pointer" }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 40px 48px" }}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 22, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 className={grotesk.className} style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.5px", margin: 0, color: "var(--text)" }}>Calendar</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => setAnchor(new Date())} style={{ padding: "8px 14px", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>Today</button>
              <button type="button" onClick={() => shift(-1)} aria-label="Previous" style={{ width: 36, height: 36, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 9, cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              <button type="button" onClick={() => shift(1)} aria-label="Next" style={{ width: 36, height: 36, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 9, cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
            </div>
            <span className={grotesk.className} style={{ fontSize: 18, fontWeight: 500, color: "var(--text)" }}>{rangeLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {(Object.keys(META) as (keyof typeof META)[]).map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--muted)" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: META[k].c }} />
                  {META[k].name}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--track)", borderRadius: 10 }}>
              {(["day", "week", "month"] as View[]).map((v) => {
                const on = v === view;
                return (
                  <button key={v} type="button" onClick={() => setView(v)} style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 500, background: on ? "var(--surface)" : "transparent", color: on ? "var(--text)" : "var(--muted)", boxShadow: on ? "0 1px 2px rgba(16,24,40,.12)" : "none", textTransform: "capitalize" }}>{v}</button>
                );
              })}
            </div>
          </div>
        </div>

        {view === "month" ? (
          <MonthGrid cells={monthCells} anchor={anchor} today={now} eventsOn={eventsOn} onPick={setSelected} onOpenDay={(d) => { setAnchor(d); setView("day"); }} />
        ) : (
          <TimeGrid columns={columns} today={now} eventsOn={eventsOn} onPick={setSelected} />
        )}
      </main>

      {selected && (
        <EventModal ev={selected} canEdit={canEdit} onClose={() => setSelected(null)} onNavigate={(href) => router.push(href)} token={token} onEdit={editAction} />
      )}
    </div>
  );
}

function MonthGrid({ cells, anchor, today, eventsOn, onPick, onOpenDay }: {
  cells: Date[]; anchor: Date; today: Date; eventsOn: (d: Date) => Ev[]; onPick: (e: Ev) => void; onOpenDay: (d: Date) => void;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid var(--border)" }}>
        {DAYS.map((d) => <div key={d} style={{ textAlign: "center", padding: "12px 0", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--faint)" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const isToday = sameDay(day, today);
          const evs = eventsOn(day);
          return (
            <div key={i} style={{ minHeight: 112, padding: "8px 8px 6px", borderRight: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)", background: inMonth ? "var(--surface)" : "var(--cell-muted)" }}>
              <div className={grotesk.className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontSize: 14, fontWeight: isToday ? 700 : 500, background: isToday ? TEAL : "transparent", color: isToday ? "#fff" : inMonth ? "var(--text)" : "var(--faint)" }}>{day.getDate()}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}>
                {evs.slice(0, 3).map((e) => (
                  <div key={e.key} onClick={() => onPick(e)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>
                    <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 2, background: META[e.type].c }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", textDecoration: e.cancelled ? "line-through" : "none" }}>{fmtTime(e.start)} {e.title}</span>
                  </div>
                ))}
                {evs.length > 3 && <div onClick={() => onOpenDay(day)} style={{ fontSize: 11, color: "#0B8F84", fontWeight: 600, cursor: "pointer" }}>+{evs.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ columns, today, eventsOn, onPick }: {
  columns: Date[]; today: Date; eventsOn: (d: Date) => Ev[]; onPick: (e: Ev) => void;
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const colBg = `repeating-linear-gradient(to bottom,var(--surface),var(--surface) ${ROW - 1}px,var(--grid-line) ${ROW - 1}px,var(--grid-line) ${ROW}px)`;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      {/* day headers */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 64, flexShrink: 0 }} />
        {columns.map((day, i) => {
          const isToday = sameDay(day, today);
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "12px 4px", borderLeft: "1px solid var(--border-soft)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--faint)" }}>{DAYS[day.getDay()]}</div>
              <div className={grotesk.className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 30, height: 30, marginTop: 4, borderRadius: "50%", fontSize: 17, fontWeight: 600, background: isToday ? TEAL : "transparent", color: isToday ? "#fff" : "var(--text)" }}>{day.getDate()}</div>
            </div>
          );
        })}
      </div>
      {/* due band */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 64, flexShrink: 0, padding: "8px 8px 0", textAlign: "right", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--faint)" }}>Due</div>
        {columns.map((day, i) => {
          const due = eventsOn(day).filter((e) => e.type === "assignment");
          return (
            <div key={i} style={{ flex: 1, borderLeft: "1px solid var(--border-soft)", padding: "8px 6px", display: "flex", flexDirection: "column", gap: 5, minHeight: 38 }}>
              {due.map((e) => (
                <div key={e.key} onClick={() => onPick(e)} style={{ background: META[e.type].bg, color: META[e.type].c, fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title} · {fmtTime(e.start)}</div>
              ))}
            </div>
          );
        })}
      </div>
      {/* time body */}
      <div style={{ display: "flex", position: "relative" }}>
        <div style={{ width: 64, flexShrink: 0, position: "relative", height: GRID_H }}>
          {hours.map((h, i) => {
            const d = new Date();
            d.setHours(h, 0, 0, 0);
            return <div key={h} style={{ position: "absolute", top: i * ROW - 7, right: 8, fontSize: 11, color: "var(--faint)" }}>{fmtTime(d)}</div>;
          })}
        </div>
        {columns.map((day, i) => {
          const isToday = sameDay(day, today);
          const timed = eventsOn(day).filter((e) => e.end);
          const nowTop = pxAt(today);
          const showNow = isToday && today.getHours() >= START_HOUR && today.getHours() < END_HOUR;
          return (
            <div key={i} style={{ flex: 1, position: "relative", height: GRID_H, borderLeft: "1px solid var(--border-soft)", background: colBg }}>
              {showNow && <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: "#E11D48", zIndex: 3 }} />}
              {timed.map((e) => {
                const top = pxAt(e.start);
                const h = Math.max(pxAt(e.end!) - top - 3, 30);
                const tall = h >= 64;
                const m = META[e.type];
                return (
                  <div key={e.key} onClick={() => onPick(e)} style={{ position: "absolute", top: top + 1, left: 4, right: 4, height: h, cursor: "pointer", background: m.bg, borderLeft: `3px solid ${m.c}`, borderRadius: 7, padding: "5px 8px", overflow: "hidden" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: m.c }}>{tall ? `${fmtTime(e.start)} – ${fmtTime(e.end!)}` : fmtTime(e.start)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, color: "#0F172A", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: tall ? "normal" : "nowrap", textDecoration: e.cancelled ? "line-through" : "none" }}>{e.title}{e.cancelled ? " (cancelled)" : ""}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({ ev, canEdit, onClose, onNavigate, token, onEdit }: {
  ev: Ev; canEdit: boolean; onClose: () => void; onNavigate: (href: string) => void; token: string; onEdit: (fn: () => Promise<unknown>) => void;
}) {
  const m = META[ev.type];
  const typeName = ev.type === "lecture" ? "Lecture" : ev.type === "exam" ? "Exam" : "Assignment";
  const timeText = ev.end ? `${fmtTime(ev.start)} – ${fmtTime(ev.end)}` : `Due at ${fmtTime(ev.start)}`;
  const [when, setWhen] = useState(toLocalInput(ev.start));

  function reschedule() {
    const iso = new Date(when).toISOString();
    if (ev.type === "lecture") return onEdit(() => updateLecture(ev.id, { scheduled_at: iso }, token));
    if (ev.type === "assignment") return onEdit(() => updateAssignment(ev.id, { due_at: iso }, token));
    return onEdit(() => updateExam(ev.id, { starts_at: iso }, token));
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(6,12,20,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 30px 70px -20px rgba(0,0,0,.55)", overflow: "hidden" }}>
        <div style={{ padding: "26px 28px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ display: "inline-block", background: m.bg, color: m.c, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", padding: "4px 10px", borderRadius: 7 }}>{typeName}</span>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, border: "none", borderRadius: 8, background: "var(--surface2)", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
          </div>
          <div className={grotesk.className} style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.4px", lineHeight: 1.2, color: "var(--text)" }}>{ev.title}{ev.cancelled ? " (cancelled)" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, color: "var(--muted)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {ev.start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, color: "var(--muted)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {timeText}
            </div>
            {ev.courseCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, color: "var(--muted)" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                {ev.courseCode}
              </div>
            )}
          </div>

          {canEdit && (
            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", padding: "7px 9px", fontSize: 13 }} />
              <button type="button" onClick={reschedule} style={{ borderRadius: 8, border: "none", background: "var(--text)", color: "var(--surface)", padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
              {ev.type === "lecture" ? (
                <button type="button" onClick={() => onEdit(() => updateLecture(ev.id, { cancelled: !ev.cancelled }, token))} style={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>{ev.cancelled ? "Un-cancel" : "Cancel"}</button>
              ) : (
                <button type="button" onClick={() => onEdit(() => (ev.type === "assignment" ? deleteAssignment(ev.id, token) : deleteExam(ev.id, token)))} style={{ borderRadius: 8, border: "1px solid #fecaca", background: "var(--surface)", color: "#dc2626", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>Delete</button>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "18px 28px", borderTop: "1px solid var(--border-soft)", background: "var(--surface2)" }}>
          <button type="button" disabled={!ev.link} onClick={() => ev.link && onNavigate(ev.link)} style={{ flex: 1, padding: 11, border: "none", borderRadius: 10, background: ev.link ? m.c : "var(--border)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: ev.link ? "pointer" : "default", opacity: ev.link ? 1 : 0.6 }}>{ev.type === "lecture" ? "Open lecture" : "Open details"}</button>
          <button type="button" onClick={onClose} style={{ flexShrink: 0, padding: "11px 18px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", fontSize: 14, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

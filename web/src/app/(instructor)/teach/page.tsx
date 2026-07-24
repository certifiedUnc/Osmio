"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getCalendar,
  getCourseAssignments,
  getCourseStudents,
  getMyCourses,
  getSubmissions,
  type CalendarEvent,
  type Course,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const INDIGO = "#4F46E5";
const CARD_COLORS = ["#4F46E5", "#0FB5A6", "#E11D48", "#F59E0B", "#0EA5E9"];
const GRADS = [
  "linear-gradient(135deg,#4F46E5,#0d1a2b)", "linear-gradient(135deg,#0FB5A6,#0d1a2b)",
  "linear-gradient(135deg,#E11D48,#0d1a2b)", "linear-gradient(135deg,#F59E0B,#0d1a2b)",
];

const THEMES = {
  light: {
    "--bg": "#F5F7F8", "--surface": "#ffffff", "--surface2": "#F1F5F5", "--border": "#E7EBEF",
    "--border-soft": "#F0F3F4", "--text": "#0F172A", "--muted": "#64748B", "--faint": "#94A3B8",
    "--track": "#EEF2F1", "--nav-active": "#EEF2F1", "--header-bg": "rgba(255,255,255,.85)",
    "--indigo-soft": "#ECECFE", "--indigo-text": "#4F46E5", "--amber-soft": "#FDF0DD", "--amber-text": "#B45309",
  },
  dark: {
    "--bg": "#0b1522", "--surface": "#101f31", "--surface2": "#17293c", "--border": "#24384e",
    "--border-soft": "#1c2c40", "--text": "#F1F5F9", "--muted": "#94A3B8", "--faint": "#7089a3",
    "--track": "#17293c", "--nav-active": "#22374f", "--header-bg": "rgba(11,21,34,.85)",
    "--indigo-soft": "rgba(99,102,241,.18)", "--indigo-text": "#a5b0ff", "--amber-soft": "rgba(245,158,11,.16)", "--amber-text": "#f0b45f",
  },
} as const;

interface Aggregate {
  course: Course;
  studentCount: number;
  published: number;
  total: number;
  assignments: number;
  toGrade: number;
  ungraded: { studentName: string; assignmentId: number; assignmentTitle: string; code: string }[];
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function TeachDashboard() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [aggregates, setAggregates] = useState<Aggregate[] | null>(null);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      const cs = await getMyCourses(token).catch(() => [] as Course[]);
      const aggs = await Promise.all(
        cs.map(async (course) => {
          const [students, asgs] = await Promise.all([
            getCourseStudents(course.id, token).catch(() => []),
            getCourseAssignments(course.id, token).catch(() => []),
          ]);
          const subLists = await Promise.all(
            asgs.map((a) => getSubmissions(a.id, token).then((subs) => ({ a, subs })).catch(() => ({ a, subs: [] }))),
          );
          const ungraded: Aggregate["ungraded"] = [];
          for (const { a, subs } of subLists) {
            for (const s of subs) {
              if (s.score == null) ungraded.push({ studentName: s.student.full_name || s.student.email, assignmentId: a.id, assignmentTitle: a.title, code: course.code });
            }
          }
          return {
            course,
            studentCount: students.length,
            published: course.lectures.filter((l) => l.published).length,
            total: course.lectures.length,
            assignments: asgs.length,
            toGrade: ungraded.length,
            ungraded,
          };
        }),
      );
      if (alive) setAggregates(aggs);
    })();
    getCalendar(token).then((c) => { if (alive) setCalendar(c); }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  const totals = useMemo(() => {
    const a = aggregates ?? [];
    return {
      students: a.reduce((s, x) => s + x.studentCount, 0),
      courses: a.length,
      toGrade: a.reduce((s, x) => s + x.toGrade, 0),
      published: a.reduce((s, x) => s + x.published, 0),
      lectures: a.reduce((s, x) => s + x.total, 0),
    };
  }, [aggregates]);

  const needsGrading = useMemo(() => (aggregates ?? []).flatMap((a) => a.ungraded).slice(0, 6), [aggregates]);
  const todayEvents = useMemo(() => {
    const now = new Date();
    return calendar
      .filter((e) => sameDay(new Date(e.at), now) && !e.cancelled)
      .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  }, [calendar]);

  if (!token || !user) return null;
  const c = THEMES[theme];
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const now = new Date();
  const today = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const name = (user.full_name || "").split(" ").slice(-1)[0] || user.full_name || "there";

  const stats = [
    { label: "Total students", value: String(totals.students) },
    { label: "Active courses", value: String(totals.courses) },
    { label: "To grade", value: String(totals.toGrade), amber: true },
    { label: "Lectures published", value: `${totals.published} / ${totals.lectures}` },
  ];

  return (
    <div className={instrument.className} style={{ ...(c as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 66, background: "var(--header-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 38 }}>
          <Link href="/teach" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: INDIGO }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
            </span>
            <span className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px", color: "var(--text)" }}>osmio</span>
          </Link>
          <nav style={{ display: "flex", gap: 6 }}>
            <Link href="/teach" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "var(--text)", background: "var(--nav-active)" }}>Dashboard</Link>
            <Link href="/teach/manage" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>Manage</Link>
            <Link href="/calendar" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>Calendar</Link>
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
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#4F46E5,#0d1a2b)", color: "#fff", fontWeight: 600, fontSize: 13 }}>{initial}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{user.full_name || user.email}</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--indigo-text)", background: "var(--indigo-soft)", padding: "2px 8px", borderRadius: 6 }}>{user.role}</span>
          </div>
          <button type="button" onClick={() => { logout(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", border: "none", background: "transparent", cursor: "pointer" }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "36px 40px 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 4 }}>{today}</div>
            <h1 className={grotesk.className} style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.6px", margin: 0, color: "var(--text)" }}>{greeting(now.getHours())}, {name}</h1>
          </div>
          <Link href="/teach/manage" style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 20px", border: "none", borderRadius: 10, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 20px -8px rgba(79,70,229,.55)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Manage courses
          </Link>
        </div>

        {/* stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 30 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{s.label}</div>
              <span className={grotesk.className} style={{ fontSize: 26, fontWeight: 600, color: s.amber && s.value !== "0" ? "var(--amber-text)" : "var(--text)" }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, alignItems: "start" }}>
          {/* courses */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.4px", margin: 0, color: "var(--text)" }}>Your courses</h2>
              {aggregates && aggregates[0]?.course.term && <span style={{ fontSize: 13, color: "var(--faint)" }}>{aggregates[0].course.term}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!aggregates && <p style={{ fontSize: 14, color: "var(--faint)" }}>Loading</p>}
              {aggregates && aggregates.length === 0 && <p style={{ fontSize: 14, color: "var(--muted)" }}>You are not assigned to any courses.</p>}
              {aggregates?.map((a, i) => {
                const color = CARD_COLORS[i % CARD_COLORS.length];
                const pct = a.total ? Math.round((a.published / a.total) * 100) : 0;
                return (
                  <Link key={a.course.id} href={`/teach/courses/${a.course.id}`} style={{ display: "block", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", color: "var(--text)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                      <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
                        <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                        </span>
                        <div>
                          <div className={grotesk.className} style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.3px", color: "var(--text)" }}>{a.course.title}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", background: "var(--surface2)", padding: "3px 9px", borderRadius: 6 }}>{a.course.code}</span>
                            {a.course.term && <span style={{ fontSize: 13, color: "var(--faint)" }}>{a.course.term}</span>}
                          </div>
                        </div>
                      </div>
                      {a.toGrade > 0 && <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--amber-text)", background: "var(--amber-soft)", padding: "4px 11px", borderRadius: 999 }}>{a.toGrade} to grade</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--border-soft)" }}>
                      {[{ v: a.studentCount, l: "students" }, { v: a.total, l: "lectures" }, { v: a.assignments, l: "assignments" }].map((m) => (
                        <div key={m.l}>
                          <div className={grotesk.className} style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{m.v}</div>
                          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{m.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} /></div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>{a.published}/{a.total} published</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 22, position: "sticky", top: 90 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Needs grading</div>
                {totals.toGrade > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--amber-text)", background: "var(--amber-soft)", padding: "2px 9px", borderRadius: 999 }}>{totals.toGrade}</span>}
              </div>
              {needsGrading.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--faint)", margin: 0 }}>Nothing to grade right now.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {needsGrading.map((g, i) => (
                    <Link key={`${g.assignmentId}-${g.studentName}-${i}`} href={`/teach/assignments/${g.assignmentId}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 8px", margin: "0 -8px", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)", borderRadius: 10, color: "var(--text)" }}>
                      <span className={grotesk.className} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, background: GRADS[i % GRADS.length] }}>{initials(g.studentName)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.studentName}</div>
                        <div style={{ fontSize: 12, color: "var(--faint)" }}>{g.code} · {g.assignmentTitle}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
              <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>Today&apos;s schedule</div>
              {todayEvents.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--faint)", margin: 0 }}>Nothing scheduled today.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {todayEvents.map((e, i) => (
                    <div key={`${e.type}-${e.id}`} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}>
                      <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--indigo-text)", width: 52 }}>{new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: "var(--text)" }}>{e.title}</span>
                        <span style={{ fontSize: 12, color: "var(--faint)" }}>{e.course_code} · {e.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import {
  createThread,
  getAnnouncements,
  getCalendar,
  getCourseAssignments,
  getMyAssignments,
  getMyCourses,
  getThread,
  getThreads,
  postReply,
  type Announcement,
  type CalendarEvent,
  type Course,
  type DiscussionThread,
  type DiscussionThreadDetail,
  type LectureSummary,
  type StudentAssignment,
} from "@/lib/api";
import { homePath, RequireRole, useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const TEAL = "#0FB5A6";

const THEMES = {
  light: {
    "--bg": "#F5F7F8", "--surface": "#ffffff", "--surface2": "#F1F5F5", "--border": "#E7EBEF",
    "--border-soft": "#F0F3F4", "--text": "#0F172A", "--muted": "#64748B", "--faint": "#94A3B8",
    "--track": "#EEF2F1", "--nav-active": "#EEF2F1", "--header-bg": "rgba(255,255,255,.85)",
    "--teal-soft": "#E4F4F1", "--teal-text": "#0B8F84",
  },
  dark: {
    "--bg": "#0b1522", "--surface": "#101f31", "--surface2": "#17293c", "--border": "#24384e",
    "--border-soft": "#1c2c40", "--text": "#F1F5F9", "--muted": "#94A3B8", "--faint": "#7089a3",
    "--track": "#17293c", "--nav-active": "#22374f", "--header-bg": "rgba(11,21,34,.85)",
    "--teal-soft": "rgba(15,181,166,.16)", "--teal-text": "#2ee6d6",
  },
} as const;

type Tab = "content" | "announcements" | "assignments" | "discussion";
const PILL = {
  due: { color: "#B45309", bg: "#FDF0DD" },
  overdue: { color: "#E11D48", bg: "#FCE4EA" },
  submitted: { color: "#0B8F84", bg: "#E4F4F1" },
  graded: { color: "#475569", bg: "#EEF2F1" },
  open: { color: "#475569", bg: "#EEF2F1" },
} as const;

function fmtDur(seconds: number) {
  if (seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}
function fmtTotal(seconds: number) {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
function monDate(iso: string) {
  const d = new Date(iso);
  return { mon: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(), date: d.getDate() };
}
function dueLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole role={["student", "instructor", "admin"]}>
      <CourseView courseId={Number(id)} />
    </RequireRole>
  );
}

function CourseView({ courseId }: { courseId: number }) {
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<Tab>("content");
  const [course, setCourse] = useState<Course | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [done, setDone] = useState<number[]>([]);
  const [openWeeks, setOpenWeeks] = useState<number[]>([]);

  useEffect(() => {
    if (!token) return;
    getMyCourses(token)
      .then((cs) => setCourse(cs.find((c) => c.id === courseId) ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
    getAnnouncements(courseId, token).then(setAnnouncements).catch(() => {});
    getCalendar(token).then(setCalendar).catch(() => {});
  }, [token, courseId]);

  useEffect(() => {
    if (!token || !user) return;
    if (user.role === "student") {
      getMyAssignments(token).then((a) => setAssignments(a.filter((x) => x.course_id === courseId))).catch(() => {});
    } else {
      getCourseAssignments(courseId, token)
        .then((a) => setAssignments(a.map((x) => ({ ...x, submission: null }))))
        .catch(() => {});
    }
  }, [token, user, courseId]);

  useEffect(() => {
    try {
      const d = localStorage.getItem(`osmio.done.${courseId}`);
      if (d) setDone(JSON.parse(d));
    } catch {
      /* ignore */
    }
  }, [courseId]);

  const published = useMemo(() => (course?.lectures ?? []).filter((l) => l.published), [course]);
  const resume = useMemo(
    () => published.find((l) => !done.includes(l.id)) ?? published[published.length - 1] ?? null,
    [published, done],
  );

  // Group lectures into week sections; open the one holding the resume lecture by default.
  const sections = useMemo(() => {
    const byWeek = new Map<number, LectureSummary[]>();
    for (const l of course?.lectures ?? []) {
      const arr = byWeek.get(l.week) ?? [];
      arr.push(l);
      byWeek.set(l.week, arr);
    }
    return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items }));
  }, [course]);

  useEffect(() => {
    if (resume) setOpenWeeks([resume.week]);
  }, [resume]);

  function toggleWeek(week: number) {
    setOpenWeeks((w) => (w.includes(week) ? w.filter((x) => x !== week) : [...w, week]));
  }
  function toggleDone(id: number) {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    try {
      localStorage.setItem(`osmio.done.${courseId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const deadlines = useMemo(() => {
    const now = Date.now();
    return calendar
      .filter((e) => e.course_id === courseId && new Date(e.at).getTime() >= now && !e.cancelled)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, 5);
  }, [calendar, courseId]);

  const doneCount = published.filter((l) => done.includes(l.id)).length;
  const pct = published.length ? Math.round((doneCount / published.length) * 100) : 0;
  const totalSeconds = (course?.lectures ?? []).reduce((s, l) => s + l.duration_s, 0);

  if (!token || !user) return null;
  const c = THEMES[theme];
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const coursesHref = homePath(user.role);

  if (loaded && !course) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16 }}>This course is not available on your account.</p>
          <Link href={coursesHref} style={{ color: TEAL, fontWeight: 600 }}>Back to your courses</Link>
        </div>
      </div>
    );
  }
  if (!course) {
    return <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading course</div>;
  }

  const tabs: { k: Tab; label: string }[] = [
    { k: "content", label: "Content" },
    { k: "announcements", label: "Announcements" },
    { k: "assignments", label: "Assignments" },
    { k: "discussion", label: "Discussion" },
  ];
  const stats = [
    { value: String(sections.length), label: sections.length === 1 ? "section" : "sections" },
    { value: String(course.lectures.length), label: "lectures" },
    { value: fmtTotal(totalSeconds), label: "total" },
  ];

  return (
    <div className={instrument.className} style={{ ...(c as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 66, background: "var(--header-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 38 }}>
          <Link href={coursesHref} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: TEAL }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#062b28" /></svg>
            </span>
            <span className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px", color: "var(--text)" }}>osmio</span>
          </Link>
          <nav style={{ display: "flex", gap: 6 }}>
            <Link href={coursesHref} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>Courses</Link>
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
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", fontWeight: 600, fontSize: 13 }}>{initial}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{user.full_name || user.email}</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--teal-text)", background: "var(--teal-soft)", padding: "2px 8px", borderRadius: 6 }}>{user.role}</span>
          </div>
          <button type="button" onClick={() => { logout(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", border: "none", background: "transparent", cursor: "pointer" }}>Sign out</button>
        </div>
      </header>

      {/* hero */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 40px 26px" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <Link href={coursesHref} style={{ color: "var(--muted)", fontWeight: 500 }}>Home</Link>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{course.code}: {course.title}</span>
          </nav>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: TEAL, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#062b28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
              </span>
              <div>
                <h1 className={grotesk.className} style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.6px", margin: 0, color: "var(--text)" }}>{course.title}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", background: "var(--surface2)", padding: "3px 10px", borderRadius: 6 }}>{course.code}{course.term ? ` · ${course.term}` : ""}</span>
                  {course.instructor_name && <span style={{ fontSize: 14, color: "var(--faint)" }}>{course.instructor_name}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
              {resume ? (
                <Link href={`/lectures/${resume.id}`} style={{ padding: "12px 22px", borderRadius: 10, background: TEAL, color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 20px -8px rgba(15,181,166,.6)" }}>Resume · Week {resume.week}</Link>
              ) : (
                <span style={{ padding: "12px 22px", borderRadius: 10, background: "var(--surface2)", color: "var(--faint)", fontSize: 14, fontWeight: 600 }}>No lectures yet</span>
              )}
              <div style={{ display: "flex", gap: 22 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ textAlign: "right" }}>
                    <div className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: "var(--faint)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--track)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{pct}% complete</span>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 40px 48px" }}>
        <div style={{ borderBottom: "1px solid var(--border)", display: "flex", gap: 26, marginBottom: 26 }}>
          {tabs.map((t) => {
            const on = t.k === tab;
            return (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{ padding: "0 0 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: instrument.style.fontFamily, fontSize: 15, fontWeight: on ? 600 : 500, color: on ? "var(--text)" : "var(--muted)", borderBottom: on ? `2px solid ${TEAL}` : "2px solid transparent", marginBottom: -1 }}>{t.label}</button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
          <section style={{ minWidth: 0 }}>
            {tab === "content" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {sections.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No lectures in this course yet.</p>}
                {sections.map((sec) => {
                  const open = openWeeks.includes(sec.week);
                  const secDone = sec.items.filter((l) => done.includes(l.id)).length;
                  const secDur = sec.items.reduce((s, l) => s + l.duration_s, 0);
                  return (
                    <div key={sec.week} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                      <button type="button" onClick={() => toggleWeek(sec.week)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "18px 22px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Week {sec.week}</span>
                          <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{secDone}/{sec.items.length} lectures{secDur > 0 ? ` · ${fmtTotal(secDur)}` : ""}</span>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s ease", flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                      {open && (
                        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-soft)" }}>
                          {sec.items.map((l, i) => {
                            const isDone = done.includes(l.id);
                            const current = resume?.id === l.id;
                            const durLabel = l.published ? (fmtDur(l.duration_s) ? `Video · ${fmtDur(l.duration_s)}` : "Video") : "Not yet released";
                            const inner = (
                              <>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDone(l.id); }} aria-label="Toggle complete" style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: isDone ? TEAL : "transparent", border: isDone ? `1px solid ${TEAL}` : "1px solid var(--faint)" }}>
                                  {isDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                                </button>
                                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "var(--teal-soft)", color: "var(--teal-text)" }}>
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                                  <span style={{ fontSize: 14.5, fontWeight: current ? 600 : 500, lineHeight: 1.3, color: current ? "var(--teal-text)" : "var(--text)" }}>{l.title}</span>
                                  <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{durLabel}</span>
                                </div>
                                {current && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "var(--teal-text)", background: "var(--teal-soft)", padding: "3px 9px", borderRadius: 6 }}>Continue</span>}
                              </>
                            );
                            const rowStyle: React.CSSProperties = { display: "flex", gap: 13, alignItems: "center", padding: "13px 22px", color: "var(--text)", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)", background: current ? "var(--teal-soft)" : "transparent", textDecoration: "none" };
                            return l.published ? (
                              <Link key={l.id} href={`/lectures/${l.id}`} style={rowStyle}>{inner}</Link>
                            ) : (
                              <div key={l.id} style={{ ...rowStyle, cursor: "default" }}>{inner}</div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "announcements" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {announcements.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No announcements for this course.</p>}
                {announcements.map((a) => (
                  <div key={a.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{a.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 4 }}>{relTime(a.created_at)}</div>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--muted)", margin: "10px 0 0" }}>{a.body}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === "assignments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {assignments.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No assignments for this course.</p>}
                {assignments.map((a) => {
                  const sub = a.submission;
                  let status: keyof typeof PILL = "open";
                  let label = "Assignment";
                  if (user.role === "student") {
                    if (sub && sub.score != null) { status = "graded"; label = "Graded"; }
                    else if (sub) { status = "submitted"; label = "Submitted"; }
                    else if (new Date(a.due_at).getTime() < Date.now()) { status = "overdue"; label = "Overdue"; }
                    else { status = "due"; label = "Due soon"; }
                  }
                  const pill = PILL[status];
                  const scoreText = sub && sub.score != null ? ` · ${Math.round((sub.score / a.max_score) * 100)}%` : "";
                  const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", textDecoration: "none" };
                  const inner = (
                    <>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", color: pill.color, background: pill.bg, padding: "5px 10px", borderRadius: 7, minWidth: 86, textAlign: "center" }}>{label}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{a.title}</div>
                        <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 3 }}>Homework · {a.max_score} points{scoreText}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{dueLabel(a.due_at)}</span>
                    </>
                  );
                  // Students get the submission page; instructors/admins have no student-facing detail view.
                  return user.role === "student" ? (
                    <Link key={a.id} href={`/assignments/${a.id}`} style={rowStyle}>{inner}</Link>
                  ) : (
                    <div key={a.id} style={rowStyle}>{inner}</div>
                  );
                })}
              </div>
            )}

            {tab === "discussion" && <Discussion courseId={course.id} token={token} />}
          </section>

          {/* sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 22, position: "sticky", top: 90 }}>
            {course.instructor_name && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
                <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Instructor</div>
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <span className={grotesk.className} style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600 }}>{initials(course.instructor_name)}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{course.instructor_name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--faint)" }}>Course instructor</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
              <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Upcoming deadlines</div>
              {deadlines.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--faint)", margin: 0 }}>Nothing coming up.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {deadlines.map((d) => {
                    const { mon, date } = monDate(d.at);
                    return (
                      <div key={`${d.type}-${d.id}`} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: "1px solid var(--border-soft)" }}>
                        <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--faint)", letterSpacing: ".4px" }}>{mon}</div>
                          <div className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: "var(--text)" }}>{date}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: "var(--text)" }}>{d.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Discussion({ courseId, token }: { courseId: number; token: string }) {
  const [threads, setThreads] = useState<DiscussionThread[] | null>(null);
  const [open, setOpen] = useState<DiscussionThreadDetail | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadThreads = () => getThreads(courseId, token).then(setThreads).catch(() => setThreads([]));
  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, token]);

  async function submitThread() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createThread(courseId, { title: title.trim(), body: body.trim() }, token);
      setTitle("");
      setBody("");
      setComposing(false);
      setOpen(created);
      loadThreads();
    } finally {
      setBusy(false);
    }
  }

  async function submitReply() {
    if (!open || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await postReply(open.id, reply.trim(), token);
      setReply("");
      setOpen(updated);
      loadThreads();
    } finally {
      setBusy(false);
    }
  }

  const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };

  if (open) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button type="button" onClick={() => setOpen(null)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", cursor: "pointer", color: TEAL, fontWeight: 600, fontSize: 13, padding: 0 }}>&larr; All discussions</button>
        <div style={cardStyle}>
          <div className={grotesk.className} style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{open.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 4 }}>{open.author} · {relTime(open.created_at)}</div>
          {open.body && <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)", margin: "12px 0 0", whiteSpace: "pre-wrap" }}>{open.body}</p>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--faint)" }}>{open.replies.length} {open.replies.length === 1 ? "reply" : "replies"}</div>
        {open.replies.map((r) => (
          <div key={r.id} style={{ ...cardStyle, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={grotesk.className} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{initials(r.author)}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{r.author}</span>
              <span style={{ fontSize: 12, color: "var(--faint)" }}>{relTime(r.created_at)}</span>
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text)", margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.body}</p>
          </div>
        ))}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          <button type="button" onClick={submitReply} disabled={busy || !reply.trim()} style={{ alignSelf: "flex-start", padding: "9px 18px", border: "none", borderRadius: 9, background: TEAL, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: reply.trim() ? "pointer" : "default", opacity: reply.trim() ? 1 : 0.5 }}>Reply</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--faint)" }}>Course discussion</span>
        <button type="button" onClick={() => setComposing((v) => !v)} style={{ padding: "9px 16px", border: "none", borderRadius: 9, background: TEAL, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>{composing ? "Cancel" : "New thread"}</button>
      </div>
      {composing && (
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thread title" style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What would you like to discuss?" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
          <button type="button" onClick={submitThread} disabled={busy || !title.trim()} style={{ alignSelf: "flex-start", padding: "9px 18px", border: "none", borderRadius: 9, background: TEAL, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: title.trim() ? "pointer" : "default", opacity: title.trim() ? 1 : 0.5 }}>Post thread</button>
        </div>
      )}
      {!threads && <p style={{ fontSize: 14, color: "var(--faint)" }}>Loading</p>}
      {threads && threads.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No discussions yet. Start the first thread.</p>}
      {threads?.map((t) => (
        <button key={t.id} type="button" onClick={() => getThread(t.id, token).then(setOpen).catch(() => {})} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{t.title}</span>
            <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{t.author} · {relTime(t.created_at)}</span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>{t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}</span>
        </button>
      ))}
    </div>
  );
}

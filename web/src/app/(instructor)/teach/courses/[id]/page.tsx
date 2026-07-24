"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getCourseAssignments,
  getCourseStudents,
  getLecture,
  getMyCourses,
  getSubmissions,
  processLecture,
  type Assignment,
  type Course,
  type LectureSummary,
  type Submission,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const INDIGO = "#4F46E5";

const THEMES = {
  light: {
    "--bg": "#F5F7F8", "--surface": "#ffffff", "--surface2": "#F1F5F5", "--border": "#E7EBEF",
    "--border-soft": "#F0F3F4", "--text": "#0F172A", "--muted": "#64748B", "--faint": "#94A3B8",
    "--track": "#EEF2F1", "--nav-active": "#EEF2F1", "--header-bg": "rgba(255,255,255,.85)",
    "--teal-soft": "#E4F4F1", "--teal-text": "#0B8F84", "--indigo-soft": "#ECECFE", "--indigo-text": "#4F46E5",
    "--amber-soft": "#FDF0DD", "--amber-text": "#B45309",
  },
  dark: {
    "--bg": "#0b1522", "--surface": "#101f31", "--surface2": "#17293c", "--border": "#24384e",
    "--border-soft": "#1c2c40", "--text": "#F1F5F9", "--muted": "#94A3B8", "--faint": "#7089a3",
    "--track": "#17293c", "--nav-active": "#22374f", "--header-bg": "rgba(11,21,34,.85)",
    "--teal-soft": "rgba(15,181,166,.16)", "--teal-text": "#2ee6d6", "--indigo-soft": "rgba(99,102,241,.18)", "--indigo-text": "#a5b0ff",
    "--amber-soft": "rgba(245,158,11,.16)", "--amber-text": "#f0b45f",
  },
} as const;

type Tab = "content" | "students" | "grading";
const STATUS_LABEL: Record<string, string> = {
  uploaded: "Draft", normalizing: "Normalizing", transcribing: "Transcribing", review: "In review", published: "Published", failed: "Failed",
};
const GRADS = [
  "linear-gradient(135deg,#4F46E5,#0d1a2b)", "linear-gradient(135deg,#0FB5A6,#0d1a2b)",
  "linear-gradient(135deg,#E11D48,#0d1a2b)", "linear-gradient(135deg,#F59E0B,#0d1a2b)",
];

interface GradeRow {
  key: string;
  assignmentId: number;
  assignmentTitle: string;
  studentName: string;
  submittedAt: string;
  graded: boolean;
}

function fmtDur(seconds: number) {
  if (seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
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
function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function lecturePill(l: LectureSummary): { label: string; color: string; bg: string } {
  if (l.published) return { label: "Published", color: "var(--teal-text)", bg: "var(--teal-soft)" };
  if (l.status === "failed") return { label: "Failed", color: "#E11D48", bg: "#FCE4EA" };
  if (l.status === "uploaded") return { label: "Draft", color: "var(--faint)", bg: "var(--surface2)" };
  return { label: STATUS_LABEL[l.status] ?? l.status, color: "var(--amber-text)", bg: "var(--amber-soft)" };
}

export default function InstructorCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = Number(id);
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<Tab>("content");
  const [course, setCourse] = useState<Course | null>(null);
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grading, setGrading] = useState<GradeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    getMyCourses(token)
      .then((cs) => {
        const found = cs.find((c) => c.id === courseId) ?? null;
        setCourse(found);
        setLectures(found?.lectures ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    getCourseStudents(courseId, token).then(setStudents).catch(() => {});
  }, [token, courseId]);

  // Grading list: every submission across the course's assignments, ungraded first.
  useEffect(() => {
    if (!token) return;
    getCourseAssignments(courseId, token)
      .then(async (asgs) => {
        setAssignments(asgs);
        const per = await Promise.all(
          asgs.map((a) => getSubmissions(a.id, token).then((subs) => ({ a, subs })).catch(() => ({ a, subs: [] as Submission[] }))),
        );
        if (!mounted.current) return;
        const rows: GradeRow[] = [];
        for (const { a, subs } of per) {
          for (const s of subs) {
            rows.push({ key: `${a.id}-${s.id}`, assignmentId: a.id, assignmentTitle: a.title, studentName: s.student.full_name || s.student.email, submittedAt: s.submitted_at, graded: s.score != null });
          }
        }
        rows.sort((x, y) => Number(x.graded) - Number(y.graded) || new Date(x.submittedAt).getTime() - new Date(y.submittedAt).getTime());
        setGrading(rows);
      })
      .catch(() => {});
  }, [token, courseId]);

  const poll = useCallback((lectureId: number, tries = 0) => {
    setTimeout(async () => {
      if (!mounted.current) return;
      try {
        const l = await getLecture(lectureId);
        if (!mounted.current) return;
        setLectures((prev) => prev.map((x) => (x.id === lectureId ? { ...x, status: l.status, published: l.published } : x)));
        if (l.status !== "published" && l.status !== "failed" && tries < 10) poll(lectureId, tries + 1);
      } catch {
        /* stop */
      }
    }, 1500);
  }, []);

  async function process(lectureId: number) {
    if (!token) return;
    setLectures((prev) => prev.map((x) => (x.id === lectureId ? { ...x, status: "normalizing", published: false } : x)));
    try {
      await processLecture(lectureId, token);
      poll(lectureId);
    } catch {
      /* leave as is */
    }
  }

  const sections = useMemo(() => {
    const byWeek = new Map<number, LectureSummary[]>();
    for (const l of lectures) {
      const arr = byWeek.get(l.week) ?? [];
      arr.push(l);
      byWeek.set(l.week, arr);
    }
    return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items }));
  }, [lectures]);

  if (!token || !user) return null;
  const c = THEMES[theme];

  if (loaded && !course) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16 }}>This course is not on your account.</p>
          <Link href="/teach" style={{ color: INDIGO, fontWeight: 600 }}>Back to teaching</Link>
        </div>
      </div>
    );
  }
  if (!course) {
    return <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading course</div>;
  }

  const published = lectures.filter((l) => l.published).length;
  const toGrade = grading.filter((g) => !g.graded).length;
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const heroStats = [
    { label: "Enrolled students", value: String(students.length) },
    { label: "Lectures published", value: `${published} / ${lectures.length}` },
    { label: "Assignments", value: String(assignments.length) },
    { label: "To grade", value: String(toGrade) },
  ];
  const tabs: { k: Tab; label: string; badge?: number }[] = [
    { k: "content", label: "Content" },
    { k: "students", label: "Students" },
    { k: "grading", label: "Grading", badge: toGrade || undefined },
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
            <Link href="/teach" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "var(--text)", background: "var(--nav-active)" }}>Courses</Link>
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

      {/* hero */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 40px 24px" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 16, flexWrap: "wrap" }}>
            <Link href="/teach" style={{ color: "var(--muted)", fontWeight: 500 }}>My courses</Link>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{course.code}: {course.title}</span>
          </nav>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: INDIGO, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 className={grotesk.className} style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.6px", margin: 0, color: "var(--text)" }}>{course.title}</h1>
                  {published > 0 && <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--teal-text)", background: "var(--teal-soft)", padding: "4px 10px", borderRadius: 7 }}>Live</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", background: "var(--surface2)", padding: "3px 10px", borderRadius: 6 }}>{course.code}{course.term ? ` · ${course.term}` : ""}</span>
                </div>
              </div>
            </div>
            <Link href="/teach/manage" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", border: "none", borderRadius: 10, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 20px -8px rgba(79,70,229,.6)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Upload lecture
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 24 }}>
            {heroStats.map((s) => (
              <div key={s.label} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{s.label}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={grotesk.className} style={{ fontSize: 24, fontWeight: 600, color: "var(--text)" }}>{s.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "26px 40px 48px" }}>
        <div style={{ borderBottom: "1px solid var(--border)", display: "flex", gap: 26, marginBottom: 26 }}>
          {tabs.map((t) => {
            const on = t.k === tab;
            return (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{ display: "inline-flex", alignItems: "center", padding: "0 0 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: instrument.style.fontFamily, fontSize: 15, fontWeight: on ? 600 : 500, color: on ? "var(--text)" : "var(--muted)", borderBottom: on ? `2px solid ${INDIGO}` : "2px solid transparent", marginBottom: -1 }}>
                {t.label}
                {t.badge != null && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: on ? "#fff" : "var(--amber-text)", background: on ? INDIGO : "var(--amber-soft)", padding: "1px 7px", borderRadius: 999 }}>{t.badge}</span>}
              </button>
            );
          })}
        </div>

        {tab === "content" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sections.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No lectures yet. Upload one from your teaching dashboard.</p>}
            {sections.map((sec) => {
              const pub = sec.items.filter((l) => l.published).length;
              return (
                <div key={sec.week} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 22px", borderBottom: "1px solid var(--border-soft)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Week {sec.week}</span>
                      <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{pub}/{sec.items.length} published</span>
                    </div>
                    <Link href="/teach/manage" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                      Add lecture
                    </Link>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {sec.items.map((l, i) => {
                      const pill = lecturePill(l);
                      return (
                        <div key={l.id} style={{ display: "flex", gap: 13, alignItems: "center", padding: "13px 22px", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}>
                          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "var(--indigo-soft)", color: "var(--indigo-text)" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                            <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{fmtDur(l.duration_s) ? `Video · ${fmtDur(l.duration_s)}` : "Video"}</div>
                          </div>
                          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", color: pill.color, background: pill.bg, padding: "4px 10px", borderRadius: 7, minWidth: 82, textAlign: "center" }}>{pill.label}</span>
                          {l.published ? (
                            <Link href={`/lectures/${l.id}`} style={{ flexShrink: 0, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>View</Link>
                          ) : (
                            <button type="button" onClick={() => process(l.id)} disabled={l.status !== "uploaded" && l.status !== "failed"} style={{ flexShrink: 0, padding: "8px 14px", border: "none", borderRadius: 9, background: INDIGO, color: "#fff", fontSize: 13, fontWeight: 600, cursor: l.status === "uploaded" || l.status === "failed" ? "pointer" : "default", opacity: l.status === "uploaded" || l.status === "failed" ? 1 : 0.5 }}>{l.status === "uploaded" || l.status === "failed" ? "Process" : "Working"}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "students" && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, padding: "14px 22px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--faint)" }}>
              <span>Student</span><span style={{ textAlign: "right" }}>Email</span>
            </div>
            {students.length === 0 && <div style={{ padding: "18px 22px", fontSize: 14, color: "var(--faint)" }}>No students are enrolled yet.</div>}
            {students.map((s, i) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "center", padding: "14px 22px", borderTop: "1px solid var(--border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span className={grotesk.className} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, background: GRADS[i % GRADS.length] }}>{initials(s.full_name || s.email)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.full_name || "Student"}</span>
                </div>
                <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.email}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "grading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grading.length === 0 && <p style={{ fontSize: 14, color: "var(--faint)" }}>No submissions yet.</p>}
            {grading.map((g, i) => (
              <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "15px 20px" }}>
                <span className={grotesk.className} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, background: GRADS[i % GRADS.length] }}>{initials(g.studentName)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text)" }}>{g.studentName}</div>
                  <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{g.assignmentTitle} · submitted {relTime(g.submittedAt)}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", color: g.graded ? "var(--teal-text)" : "var(--amber-text)", background: g.graded ? "var(--teal-soft)" : "var(--amber-soft)", padding: "4px 10px", borderRadius: 7, minWidth: 82, textAlign: "center" }}>{g.graded ? "Graded" : "New"}</span>
                <Link href={`/teach/assignments/${g.assignmentId}`} style={{ flexShrink: 0, padding: "9px 16px", border: "none", borderRadius: 9, background: INDIGO, color: "#fff", fontSize: 13, fontWeight: 600 }}>{g.graded ? "Review" : "Grade"}</Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

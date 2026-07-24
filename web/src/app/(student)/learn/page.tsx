"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAnnouncements,
  getCalendar,
  getMyCourses,
  type Announcement,
  type CalendarEvent,
  type Course,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const TEAL = "#0FB5A6";
const PALETTE = ["#0FB5A6", "#F59E0B", "#7C6BF5", "#EC4899", "#3B82F6"];

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

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export default function LearnPage() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [annByCourse, setAnnByCourse] = useState<Record<number, Announcement[]>>({});
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyCourses(token)
      .then(async (cs) => {
        setCourses(cs);
        const entries = await Promise.all(
          cs.map((c) =>
            getAnnouncements(c.id, token)
              .then((a) => [c.id, a] as const)
              .catch(() => [c.id, [] as Announcement[]] as const),
          ),
        );
        setAnnByCourse(Object.fromEntries(entries));
      })
      .catch(() => setError("Could not load your courses."));
    getCalendar(token)
      .then(setCalendar)
      .catch(() => {});
  }, [token]);

  const colorFor = useCallback(
    (courseId: number) => {
      const i = courses?.findIndex((c) => c.id === courseId) ?? -1;
      return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
    },
    [courses],
  );

  const sidebarAnnouncements = useMemo(() => {
    if (!courses) return [];
    const codeById = Object.fromEntries(courses.map((c) => [c.id, c.code]));
    return Object.entries(annByCourse)
      .flatMap(([cid, list]) =>
        list.map((a) => ({ ...a, course: codeById[Number(cid)] ?? "", color: colorFor(Number(cid)) })),
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [annByCourse, courses, colorFor]);

  const deadlines = useMemo(() => {
    const now = Date.now();
    return calendar
      .filter((e) => (e.type === "assignment" || e.type === "exam") && new Date(e.at).getTime() >= now)
      .slice(0, 6)
      .map((e) => {
        const dt = new Date(e.at);
        return {
          key: `${e.type}-${e.id}`,
          mon: dt.toLocaleString(undefined, { month: "short" }),
          date: dt.getDate(),
          title: e.title,
          course: e.course_code,
          color: e.type === "exam" ? "#EF4444" : "#F59E0B",
        };
      });
  }, [calendar]);

  function signOut() {
    logout();
    router.replace("/login");
  }

  if (!token || !user) return null;

  const c = THEMES[theme];
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const navItems = [
    { label: "Courses", href: "/learn", active: true },
    { label: "Assignments", href: "/assignments", active: false },
    { label: "Calendar", href: "/calendar", active: false },
  ];

  return (
    <div className={instrument.className} style={{ ...(c as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 40px", height: 66,
          background: "var(--header-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 38 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: TEAL }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#062b28" /></svg>
            </span>
            <span className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px", color: "var(--text)" }}>osmio</span>
          </div>
          <nav style={{ display: "flex", gap: 6 }}>
            {navItems.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 14, textDecoration: "none",
                  fontWeight: n.active ? 600 : 500, color: n.active ? "var(--text)" : "var(--muted)",
                  background: n.active ? "var(--nav-active)" : "transparent",
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-label="Toggle theme"
            style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}
          >
            {theme === "light" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
          <button aria-label="Notifications" style={{ position: "relative", width: 38, height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", border: "1.5px solid var(--surface)" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px 5px 5px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", fontWeight: 600, fontSize: 13 }}>{initial}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{user.full_name || user.email}</span>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--teal-text)", background: "var(--teal-soft)", padding: "2px 8px", borderRadius: 6 }}>Student</span>
          </div>
          <button type="button" onClick={signOut} style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", border: "none", background: "transparent", cursor: "pointer" }}>Sign out</button>
        </div>
      </header>

      {/* body */}
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: 40, display: "grid", gridTemplateColumns: "1fr 340px", gap: 36, alignItems: "start" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 4 }}>Welcome back, {user.full_name || "there"}</div>
            <h1 className={grotesk.className} style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.6px", margin: 0, color: "var(--text)" }}>Your courses</h1>
          </div>

          {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
          {!courses && <p style={{ color: "var(--faint)", fontSize: 14 }}>Loading</p>}
          {courses && courses.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>You are not enrolled in any courses yet.</p>
          )}

          {courses?.map((course) => {
            const color = colorFor(course.id);
            const published = course.lectures.filter((l) => l.published);
            const anns = annByCourse[course.id] ?? [];
            const resume = published[published.length - 1];
            return (
              <article key={course.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px 26px", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: 4, background: color, marginTop: 5 }} />
                    <div>
                      <Link href={`/courses/${course.id}`} className={grotesk.className} style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.3px", color: "var(--text)", textDecoration: "none" }}>
                        {course.code}: {course.title}
                      </Link>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                        {course.term && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", background: "var(--surface2)", padding: "3px 9px", borderRadius: 6 }}>{course.term}</span>}
                      </div>
                    </div>
                  </div>
                  {anns.length > 0 && (
                    <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--teal-text)", background: "var(--teal-soft)", padding: "4px 10px", borderRadius: 999 }}>{anns.length} new</span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--faint)", marginBottom: 12 }}>Lectures</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {published.length === 0 && <span style={{ fontSize: 14, color: "var(--faint)" }}>No published lectures yet.</span>}
                      {published.slice(0, 3).map((lec) => (
                        <Link key={lec.id} href={`/lectures/${lec.id}`} style={{ display: "flex", alignItems: "center", gap: 11, color: "var(--text)", textDecoration: "none" }}>
                          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: "var(--teal-soft)", color: "var(--teal-text)" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>Week {lec.week}: {lec.title}</span>
                            <span style={{ fontSize: 12, color: "var(--faint)" }}>{lec.duration_s > 0 ? `${Math.round(lec.duration_s / 60)} min` : "Lecture"}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--faint)", marginBottom: 12 }}>Announcements</div>
                    {anns.length === 0 ? (
                      <div style={{ fontSize: 14, color: "var(--faint)", padding: "6px 0" }}>No new announcements.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {anns.slice(0, 2).map((an) => (
                          <div key={an.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: "var(--text)" }}>{an.title}</span>
                            <span style={{ fontSize: 12, color: "var(--faint)" }}>{relTime(an.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--border-soft)" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{published.length} {published.length === 1 ? "lecture" : "lectures"} available</span>
                  {resume ? (
                    <Link href={`/lectures/${resume.id}`} style={{ flexShrink: 0, padding: "10px 20px", borderRadius: 9, background: TEAL, color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Resume</Link>
                  ) : (
                    <span style={{ flexShrink: 0, padding: "10px 20px", borderRadius: 9, background: "var(--surface2)", color: "var(--faint)", fontSize: 14, fontWeight: 600 }}>Resume</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {/* sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 24, position: "sticky", top: 98 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Announcements</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {sidebarAnnouncements.length === 0 && <span style={{ fontSize: 14, color: "var(--faint)", padding: "8px 0" }}>Nothing yet.</span>}
              {sidebarAnnouncements.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderTop: "1px solid var(--border-soft)" }}>
                  <span style={{ flexShrink: 0, width: 9, height: 9, borderRadius: 3, background: a.color, marginTop: 5 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: "var(--text)" }}>{a.title}</span>
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>{a.course} · {relTime(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>Upcoming deadlines</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {deadlines.length === 0 && <span style={{ fontSize: 14, color: "var(--faint)", padding: "8px 0" }}>Nothing due soon.</span>}
              {deadlines.map((d) => (
                <div key={d.key} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: "1px solid var(--border-soft)" }}>
                  <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--faint)", letterSpacing: ".4px" }}>{d.mon}</div>
                    <div className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: "var(--text)" }}>{d.date}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: "var(--text)" }}>{d.title}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--faint)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: d.color }} />
                      {d.course}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

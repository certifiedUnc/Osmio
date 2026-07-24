"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import CloudflarePlayer from "@/components/CloudflarePlayer";
import MockPlayer from "@/components/MockPlayer";
import type { PlayerHandle } from "@/components/playerTypes";
import {
  ApiError,
  askQuestion,
  formatTimestamp,
  getAnnouncements,
  getCourses,
  getLecture,
  getQuestions,
  transcriptUrl,
  type Announcement,
  type Course,
  type LectureDetail,
  type Question,
} from "@/lib/api";
import { homePath, useAuth } from "@/lib/auth";
import { findActiveIndex } from "@/lib/transcript";

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

type Tab = "overview" | "transcript" | "qa" | "notes" | "announcements";
interface Note {
  id: number;
  ms: number;
  text: string;
}

function fmtDur(seconds: number) {
  if (seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}
function relTime(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lectureId = Number(id);
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<Tab>("overview");
  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [done, setDone] = useState<number[]>([]);

  const playerRef = useRef<PlayerHandle | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const seek = useCallback((ms: number) => playerRef.current?.seek(ms), []);
  const onTimeUpdateMs = useCallback((ms: number) => setCurrentTimeMs(ms), []);

  // Lecture + questions are public; anyone with the link can watch.
  useEffect(() => {
    if (!Number.isInteger(lectureId)) {
      setError("Lecture not found.");
      return;
    }
    getLecture(lectureId)
      .then(setLecture)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? "Lecture not found."
            : "Could not load this lecture. Is the API running?",
        ),
      );
    getQuestions(lectureId).then(setQuestions).catch(() => {});
    getCourses()
      .then((courses) => setCourse(courses.find((c) => c.lectures.some((l) => l.id === lectureId)) ?? null))
      .catch(() => {});
  }, [lectureId]);

  // Announcements live behind auth and need the course id.
  useEffect(() => {
    if (course && token) getAnnouncements(course.id, token).then(setAnnouncements).catch(() => {});
  }, [course, token]);

  // Notes and completion are kept on the device; there is no backend table for them yet.
  useEffect(() => {
    try {
      const n = localStorage.getItem(`osmio.notes.${lectureId}`);
      if (n) setNotes(JSON.parse(n));
    } catch {
      /* ignore malformed storage */
    }
  }, [lectureId]);
  useEffect(() => {
    if (!course) return;
    try {
      const d = localStorage.getItem(`osmio.done.${course.id}`);
      if (d) setDone(JSON.parse(d));
    } catch {
      /* ignore */
    }
  }, [course]);

  function saveNotes(next: Note[]) {
    setNotes(next);
    try {
      localStorage.setItem(`osmio.notes.${lectureId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function toggleDone(id: number) {
    if (!course) return;
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    try {
      localStorage.setItem(`osmio.done.${course.id}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const c = THEMES[theme];

  if (error) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16 }}>{error}</p>
          <Link href="/" style={{ color: TEAL, fontWeight: 600 }}>Back to lectures</Link>
        </div>
      </div>
    );
  }
  if (!lecture) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
        Loading lecture
      </div>
    );
  }

  const initial = (user?.full_name || user?.email || "?").charAt(0).toUpperCase();
  const coursesHref = user ? homePath(user.role) : "/";
  const tabs: { k: Tab; label: string }[] = [
    { k: "overview", label: "Overview" },
    { k: "transcript", label: "Transcript" },
    { k: "qa", label: "Q&A" },
    { k: "notes", label: "Notes" },
    { k: "announcements", label: "Announcements" },
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
            {user && <Link href="/calendar" style={{ padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>Calendar</Link>}
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
          {user ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px 5px 5px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0FB5A6,#0d1a2b)", color: "#fff", fontWeight: 600, fontSize: 13 }}>{initial}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{user.full_name || user.email}</span>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--teal-text)", background: "var(--teal-soft)", padding: "2px 8px", borderRadius: 6 }}>{user.role}</span>
              </div>
              <button type="button" onClick={() => { logout(); router.replace("/login"); }} style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", border: "none", background: "transparent", cursor: "pointer" }}>Sign out</button>
            </>
          ) : (
            <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: "var(--teal-text)" }}>Sign in</Link>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 40px 48px" }}>
        {/* breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 22, flexWrap: "wrap" }}>
          <Link href={coursesHref} style={{ color: "var(--muted)", fontWeight: 500 }}>Home</Link>
          {course && (
            <>
              <Chevron />
              <Link href={`/courses/${course.id}`} style={{ color: "var(--muted)", fontWeight: 500 }}>{course.code}: {course.title}</Link>
            </>
          )}
          <Chevron />
          <span style={{ color: "var(--text)", fontWeight: 600 }}>Week {lecture.week} · {lecture.title}</span>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: course && course.lectures.length > 0 ? "1fr 360px" : "1fr", gap: 32, alignItems: "start" }}>
          {/* left */}
          <section style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            {/* player */}
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#0a1422", boxShadow: "0 12px 30px -12px rgba(0,0,0,.4)" }}>
              {(course?.code || lecture.week) && (
                <div style={{ position: "absolute", left: 18, top: 16, zIndex: 2, padding: "5px 11px", borderRadius: 7, background: "rgba(0,0,0,.45)", color: "#cfe6e2", fontFamily: grotesk.style.fontFamily, fontSize: 12, fontWeight: 500, letterSpacing: ".3px", pointerEvents: "none" }}>
                  {course?.code ? `${course.code} · ` : ""}WEEK {lecture.week}
                </div>
              )}
              {lecture.stream_uid ? (
                <CloudflarePlayer src={lecture.stream_uid} onTimeUpdateMs={onTimeUpdateMs} handleRef={playerRef} />
              ) : (
                <MockPlayer durationMs={lecture.duration_s * 1000} onTimeUpdateMs={onTimeUpdateMs} handleRef={playerRef} />
              )}
            </div>

            <div>
              <h1 className={grotesk.className} style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.5px", margin: 0, color: "var(--text)" }}>{lecture.title}</h1>
              <div style={{ fontSize: 14, color: "var(--faint)", marginTop: 6 }}>
                {[course ? `${course.code}: ${course.title}` : null, `Week ${lecture.week}`, fmtDur(lecture.duration_s)].filter(Boolean).join(" · ")}
              </div>
            </div>

            {/* tabs */}
            <div style={{ borderBottom: "1px solid var(--border)", display: "flex", gap: 26, flexWrap: "wrap" }}>
              {tabs.map((t) => {
                const on = t.k === tab;
                return (
                  <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{ padding: "0 0 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: instrument.style.fontFamily, fontSize: 15, fontWeight: on ? 600 : 500, color: on ? "var(--text)" : "var(--muted)", borderBottom: on ? `2px solid ${TEAL}` : "2px solid transparent", marginBottom: -1 }}>{t.label}</button>
                );
              })}
            </div>

            {tab === "overview" && <Overview lecture={lecture} />}
            {tab === "transcript" && <Transcript lecture={lecture} currentTimeMs={currentTimeMs} onSeek={seek} />}
            {tab === "qa" && <Qa lectureId={lecture.id} questions={questions} setQuestions={setQuestions} currentTimeMs={currentTimeMs} onSeek={seek} />}
            {tab === "notes" && <Notes notes={notes} save={saveNotes} currentTimeMs={currentTimeMs} onSeek={seek} />}
            {tab === "announcements" && <Announcements items={announcements} loggedIn={!!user} code={course?.code} />}
          </section>

          {/* right: course content */}
          {course && course.lectures.length > 0 && (
            <aside style={{ position: "sticky", top: 90, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
                <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Course content</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((done.length / course.lectures.length) * 100)}%`, height: "100%", background: TEAL, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{Math.round((done.length / course.lectures.length) * 100)}%</span>
                </div>
              </div>
              <div style={{ maxHeight: 620, overflowY: "auto", padding: "6px 0" }}>
                {course.lectures.map((l) => {
                  const isDone = done.includes(l.id);
                  const current = l.id === lecture.id;
                  return (
                    <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 20px", background: current ? "var(--teal-soft)" : "transparent", borderLeft: current ? `3px solid ${TEAL}` : "3px solid transparent" }}>
                      <button type="button" onClick={() => toggleDone(l.id)} aria-label="Toggle complete" style={{ flexShrink: 0, marginTop: 1, width: 19, height: 19, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: isDone ? TEAL : "transparent", border: isDone ? `1px solid ${TEAL}` : "1px solid var(--faint)" }}>
                        {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      </button>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <Link href={`/lectures/${l.id}`} style={{ fontSize: 13.5, fontWeight: current ? 600 : 500, lineHeight: 1.35, color: current ? "var(--teal-text)" : "var(--text)" }}>{l.title}</Link>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--faint)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          {fmtDur(l.duration_s) ?? "Week " + l.week}
                          {current && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--teal-text)", background: "var(--teal-soft)", padding: "1px 7px", borderRadius: 5 }}>Now playing</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function Chevron() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
}

function Overview({ lecture }: { lecture: LectureDetail }) {
  const hasTranscript = lecture.segments.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text)", margin: 0, maxWidth: "60ch" }}>
        Watch the recording and follow along with the synced transcript. Jump to any moment from the transcript or the questions, add private notes at a timestamp, and post a question tied to the exact point you have in mind.
      </p>
      {hasTranscript && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--faint)", marginBottom: 12 }}>Resources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {([["txt", "Transcript", "Plain text · .txt"], ["pdf", "Transcript", "Formatted · .pdf"]] as const).map(([fmt, name, meta]) => (
              <a key={fmt} href={transcriptUrl(lecture.id, fmt)} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface)", color: "var(--text)" }}>
                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "var(--teal-soft)", color: "var(--teal-text)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{name} ({fmt.toUpperCase()})</span>
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>{meta}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Transcript({ lecture, currentTimeMs, onSeek }: { lecture: LectureDetail; currentTimeMs: number; onSeek: (ms: number) => void }) {
  const activeIndex = useMemo(() => findActiveIndex(lecture.segments, currentTimeMs), [lecture.segments, currentTimeMs]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !el) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < cr.top + 24 || er.bottom > cr.bottom - 24) {
      container.scrollTo({ top: container.scrollTop + (er.top - cr.top) - cr.height / 2 + er.height / 2, behavior: "smooth" });
    }
  }, [activeIndex]);

  if (lecture.segments.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--faint)" }}>No transcript is available for this lecture yet.</p>;
  }
  return (
    <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 520, overflowY: "auto" }}>
      {lecture.segments.map((seg, i) => {
        const on = i === activeIndex;
        return (
          <button key={seg.start_ms} type="button" data-active={on || undefined} onClick={() => onSeek(seg.start_ms)} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "11px 14px", border: "none", cursor: "pointer", borderRadius: 10, textAlign: "left", background: on ? "var(--teal-soft)" : "transparent", color: on ? "var(--text)" : "var(--muted)", fontFamily: "inherit" }}>
            <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, paddingTop: 1, color: on ? "var(--teal-text)" : "var(--faint)" }}>{formatTimestamp(seg.start_ms)}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.5 }}>{seg.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function Qa({ lectureId, questions, setQuestions, currentTimeMs, onSeek }: {
  lectureId: number; questions: Question[]; setQuestions: React.Dispatch<React.SetStateAction<Question[]>>; currentTimeMs: number; onSeek: (ms: number) => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const insertSorted = (list: Question[], q: Question) => [...list, q].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  async function post() {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    const ms = currentTimeMs;
    const tempId = -Date.now();
    const optimistic: Question = { id: tempId, timestamp_ms: ms, author: "You", body: trimmed, created_at: new Date().toISOString() };
    setQuestions((prev) => insertSorted(prev, optimistic));
    setBody("");
    setErr(null);
    setSubmitting(true);
    try {
      const saved = await askQuestion(lectureId, { timestamp_ms: ms, body: trimmed });
      setQuestions((prev) => insertSorted(prev.filter((q) => q.id !== tempId), saved));
    } catch (e) {
      setQuestions((prev) => prev.filter((q) => q.id !== tempId));
      setBody((cur) => (cur.length === 0 ? trimmed : cur));
      setErr(e instanceof ApiError ? e.message : "Could not post your question.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} placeholder="Ask a question about this lecture" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 14.5, color: "var(--text)" }} />
        <button type="button" onClick={post} disabled={submitting || !body.trim()} style={{ padding: "8px 16px", border: "none", borderRadius: 9, background: TEAL, color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: submitting || !body.trim() ? 0.5 : 1 }}>{submitting ? "Posting" : `Ask at ${formatTimestamp(currentTimeMs)}`}</button>
      </div>
      {err && <p style={{ margin: 0, fontSize: 12.5, color: "#dc2626" }}>{err}</p>}
      {questions.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--faint)" }}>No questions yet. Ask about this moment in the lecture.</p>
      ) : (
        questions.map((q) => (
          <div key={q.id} style={{ display: "flex", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <button type="button" onClick={() => onSeek(q.timestamp_ms)} title="Jump to this moment" className={grotesk.className} style={{ flexShrink: 0, alignSelf: "flex-start", fontSize: 13, fontWeight: 600, color: "var(--teal-text)", background: "var(--teal-soft)", padding: "4px 9px", borderRadius: 7, border: "none", cursor: "pointer" }}>{formatTimestamp(q.timestamp_ms)}</button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{q.body}</span>
              <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{q.author} · {relTime(q.created_at)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Notes({ notes, save, currentTimeMs, onSeek }: { notes: Note[]; save: (n: Note[]) => void; currentTimeMs: number; onSeek: (ms: number) => void }) {
  const [text, setText] = useState("");
  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    save([...notes, { id: Date.now(), ms: currentTimeMs, text: trimmed }].sort((a, b) => a.ms - b.ms));
    setText("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
        <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--teal-text)", background: "var(--teal-soft)", padding: "5px 9px", borderRadius: 7 }}>{formatTimestamp(currentTimeMs)}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a note at the current timestamp" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 14.5, color: "var(--text)" }} />
        <button type="button" onClick={add} disabled={!text.trim()} style={{ padding: "8px 14px", border: "none", borderRadius: 9, background: "var(--text)", color: "var(--surface)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: text.trim() ? 1 : 0.5 }}>Add</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--faint)" }}>Your notes stay on this device. Add one at the moment that matters.</p>
      ) : (
        notes.map((n) => (
          <div key={n.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <button type="button" onClick={() => onSeek(n.ms)} className={grotesk.className} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--teal-text)", background: "transparent", border: "none", cursor: "pointer", paddingTop: 1 }}>{formatTimestamp(n.ms)}</button>
            <span style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: "var(--text)" }}>{n.text}</span>
            <button type="button" onClick={() => save(notes.filter((x) => x.id !== n.id))} aria-label="Delete note" style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", color: "var(--faint)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function Announcements({ items, loggedIn, code }: { items: Announcement[]; loggedIn: boolean; code?: string }) {
  if (!loggedIn) return <p style={{ fontSize: 14, color: "var(--faint)" }}>Sign in to see course announcements.</p>;
  if (items.length === 0) return <p style={{ fontSize: 14, color: "var(--faint)" }}>No announcements for this course.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((a) => (
        <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "15px 0", borderTop: "1px solid var(--border-soft)" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{a.title}</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>{a.body}</span>
          <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{code ? `${code} · ` : ""}{relTime(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

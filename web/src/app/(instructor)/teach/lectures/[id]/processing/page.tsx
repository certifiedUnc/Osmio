"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  getLecture,
  getMyCourses,
  processLecture,
  type Course,
  type LectureDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const INDIGO = "#4F46E5";
const TEAL = "#0FB5A6";

const THEMES = {
  light: {
    "--bg": "#F5F7F8", "--surface": "#ffffff", "--surface2": "#F1F5F5", "--border": "#E7EBEF",
    "--border-soft": "#F0F3F4", "--text": "#0F172A", "--muted": "#64748B", "--faint": "#94A3B8",
    "--track": "#EEF2F1", "--nav-active": "#EEF2F1", "--header-bg": "rgba(255,255,255,.85)",
    "--indigo-soft": "#ECECFE", "--indigo-text": "#4F46E5", "--teal-text": "#0B8F84",
  },
  dark: {
    "--bg": "#0b1522", "--surface": "#101f31", "--surface2": "#17293c", "--border": "#24384e",
    "--border-soft": "#1c2c40", "--text": "#F1F5F9", "--muted": "#94A3B8", "--faint": "#7089a3",
    "--track": "#17293c", "--nav-active": "#22374f", "--header-bg": "rgba(11,21,34,.85)",
    "--indigo-soft": "rgba(99,102,241,.18)", "--indigo-text": "#a5b0ff", "--teal-text": "#2ee6d6",
  },
} as const;

// The pipeline moves a lecture through these states; "published" is the finished line.
const STAGES = ["uploaded", "normalizing", "transcribing", "review", "published"] as const;
const STEP_TITLES = ["Recording received", "Normalizing audio", "Generating transcript", "Finalizing and review", "Published to students"];
const STAGE_PCT = [8, 35, 65, 88, 100];
const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded", normalizing: "Normalizing audio", transcribing: "Transcribing", review: "In review", published: "Published", failed: "Failed",
};
const ACTIVE = new Set(["normalizing", "transcribing", "review"]);

function fmtDur(seconds: number) {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lectureId = Number(id);
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const poll = useCallback((tries = 0) => {
    setTimeout(async () => {
      if (!mounted.current || !token) return;
      try {
        const l = await getLecture(lectureId, token);
        if (!mounted.current) return;
        setLecture(l);
        if (ACTIVE.has(l.status) && tries < 20) poll(tries + 1);
      } catch {
        /* stop polling */
      }
    }, 1500);
  }, [lectureId, token]);

  useEffect(() => {
    if (!token || !Number.isInteger(lectureId)) return;
    getLecture(lectureId, token)
      .then((l) => {
        setLecture(l);
        if (ACTIVE.has(l.status)) poll();
      })
      .catch(() => setError("Could not load this lecture."))
      .finally(() => setLoaded(true));
    getMyCourses(token).then((cs) => setCourse(cs.find((c) => c.lectures.some((x) => x.id === lectureId)) ?? null)).catch(() => {});
  }, [token, lectureId, poll]);

  async function start() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const l = await processLecture(lectureId, token);
      setLecture((prev) => (prev ? { ...prev, status: l.status, published: l.published } : prev));
      poll();
    } catch {
      setError("Could not start processing. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) return null;
  const c = THEMES[theme];
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();

  if (loaded && !lecture) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16 }}>{error ?? "Lecture not found."}</p>
          <Link href="/teach" style={{ color: INDIGO, fontWeight: 600 }}>Back to dashboard</Link>
        </div>
      </div>
    );
  }
  if (!lecture) {
    return <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading</div>;
  }

  const status = lecture.status;
  const failed = status === "failed";
  const done = lecture.published;
  const notStarted = status === "uploaded" && !done;
  const currentIndex = done ? 4 : Math.max(0, STAGES.indexOf(status as (typeof STAGES)[number]));
  const pct = failed ? STAGE_PCT[currentIndex] : done ? 100 : STAGE_PCT[currentIndex];
  const backHref = course ? `/teach/courses/${course.id}` : "/teach";

  const steps = STEP_TITLES.map((title, i) => {
    const isDone = done ? true : currentIndex > i;
    const isActive = !failed && !done && currentIndex === i && ACTIVE.has(status);
    const isFailed = failed && currentIndex === i;
    const meta = isFailed ? "Failed" : isDone ? (i === 2 ? `${lecture.segments.length} segments` : "Done") : isActive ? "In progress" : notStarted && i === 0 ? "Ready" : "Waiting";
    return { title, isDone, isActive, isFailed, isPending: !isDone && !isActive && !isFailed, meta };
  });

  const details = [
    { k: "Week", v: `Week ${lecture.week}` },
    { k: "Duration", v: fmtDur(lecture.duration_s) },
    { k: "Transcript", v: lecture.segments.length ? `${lecture.segments.length} segments` : "Pending" },
    { k: "Video", v: lecture.stream_uid ? "Cloudflare Stream" : lecture.has_recording ? "Recording attached" : "Not attached" },
    { k: "Status", v: STATUS_LABEL[status] ?? status },
  ];

  const headBg = failed ? "#E11D48" : done ? TEAL : INDIGO;
  const title = failed ? "Processing failed" : done ? "Lecture ready" : notStarted ? "Ready to process" : "Processing recording";
  const subtitle = failed
    ? "Something went wrong while processing this recording. You can retry."
    : done
      ? "Transcript synced and the lecture is published to enrolled students."
      : notStarted
        ? "Start processing to normalize the audio and generate the synced transcript."
        : "Osmio is normalizing and transcribing this recording. This page updates on its own as it progresses.";

  return (
    <div className={instrument.className} style={{ ...(c as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 66, background: "var(--header-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <Link href="/teach" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: INDIGO }}>
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
          </span>
          <span className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px", color: "var(--text)" }}>osmio</span>
        </Link>
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

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 40px 48px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 22, flexWrap: "wrap" }}>
          <Link href="/teach" style={{ color: "var(--muted)", fontWeight: 500 }}>Dashboard</Link>
          <Chevron />
          {course && (
            <>
              <Link href={`/teach/courses/${course.id}`} style={{ color: "var(--muted)", fontWeight: 500 }}>{course.code}: {course.title}</Link>
              <Chevron />
            </>
          )}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>Processing</span>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 30, alignItems: "start" }}>
          {/* pipeline */}
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: "30px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
              <span style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 15, display: "inline-flex", alignItems: "center", justifyContent: "center", background: headBg }}>
                {done ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : failed ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                ) : notStarted ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                ) : (
                  <svg className="animate-spin" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
                )}
              </span>
              <div>
                <h1 className={grotesk.className} style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.5px", margin: 0, color: "var(--text)" }}>{title}</h1>
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>{subtitle}</div>
              </div>
            </div>

            <div style={{ margin: "22px 0 30px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: "var(--muted)" }}>Overall progress</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{pct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 5, background: "var(--track)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, transition: "width .4s ease", background: failed ? "#E11D48" : done ? TEAL : INDIGO }} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {steps.map((s, i) => (
                <div key={s.title} style={{ display: "flex", gap: 16, padding: "15px 0", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: s.isDone ? TEAL : s.isActive ? INDIGO : s.isFailed ? "#E11D48" : "transparent", border: s.isPending ? "1px solid var(--border)" : "none" }}>
                    {s.isDone ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : s.isActive ? (
                      <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
                    ) : s.isFailed ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    ) : (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--faint)" }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: s.isPending ? 500 : 600, color: s.isPending ? "var(--muted)" : "var(--text)" }}>{s.title}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: s.isDone ? "var(--teal-text)" : s.isActive ? "var(--indigo-text)" : s.isFailed ? "#E11D48" : "var(--faint)" }}>{s.meta}</span>
                    </div>
                    {s.isActive && (
                      <div style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden", marginTop: 9 }}>
                        <div className="animate-pulse" style={{ width: "100%", height: "100%", borderRadius: 3, background: INDIGO }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {error && <p style={{ margin: "18px 0 0", fontSize: 13, color: "#dc2626" }}>{error}</p>}

            <div style={{ display: "flex", gap: 12, marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--border-soft)", flexWrap: "wrap", alignItems: "center" }}>
              {done ? (
                <Link href={`/lectures/${lecture.id}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "13px 22px", border: "none", borderRadius: 10, background: INDIGO, color: "#fff", fontSize: 14.5, fontWeight: 600, boxShadow: "0 8px 20px -8px rgba(79,70,229,.6)" }}>View lecture</Link>
              ) : notStarted || failed ? (
                <button type="button" onClick={start} disabled={busy} style={{ padding: "13px 22px", border: "none", borderRadius: 10, background: INDIGO, color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Starting" : failed ? "Retry processing" : "Start processing"}</button>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", padding: "13px 22px", borderRadius: 10, background: "var(--surface2)", color: "var(--faint)", fontSize: 14.5, fontWeight: 600 }}>Processing</span>
              )}
              <Link href={backHref} style={{ display: "inline-flex", alignItems: "center", padding: "13px 20px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", fontSize: 14.5, fontWeight: 600, color: "var(--text)" }}>Back to course</Link>
              {done && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "var(--teal-text)", alignSelf: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  Published to students
                </span>
              )}
            </div>
          </section>

          {/* summary */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 90 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "radial-gradient(120% 100% at 30% 25%,#1b3a52,#0d1a2b 72%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center", padding: 16 }}>
                  <div className={grotesk.className} style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", color: "#5b7f9a" }}>{course?.code ? `${course.code} · ` : ""}WEEK {lecture.week}</div>
                  <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "#dfeef0", marginTop: 6 }}>{lecture.title}</div>
                </div>
                <span style={{ position: "absolute", left: 12, bottom: 12, fontSize: 11, fontWeight: 600, color: "#dfeef0", background: "#0009", padding: "3px 8px", borderRadius: 5 }}>{fmtDur(lecture.duration_s)}</span>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{lecture.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 3 }}>Week {lecture.week}{course ? ` · ${course.code}` : ""}</div>
              </div>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
              <div className={grotesk.className} style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>Lecture details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {details.map((d) => (
                  <div key={d.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                    <span style={{ color: "var(--muted)" }}>{d.k}</span>
                    <span style={{ fontWeight: 600, color: "var(--text)", textAlign: "right" }}>{d.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Chevron() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
}

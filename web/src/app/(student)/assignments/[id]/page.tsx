"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  deleteSubmissionFile,
  downloadSubmissionFile,
  fmtFileSize,
  getMyAssignments,
  getMyCourses,
  submitAssignment,
  uploadSubmissionFile,
  type Course,
  type StudentAssignment,
  type SubmissionFile,
} from "@/lib/api";
import { homePath, useAuth } from "@/lib/auth";

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

function fmtDue(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time}`;
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

function statusPill(a: StudentAssignment) {
  const sub = a.submission;
  if (sub && sub.score != null) return { label: "Graded", color: "#475569", bg: "#EEF2F1" };
  if (sub) return { label: "Submitted", color: "#0B8F84", bg: "#E4F4F1" };
  const diff = new Date(a.due_at).getTime() - Date.now();
  if (diff < 0) return { label: "Overdue", color: "#E11D48", bg: "#FCE4EA" };
  const days = Math.ceil(diff / 86400000);
  return { label: days <= 1 ? "Due today" : `Due in ${days} days`, color: "#B45309", bg: "#FDF0DD" };
}

export default function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const assignmentId = Number(id);
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    getMyAssignments(token)
      .then((all) => {
        const a = all.find((x) => x.id === assignmentId) ?? null;
        setAssignment(a);
        if (a && !touched) setBody(a.submission?.body ?? "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token, assignmentId, touched]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (token) getMyCourses(token).then((cs) => setCourse(cs.find((c) => c.id === assignment?.course_id) ?? null)).catch(() => {});
  }, [token, assignment?.course_id]);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitAssignment(assignmentId, body.trim(), token!);
      setTouched(false);
      load();
    } catch {
      setError("Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) return null;
  const c = THEMES[theme];

  if (loaded && !assignment) {
    return (
      <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16 }}>This assignment is not available on your account.</p>
          <Link href={homePath(user.role)} style={{ color: TEAL, fontWeight: 600 }}>Back to your courses</Link>
        </div>
      </div>
    );
  }
  if (!assignment) {
    return <div className={instrument.className} style={{ ...(THEMES.light as React.CSSProperties), minHeight: "100vh", background: "var(--bg)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading assignment</div>;
  }

  const initial = (user.full_name || user.email).charAt(0).toUpperCase();
  const coursesHref = homePath(user.role);
  const sub = assignment.submission;
  const graded = sub != null && sub.score != null;
  const pill = statusPill(assignment);
  const details: { k: string; v: string }[] = [
    { k: "Status", v: graded ? "Graded" : sub ? "Submitted" : "Not submitted" },
    { k: "Points", v: String(assignment.max_score) },
    { k: "Due date", v: fmtDue(assignment.due_at) },
    { k: "Resubmissions", v: "Allowed until due" },
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

      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 40px 48px" }}>
        {/* breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <Link href={coursesHref} style={{ color: "var(--muted)", fontWeight: 500 }}>Home</Link>
          <Chevron />
          {course ? (
            <Link href={`/courses/${course.id}`} style={{ color: "var(--muted)", fontWeight: 500 }}>{course.code}: {course.title}</Link>
          ) : (
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>Course</span>
          )}
          <Chevron />
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{assignment.title}</span>
        </nav>

        {/* title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: pill.color, background: pill.bg, padding: "4px 11px", borderRadius: 7 }}>{pill.label}</span>
              <span style={{ fontSize: 13, color: "var(--faint)" }}>Homework · {assignment.max_score} points</span>
            </div>
            <h1 className={grotesk.className} style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.6px", margin: 0, color: "var(--text)" }}>{assignment.title}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>Due date</div>
              <div className={grotesk.className} style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{fmtDue(assignment.due_at)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
          {/* left */}
          <section style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 26 }}>
              <div className={grotesk.className} style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>Instructions</div>
              {assignment.description ? (
                <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)", margin: 0, maxWidth: "66ch", whiteSpace: "pre-wrap" }}>{assignment.description}</p>
              ) : (
                <p style={{ fontSize: 14.5, color: "var(--faint)", margin: 0 }}>No instructions were provided for this assignment.</p>
              )}
            </div>

            {graded ? (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 26 }}>
                <div className={grotesk.className} style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Your submission</div>
                {sub!.body && <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap", padding: "14px 16px", background: "var(--surface2)", borderRadius: 11 }}>{sub!.body}</p>}
                <SubmissionFiles files={sub!.files} token={token} assignmentId={assignmentId} editable={false} onChange={load} />
                <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 12 }}>Submitted {relTime(sub!.submitted_at)}. This assignment has been graded and is locked.</div>
              </div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 26 }}>
                <div className={grotesk.className} style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Your submission</div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8, display: "block" }}>Your work</label>
                <textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setTouched(true); }}
                  placeholder="Paste your code, a link, or write up your answer here"
                  style={{ width: "100%", minHeight: 160, resize: "vertical", padding: "13px 15px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.5, outline: "none" }}
                />
                {error && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#dc2626" }}>{error}</p>}
                <SubmissionFiles files={sub?.files ?? []} token={token} assignmentId={assignmentId} editable onChange={load} />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                  <button type="button" onClick={submit} disabled={busy || !body.trim()} style={{ padding: "13px 22px", border: "none", borderRadius: 10, background: body.trim() ? TEAL : "var(--border)", color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: body.trim() && !busy ? "pointer" : "not-allowed", boxShadow: body.trim() ? "0 8px 20px -8px rgba(15,181,166,.6)" : "none" }}>{busy ? "Submitting" : sub ? "Resubmit" : "Submit assignment"}</button>
                  {sub && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--teal-text)" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      Submitted {relTime(sub.submitted_at)} · you can resubmit until the deadline
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 22, position: "sticky", top: 90 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
              <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {details.map((d) => (
                  <div key={d.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                    <span style={{ color: "var(--faint)" }}>{d.k}</span>
                    <span style={{ fontWeight: 600, color: "var(--text)", textAlign: "right" }}>{d.v}</span>
                  </div>
                ))}
              </div>
            </div>
            {graded && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
                <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>Grade</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className={grotesk.className} style={{ fontSize: 30, fontWeight: 600, color: "var(--text)" }}>{sub!.score}</span>
                  <span style={{ fontSize: 15, color: "var(--faint)" }}>/ {assignment.max_score}</span>
                  <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: "var(--teal-text)" }}>{Math.round((sub!.score! / assignment.max_score) * 100)}%</span>
                </div>
                {sub!.feedback && (
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--muted)", margin: "14px 0 0", paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>{sub!.feedback}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Chevron() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
}

function SubmissionFiles({ files, token, assignmentId, editable, onChange }: {
  files: SubmissionFile[];
  token: string;
  assignmentId: number;
  editable?: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of Array.from(picked)) await uploadSubmissionFile(assignmentId, f, token);
      onChange();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await deleteSubmissionFile(id, token);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: editable ? 20 : 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Files</div>
      {files.length === 0 && <p style={{ fontSize: 13.5, color: "var(--faint)", margin: "0 0 8px" }}>{editable ? "Attach your code, a PDF, or a zip (up to 25 MB)." : "No files attached."}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {files.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 13px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "var(--surface)", color: "var(--teal-text)", border: "1px solid var(--border)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.filename}</div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>{fmtFileSize(f.size_bytes)}</div>
            </div>
            <button type="button" onClick={() => downloadSubmissionFile(f.id, f.filename, token).catch(() => {})} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: "var(--teal-text)", background: "transparent", border: "none", cursor: "pointer" }}>Download</button>
            {editable && (
              <button type="button" onClick={() => remove(f.id)} disabled={busy} aria-label="Remove" style={{ flexShrink: 0, width: 28, height: 28, border: "none", borderRadius: 7, background: "transparent", cursor: "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <>
          <input ref={inputRef} type="file" multiple onChange={onPick} style={{ display: "none" }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", border: "1px dashed var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
            {busy ? "Uploading" : "Add file"}
          </button>
          {err && <p style={{ fontSize: 12.5, color: "#dc2626", marginTop: 6 }}>{err}</p>}
        </>
      )}
    </div>
  );
}

"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  partnerGetCourses,
  partnerGetTranscript,
  partnerGetUsage,
  type PartnerCourse,
  type PartnerLecture,
  type PartnerTranscript,
  type PartnerUsage,
} from "@/lib/api";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// This screen is a stand-in for an external partner app that licenses osmio content and pulls
// it through the metered API. It is deliberately branded as someone else's product.
const AMBER = "#D97706";
const DEMO_KEY = "osk_demo_partner_2026";

function fmtTs(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function fmtDur(seconds: number) {
  if (seconds <= 0) return "";
  return `${Math.round(seconds / 60)} min`;
}
function relTime(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function PartnerSandbox() {
  const [keyInput, setKeyInput] = useState(DEMO_KEY);
  const [activeKey, setActiveKey] = useState(DEMO_KEY);
  const [courses, setCourses] = useState<PartnerCourse[] | null>(null);
  const [usage, setUsage] = useState<PartnerUsage | null>(null);
  const [reading, setReading] = useState<{ course: PartnerCourse; lecture: PartnerLecture } | null>(null);
  const [transcript, setTranscript] = useState<PartnerTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshUsage = useCallback((k: string) => {
    partnerGetUsage(k).then(setUsage).catch(() => {});
  }, []);

  const connect = useCallback(
    async (k: string) => {
      setError(null);
      setLoading(true);
      setReading(null);
      setTranscript(null);
      try {
        const cs = await partnerGetCourses(k);
        setCourses(cs);
        setActiveKey(k);
        refreshUsage(k);
      } catch (e) {
        setCourses(null);
        setUsage(null);
        setError(e instanceof ApiError ? e.message : "Could not reach the osmio API.");
      } finally {
        setLoading(false);
      }
    },
    [refreshUsage],
  );

  useEffect(() => {
    connect(DEMO_KEY);
  }, [connect]);

  async function openLecture(course: PartnerCourse, lecture: PartnerLecture) {
    setReading({ course, lecture });
    setTranscript(null);
    try {
      setTranscript(await partnerGetTranscript(lecture.id, activeKey));
    } catch {
      /* ignore */
    }
    refreshUsage(activeKey);
  }

  const licensedCount = courses?.length ?? 0;

  return (
    <div className={instrument.className} style={{ minHeight: "100vh", background: "#FAFAF9", color: "#1C1917" }}>
      {/* partner brand header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 64, background: "#fff", borderBottom: "1px solid #E7E5E4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 9, background: AMBER, color: "#fff" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
          </span>
          <div>
            <div className={grotesk.className} style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.4px" }}>Northwind Learning</div>
            <div style={{ fontSize: 11.5, color: "#78716C", marginTop: -1 }}>Content sandbox</div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#57534E", background: "#F5F5F4", border: "1px solid #E7E5E4", padding: "6px 12px", borderRadius: 999 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0FB5A6" }} />
          Powered by the osmio API
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 40px 48px" }}>
        <div style={{ marginBottom: 6 }}>
          <h1 className={grotesk.className} style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.5px", margin: 0 }}>Course library</h1>
          <p style={{ fontSize: 14, color: "#78716C", margin: "6px 0 0" }}>Lectures and transcripts licensed from osmio, delivered to Northwind learners through the read-only content API.</p>
        </div>

        {/* API key bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "18px 0 24px", padding: "14px 16px", background: "#fff", border: "1px solid #E7E5E4", borderRadius: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#A8A29E" }}>API key</span>
          <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} spellCheck={false} style={{ flex: 1, minWidth: 260, fontFamily: grotesk.style.fontFamily, fontSize: 13.5, padding: "9px 12px", border: "1px solid #E7E5E4", borderRadius: 9, background: "#FAFAF9", color: "#1C1917", outline: "none" }} />
          <button type="button" onClick={() => connect(keyInput.trim())} disabled={loading || !keyInput.trim()} style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: AMBER, color: "#fff", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>{loading ? "Connecting" : "Connect"}</button>
          {courses && !error && (
            <span style={{ fontSize: 13, color: "#57534E" }}>Connected as <strong>{usage?.partner ?? "partner"}</strong> · {licensedCount} course{licensedCount === 1 ? "" : "s"} licensed</span>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13.5, color: "#B91C1C" }}>
            API returned an error: {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28, alignItems: "start" }}>
          {/* catalogue / reader */}
          <section style={{ minWidth: 0 }}>
            {reading ? (
              <div style={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid #F0EFEC" }}>
                  <div style={{ minWidth: 0 }}>
                    <button type="button" onClick={() => { setReading(null); setTranscript(null); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: AMBER, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: 0 }}>&larr; Back to catalogue</button>
                    <div className={grotesk.className} style={{ fontSize: 17, fontWeight: 600, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reading.lecture.title}</div>
                    <div style={{ fontSize: 12.5, color: "#A8A29E", marginTop: 2 }}>{reading.course.code} · Week {reading.lecture.week}{fmtDur(reading.lecture.duration_s) ? ` · ${fmtDur(reading.lecture.duration_s)}` : ""}</div>
                  </div>
                  <span style={{ flexShrink: 0, fontFamily: grotesk.style.fontFamily, fontSize: 11, color: "#A8A29E" }}>GET /partner/v1/lectures/{reading.lecture.id}/transcript</span>
                </div>
                <div style={{ maxHeight: 520, overflowY: "auto", padding: "8px 20px 20px" }}>
                  {!transcript ? (
                    <p style={{ fontSize: 14, color: "#A8A29E", padding: "16px 0" }}>Loading transcript</p>
                  ) : transcript.segments.length === 0 ? (
                    <p style={{ fontSize: 14, color: "#A8A29E", padding: "16px 0" }}>No transcript available.</p>
                  ) : (
                    transcript.segments.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 14, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #F5F5F4" }}>
                        <span className={grotesk.className} style={{ flexShrink: 0, width: 44, fontSize: 12.5, fontWeight: 600, color: AMBER, paddingTop: 1 }}>{fmtTs(s.start_ms)}</span>
                        <span style={{ fontSize: 14.5, lineHeight: 1.55, color: "#292524" }}>{s.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!courses && !error && <p style={{ fontSize: 14, color: "#A8A29E" }}>Loading catalogue</p>}
                {courses && courses.length === 0 && !error && <p style={{ fontSize: 14, color: "#78716C" }}>This key is not licensed for any courses.</p>}
                {courses?.map((course) => (
                  <div key={course.id} style={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: course.lectures.length ? "1px solid #F0EFEC" : "none" }}>
                      <span className={grotesk.className} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "#FEF3E2", color: AMBER, fontSize: 13, fontWeight: 700 }}>{course.code.replace(/[^A-Z]/g, "").slice(0, 2) || "C"}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className={grotesk.className} style={{ fontSize: 16, fontWeight: 600 }}>{course.title}</div>
                        <div style={{ fontSize: 12.5, color: "#A8A29E" }}>{course.code} · {course.term} · {course.lectures.length} lecture{course.lectures.length === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                    {course.lectures.map((lec, i) => (
                      <button key={lec.id} type="button" onClick={() => openLecture(course, lec)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "13px 20px", border: "none", borderTop: i === 0 ? "none" : "1px solid #F5F5F4", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "#F5F5F4", color: AMBER }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#1C1917" }}>Week {lec.week}: {lec.title}</span>
                          <span style={{ fontSize: 12.5, color: "#A8A29E" }}>{fmtDur(lec.duration_s) || "Transcript available"}</span>
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: AMBER }}>Read transcript</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* usage meter */}
          <aside style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1C1917", color: "#fff", borderRadius: 16, padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#A8A29E" }}>API usage</span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0FB5A6" }} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
                <span className={grotesk.className} style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>{usage?.total ?? 0}</span>
                <span style={{ fontSize: 13, color: "#A8A29E" }}>metered calls</span>
              </div>
              <div style={{ fontSize: 12, color: "#78716C", marginTop: 6 }}>Every request is counted against the license. This is the billing meter.</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #E7E5E4", borderRadius: 16, padding: 20 }}>
              <div className={grotesk.className} style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent requests</div>
              {!usage || usage.recent.length === 0 ? (
                <p style={{ fontSize: 13, color: "#A8A29E", margin: 0 }}>No calls yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {usage.recent.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #F5F5F4" }}>
                      <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "#0B8F84", background: "#E4F4F1", padding: "2px 6px", borderRadius: 5 }}>{r.method}</span>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: grotesk.style.fontFamily, fontSize: 12, color: "#57534E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.path.replace("/partner/v1", "")}</span>
                      <span style={{ flexShrink: 0, fontSize: 11.5, color: "#A8A29E" }}>{relTime(r.created_at)}</span>
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

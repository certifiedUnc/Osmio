"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  partnerGetCourses,
  partnerGetDailyUsage,
  partnerGetUsage,
  type PartnerCourse,
  type PartnerDailyUsage,
  type PartnerUsage,
} from "@/lib/api";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const TEAL = "#0FB5A6";
const DEMO_KEY = "osk_demo_partner_2026";
const ENDPOINTS = [
  { m: "GET", p: "/partner/v1/courses", d: "Courses licensed to your account" },
  { m: "GET", p: "/partner/v1/courses/{id}", d: "One licensed course and its published lectures" },
  { m: "GET", p: "/partner/v1/lectures/{id}", d: "Lecture metadata" },
  { m: "GET", p: "/partner/v1/lectures/{id}/transcript", d: "The synced transcript for a lecture" },
  { m: "GET", p: "/partner/v1/usage", d: "Your usage total and recent calls" },
];

function relTime(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
}

export default function DeveloperPortal() {
  const [keyInput, setKeyInput] = useState(DEMO_KEY);
  const [activeKey, setActiveKey] = useState(DEMO_KEY);
  const [usage, setUsage] = useState<PartnerUsage | null>(null);
  const [daily, setDaily] = useState<PartnerDailyUsage[]>([]);
  const [courses, setCourses] = useState<PartnerCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const connect = useCallback(async (k: string) => {
    setError(null);
    setLoading(true);
    try {
      const [u, d, cs] = await Promise.all([partnerGetUsage(k), partnerGetDailyUsage(k), partnerGetCourses(k)]);
      setUsage(u);
      setDaily(d);
      setCourses(cs);
      setActiveKey(k);
    } catch (e) {
      setUsage(null);
      setCourses(null);
      setError(e instanceof ApiError ? e.message : "Could not reach the osmio API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    connect(DEMO_KEY);
  }, [connect]);

  const curl = `curl -H "X-API-Key: ${activeKey}" \\\n  https://api.osmio.dev/partner/v1/courses`;
  const maxDaily = Math.max(1, ...daily.map((d) => d.count));
  const licensed = courses?.length ?? 0;

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E7EBEF", borderRadius: 14, padding: "20px 22px" };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "#94A3B8" };

  return (
    <div className={instrument.className} style={{ minHeight: "100vh", background: "#F5F7F8", color: "#0F172A" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 64, background: "#fff", borderBottom: "1px solid #E7EBEF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: TEAL }}>
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#062b28" /></svg>
          </span>
          <span className={grotesk.className} style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.4px" }}>osmio <span style={{ color: "#94A3B8", fontWeight: 500 }}>for developers</span></span>
        </div>
        <Link href="/partner" style={{ fontSize: 13.5, fontWeight: 600, color: TEAL }}>Open content sandbox</Link>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 40px 48px" }}>
        <h1 className={grotesk.className} style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.5px", margin: 0 }}>Partner console</h1>
        <p style={{ fontSize: 14, color: "#64748B", margin: "6px 0 0" }}>Your metered access to the osmio content API: keys, usage, licensed catalogue, and the reference to integrate.</p>

        {/* key bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "18px 0 24px", padding: "14px 16px", ...card }}>
          <span style={label}>API key</span>
          <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} spellCheck={false} style={{ flex: 1, minWidth: 260, fontFamily: grotesk.style.fontFamily, fontSize: 13.5, padding: "9px 12px", border: "1px solid #E7EBEF", borderRadius: 9, background: "#FAFBFC", color: "#0F172A", outline: "none" }} />
          <button type="button" onClick={() => connect(keyInput.trim())} disabled={loading || !keyInput.trim()} style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: TEAL, color: "#fff", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>{loading ? "Loading" : "Refresh"}</button>
        </div>

        {error && <div style={{ marginBottom: 20, padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13.5, color: "#B91C1C" }}>API returned an error: {error}</div>}

        {/* top cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <div style={label}>Account</div>
            <div className={grotesk.className} style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>{usage?.partner ?? "Partner"}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#0B8F84", background: "#E4F4F1", padding: "3px 10px", borderRadius: 999 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: TEAL }} />Active</div>
          </div>
          <div style={card}>
            <div style={label}>Total API calls</div>
            <div className={grotesk.className} style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>{usage?.total ?? 0}</div>
            <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2 }}>metered against your license</div>
          </div>
          <div style={card}>
            <div style={label}>Licensed courses</div>
            <div className={grotesk.className} style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>{licensed}</div>
            <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2 }}>available through the API</div>
          </div>
        </div>

        {/* usage chart + recent */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <div style={label}>Calls, last 7 days</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginTop: 16 }}>
              {daily.map((d) => (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>{d.count || ""}</span>
                  <div style={{ width: "100%", height: `${(d.count / maxDaily) * 88}%`, minHeight: d.count ? 4 : 2, borderRadius: "6px 6px 3px 3px", background: d.count ? TEAL : "#E7EBEF" }} />
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{dayLabel(d.date)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <div style={label}>Recent requests</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {!usage || usage.recent.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94A3B8", margin: "6px 0 0" }}>No calls yet.</p>
              ) : (
                usage.recent.slice(0, 6).map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #F1F5F5" }}>
                    <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "#0B8F84", background: "#E4F4F1", padding: "2px 6px", borderRadius: 5 }}>{r.method}</span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: grotesk.style.fontFamily, fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.path.replace("/partner/v1", "")}</span>
                    <span style={{ flexShrink: 0, fontSize: 11.5, color: "#94A3B8" }}>{relTime(r.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* licensed catalogue */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={label}>Licensed catalogue</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {courses && courses.length === 0 && <p style={{ fontSize: 13.5, color: "#94A3B8", margin: 0 }}>This key is not licensed for any courses.</p>}
            {courses?.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #F1F5F5" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.title}</span>
                <span style={{ fontSize: 12.5, color: "#94A3B8" }}>{c.code} · {c.lectures.length} lecture{c.lectures.length === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* API reference */}
        <div style={card}>
          <div style={label}>API reference</div>
          <p style={{ fontSize: 13.5, color: "#64748B", margin: "10px 0 14px" }}>Authenticate every request with your key in the <code style={{ fontFamily: grotesk.style.fontFamily, background: "#F1F5F5", padding: "1px 6px", borderRadius: 5 }}>X-API-Key</code> header. Responses are scoped to your licensed courses.</p>
          <div style={{ background: "#0d1a2b", borderRadius: 10, padding: "14px 16px", position: "relative", marginBottom: 16 }}>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ position: "absolute", top: 10, right: 10, border: "1px solid #24384e", background: "#101f31", color: "#94A3B8", fontSize: 11.5, fontWeight: 600, borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>{copied ? "Copied" : "Copy"}</button>
            <pre className={grotesk.className} style={{ margin: 0, color: "#cfe6e2", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{curl}</pre>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ENDPOINTS.map((e, i) => (
              <div key={e.p} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid #F1F5F5" }}>
                <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#0B8F84", background: "#E4F4F1", padding: "2px 8px", borderRadius: 5, minWidth: 40, textAlign: "center" }}>{e.m}</span>
                <span className={grotesk.className} style={{ flexShrink: 0, fontSize: 12.5, color: "#0F172A" }}>{e.p}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#94A3B8", textAlign: "right" }}>{e.d}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

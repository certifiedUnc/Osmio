"use client";

import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { homePath, useAuth } from "@/lib/auth";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const TEAL = "#0FB5A6";

const THEMES = {
  light: {
    formBg: "#ffffff", heading: "#0F172A", sub: "#64748B", label: "#334155",
    inputBorder: "#E4E8EE", inputText: "#0F172A", inputBg: "#ffffff",
    track: "#EEF2F1", tabActiveBg: "#ffffff", tabActiveColor: "#0B8F84", tabInactive: "#64748B",
    footer: "#64748B", remember: "#475569", checkOff: "#CBD5E1",
    btnBg: "#ffffff", btnBorder: "#E4E8EE", btnColor: "#334155",
  },
  dark: {
    formBg: "#0e1b2c", heading: "#F1F5F9", sub: "#94A3B8", label: "#CBD5E1",
    inputBorder: "#28394f", inputText: "#F1F5F9", inputBg: "#152438",
    track: "#152438", tabActiveBg: "#22374f", tabActiveColor: "#2ee6d6", tabInactive: "#94A3B8",
    footer: "#94A3B8", remember: "#CBD5E1", checkOff: "#3a4d66",
    btnBg: "rgba(255,255,255,.08)", btnBorder: "rgba(255,255,255,.15)", btnColor: "#F1F5F9",
  },
} as const;

const ROLES = [
  { key: "student", label: "Student", email: "student@osmio.dev" },
  { key: "admin", label: "Admin", email: "admin@osmio.dev" },
  { key: "instructor", label: "Instructor", email: "instructor@osmio.dev" },
] as const;

function PlayIcon({ fill, size = 17 }: { fill: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" fill={fill} />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("student");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = THEMES[theme];

  // Tabs double as a quick demo launcher: they prefill the matching seeded account.
  function pickRole(r: (typeof ROLES)[number]) {
    setRole(r.key);
    setEmail(r.email);
    setPassword("password");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      router.replace(homePath(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "13px 15px", border: `1px solid ${c.inputBorder}`,
    borderRadius: 10, fontSize: 15, color: c.inputText, background: c.inputBg, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: c.label, marginBottom: 7, display: "block",
  };

  return (
    <div
      className={instrument.className}
      style={{ position: "relative", display: "flex", minHeight: "100vh", background: "#0d1a2b" }}
    >
      <button
        type="button"
        onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        aria-label="Toggle theme"
        style={{
          position: "absolute", top: 26, right: 26, zIndex: 5, width: 40, height: 40,
          borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", background: c.btnBg, border: `1px solid ${c.btnBorder}`, color: c.btnColor,
        }}
      >
        {theme === "light" ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      <div
        className="hidden lg:flex"
        style={{
          position: "relative", flex: "0 0 46%", maxWidth: 640, padding: 56,
          flexDirection: "column", justifyContent: "space-between",
          background: "radial-gradient(120% 90% at 15% 5%, #16324a 0%, #0d1a2b 55%, #0a1422 100%)",
          color: "#fff", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", width: 420, height: 420, right: -150, top: -110, borderRadius: "50%", background: "radial-gradient(circle, rgba(15,181,166,.32), transparent 70%)", animation: "floatGlow 11s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 300, height: 300, left: -120, bottom: -90, borderRadius: "50%", background: "radial-gradient(circle, rgba(21,80,120,.5), transparent 70%)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, background: TEAL }}>
            <PlayIcon fill="#062b28" />
          </span>
          <span className={grotesk.className} style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.5px" }}>osmio</span>
        </div>

        <div style={{ position: "relative", maxWidth: 440, margin: "0 auto", width: "100%" }}>
          <div style={{ background: "#0f1f31", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: 18, boxShadow: "0 26px 50px -22px rgba(0,0,0,.65)" }}>
            <div style={{ position: "relative", height: 172, borderRadius: 12, background: "linear-gradient(135deg,#1b3a52,#0f2438)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,.94)", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
                <PlayIcon fill="#0d1a2b" size={21} />
              </span>
              <div className={grotesk.className} style={{ position: "absolute", left: 14, top: 14, padding: "4px 9px", borderRadius: 6, background: "rgba(0,0,0,.4)", fontSize: 11, fontWeight: 500, letterSpacing: ".3px" }}>
                LECTURE 07 · LIVE TRANSCRIPT
              </div>
              <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 5, background: "rgba(255,255,255,.12)" }}>
                <div style={{ width: "38%", height: "100%", background: TEAL }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 17 }}>
              <div style={{ display: "flex", gap: 11, alignItems: "center", opacity: 0.5 }}>
                <span className={grotesk.className} style={{ fontSize: 11, color: "#8fb7b2" }}>01:12</span>
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,.1)" }} />
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                <span className={grotesk.className} style={{ fontSize: 11, color: TEAL, fontWeight: 600 }}>01:24</span>
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: "linear-gradient(90deg,#0FB5A6,rgba(15,181,166,.2))" }} />
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "center", opacity: 0.5 }}>
                <span className={grotesk.className} style={{ fontSize: 11, color: "#8fb7b2" }}>01:41</span>
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,.1)", maxWidth: "72%" }} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={grotesk.className} style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.35, maxWidth: 400 }}>
            Recorded lectures with transcripts that follow every word.
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)" }}>
            Timestamped Q&amp;A · Licensable content API for partner apps
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 56, background: c.formBg }}>
        <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 392, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: "#0B8F84", marginBottom: 9 }}>
            Welcome back
          </div>
          <div className={grotesk.className} style={{ fontSize: 31, fontWeight: 600, color: c.heading, letterSpacing: "-.6px" }}>
            Sign in to Osmio
          </div>
          <div style={{ fontSize: 15, color: c.sub, marginTop: 9, marginBottom: 28 }}>
            Pick up where your last lecture left off.
          </div>

          <div style={{ display: "flex", gap: 4, padding: 4, background: c.track, borderRadius: 11, marginBottom: 24 }}>
            {ROLES.map((r) => {
              const on = r.key === role;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => pickRole(r)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 14, fontWeight: on ? 600 : 500,
                    background: on ? c.tabActiveBg : "transparent",
                    color: on ? c.tabActiveColor : c.tabInactive,
                    boxShadow: on ? "0 1px 2px rgba(0,0,0,.18)" : "none",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <label htmlFor="email" style={labelStyle}>Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            style={{ ...inputBase, marginBottom: 16 }}
          />

          <label htmlFor="password" style={labelStyle}>Password</label>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputBase, padding: "13px 44px 13px 15px" }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label="Toggle password visibility"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
            >
              {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
            <button
              type="button"
              onClick={() => setRemember((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 9, border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: 14, color: c.remember }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: remember ? TEAL : "transparent", border: remember ? `1px solid ${TEAL}` : `1px solid ${c.checkOff}` }}>
                {remember && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </span>
              Remember me
            </button>
            <a href="#" style={{ fontSize: 14, fontWeight: 600, color: "#0B8F84", textDecoration: "none" }}>Forgot password?</a>
          </div>

          {error && (
            <p role="alert" style={{ marginBottom: 16, borderRadius: 8, background: "rgba(220,38,38,.1)", padding: "8px 10px", fontSize: 14, color: "#dc2626" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: 14, border: "none", borderRadius: 10, background: TEAL, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 20px -8px rgba(15,181,166,.6)", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Signing in" : "Sign in"}
          </button>

          <div style={{ textAlign: "center", fontSize: 14, color: c.footer, marginTop: 22 }}>
            New to Osmio? <a href="#" style={{ fontWeight: 600, color: "#0B8F84", textDecoration: "none" }}>Contact your institution</a>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { uploadLectureRecording, type LectureSummary } from "@/lib/api";

type Phase = "idle" | "live" | "recording" | "recorded" | "saving";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LectureRecorder({
  courseId,
  token,
  onCreated,
}: {
  courseId: number;
  token: string;
  onCreated: (lecture: LectureSummary) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [week, setWeek] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  // Release the camera, timer, and object URL if the panel unmounts mid-recording.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopTimer();
      stopStream();
      clearPreview();
    };
  }, []);

  function attachLive() {
    const el = videoRef.current;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.muted = true;
      el.play().catch(() => {});
    }
  }

  async function enable() {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPhase("live");
      // Wait for the video element to mount before attaching the stream.
      window.setTimeout(attachLive, 0);
    } catch {
      setError("Camera and microphone access was blocked. Allow access and try again.");
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    clearPreview();
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (!mountedRef.current) return;
      const type = chunksRef.current[0]?.type || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const el = videoRef.current;
      if (el) {
        el.srcObject = null;
        el.src = url;
        el.muted = false;
        el.controls = true;
      }
      setPhase("recorded");
    };
    recorder.start();
    recorderRef.current = recorder;
    durationRef.current = 0;
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      durationRef.current += 1;
      setElapsed(durationRef.current);
    }, 1000);
    setPhase("recording");
  }

  function stopRecording() {
    stopTimer();
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function reRecord() {
    clearPreview();
    blobRef.current = null;
    setElapsed(0);
    durationRef.current = 0;
    const el = videoRef.current;
    if (el) {
      el.removeAttribute("src");
      el.controls = false;
      el.load();
    }
    attachLive();
    setPhase("live");
  }

  async function save() {
    if (!blobRef.current || !title.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      const lecture = await uploadLectureRecording(
        { course_id: courseId, title: title.trim(), week, duration_s: durationRef.current },
        blobRef.current,
        token,
      );
      stopStream();
      clearPreview();
      onCreated(lecture);
    } catch {
      setError("Could not save the recording. Please try again.");
      setPhase("recorded");
    }
  }

  const showVideo = phase !== "idle";
  const saving = phase === "saving";

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Lecture title"
          className="min-w-[12rem] flex-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
        />
        <label className="text-xs text-neutral-500">
          Week
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(Math.max(1, Number(e.target.value)))}
            className="ml-1 w-16 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg bg-neutral-900">
        {showVideo ? (
          <video
            ref={videoRef}
            playsInline
            className="aspect-video w-full bg-black object-contain"
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-neutral-400">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
            <span className="text-xs">Camera is off</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phase === "idle" && (
          <button
            type="button"
            onClick={enable}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Enable camera and mic
          </button>
        )}

        {phase === "live" && (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
            Start recording
          </button>
        )}

        {phase === "recording" && (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-red-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              Recording {fmtClock(elapsed)}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Stop
            </button>
          </>
        )}

        {(phase === "recorded" || saving) && (
          <>
            <span className="text-xs text-neutral-500">Recorded {fmtClock(elapsed)}</span>
            <button
              type="button"
              onClick={reRecord}
              disabled={saving}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-40"
            >
              Re-record
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !title.trim()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? "Saving" : "Save and process"}
            </button>
            {!title.trim() && !saving && (
              <span className="text-xs text-neutral-400">Add a title to save.</span>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

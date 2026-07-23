"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { formatTimestamp } from "@/lib/api";
import type { PlayerHandleRef } from "./playerTypes";

interface Props {
  durationMs: number;
  onTimeUpdateMs: (ms: number) => void;
  handleRef: PlayerHandleRef;
}

// Stand-in player used until a lecture has a Cloudflare video. It advances a
// simulated clock so the transcript sync, click-to-seek, and "Ask at MM:SS" all
// work in a demo before any video is uploaded.
export default function MockPlayer({ durationMs, onTimeUpdateMs, handleRef }: Props) {
  const duration = Math.max(durationMs, 1000);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const emit = useCallback(
    (ms: number) => {
      const clamped = Math.min(Math.max(ms, 0), duration);
      timeRef.current = clamped;
      setCurrentMs(clamped);
      onTimeUpdateMs(clamped);
    },
    [duration, onTimeUpdateMs],
  );

  // Seeking (from a transcript line or a question) also resumes playback, matching the
  // real Cloudflare player. The range slider keeps calling emit directly so dragging it
  // stays paused-safe.
  const seekTo = useCallback(
    (ms: number) => {
      emit(ms);
      setPlaying(true);
    },
    [emit],
  );

  useImperativeHandle(handleRef, () => ({ seek: seekTo }), [seekTo]);

  useEffect(() => {
    if (!playing) return;
    if (timeRef.current >= duration) emit(0); // replay from the start after reaching the end
    lastTsRef.current = null;
    const step = (ts: number) => {
      if (lastTsRef.current != null) {
        const next = timeRef.current + (ts - lastTsRef.current);
        emit(next);
        if (next >= duration) {
          setPlaying(false);
          return;
        }
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, duration, emit]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <div className="flex aspect-video items-center justify-center bg-neutral-900 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-neutral-300">Preview mode</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
            No video uploaded yet. Playback is simulated so the transcript and questions stay in
            sync.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-neutral-800 px-3 py-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="font-mono text-xs tabular-nums text-neutral-300">
          {formatTimestamp(currentMs)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          value={currentMs}
          onChange={(e) => emit(Number(e.target.value))}
          aria-label="Seek"
          className="flex-1 accent-sky-500"
        />
        <span className="font-mono text-xs tabular-nums text-neutral-400">
          {formatTimestamp(duration)}
        </span>
      </div>
    </div>
  );
}

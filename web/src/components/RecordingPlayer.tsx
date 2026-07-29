"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { fetchLectureRecording } from "@/lib/api";
import type { PlayerHandleRef } from "./playerTypes";

interface Props {
  lectureId: number;
  token: string;
  onTimeUpdateMs: (ms: number) => void;
  handleRef: PlayerHandleRef;
}

// Plays a lecture recorded in the browser. The clip is served from an authed endpoint, so we
// fetch it as a blob and hand the object URL to a native video element, which keeps the
// transcript sync, click-to-seek, and watch-time heartbeat working the same as the Stream player.
export default function RecordingPlayer({ lectureId, token, onTimeUpdateMs, handleRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    fetchLectureRecording(lectureId, token)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [lectureId, token]);

  useImperativeHandle(
    handleRef,
    () => ({
      seek(ms: number) {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = ms / 1000;
        void v.play();
      },
    }),
    [],
  );

  const reportTime = useCallback(() => {
    const v = videoRef.current;
    if (v) onTimeUpdateMs(Math.floor(v.currentTime * 1000));
  }, [onTimeUpdateMs]);

  if (error) {
    return (
      <div className="flex aspect-video items-center justify-center bg-neutral-900 px-6 text-center">
        <p className="max-w-sm text-sm text-neutral-400">
          The recording could not be loaded. It may still be processing.
        </p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src ?? undefined}
      controls
      playsInline
      onTimeUpdate={reportTime}
      onSeeked={reportTime}
      style={{ display: "block", width: "100%", aspectRatio: "16 / 9", background: "#000" }}
    />
  );
}

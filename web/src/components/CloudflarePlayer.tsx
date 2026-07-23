"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import { Stream, type StreamPlayerApi } from "@cloudflare/stream-react";

import type { PlayerHandleRef } from "./playerTypes";

interface Props {
  src: string; // stream_uid or a signed token
  onTimeUpdateMs: (ms: number) => void;
  handleRef: PlayerHandleRef;
}

// Cloudflare Stream measures time in seconds; our data is in ms, so we convert
// at this boundary and nowhere else.
export default function CloudflarePlayer({ src, onTimeUpdateMs, handleRef }: Props) {
  const streamRef = useRef<StreamPlayerApi | undefined>(undefined);

  useImperativeHandle(
    handleRef,
    () => ({
      seek(ms: number) {
        const player = streamRef.current;
        if (!player) return;
        player.currentTime = ms / 1000;
        void player.play();
      },
    }),
    [handleRef],
  );

  // The event props are plain listeners and don't carry the time, so we read it
  // off the player ref when they fire.
  const reportTime = () => {
    if (streamRef.current) onTimeUpdateMs(streamRef.current.currentTime * 1000);
  };

  useEffect(() => onTimeUpdateMs(0), [onTimeUpdateMs]);

  return (
    <Stream
      src={src}
      streamRef={streamRef}
      controls
      responsive
      onTimeUpdate={reportTime}
      onSeeked={reportTime}
    />
  );
}

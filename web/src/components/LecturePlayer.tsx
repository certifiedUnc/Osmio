"use client";

import { useCallback, useRef, useState } from "react";

import type { LectureDetail, Question } from "@/lib/api";
import CloudflarePlayer from "./CloudflarePlayer";
import MockPlayer from "./MockPlayer";
import QnaPanel from "./QnaPanel";
import TranscriptPanel from "./TranscriptPanel";
import type { PlayerHandle } from "./playerTypes";

interface Props {
  lecture: LectureDetail;
  initialQuestions: Question[];
}

// Owns playback state. currentTimeMs and a stable seek() flow down to both the
// transcript and the Q&A panels; neither knows which player is mounted.
export default function LecturePlayer({ lecture, initialQuestions }: Props) {
  const playerRef = useRef<PlayerHandle | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const seek = useCallback((ms: number) => playerRef.current?.seek(ms), []);
  const onTimeUpdateMs = useCallback((ms: number) => setCurrentTimeMs(ms), []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
        {lecture.stream_uid ? (
          <CloudflarePlayer
            src={lecture.stream_uid}
            onTimeUpdateMs={onTimeUpdateMs}
            handleRef={playerRef}
          />
        ) : (
          <MockPlayer
            durationMs={lecture.duration_s * 1000}
            onTimeUpdateMs={onTimeUpdateMs}
            handleRef={playerRef}
          />
        )}
        <TranscriptPanel segments={lecture.segments} currentTimeMs={currentTimeMs} onSeek={seek} />
      </div>

      <aside className="min-h-0 lg:h-[560px]">
        <QnaPanel
          lectureId={lecture.id}
          initialQuestions={initialQuestions}
          currentTimeMs={currentTimeMs}
          onSeek={seek}
        />
      </aside>
    </div>
  );
}

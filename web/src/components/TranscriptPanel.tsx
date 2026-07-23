"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatTimestamp, type Segment } from "@/lib/api";
import { findActiveIndex } from "@/lib/transcript";

// Scroll the active line into view within the panel only. scrollIntoView would
// walk up and scroll the page too, so we compute a delta and scroll the container.
function keepInView(container: HTMLElement, el: HTMLElement, behavior: ScrollBehavior) {
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  const margin = 24;
  let delta = 0;
  if (e.top < c.top + margin) delta = e.top - c.top - margin;
  else if (e.bottom > c.bottom - margin) delta = e.bottom - c.bottom + margin;
  else return;
  container.scrollTo({ top: container.scrollTop + delta, behavior });
}

const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];

interface RowProps {
  startMs: number;
  text: string;
  isActive: boolean;
  onSelect: (startMs: number) => void;
}

// Memoized on the boolean isActive, so only the two rows that flip re-render per change.
const TranscriptRow = memo(function TranscriptRow({ startMs, text, isActive, onSelect }: RowProps) {
  const ts = formatTimestamp(startMs);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(startMs)}
        aria-current={isActive ? "true" : undefined}
        data-active={isActive || undefined}
        aria-label={`Seek to ${ts}, ${text}`}
        className={[
          "flex w-full gap-3 rounded-md px-3 py-2 text-left transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          isActive ? "bg-sky-50 text-sky-950 ring-1 ring-sky-200" : "text-neutral-700 hover:bg-neutral-50",
        ].join(" ")}
      >
        <span className="shrink-0 pt-0.5 font-mono text-xs tabular-nums text-neutral-400">{ts}</span>
        <span className="leading-relaxed">{text}</span>
      </button>
    </li>
  );
});

interface Props {
  segments: Segment[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}

export default function TranscriptPanel({ segments, currentTimeMs, onSeek }: Props) {
  const activeIndex = useMemo(
    () => findActiveIndex(segments, currentTimeMs),
    [segments, currentTimeMs],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const scrollToActive = useCallback((behavior: ScrollBehavior) => {
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (container && el) keepInView(container, el, behavior);
  }, []);

  // Auto-scroll only when the active line changes, and only while following.
  useEffect(() => {
    if (activeIndex < 0 || !followingRef.current) return;
    scrollToActive(reduceMotion ? "auto" : "smooth");
  }, [activeIndex, scrollToActive, reduceMotion]);

  // Real user input stops follow mode. Programmatic scrollTo does not emit wheel/touch/key
  // events, so this classification is exact (no timing guesswork).
  const stopFollowing = useCallback(() => {
    if (followingRef.current) {
      followingRef.current = false;
      setFollowing(false);
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (SCROLL_KEYS.includes(e.key)) stopFollowing();
    },
    [stopFollowing],
  );

  const resume = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    scrollToActive(reduceMotion ? "auto" : "smooth");
  }, [scrollToActive, reduceMotion]);

  const onSelect = useCallback(
    (startMs: number) => {
      onSeek(startMs);
      followingRef.current = true;
      setFollowing(true);
    },
    [onSeek],
  );

  return (
    <section aria-label="Transcript" className="relative flex min-h-0 flex-col rounded-lg border border-neutral-200">
      <header className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Transcript</h2>
      </header>
      <div
        ref={scrollRef}
        onWheel={stopFollowing}
        onTouchMove={stopFollowing}
        onKeyDown={onKeyDown}
        className="max-h-[420px] min-h-0 flex-1 overflow-y-auto"
      >
        <ol className="space-y-0.5 p-2">
          {segments.map((seg, i) => (
            <TranscriptRow
              key={seg.start_ms}
              startMs={seg.start_ms}
              text={seg.text}
              isActive={i === activeIndex}
              onSelect={onSelect}
            />
          ))}
        </ol>
      </div>
      {!following && (
        <button
          type="button"
          onClick={resume}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-lg hover:bg-sky-500"
        >
          Jump to current
        </button>
      )}
    </section>
  );
}

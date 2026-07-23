import type { RefObject } from "react";

// Imperative handle both player implementations expose so the transcript and
// Q&A panels can seek without knowing which player is mounted.
export interface PlayerHandle {
  seek: (ms: number) => void;
}

export type PlayerHandleRef = RefObject<PlayerHandle | null>;

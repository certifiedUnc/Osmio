import type { Segment } from "./api";

// Index of the segment covering tMs: the rightmost one whose start_ms <= tMs.
// Segments arrive sorted by start_ms from the API. Binary search so this stays
// cheap on the playback hot path even for a long lecture with many segments.
// Sticky through silence gaps (keeps the last segment lit rather than blinking off).
export function findActiveIndex(segments: Segment[], tMs: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= tMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

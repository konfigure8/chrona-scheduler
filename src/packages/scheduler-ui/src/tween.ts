/**
 * F41 Live solve: the counting the live panel and the review share, so a figure never snaps:
 * it counts up with the replay, and eases on from the live figure when the review takes over.
 */
import * as React from "react";

import { replayCount } from "./solve";

/**
 * The replay (F41 ruling: "The answer replays shift by shift"): the first roster, or an answer
 * that came with no best roster before it, lands chip after chip over about this long, however
 * many shifts it holds.
 */
export const REPLAY_MS = 2500;
/** When the replay's first chip lands: its flight's shortest duration. */
export const REPLAY_FIRST_LANDING_MS = 300;
/** Whether the person asked for less motion. */
export function usePrefersReducedMotion(): boolean {
  const query = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : undefined;
  const [reduced, setReduced] = React.useState(query?.matches === true);
  React.useEffect(() => {
    if (!query) {
      return undefined;
    }
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [query]);
  return reduced;
}

/** A number that eases to each new value over half a second, as the prototype's tiles do; at once with reduced motion. */
export function useTweenedNumber(target: number, reduced: boolean, replayEndsAt?: number, initial?: number): number {
  // During the replay a tile that shows for the first time counts up from 0, as the chips land; a tile
  // that takes over from another (the review after the run) eases on from that figure.
  const replaying = (): boolean => !reduced && replayEndsAt !== undefined && Date.now() < replayEndsAt;
  const [shown, setShown] = React.useState(() => (replaying() ? 0 : reduced || initial === undefined ? target : initial));
  const from = React.useRef(shown);
  React.useEffect(() => {
    if (reduced || from.current === target || typeof requestAnimationFrame !== "function") {
      from.current = target;
      setShown(target);
      return undefined;
    }
    const start = from.current;
    // The replay: evenly, from the first landing (a flight takes about 300 ms), to the replay's one end time.
    const ends = replaying() ? replayEndsAt : undefined;
    const t0 = ends !== undefined ? Math.max(Date.now(), ends - REPLAY_MS) : Date.now();
    let frame = 0;
    const step = (): void => {
      const now = Date.now();
      const k = ends !== undefined ? (now >= ends ? 1 : 0) : Math.max(0, Math.min(1, (now - t0) / 500));
      const value = ends !== undefined ? replayCount(start, target, t0, ends, now) : start + (target - start) * (1 - (1 - k) ** 3);
      from.current = value;
      setShown(Math.round(value));
      if (ends !== undefined ? now < ends : k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);
  return shown;
}


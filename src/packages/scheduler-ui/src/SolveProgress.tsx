import * as React from "react";

import type { SolveProgress } from "./solve";
import { formatString } from "./stringResources";
import { useSchedulerStrings } from "./strings";

/** Whole seconds since `active` turned on; 0 while it is off. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!active) {
      setSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    setSeconds(0);
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

/**
 * The Fluent Spinner idiom while a solve runs (F31): a brand ring,
 * the phase, the elapsed seconds, and the run's two endings (F41 Live
 * solve): Stop and review ends the run and opens the best roster found
 * so far; Cancel ends it and keeps nothing. It stands in for the Solve
 * or Optimize button for the duration; the board stays live around it.
 */
export function SolveProgressIndicator(props: {
  readonly progress: SolveProgress;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const { progress } = props;
  // All phases share one cell, so the label keeps the widest one's room and the buttons stay put.
  const phases = [...new Set([...(progress.phases ?? []), progress.label])];
  return (
    <span className="chrona-sched__solve-progress-group">
      <span
        aria-live="polite"
        className="chrona-sched__solve-progress"
        data-testid="solve-progress"
        role="status"
      >
        <span aria-hidden="true" className="chrona-sched__spinner" />
        <span className="chrona-sched__solve-phase">
          {phases.map((phase) => (
            <span
              aria-hidden={phase !== progress.label}
              className={phase === progress.label ? undefined : "chrona-sched__solve-phase-off"}
              key={phase}
            >
              {phase}
            </span>
          ))}
        </span>
        <span className="chrona-sched__solve-elapsed">
          {formatString(strings.solveElapsed, {
            seconds: String(progress.seconds),
          })}
        </span>
      </span>
      {progress.onStop ? (
        <button
          className="chrona-sched__toolbar-button chrona-sched__solve-stop"
          data-testid="solve-stop"
          disabled={progress.stopping}
          onClick={progress.onStop}
          type="button"
        >
          {strings.solveStop}
        </button>
      ) : null}
      {progress.onCancel ? (
        <button
          className="chrona-sched__toolbar-button chrona-sched__solve-cancel"
          data-testid="solve-cancel"
          onClick={progress.onCancel}
          type="button"
        >
          {strings.cancel}
        </button>
      ) : null}
    </span>
  );
}

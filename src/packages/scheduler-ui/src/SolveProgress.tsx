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
 * the phase, the elapsed seconds, and Cancel. It stands in for the
 * Solve or Optimize button for the duration; the board stays live
 * around it.
 */
export function SolveProgressIndicator(props: {
  readonly progress: SolveProgress;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const { progress } = props;
  return (
    <span className="chrona-sched__solve-progress-group">
      <span
        aria-live="polite"
        className="chrona-sched__solve-progress"
        data-testid="solve-progress"
        role="status"
      >
        <span aria-hidden="true" className="chrona-sched__spinner" />
        <span>{progress.label}</span>
        <span className="chrona-sched__solve-elapsed">
          {formatString(strings.solveElapsed, {
            seconds: String(progress.seconds),
          })}
        </span>
      </span>
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

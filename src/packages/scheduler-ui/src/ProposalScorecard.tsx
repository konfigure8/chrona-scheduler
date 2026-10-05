import * as React from "react";

import type { SolveSearch } from "./schedulingContract";
import type { ProposalScore } from "./solve";
import { formatString, useSchedulerStrings } from "./strings";

export interface ProposalScorecardProps {
  /** Folded under the bar's chevron; the summary line stays. */
  readonly hidden?: boolean;
  /** For the chevron's aria-controls. */
  readonly id?: string;
  /** What the solver said about Must rules; absent when it cannot vouch for the roster shown. */
  readonly must: "broken" | "kept" | undefined;
  /** People on the board. */
  readonly peopleTotal: number;
  readonly score: ProposalScore;
  /** What the solver's search did; no tile when the answer does not say. */
  readonly search?: SolveSearch;
}

interface ScoreProps {
  readonly label: string;
  readonly note: string;
  readonly noteTone?: "good" | "worse";
  readonly testId: string;
  readonly tone?: "bad" | "good";
  /** A word after the value, in small type: "1.2M versions". */
  readonly unit?: string;
  readonly value: string;
}

function Score(props: ScoreProps): JSX.Element {
  return (
    <div
      className={`chrona-sched__score${props.tone ? ` chrona-sched__score--${props.tone}` : ""}`}
      data-testid={props.testId}
    >
      <dt className="chrona-sched__score-label">{props.label}</dt>
      <dd className="chrona-sched__score-value">
        {props.value}
        {props.unit ? (
          <>
            {" "}
            <span className="chrona-sched__score-unit">{props.unit}</span>
          </>
        ) : null}
      </dd>
      <dd
        className={`chrona-sched__score-note${props.noteTone ? ` chrona-sched__score-note--${props.noteTone}` : ""}`}
      >
        {props.note}
      </dd>
    </div>
  );
}

/** A large count in the browser's own short form: 1.2M, 1,2 Mio. */
const compactCount = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  notation: "compact",
});

/**
 * F31 rework: the scorecard below the summary sets the proposal's
 * figures against today's roster - shifts filled, Must rules, changes
 * and people affected, in both products - and says what the solver's
 * search did. The figures follow Drop and Keep, as Apply would leave
 * the roster. Nothing here repeats the bar above it (Matt 2026-10-01):
 * the bar names the drops and the out-of-date changes, and carries the
 * figures only while the scorecard is folded.
 */
export function ProposalScorecard(props: ProposalScorecardProps): JSX.Element {
  const strings = useSchedulerStrings();
  const { score } = props;
  const gained = score.filledProposed - score.filledNow;
  return (
    <div
      aria-label={strings.scorecardLabel}
      className="chrona-sched__scorecard"
      data-testid="proposal-scorecard"
      hidden={props.hidden}
      id={props.id}
      role="group"
    >
      <dl>
        <Score
          label={strings.scoreFilled}
          note={
            gained === 0
              ? strings.scoreNoChange
              : formatString(strings.scoreVsNow, {
                  delta: gained > 0 ? `+${gained}` : `−${-gained}`,
                })
          }
          noteTone={gained > 0 ? "good" : gained < 0 ? "worse" : undefined}
          testId="score-filled"
          value={`${score.filledProposed} / ${score.total}`}
        />
        <Score
          label={strings.scoreMustBroken}
          note={props.must ? "" : strings.scoreNotChecked}
          testId="score-must"
          tone={props.must === "kept" ? "good" : props.must === "broken" ? "bad" : undefined}
          value={
            props.must === "kept"
              ? strings.scoreNone
              : props.must === "broken"
                ? strings.scoreSome
                : "—"
          }
        />
        <Score label={strings.scoreChanges} note="" testId="score-changes" value={String(score.kept)} />
        <Score
          label={strings.scorePeople}
          note={formatString(strings.scoreOfPeople, { count: String(props.peopleTotal) })}
          testId="score-people"
          value={String(score.peopleAffected)}
        />
        {props.search ? (
          <Score
            label={strings.scoreSearch}
            note={
              props.search.betterRostersFound === 1
                ? formatString(strings.scoreSearchNoteOne, {
                    seconds: String(Math.max(1, Math.round(props.search.solvingMillis / 1000))),
                  })
                : formatString(strings.scoreSearchNote, {
                    better: String(props.search.betterRostersFound),
                    seconds: String(Math.max(1, Math.round(props.search.solvingMillis / 1000))),
                  })
            }
            testId="score-search"
            unit={strings.scoreSearchUnit}
            value={compactCount.format(props.search.rostersChecked)}
          />
        ) : null}
      </dl>
    </div>
  );
}

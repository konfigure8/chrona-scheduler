import {
  ArrowSwap16Regular,
  ChevronDown12Regular,
  ChevronRight16Regular,
  ChevronUp12Regular,
  Heart16Regular,
  People16Regular,
  Search16Regular,
  ShieldCheckmark16Regular,
  Shifts16Regular,
  Warning16Regular,
} from "@fluentui/react-icons";
import * as React from "react";

import { dateNamesFrom, formatDayLabel, type DateNames } from "./dateNames";
import type { PreferencesMet, UncheckedPeople } from "./extension";
import { DRILL_DOWN_LIMIT } from "./proposalReasons";
import { mustBreachTotal, type MustBreachCounts, type SolveSearch } from "./schedulingContract";
import {
  MUST_ROWS,
  mustRowCount,
  mustRowMatches,
  type MustReport,
  type MustRow,
  type ProposalScore,
} from "./solve";
import { formatString, useSchedulerStrings, type SchedulerStrings } from "./strings";
import type { SchedulerUiEvent } from "./types";

export interface ProposalScorecardProps {
  /** Folded under the bar's chevron; the summary line stays. */
  readonly hidden?: boolean;
  /** For the chevron's aria-controls. */
  readonly id?: string;
  /** What the solver said about Must rules; absent when it cannot vouch for the roster shown. */
  readonly must: "broken" | "kept" | undefined;
  /**
   * The Must counts behind the tile, now and proposed, with the rule
   * matches behind them. Absent = the solver's verdict only (the board
   * has no Must report).
   */
  readonly mustReport?: MustReport;
  /** Brings a breakdown row's shifts into the change list. */
  readonly onOpenRow?: (row: MustRow) => void;
  /** Brings one open shift into view on the board and selects it. */
  readonly onFocusShift?: (event: SchedulerUiEvent) => void;
  /** The shifts Apply would leave open, earliest first. */
  readonly openShifts: readonly SchedulerUiEvent[];
  /** People on the board. */
  readonly peopleTotal: number;
  /** A person's name, for the unmet preferences. */
  readonly nameOf?: (resourceId: string) => string;
  /**
   * Preferences met over Optimize's window, now and as Apply would leave
   * the roster (E4, A4), counted on the board. Absent = no tile.
   */
  readonly preferences?: { readonly now: PreferencesMet; readonly proposed: PreferencesMet };
  readonly score: ProposalScore;
  /** What the solver's search did; no tile when the answer does not say. */
  readonly search?: SolveSearch;
  /** People whose rest and day limits are not checked. Absent = not known. */
  readonly unchecked?: UncheckedPeople;
}

interface ScoreDisclosure {
  readonly buttonRef: React.Ref<HTMLButtonElement>;
  readonly controls: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

interface ScoreProps {
  /** The tile opens a list below the scorecard row. */
  readonly disclosure?: ScoreDisclosure;
  /** The tile's 16px icon before its label, as the prototype's scorecard draws it. */
  readonly icon: React.ReactElement;
  readonly label: string;
  readonly note: string;
  readonly noteTone?: "good" | "worse";
  /** A second note line, in the warning tone: who is not checked. */
  readonly attention?: string;
  readonly testId: string;
  readonly tone?: "bad" | "good";
  /** A word after the value, in small type: "1.2M versions". */
  readonly unit?: string;
  readonly value: string;
}

let scoreIds = 0;

function Score(props: ScoreProps): JSX.Element {
  const ids = React.useRef<string | undefined>(undefined);
  if (!ids.current) {
    scoreIds += 1;
    ids.current = `chrona-score-${scoreIds}`;
  }
  const base = ids.current;
  const { disclosure } = props;
  const className = [
    "chrona-sched__score",
    props.tone ? `chrona-sched__score--${props.tone}` : "",
    disclosure ? "chrona-sched__score--disclosure" : "",
    disclosure?.expanded ? "chrona-sched__score--expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} data-testid={props.testId}>
      <dt className="chrona-sched__score-label">
        {disclosure ? (
          <button
            aria-controls={disclosure.controls}
            aria-describedby={[`${base}-value`, `${base}-note`, props.attention ? `${base}-attention` : ""]
              .filter(Boolean)
              .join(" ")}
            aria-expanded={disclosure.expanded}
            className="chrona-sched__score-toggle"
            onClick={disclosure.onToggle}
            ref={disclosure.buttonRef}
            type="button"
          >
            {props.icon}
            {props.label}
            {disclosure.expanded ? (
              <ChevronUp12Regular aria-hidden="true" className="chrona-sched__score-chevron" />
            ) : (
              <ChevronDown12Regular aria-hidden="true" className="chrona-sched__score-chevron" />
            )}
          </button>
        ) : (
          <span className="chrona-sched__score-caption">
            {props.icon}
            {props.label}
          </span>
        )}
      </dt>
      <dd className="chrona-sched__score-value" id={`${base}-value`}>
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
        id={`${base}-note`}
      >
        {props.note}
      </dd>
      {props.attention ? (
        <dd
          className="chrona-sched__score-note chrona-sched__score-note--attention"
          data-testid={`${props.testId}-unchecked`}
          id={`${base}-attention`}
        >
          {props.attention}
        </dd>
      ) : null}
    </div>
  );
}

/** A large count in the browser's own short form: 1.2M, 1,2 Mio. */
const compactCount = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  notation: "compact",
});

/** "+3 vs now", "−2 vs now" or "No change", with its tone; lower is better when `lowerIsBetter`. */
function deltaNote(
  strings: SchedulerStrings,
  delta: number,
  lowerIsBetter: boolean,
): Pick<ScoreProps, "note" | "noteTone"> {
  if (delta === 0) {
    return { note: strings.scoreNoChange };
  }
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    note: formatString(strings.scoreVsNow, { delta: delta > 0 ? `+${delta}` : `−${-delta}` }),
    noteTone: better ? "good" : "worse",
  };
}

/** A breakdown row's name. */
export function mustRowLabel(strings: SchedulerStrings, row: MustRow): string {
  switch (row) {
    case "restBetweenShifts":
      return strings.mustRowRest;
    case "daysInARow":
      return strings.mustRowDaysInARow;
    case "skills":
      return strings.mustRowSkills;
    case "onLeaveOrUnavailable":
      return strings.mustRowOnLeave;
    default:
      return strings.mustRowOther;
  }
}

/** "Double booking 1 · Max hours 1": the kinds behind "Other Must rules", with their counts. */
export function otherMustKinds(strings: SchedulerStrings, counts: MustBreachCounts): string {
  const { other } = counts;
  return (
    [
      [strings.mustKindOverlap, other.overlap],
      [strings.mustKindMaximumHours, other.maximumHours],
      [strings.mustKindSplitParts, other.splitParts],
      [strings.mustKindUnlisted, other.unlisted],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(" · ");
}

/** "Not checked for 3 people", or nothing when everyone is checked or nobody is. */
export function uncheckedNote(strings: SchedulerStrings, unchecked: UncheckedPeople | undefined): string | undefined {
  if (!unchecked || unchecked.nobody || unchecked.count === 0) {
    return undefined;
  }
  return unchecked.count === 1
    ? strings.mustUncheckedOne
    : formatString(strings.mustUnchecked, { count: String(unchecked.count) });
}

/** A preference band's time: whole days as their days ("Thu 5 Nov", "Thu 5 Nov – Fri 6 Nov"), else the day and hours. */
function formatBand(band: { readonly end: Date; readonly start: Date }, names: DateNames): string {
  const midnight = (date: Date): boolean =>
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  if (midnight(band.start) && midnight(band.end)) {
    const last = new Date(band.end.getTime() - 1);
    const first = formatDayLabel(band.start, names);
    return last.toDateString() === band.start.toDateString() ? first : `${first} – ${formatDayLabel(last, names)}`;
  }
  return `${formatDayLabel(band.start, names)} ${formatTimeRange(band)}`;
}

function formatTimeRange(event: { readonly end: Date; readonly start: Date }): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

/**
 * F31 rework: the scorecard below the summary sets the proposal's
 * figures against today's roster - Must rules, shifts filled, changes
 * and people affected, in both products - and says what the solver's
 * search did. The figures follow Drop and Keep, as Apply would leave
 * the roster. Nothing here repeats the bar above it (Matt 2026-10-01):
 * the bar names the drops and the out-of-date changes, and carries the
 * figures only while the scorecard is folded.
 *
 * With a Must report (design Pass 1 calls 2, 3 and 6; DR2 calls 5, 6
 * and 10) the Must tile counts breaches, now against proposed, and
 * opens a breakdown by rule below the row; each row with breaches opens
 * its shifts in the change list. Shifts filled opens the shifts Apply
 * would leave open. Preferences met (E4, A4; DR2 call 7) counts the
 * people's preferred and unpreferred time the roster keeps and opens the
 * ones it does not, by person. Escape closes an open list and returns to
 * its tile. Each tile carries its icon, as the prototype's scorecard.
 */
export function ProposalScorecard(props: ProposalScorecardProps): JSX.Element {
  const strings = useSchedulerStrings();
  const names = React.useMemo(() => dateNamesFrom(strings), [strings]);
  const { mustReport, openShifts, preferences, score, unchecked } = props;
  const [open, setOpen] = React.useState<"must" | "open" | "preferences" | undefined>();
  const mustButton = React.useRef<HTMLButtonElement | null>(null);
  const openButton = React.useRef<HTMLButtonElement | null>(null);
  const preferencesButton = React.useRef<HTMLButtonElement | null>(null);
  const regionIds = React.useRef(`chrona-breakdown-${Math.random().toString(36).slice(2)}`).current;

  const proposed = mustReport?.proposed;
  const now = mustReport?.now;
  const mustCounted = proposed !== undefined;
  const openable = openShifts.length > 0;
  const unmet = preferences?.proposed.unmet ?? [];
  // A list whose tile stops being a button closes with it.
  const shown =
    (open === "must" && !mustCounted) || (open === "open" && !openable) || (open === "preferences" && unmet.length === 0)
      ? undefined
      : open;

  const toggle = (which: "must" | "open" | "preferences"): void =>
    setOpen((current) => (current === which ? undefined : which));
  const closeOnEscape = (event: React.KeyboardEvent): void => {
    if (event.key !== "Escape" || !shown) {
      return;
    }
    event.stopPropagation();
    const button =
      shown === "must" ? mustButton.current : shown === "open" ? openButton.current : preferencesButton.current;
    setOpen(undefined);
    button?.focus();
  };

  const gained = score.filledProposed - score.filledNow;
  const attention = mustReport ? uncheckedNote(strings, unchecked) : undefined;

  const mustTile = (): JSX.Element => {
    if (proposed) {
      const total = mustBreachTotal(proposed);
      return (
        <Score
          attention={attention}
          disclosure={{
            buttonRef: mustButton,
            controls: `${regionIds}-must`,
            expanded: shown === "must",
            onToggle: () => toggle("must"),
          }}
          icon={<ShieldCheckmark16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
          label={strings.scoreMustBroken}
          {...(now ? deltaNote(strings, total - mustBreachTotal(now), true) : { note: "" })}
          testId="score-must"
          tone={total > 0 ? "bad" : "good"}
          value={String(total)}
        />
      );
    }
    return (
      <Score
        attention={attention}
        icon={<ShieldCheckmark16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
        label={strings.scoreMustBroken}
        note={props.must ? "" : mustReport ? strings.scoreNotCounted : strings.scoreNotChecked}
        testId="score-must"
        tone={props.must === "kept" ? "good" : props.must === "broken" ? "bad" : undefined}
        value={props.must === "kept" ? strings.scoreNone : props.must === "broken" ? strings.scoreSome : "—"}
      />
    );
  };

  const breakdown = (): JSX.Element | null => {
    if (shown !== "must" || !mustReport || !proposed) {
      return null;
    }
    const foot =
      unchecked && (unchecked.nobody || unchecked.count > 0)
        ? unchecked.nobody
          ? strings.mustNoAgreementNobody
          : unchecked.count === 1
            ? strings.mustNoAgreementOne
            : formatString(strings.mustNoAgreement, { count: String(unchecked.count) })
        : undefined;
    return (
      <div
        aria-label={strings.mustBreakdownTitle}
        className="chrona-sched__breakdown"
        data-testid="must-breakdown"
        id={`${regionIds}-must`}
        role="region"
      >
        <div className="chrona-sched__breakdown-title">{strings.mustBreakdownTitle}</div>
        <ul className="chrona-sched__breakdown-list">
          {MUST_ROWS.map((row) => {
            const label = mustRowLabel(strings, row);
            const nowCount = now ? mustRowCount(now, row) : undefined;
            const proposedCount = mustRowCount(proposed, row);
            const nowText = nowCount === undefined ? "—" : String(nowCount);
            const kinds =
              row === "other"
                ? otherMustKinds(strings, proposedCount > 0 || !now ? proposed : now)
                : "";
            const opens = props.onOpenRow && mustRowMatches(mustReport, row) !== undefined;
            const values = { now: nowText, proposed: String(proposedCount), rule: label };
            const content = (
              <>
                <span aria-hidden="true" className="chrona-sched__breakdown-label">
                  {label}
                  {kinds ? <span className="chrona-sched__breakdown-kinds">{kinds}</span> : null}
                </span>
                <span aria-hidden="true" className="chrona-sched__breakdown-value">
                  {nowText}
                  <span className="chrona-sched__breakdown-arrow">→</span>
                  {proposedCount}
                </span>
              </>
            );
            return (
              <li data-must-row={row} key={row}>
                {opens ? (
                  <button
                    aria-label={formatString(strings.mustRowOpen, values)}
                    className="chrona-sched__breakdown-row chrona-sched__breakdown-row--open"
                    onClick={() => props.onOpenRow?.(row)}
                    type="button"
                  >
                    {content}
                    <ChevronRight16Regular aria-hidden="true" className="chrona-sched__breakdown-chevron" />
                  </button>
                ) : (
                  <div className="chrona-sched__breakdown-row">
                    {content}
                    <span className="chrona-sched__sr-only">{formatString(strings.mustRowSummary, values)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {foot ? (
          <div className="chrona-sched__breakdown-foot" data-testid="must-unchecked">
            <Warning16Regular aria-hidden="true" className="chrona-sched__breakdown-foot-icon" />
            <span>{foot}</span>
          </div>
        ) : null}
      </div>
    );
  };

  const openList = (): JSX.Element | null => {
    if (shown !== "open") {
      return null;
    }
    const listed = openShifts.slice(0, DRILL_DOWN_LIMIT);
    return (
      <div
        aria-label={strings.rosterOpenShifts}
        className="chrona-sched__breakdown"
        data-testid="open-shifts-list"
        id={`${regionIds}-open`}
        role="region"
      >
        <div className="chrona-sched__breakdown-title">{strings.rosterOpenShifts}</div>
        <ul className="chrona-sched__breakdown-list">
          {listed.map((event) => (
            <li key={event.id}>
              <button
                className="chrona-sched__breakdown-row chrona-sched__breakdown-row--open"
                onClick={() => props.onFocusShift?.(event)}
                type="button"
              >
                <span className="chrona-sched__breakdown-label">{event.title}</span>
                <span className="chrona-sched__breakdown-value">
                  {formatDayLabel(event.start, names)} {formatTimeRange(event)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {openShifts.length > listed.length ? (
          <div className="chrona-sched__breakdown-more">
            {formatString(strings.drillMore, { count: String(openShifts.length - listed.length) })}
          </div>
        ) : null}
      </div>
    );
  };

  const preferencesTile = (): JSX.Element | null => {
    if (!preferences) {
      return null;
    }
    const heart = <Heart16Regular aria-hidden="true" className="chrona-sched__score-icon" />;
    const { proposed: after } = preferences;
    // No bands for anyone in the period: nothing to count, and not a button.
    if (after.total === 0) {
      return (
        <Score
          icon={heart}
          label={strings.scorePreferences}
          note={strings.scorePreferencesNone}
          testId="score-preferences"
          value="—"
        />
      );
    }
    return (
      <Score
        disclosure={
          unmet.length > 0
            ? {
                buttonRef: preferencesButton,
                controls: `${regionIds}-preferences`,
                expanded: shown === "preferences",
                onToggle: () => toggle("preferences"),
              }
            : undefined
        }
        icon={heart}
        label={strings.scorePreferences}
        {...deltaNote(strings, after.met - preferences.now.met, false)}
        testId="score-preferences"
        value={formatString(strings.scorePreferencesValue, { met: String(after.met), total: String(after.total) })}
      />
    );
  };

  const preferencesList = (): JSX.Element | null => {
    if (shown !== "preferences") {
      return null;
    }
    const listed = unmet.slice(0, DRILL_DOWN_LIMIT);
    const nameOf = props.nameOf ?? ((resourceId: string): string => resourceId);
    return (
      <div
        aria-label={strings.preferencesUnmetTitle}
        className="chrona-sched__breakdown"
        data-testid="preferences-unmet"
        id={`${regionIds}-preferences`}
        role="region"
      >
        <div className="chrona-sched__breakdown-title">{strings.preferencesUnmetTitle}</div>
        <ul className="chrona-sched__breakdown-list">
          {listed.map((miss) => (
            <li key={`${miss.resourceId}|${miss.kind}|${miss.start.getTime()}`}>
              <div className="chrona-sched__breakdown-row">
                <span className="chrona-sched__breakdown-label">
                  {formatString(miss.kind === "preferred" ? strings.whyNotPrefers : strings.reasonUnpreferred, {
                    name: nameOf(miss.resourceId),
                  })}
                </span>
                <span className="chrona-sched__breakdown-value">{formatBand(miss, names)}</span>
              </div>
            </li>
          ))}
        </ul>
        {unmet.length > listed.length ? (
          <div className="chrona-sched__breakdown-more">
            {formatString(strings.drillMore, { count: String(unmet.length - listed.length) })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      aria-label={strings.scorecardLabel}
      className="chrona-sched__scorecard"
      data-testid="proposal-scorecard"
      hidden={props.hidden}
      id={props.id}
      onKeyDown={closeOnEscape}
      role="group"
    >
      <dl>
        {mustTile()}
        <Score
          disclosure={
            openable
              ? {
                  buttonRef: openButton,
                  controls: `${regionIds}-open`,
                  expanded: shown === "open",
                  onToggle: () => toggle("open"),
                }
              : undefined
          }
          icon={<Shifts16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
          label={strings.scoreFilled}
          {...deltaNote(strings, gained, false)}
          testId="score-filled"
          value={`${score.filledProposed} / ${score.total}`}
        />
        {preferencesTile()}
        <Score
          icon={<ArrowSwap16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
          label={strings.scoreChanges}
          note=""
          testId="score-changes"
          value={String(score.kept)}
        />
        <Score
          icon={<People16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
          label={strings.scorePeople}
          note={formatString(strings.scoreOfPeople, { count: String(props.peopleTotal) })}
          testId="score-people"
          value={String(score.peopleAffected)}
        />
        {props.search ? (
          <Score
            icon={<Search16Regular aria-hidden="true" className="chrona-sched__score-icon" />}
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
      {breakdown()}
      {openList()}
      {preferencesList()}
    </div>
  );
}

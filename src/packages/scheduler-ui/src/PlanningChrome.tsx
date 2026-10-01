/**
 * Planning chrome (PLAN doctrine 2026-08-24, card design ratified
 * from the design studies): the elevated horizon container holding
 * the roster-card carousel and the persistent period header naming
 * the optimization scope. The Plan/Operate toggle lives in the
 * toolbar (SchedulerToolbar).
 *
 * Publishing is SEQUENTIAL (horizon.ts sequentialEligibility): the
 * published prefix never gets holes - publish needs the preceding
 * roster published, unpublish needs the following one back in
 * draft. Publish, unpublish, and delete all pass through localized
 * confirmation dialogs.
 *
 * Fluent-2 neutralization (Matt 2026-08-24 review): neutral cards -
 * semantic color carries STATUS only. The lifecycle pill gave way
 * to a schedule-progress pill (Not started / {n}% scheduled /
 * Fully scheduled): neutral while in progress, green only at 100%,
 * warning when incomplete past its deadline. Selection is a quiet
 * 2px brand stroke plus a subtle brand tint. Navigation is
 * forward-only: one right chevron; the add-roster affordance lives
 * in the title row, outside the card cadence.
 */
import * as React from "react";

import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { SolveProgress } from "./solve";
import { SolveProgressIndicator } from "./SolveProgress";
import { dateNamesFrom, formatDayLabel, type DateNames } from "./dateNames";
import {
  latestPublication,
  periodKey,
  sequentialEligibility,
  type PeriodLifecycle,
  type RailPeriod,
} from "./horizon";
import { formatString, useSchedulerStrings } from "./strings";
import type { SchedulerStrings } from "./stringResources";
import type { TimeWindow } from "./types";

export type PlanningMode = "operate" | "plan";

export type RosterCardAction =
  | "delete"
  | "generate"
  | "optimize"
  | "publish"
  | "unpublish";

export interface SchedulerPlanningProps {
  /** The mode being shown; controlled by the host. */
  readonly activeMode: PlanningMode;
  /** False when the horizon is full - the + click then explains
   * itself instead of adding. */
  readonly canAddRoster?: boolean;
  /** Full horizon bounds (current period start to plan-ahead end). */
  readonly horizon: TimeWindow;
  /** "both" renders the control's toolbar toggle. */
  readonly modes: "both" | PlanningMode;
  /** Clock for met/overdue derivation (host-supplied, testable). */
  readonly now: Date;
  readonly onAddRoster?: () => void;
  readonly onCardAction?: (action: RosterCardAction, key: string) => void;
  readonly onModeChange?: (mode: PlanningMode) => void;
  readonly onSelectPeriod: (key: string) => void;
  /** Horizon rail periods, in order; see horizon.ts railPeriods. */
  readonly rail: readonly RailPeriod[];
  readonly selectedKey: string;
}

interface OptimizeAction {
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
  /** Set while a solve runs: the progress state stands in for the button. */
  readonly progress?: SolveProgress;
}

// Date labels read "Mon 17 Aug" from the bundle's names (dateNames.ts).
function rangeLabel(period: TimeWindow, names: DateNames): string {
  return `${formatDayLabel(period.start, names)} – ${formatDayLabel(new Date(period.end.getTime() - 1), names)}`;
}

function formatDeadline(date: Date, names: DateNames): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${formatDayLabel(date, names)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function publicationLine(
  strings: SchedulerStrings,
  lifecycle: PeriodLifecycle,
): string | undefined {
  const publication = latestPublication(lifecycle);
  if (!publication) {
    return undefined;
  }
  const published = formatString(strings.publishedLine, {
    date: formatDayLabel(publication.at, dateNamesFrom(strings)),
  });
  const changes =
    publication.changesSince === 0
      ? strings.changesSinceNone
      : formatString(
          publication.changesSince === 1
            ? strings.changesSinceOne
            : strings.changesSinceMany,
          { count: String(publication.changesSince) },
        );
  return `${published} · ${changes}`;
}

function deadlineLine(
  strings: SchedulerStrings,
  card: RailPeriod,
  now: Date,
): { overdue: boolean; text: string } | undefined {
  if (!card.publishBy) {
    return undefined;
  }
  if (now.getTime() > card.publishBy.getTime()) {
    const days = Math.max(
      1,
      Math.ceil((now.getTime() - card.publishBy.getTime()) / 86_400_000),
    );
    return {
      overdue: true,
      text: formatString(
        days === 1 ? strings.publishOverdueDay : strings.publishOverdueDays,
        { days: String(days) },
      ),
    };
  }
  return {
    overdue: false,
    text: formatString(strings.publishByLine, {
      date: formatDeadline(card.publishBy, dateNamesFrom(strings)),
    }),
  };
}

/**
 * Schedule-progress pill: the operational state a planner scans
 * for. Neutral while in progress, positive only when fully
 * scheduled, warning when incomplete past its publish deadline -
 * arbitrary percentages never go green.
 */
function progressPill(
  strings: SchedulerStrings,
  card: RailPeriod,
  overdue: boolean,
): JSX.Element | undefined {
  const percent = card.scheduledPercent;
  if (percent === undefined) {
    return undefined;
  }
  const full = percent >= 100;
  const tone = full ? "full" : overdue ? "late" : "neutral";
  const label = full
    ? strings.rosterProgressFull
    : percent === 0
      ? strings.rosterProgressNotStarted
      : formatString(strings.rosterPercentScheduled, {
          percent: String(percent),
        });
  return (
    <span
      className={`chrona-sched__progress-chip chrona-sched__progress-chip--${tone}`}
    >
      {label}
    </span>
  );
}

interface PendingConfirm {
  readonly action: "delete" | "publish" | "unpublish";
  readonly key: string;
  readonly range: string;
}

function confirmTexts(
  strings: SchedulerStrings,
  pending: PendingConfirm,
): { action: string; message: string; title: string } {
  if (pending.action === "publish") {
    return {
      action: strings.publishAction,
      message: formatString(strings.publishConfirmMessage, {
        range: pending.range,
      }),
      title: strings.publishConfirmTitle,
    };
  }
  if (pending.action === "unpublish") {
    return {
      action: strings.unpublishAction,
      message: formatString(strings.unpublishConfirmMessage, {
        range: pending.range,
      }),
      title: strings.unpublishConfirmTitle,
    };
  }
  return {
    action: strings.deleteConfirmAction,
    message: formatString(strings.rosterDeleteConfirmMessage, {
      range: pending.range,
    }),
    title: strings.rosterDeleteConfirmTitle,
  };
}

export function PlanningChrome(props: {
  readonly optimize?: OptimizeAction;
  readonly planning: SchedulerPlanningProps;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const dateNames = dateNamesFrom(strings);
  const { planning } = props;
  const isPlan = planning.activeMode === "plan";
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [cardMenu, setCardMenu] = React.useState<
    { key: string; x: number; y: number } | undefined
  >(undefined);
  const [pendingConfirm, setPendingConfirm] = React.useState<
    PendingConfirm | undefined
  >(undefined);
  const [horizonFullNotice, setHorizonFullNotice] = React.useState(false);
  const eligibility = React.useMemo(
    () => sequentialEligibility(planning.rail),
    [planning.rail],
  );
  const selected =
    planning.rail.find(
      (card) => periodKey(card.period) === planning.selectedKey,
    ) ?? planning.rail[0];
  // Operate is about the current period - by construction the rail's
  // first card - regardless of the Plan-side selection.
  const headerCard = isPlan ? selected : planning.rail[0];
  const horizonDays = Math.round(
    (planning.horizon.end.getTime() - planning.horizon.start.getTime()) /
      86_400_000,
  );

  const scrollRail = (direction: -1 | 1): void => {
    const rail = railRef.current;
    if (rail) {
      rail.scrollBy({
        behavior: "smooth",
        left: direction * Math.max(240, rail.clientWidth * 0.8),
      });
    }
  };

  const requestConfirm = (
    action: PendingConfirm["action"],
    card: RailPeriod,
  ): void => {
    setPendingConfirm({
      action,
      key: periodKey(card.period),
      range: rangeLabel(card.period, dateNames),
    });
  };

  const menuItems = (card: RailPeriod): ContextMenuItem[] => {
    const key = periodKey(card.period);
    const isCurrent = card === planning.rail[0];
    const cardEligibility = eligibility.get(key);
    const isPublished = card.lifecycle.status !== "draft";
    const close = (run: () => void) => (): void => {
      setCardMenu(undefined);
      run();
    };
    const items: ContextMenuItem[] = [
      isPublished
        ? {
            disabled: !cardEligibility?.canUnpublish,
            id: "unpublish",
            label: cardEligibility?.canUnpublish
              ? strings.unpublishAction
              : `${strings.unpublishAction} – ${strings.unpublishBlockedSequential}`,
            onSelect: close(() => requestConfirm("unpublish", card)),
          }
        : {
            disabled: !cardEligibility?.canPublish,
            id: "publish",
            label: cardEligibility?.canPublish
              ? strings.publishAction
              : `${strings.publishAction} – ${strings.publishBlockedSequential}`,
            onSelect: close(() => requestConfirm("publish", card)),
          },
      {
        id: "generate",
        label: strings.rosterGenerate,
        onSelect: close(() => planning.onCardAction?.("generate", key)),
      },
      {
        id: "optimize",
        label: strings.optimizePeriod,
        onSelect: close(() => planning.onCardAction?.("optimize", key)),
      },
    ];
    if (!isPublished && !isCurrent) {
      items.push({
        danger: true,
        id: "delete",
        label: strings.delete,
        onSelect: close(() => requestConfirm("delete", card)),
      });
    }
    return items;
  };

  const headerEligibility = headerCard
    ? eligibility.get(periodKey(headerCard.period))
    : undefined;
  const headerPublished = headerCard
    ? headerCard.lifecycle.status !== "draft"
    : false;

  return (
    <>
      {isPlan ? (
        <section
          aria-label={strings.railLabel}
          className="chrona-sched__horizon"
          data-testid="horizon"
        >
          <div className="chrona-sched__horizon-head">
            <h3 className="chrona-sched__horizon-title">
              {formatString(strings.horizonHeader, {
                days: String(horizonDays),
                range: rangeLabel(planning.horizon, dateNames),
              })}
            </h3>
            {planning.onAddRoster ? (
              <button
                aria-label={strings.railAddRoster}
                className="chrona-sched__rail-add"
                data-testid="add-roster"
                onClick={() => {
                  if (planning.canAddRoster === false) {
                    setHorizonFullNotice(true);
                    return;
                  }
                  setHorizonFullNotice(false);
                  planning.onAddRoster?.();
                }}
                title={strings.railAddRoster}
                type="button"
              >
                +
              </button>
            ) : null}
          </div>
          {horizonFullNotice ? (
            <div
              className="chrona-sched__horizon-notice"
              data-testid="horizon-full-message"
              role="status"
            >
              <span>{strings.horizonFull}</span>
              <button
                aria-label={strings.close}
                className="chrona-sched__horizon-notice-close"
                onClick={() => setHorizonFullNotice(false)}
                type="button"
              >
                &#10005;
              </button>
            </div>
          ) : null}
          <div className="chrona-sched__rail-row">
            <div
              className="chrona-sched__rail"
              data-testid="horizon-rail"
              ref={railRef}
              role="tablist"
            >
              {planning.rail.map((card, index) => {
                const key = periodKey(card.period);
                const deadline = deadlineLine(strings, card, planning.now);
                const publication = publicationLine(strings, card.lifecycle);
                const isSelected = key === planning.selectedKey;
                return (
                  <div
                    className={`chrona-sched__rail-card${
                      card.readOnly ? " chrona-sched__rail-card--readonly" : ""
                    }${isSelected ? " chrona-sched__rail-card--selected" : ""}`}
                    key={key}
                  >
                    <button
                      aria-selected={isSelected}
                      className="chrona-sched__rail-card-main"
                      onClick={() => planning.onSelectPeriod(key)}
                      role="tab"
                      type="button"
                    >
                      <span className="chrona-sched__rail-range">
                        {formatString(strings.rosterCardLabel, {
                          range: rangeLabel(card.period, dateNames),
                        })}
                      </span>
                      <span className="chrona-sched__rail-meta">
                        {progressPill(strings, card, deadline?.overdue ?? false)}
                        {publication ? <span>{publication}</span> : null}
                        {deadline ? (
                          <span
                            className={
                              deadline.overdue
                                ? "chrona-sched__rail-deadline--overdue"
                                : undefined
                            }
                          >
                            {deadline.text}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {planning.onCardAction && !card.readOnly ? (
                      <button
                        aria-label={strings.rosterActions}
                        className="chrona-sched__rail-menu"
                        onClick={(clickEvent) => {
                          // The menu positions inside the shell, the
                          // control's positioned ancestor - viewport
                          // coordinates land it far away.
                          const button = clickEvent.currentTarget;
                          const shell = button.closest(".chrona-sched__shell");
                          const shellRect = shell?.getBoundingClientRect();
                          const rect = button.getBoundingClientRect();
                          setCardMenu({
                            key,
                            x: rect.left - (shellRect?.left ?? 0),
                            y: rect.bottom - (shellRect?.top ?? 0) + 2,
                          });
                        }}
                        type="button"
                      >
                        &#8943;
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <button
              aria-label={strings.railScrollForward}
              className="chrona-sched__rail-chevron"
              onClick={() => scrollRail(1)}
              type="button"
            >
              &#8250;
            </button>
          </div>
        </section>
      ) : null}
      {cardMenu ? (
        <ContextMenu
          items={menuItems(
            planning.rail.find(
              (card) => periodKey(card.period) === cardMenu.key,
            ) ?? planning.rail[0]!,
          )}
          onClose={() => setCardMenu(undefined)}
          x={cardMenu.x}
          y={cardMenu.y}
        />
      ) : null}
      {pendingConfirm ? (
        <div
          className="chrona-sched__dialog-backdrop"
          onClick={() => setPendingConfirm(undefined)}
        >
          <div
            aria-label={confirmTexts(strings, pendingConfirm).title}
            className="chrona-sched__dialog chrona-sched__confirm-dialog"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            role="alertdialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {confirmTexts(strings, pendingConfirm).title}
              </span>
            </div>
            <p>{confirmTexts(strings, pendingConfirm).message}</p>
            <div className="chrona-sched__dialog-actions">
              <button
                onClick={() => setPendingConfirm(undefined)}
                type="button"
              >
                {strings.cancel}
              </button>
              <button
                className={
                  pendingConfirm.action === "delete"
                    ? "chrona-sched__dialog-danger-primary"
                    : "chrona-sched__dialog-primary"
                }
                data-testid="confirm-roster-action"
                onClick={() => {
                  planning.onCardAction?.(
                    pendingConfirm.action,
                    pendingConfirm.key,
                  );
                  setPendingConfirm(undefined);
                }}
                type="button"
              >
                {confirmTexts(strings, pendingConfirm).action}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {headerCard ? (
        <div className="chrona-sched__period-header" data-testid="period-header">
          <span className="chrona-sched__period-title">
            {isPlan
              ? formatString(strings.rosterCardLabel, {
                  range: rangeLabel(headerCard.period, dateNames),
                })
              : `${strings.currentRosterLabel} · ${rangeLabel(headerCard.period, dateNames)}`}
          </span>
          {isPlan ? (
            <span className="chrona-sched__scope-notice">
              {strings.scopeNotice}
            </span>
          ) : publicationLine(strings, headerCard.lifecycle) ? (
            <span className="chrona-sched__period-publine">
              {publicationLine(strings, headerCard.lifecycle)}
            </span>
          ) : null}
          {isPlan ? (
            <span className="chrona-sched__period-actions">
              {planning.onCardAction && !headerCard.readOnly ? (
                <button
                  className="chrona-sched__toolbar-button"
                  data-testid="publish-button"
                  disabled={
                    headerPublished
                      ? !headerEligibility?.canUnpublish
                      : !headerEligibility?.canPublish
                  }
                  onClick={() =>
                    requestConfirm(
                      headerPublished ? "unpublish" : "publish",
                      headerCard,
                    )
                  }
                  title={
                    headerPublished
                      ? headerEligibility?.canUnpublish
                        ? undefined
                        : strings.unpublishBlockedSequential
                      : headerEligibility?.canPublish
                        ? undefined
                        : strings.publishBlockedSequential
                  }
                  type="button"
                >
                  {headerPublished
                    ? strings.unpublishAction
                    : strings.publishAction}
                </button>
              ) : null}
              {props.optimize ? (
                props.optimize.progress ? (
                  <SolveProgressIndicator progress={props.optimize.progress} />
                ) : (
                  <button
                    className="chrona-sched__toolbar-primary chrona-sched__solve-button"
                    disabled={props.optimize.disabled}
                    onClick={props.optimize.onClick}
                    type="button"
                  >
                    {props.optimize.label}
                  </button>
                )
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

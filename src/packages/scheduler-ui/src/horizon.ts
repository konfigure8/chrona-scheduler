/**
 * Planning-horizon math and period lifecycle types (PLAN: planning
 * horizon and lifecycle UX doctrine, 2026-08-24). Everything is
 * derived - nobody sets what time already knows:
 *
 * - The CURRENT period is the period containing today (never
 *   "active": that reads like a lifecycle status).
 * - The horizon runs from the current period's end, forward by the
 *   maker plan-ahead distance (in periods).
 * - Publish-by = period start minus the maker publish-ahead
 *   distance (days plus a time of day).
 * - Where Plan starts (ratified wording): "Plan normally starts
 *   with the next period. If the current period has never been
 *   published, Plan starts with the current period so it can be
 *   completed and published late. Plan never reaches into an
 *   already-ended period."
 *
 * Lifecycle is host-fed data. The type makes the design-review
 * correction unrepresentable: a draft period CANNOT carry
 * publications, a published or locked one must. Locked is
 * exclusively a terminal, post-period state; periods beyond the
 * horizon are absent, never "Locked".
 */
import { periodContaining, stepPeriod } from "./periods";
import type { SchedulerPeriodConfig } from "./periods";
import type { TimeWindow } from "./types";

export interface PeriodPublication {
  readonly at: Date;
  /** Audited delta count against this publication. */
  readonly changesSince: number;
}

export type PeriodLifecycle =
  | { readonly status: "draft" }
  | {
      /** Newest last; at least one - published means published. */
      readonly publications: readonly PeriodPublication[];
      readonly status: "locked" | "published";
    };

export function latestPublication(
  lifecycle: PeriodLifecycle | undefined,
): PeriodPublication | undefined {
  if (!lifecycle || lifecycle.status === "draft") {
    return undefined;
  }
  return lifecycle.publications[lifecycle.publications.length - 1];
}

/** Stable identity for a period: its local start date, YYYY-MM-DD. */
export function periodKey(period: TimeWindow): string {
  const month = String(period.start.getMonth() + 1).padStart(2, "0");
  const day = String(period.start.getDate()).padStart(2, "0");
  return `${period.start.getFullYear()}-${month}-${day}`;
}

/** The period containing today. */
export function currentPeriod(
  config: SchedulerPeriodConfig,
  today: Date,
): TimeWindow {
  return periodContaining(config, today);
}

export interface PublishAhead {
  /** Whole days before the period starts. */
  readonly days: number;
  /** Local time of day the deadline falls on (default midnight). */
  readonly hour?: number;
  readonly minute?: number;
}

/** The publish deadline for a period. */
export function publishBy(period: TimeWindow, ahead: PublishAhead): Date {
  return new Date(
    period.start.getFullYear(),
    period.start.getMonth(),
    period.start.getDate() - ahead.days,
    ahead.hour ?? 0,
    ahead.minute ?? 0,
  );
}

export interface RailPeriod {
  readonly lifecycle: PeriodLifecycle;
  readonly period: TimeWindow;
  /** Absent on published/locked periods - a met deadline clears. */
  readonly publishBy?: Date;
  /** Orientation only: visible in Plan but not editable. */
  readonly readOnly: boolean;
  /** Host-computed share of shifts assigned, 0-100 (rounded). */
  readonly scheduledPercent?: number;
}

export interface RailOptions {
  readonly config: SchedulerPeriodConfig;
  /**
   * Explicitly created rosters, by periodKey. When given, horizon
   * periods appear only once created (the current period always
   * exists - it is running); when absent, every horizon period
   * shows (derived-grid mode).
   */
  readonly createdKeys?: ReadonlySet<string>;
  /** Lifecycle by periodKey; absent entries are draft. */
  readonly lifecycleByKey: ReadonlyMap<string, PeriodLifecycle>;
  /** Horizon length in periods, from the current period's end. */
  readonly planAheadPeriods: number;
  readonly publishAhead: PublishAhead;
  readonly today: Date;
}

/**
 * The horizon rail's periods, in order. The current period appears
 * either as the read-only orientation card (published) or as the
 * first plannable card (never published - the narrow exception).
 * Periods beyond the horizon are absent. Already-ended periods
 * never appear as plannable.
 */
export function railPeriods(options: RailOptions): readonly RailPeriod[] {
  const current = currentPeriod(options.config, options.today);
  const lifecycleOf = (period: TimeWindow): PeriodLifecycle =>
    options.lifecycleByKey.get(periodKey(period)) ?? { status: "draft" };

  const currentLifecycle = lifecycleOf(current);
  const cards: RailPeriod[] = [
    currentLifecycle.status === "draft"
      ? {
          lifecycle: currentLifecycle,
          period: current,
          publishBy: publishBy(current, options.publishAhead),
          readOnly: false,
        }
      : {
          lifecycle: currentLifecycle,
          period: current,
          readOnly: true,
        },
  ];

  let period = current;
  for (let index = 0; index < options.planAheadPeriods; index += 1) {
    period = stepPeriod(options.config, period.start, 1);
    if (options.createdKeys && !options.createdKeys.has(periodKey(period))) {
      continue;
    }
    const lifecycle = lifecycleOf(period);
    cards.push({
      lifecycle,
      period,
      publishBy:
        lifecycle.status === "draft"
          ? publishBy(period, options.publishAhead)
          : undefined,
      readOnly: false,
    });
  }
  return cards;
}

/** The horizon's full bounds: current period start to plan-ahead end. */
export function horizonWindow(
  config: SchedulerPeriodConfig,
  today: Date,
  planAheadPeriods: number,
): TimeWindow {
  const current = currentPeriod(config, today);
  let period = current;
  for (let index = 0; index < planAheadPeriods; index += 1) {
    period = stepPeriod(config, period.start, 1);
  }
  return { end: period.end, start: current.start };
}

/**
 * The next roster that can be created: the first horizon period not
 * yet created (append-adjacent by construction). Undefined when the
 * planning horizon is full - no more rosters can be added.
 */
export function nextAddablePeriod(
  options: RailOptions,
): TimeWindow | undefined {
  if (!options.createdKeys) {
    return undefined;
  }
  let period = currentPeriod(options.config, options.today);
  for (let index = 0; index < options.planAheadPeriods; index += 1) {
    period = stepPeriod(options.config, period.start, 1);
    if (!options.createdKeys.has(periodKey(period))) {
      return period;
    }
  }
  return undefined;
}

export interface SequentialEligibility {
  readonly canPublish: boolean;
  readonly canUnpublish: boolean;
}

/**
 * Publishing is sequential (Matt 2026-08-24): a roster can be
 * published only when the preceding one is published, and
 * unpublished only when the following one is not published - the
 * published prefix of the horizon never gets holes.
 */
export function sequentialEligibility(
  rail: readonly RailPeriod[],
): ReadonlyMap<string, SequentialEligibility> {
  const isPublished = (card: RailPeriod): boolean =>
    card.lifecycle.status !== "draft";
  const map = new Map<string, SequentialEligibility>();
  rail.forEach((card, index) => {
    const previous = rail[index - 1];
    const next = rail[index + 1];
    map.set(periodKey(card.period), {
      canPublish:
        !isPublished(card) && (previous === undefined || isPublished(previous)),
      canUnpublish:
        isPublished(card) && (next === undefined || !isPublished(next)),
    });
  });
  return map;
}

/** Where Plan starts: the first non-read-only rail period. */
export function planStartPeriod(options: RailOptions): TimeWindow {
  const cards = railPeriods(options);
  const first = cards.find((card) => !card.readOnly);
  return (first ?? cards[cards.length - 1]!).period;
}

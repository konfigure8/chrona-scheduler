/**
 * Demand-template shift generation (domain model 6.4). Creating a
 * roster period expands templates into unassigned shifts; re-running
 * RECONCILES, never regenerates:
 *
 * - Each generated shift remembers its origin (template, date,
 *   slot) via `SchedulerUiEvent.origin`. Hand-created shifts have
 *   no origin and are invisible here.
 * - Missing shifts are added. No-longer-required shifts are removed
 *   only while untouched: generated provenance, unassigned,
 *   unpinned, unedited. When a count shrinks, untouched unassigned
 *   shifts are removed first.
 * - Anything assigned, pinned, or edited is never touched; surplus
 *   ones are FLAGGED for the planner: the run stamps
 *   `SchedulerUiEvent.flag` (and strips stale flags), so the mark
 *   survives storage and renders on the shift itself.
 * - Every run reports added / removed / flagged.
 *
 * "Unedited" is judged against what generation CREATED (stored in
 * `origin.generated`), so it stays decidable after the slot or day
 * leaves the template: pristine debris of a deleted slot is
 * removed, an edited one is flagged. What a template CONTENT change
 * (same slot, new times) should do to existing untouched shifts is
 * deliberately not decided here: counts match, so reconciliation
 * leaves them alone (PLAN records the open question).
 *
 * Times are built from local-midnight day starts plus minutes, the
 * same DST-safe convention periods.ts uses; an end past 24h simply
 * crosses midnight.
 *
 * F1 Rotating patterns: a slot may occur in only one week of an
 * N-week cycle. Week 1 is the week starting on the cycle anchor (the
 * view's period anchor) and weeks run in sevens from there, so the
 * phase is the same under week, fortnight, and month periods. A
 * cycled slot cannot be placed without an anchor: the run reports it
 * and leaves it out entirely, its existing shifts included.
 */
import { resolveSlotCounts, type DemandData, type DemandLever } from "./demandLevers";
import { resolveLock } from "./locks";
import type {
  EventFlag,
  GeneratedShiftOrigin,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

/**
 * A rostered gap declared on the template (F25, Q3-A): minutes from
 * local midnight like the slot's own start/end, stamped onto every
 * generated item as a ShiftGap. Only rostered gaps exist here.
 */
export interface ShiftTemplateGap {
  readonly endMinutes: number;
  readonly label?: string;
  readonly paid?: boolean;
  readonly startMinutes: number;
}

/**
 * F1: the slot occurs only in `week` of a `weeks`-week cycle. A
 * `weeks` of 1 (or less) is weekly, as without a cycle.
 */
export interface ShiftTemplateCycle {
  /** 1-based week of the cycle the slot occurs in. */
  readonly week: number;
  /** Weeks in the cycle. */
  readonly weeks: number;
}

export interface ShiftTemplateSlot {
  /** Shifts required per occurrence day; the floor when a lever is set. */
  readonly count: number;
  /** F1: which week of an N-week cycle the slot occurs in. */
  readonly cycle?: ShiftTemplateCycle;
  /** F5: a driver-based lever that computes the count per occurrence. */
  readonly lever?: DemandLever;
  /** The shape: rostered gaps inside the slot's envelope. */
  readonly gaps?: readonly ShiftTemplateGap[];
  /** Local weekdays the slot occurs on (0 = Sunday .. 6 = Saturday). */
  readonly daysOfWeek: readonly number[];
  /** Minutes from local midnight; may exceed 24h to cross midnight. */
  readonly endMinutes: number;
  /** Classification map stamped onto generated shifts. */
  readonly groups?: Readonly<Record<string, string>>;
  readonly requiredTags?: readonly string[];
  /** Stable within the template; part of the origin identity. */
  readonly slotId: string;
  readonly startMinutes: number;
  readonly title: string;
}

export interface ShiftDemandTemplate {
  readonly slots: readonly ShiftTemplateSlot[];
  readonly templateId: string;
}

export interface GenerationResult {
  readonly added: readonly SchedulerUiEvent[];
  /** True when the run altered events (adds, removes, or flag
   * changes) - false runs need no persistence. */
  readonly changed: boolean;
  /** The full next event list: additions appended, removals dropped,
   * flags stamped and stripped. */
  readonly events: readonly SchedulerUiEvent[];
  /** Surplus shifts that are assigned, pinned, or edited - flagged,
   * never removed. */
  readonly flagged: readonly SchedulerUiEvent[];
  readonly removed: readonly SchedulerUiEvent[];
  /** F1: cycled slots left out because no cycle anchor was given. */
  readonly unanchored: readonly ShiftTemplateSlot[];
}

export interface ReconcileGenerationOptions {
  /**
   * F1: the local date whose week is cycle week 1 - the view's period
   * anchor. Cycled slots are left out and reported without it.
   */
  readonly cycleAnchor?: Date;
  /** F5: drivers and their values; slots without a lever ignore it. */
  readonly demand?: DemandData;
  readonly events: readonly SchedulerUiEvent[];
  /** Row id the host renders open shifts under. */
  readonly openResourceId: string;
  /** The roster period being generated (local-midnight bounds). */
  readonly period: TimeWindow;
  readonly templates: readonly ShiftDemandTemplate[];
}

interface ExpectedSlot {
  readonly count: number;
  readonly dayStart: Date;
  readonly origin: GeneratedShiftOrigin;
  readonly slot: ShiftTemplateSlot;
}

/**
 * F5: the count a slot needs on a given day. Without a lever (or
 * without demand data) the fixed count applies; with one, the lever
 * resolves every occurrence of the slot inside the period once and
 * the day's entry is read from that map.
 */
function makeCountResolver(
  options: ReconcileGenerationOptions,
): (template: ShiftDemandTemplate, slot: ShiftTemplateSlot, dayStart: Date) => number {
  const cache = new Map<string, ReadonlyMap<string, number>>();
  return (template, slot, dayStart) => {
    if (!slot.lever || !options.demand) {
      return slot.count;
    }
    const cacheKey = `${template.templateId} ${slot.slotId}`;
    let counts = cache.get(cacheKey);
    if (!counts) {
      counts = resolveSlotCounts({
        demand: options.demand,
        lever: { ...slot.lever, minimum: Math.max(slot.lever.minimum, 0) },
        occurrenceDateKeys: occurrenceDateKeys(slot, options.period, options.cycleAnchor),
        periodEndKey: localDateKey(options.period.end),
        periodStartKey: localDateKey(options.period.start),
      });
      cache.set(cacheKey, counts);
    }
    return counts.get(localDateKey(dayStart)) ?? slot.count;
  };
}

function occurrenceDateKeys(slot: ShiftTemplateSlot, period: TimeWindow, cycleAnchor: Date | undefined): string[] {
  const keys: string[] = [];
  for (
    let dayStart = new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate());
    dayStart < period.end;
    dayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1)
  ) {
    if (slotOccursOn(slot, dayStart, cycleAnchor)) {
      keys.push(localDateKey(dayStart));
    }
  }
  return keys;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * F1: the 1-based cycle week of `day` in a `weeks`-week cycle whose
 * week 1 starts on the anchor's local midnight. Whole days between
 * local midnights (DST-safe, as periods.ts counts), so the day before
 * the anchor falls in the cycle's last week.
 */
export function cycleWeekOf(anchor: Date, day: Date, weeks: number): number {
  const length = Math.max(1, Math.trunc(weeks));
  const days = Math.round((startOfDay(day).getTime() - startOfDay(anchor).getTime()) / DAY_MS);
  const week = Math.floor(days / 7);
  return ((week % length) + length) % length + 1;
}

/** F1: whether the slot's cycle is longer than a week and so needs an anchor. */
export function isCycled(slot: ShiftTemplateSlot): boolean {
  return (slot.cycle?.weeks ?? 1) > 1;
}

/**
 * F1: whether the slot occurs on `dayStart`: its weekday matches and,
 * when cycled, the day's cycle week is the slot's week. A cycled slot
 * never occurs without an anchor; the reconcile reports it instead.
 */
export function slotOccursOn(
  slot: ShiftTemplateSlot,
  dayStart: Date,
  cycleAnchor: Date | undefined,
): boolean {
  if (!slot.daysOfWeek.includes(dayStart.getDay())) {
    return false;
  }
  if (!slot.cycle || !isCycled(slot)) {
    return true;
  }
  if (!cycleAnchor) {
    return false;
  }
  return cycleWeekOf(cycleAnchor, dayStart, slot.cycle.weeks) === Math.trunc(slot.cycle.week);
}

function localDateKey(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

function atMinutes(dayStart: Date, minutes: number): Date {
  return new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    0,
    minutes,
  );
}

function originKey(origin: GeneratedShiftOrigin): string {
  return `${origin.templateId} ${origin.dateKey} ${origin.slotId}`;
}

function sameTags(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return (
    left.length === right.length &&
    left.every((tag, index) => tag === right[index])
  );
}

/**
 * Untouched = safe to remove: still an open shift, only the
 * demand-born time lock, and exactly what generation created - any
 * deviation counts as an edit. Exported for period deletion, which
 * removes exactly what reconciliation would.
 */
export function isUntouchedGenerated(event: SchedulerUiEvent): boolean {
  if (
    event.status !== "needsCover" ||
    resolveLock(event) !== "time" ||
    !event.origin
  ) {
    return false;
  }
  const created = event.origin.generated;
  return (
    event.start.toISOString() === created.start &&
    event.end.toISOString() === created.end &&
    event.title === created.title &&
    sameTags(event.requiredTags, created.tags)
  );
}

/** Expand the templates over the period and reconcile with current events. */
export function reconcileGeneration(
  options: ReconcileGenerationOptions,
): GenerationResult {
  const expected = new Map<string, ExpectedSlot>();
  const countFor = makeCountResolver(options);
  // F1: without an anchor a cycled slot cannot be placed, so it is
  // reported and left out of the run - its existing shifts included,
  // which keeps a cleared anchor from removing them as surplus.
  const unanchored: ShiftTemplateSlot[] = [];
  const unanchoredKeys = new Set<string>();
  if (!options.cycleAnchor) {
    for (const template of options.templates) {
      for (const slot of template.slots) {
        if (isCycled(slot)) {
          unanchored.push(slot);
          unanchoredKeys.add(`${template.templateId} ${slot.slotId}`);
        }
      }
    }
  }
  for (
    let dayStart = new Date(
      options.period.start.getFullYear(),
      options.period.start.getMonth(),
      options.period.start.getDate(),
    );
    dayStart < options.period.end;
    dayStart = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate() + 1,
    )
  ) {
    for (const template of options.templates) {
      for (const slot of template.slots) {
        if (!slotOccursOn(slot, dayStart, options.cycleAnchor)) {
          continue;
        }
        const origin: GeneratedShiftOrigin = {
          dateKey: localDateKey(dayStart),
          generated: {
            end: atMinutes(dayStart, slot.endMinutes).toISOString(),
            start: atMinutes(dayStart, slot.startMinutes).toISOString(),
            tags: slot.requiredTags ?? [],
            title: slot.title,
          },
          slotId: slot.slotId,
          templateId: template.templateId,
        };
        expected.set(originKey(origin), {
          count: countFor(template, slot, dayStart),
          dayStart,
          origin,
          slot,
        });
      }
    }
  }

  // Generated events under these templates inside the period,
  // grouped by origin - including orphans whose slot or day is gone.
  const templateIds = new Set(
    options.templates.map((template) => template.templateId),
  );
  const firstKey = localDateKey(options.period.start);
  const lastKey = localDateKey(
    new Date(options.period.end.getTime() - 1),
  );
  const existingByKey = new Map<string, SchedulerUiEvent[]>();
  for (const event of options.events) {
    if (
      !event.origin ||
      !templateIds.has(event.origin.templateId) ||
      event.origin.dateKey < firstKey ||
      event.origin.dateKey > lastKey ||
      unanchoredKeys.has(`${event.origin.templateId} ${event.origin.slotId}`)
    ) {
      continue;
    }
    const key = originKey(event.origin);
    const group = existingByKey.get(key);
    if (group) {
      group.push(event);
    } else {
      existingByKey.set(key, [event]);
    }
  }

  const usedIds = new Set(options.events.map((event) => event.id));
  const added: SchedulerUiEvent[] = [];
  const flagById = new Map<string, EventFlag>();
  const managedIds = new Set<string>();
  for (const group of existingByKey.values()) {
    for (const event of group) {
      managedIds.add(event.id);
    }
  }
  const removeIds = new Set<string>();

  const keys = new Set([...expected.keys(), ...existingByKey.keys()]);
  for (const key of keys) {
    const spec = expected.get(key);
    const existing = existingByKey.get(key) ?? [];
    const target = spec?.count ?? 0;

    if (existing.length < target && spec) {
      for (let index = existing.length; index < target; index += 1) {
        let suffix = index + 1;
        let id = `gen-${spec.origin.templateId}-${spec.origin.dateKey}-${spec.origin.slotId}-${suffix}`;
        while (usedIds.has(id)) {
          suffix += 1;
          id = `gen-${spec.origin.templateId}-${spec.origin.dateKey}-${spec.origin.slotId}-${suffix}`;
        }
        usedIds.add(id);
        const gaps = (spec.slot.gaps ?? []).map((gap) => ({
          end: atMinutes(spec.dayStart, gap.endMinutes),
          ...(gap.label !== undefined ? { label: gap.label } : {}),
          ...(gap.paid !== undefined ? { paid: gap.paid } : {}),
          start: atMinutes(spec.dayStart, gap.startMinutes),
        }));
        added.push({
          end: atMinutes(spec.dayStart, spec.slot.endMinutes),
          ...(gaps.length > 0 ? { gaps } : {}),
          groups: spec.slot.groups,
          id,
          // Demand-born shifts keep their time when dragged to a row.
          lock: "time",
          origin: spec.origin,
          requiredTags: spec.slot.requiredTags,
          resourceId: options.openResourceId,
          start: atMinutes(spec.dayStart, spec.slot.startMinutes),
          status: "needsCover",
          title: spec.slot.title,
        });
      }
      continue;
    }

    let surplus = existing.length - target;
    if (surplus <= 0) {
      continue;
    }
    for (const event of existing) {
      if (surplus === 0) {
        break;
      }
      if (isUntouchedGenerated(event)) {
        removeIds.add(event.id);
        surplus -= 1;
      }
    }
    if (surplus > 0) {
      const touched = existing.filter((event) => !removeIds.has(event.id));
      for (const event of touched.slice(touched.length - surplus)) {
        flagById.set(event.id, {
          cause:
            event.status !== "needsCover"
              ? "assigned"
              : resolveLock(event) !== "time"
                ? "pinned"
                : "edited",
          existing: existing.length,
          required: target,
        });
      }
    }
  }

  const removed = options.events.filter((event) => removeIds.has(event.id));
  let flagsChanged = false;
  const events = [
    ...options.events
      .filter((event) => !removeIds.has(event.id))
      .map((event) => {
        // Reconciliation owns the flag: stamp current surplus, strip
        // stale marks on every shift it manages this run.
        const flag = flagById.get(event.id);
        if (flag) {
          if (
            event.flag?.cause === flag.cause &&
            event.flag.existing === flag.existing &&
            event.flag.required === flag.required
          ) {
            return event;
          }
          flagsChanged = true;
          return { ...event, flag };
        }
        if (managedIds.has(event.id) && event.flag) {
          flagsChanged = true;
          const { flag: stale, ...rest } = event;
          void stale;
          return rest;
        }
        return event;
      }),
    ...added,
  ];
  const flagged = events.filter((event) => flagById.has(event.id));
  return {
    added,
    changed: added.length > 0 || removed.length > 0 || flagsChanged,
    events,
    flagged,
    removed,
    unanchored,
  };
}

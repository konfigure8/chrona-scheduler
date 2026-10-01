import type { AvailabilityBand, TimeWindow } from "./types";

export type RowDecorationKind =
  | "busyElsewhere"
  | "custom"
  | "holiday"
  | "nonWorking"
  | "preferred"
  | "unavailable"
  | "unpreferred";

/**
 * A span drawn on a resource row that is not an event: availability bands
 * now; travel segments, breaks, and holidays later. One rendering
 * primitive for all of them (see Docs/scheduler_ui_plan.md scenario forward-compatibility).
 */
export interface RowDecoration {
  readonly end: Date;
  readonly kind: RowDecorationKind;
  readonly label?: string;
  /** Undefined applies the decoration to every row (e.g. non-working time). */
  readonly resourceId?: string;
  readonly start: Date;
}

export interface WorkingWindow {
  /** Hour of day work ends (exclusive), 0-24. */
  readonly endHour: number;
  /** Hour of day work starts (inclusive), 0-24. */
  readonly startHour: number;
}

const millisecondsPerDay = 86_400_000;

/** Default labels for bands that carry none; hosts pass the bundle's. */
export interface BandLabels {
  readonly busyElsewhere: string;
  readonly preferred: string;
  readonly unavailable: string;
  readonly unpreferred: string;
}

export const englishBandLabels: BandLabels = {
  busyElsewhere: "Busy elsewhere",
  preferred: "Preferred",
  unavailable: "Unavailable",
  unpreferred: "Unpreferred",
};

export function availabilityBandsToDecorations(
  bands: readonly AvailabilityBand[],
  labels: BandLabels = englishBandLabels,
): readonly RowDecoration[] {
  return bands.map((band) => ({
    end: band.end,
    kind: band.kind,
    label:
      band.label ??
      (band.kind === "unavailable"
        ? labels.unavailable
        : band.kind === "busyElsewhere"
          ? labels.busyElsewhere
          : band.kind === "preferred"
            ? labels.preferred
            : labels.unpreferred),
    resourceId: band.resourceId,
    start: band.start,
  }));
}

/**
 * Shades hours outside the working window for every day in the window,
 * and whole weekend days when weekends are marked non-working.
 */
export function buildNonWorkingDecorations(
  window: TimeWindow,
  workingWindow: WorkingWindow | undefined,
  weekendsNonWorking: boolean,
): readonly RowDecoration[] {
  const decorations: RowDecoration[] = [];
  const cursor = new Date(window.start.getTime());
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < window.end.getTime()) {
    const dayStart = new Date(cursor.getTime());
    const dayEnd = new Date(cursor.getTime() + millisecondsPerDay);
    const isWeekend = dayStart.getDay() === 0 || dayStart.getDay() === 6;

    if (weekendsNonWorking && isWeekend) {
      decorations.push({
        end: dayEnd,
        kind: "nonWorking",
        label: "Non-working time",
        start: dayStart,
      });
    } else if (workingWindow) {
      if (workingWindow.startHour > 0) {
        const morningEnd = new Date(dayStart.getTime());
        morningEnd.setHours(workingWindow.startHour, 0, 0, 0);
        decorations.push({
          end: morningEnd,
          kind: "nonWorking",
          label: "Non-working time",
          start: dayStart,
        });
      }
      if (workingWindow.endHour < 24) {
        const eveningStart = new Date(dayStart.getTime());
        eveningStart.setHours(workingWindow.endHour, 0, 0, 0);
        decorations.push({
          end: dayEnd,
          kind: "nonWorking",
          label: "Non-working time",
          start: eveningStart,
        });
      }
    }

    cursor.setTime(dayEnd.getTime());
  }

  return decorations;
}

export function decorationsForResource(
  decorations: readonly RowDecoration[],
  resourceId: string,
): readonly RowDecoration[] {
  return decorations.filter(
    (decoration) =>
      decoration.resourceId === undefined ||
      decoration.resourceId === resourceId,
  );
}

export interface LegendEntry {
  readonly kind: RowDecorationKind | "needsCover";
  readonly label: string;
}

const legendLabels: Record<RowDecorationKind, string> = {
  busyElsewhere: "Busy elsewhere",
  custom: "Highlighted",
  holiday: "Holiday",
  nonWorking: "Non-working time",
  preferred: "Preferred hours",
  unavailable: "Unavailable",
  unpreferred: "Unpreferred hours",
};

const legendOrder: readonly RowDecorationKind[] = [
  "unavailable",
  "busyElsewhere",
  "preferred",
  "unpreferred",
  "nonWorking",
  "holiday",
  "custom",
];

/**
 * Chips worth explaining for the current dataset: one entry per decoration
 * kind actually present, plus needs-cover when any event carries it.
 * Hosts localize by overriding `labels` (kind map) and `needsCoverLabel`.
 */
export function buildLegendEntries(
  decorations: readonly RowDecoration[] | undefined,
  hasNeedsCover: boolean,
  labels?: Partial<Record<RowDecorationKind, string>>,
  needsCoverLabel?: string,
): readonly LegendEntry[] {
  const present = new Set<RowDecorationKind>();
  for (const decoration of decorations ?? []) {
    present.add(decoration.kind);
  }
  const entries: LegendEntry[] = legendOrder
    .filter((kind) => present.has(kind))
    .map((kind) => ({ kind, label: labels?.[kind] ?? legendLabels[kind] }));
  if (hasNeedsCover) {
    entries.push({
      kind: "needsCover",
      label: needsCoverLabel ?? "Needs cover",
    });
  }
  return entries;
}

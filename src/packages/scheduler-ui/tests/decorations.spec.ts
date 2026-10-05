import {
  buildLegendEntries,
  buildNonWorkingDecorations,
  decorationsForResource,
} from "../src/decorations";
import type { RowDecoration } from "../src/decorations";
import type { TimeWindow } from "../src/types";

// Mon 2026-08-17 .. Mon 2026-08-24 (includes Sat 22nd and Sun 23rd).
const week: TimeWindow = {
  end: new Date(2026, 7, 24, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

function shadesOutsideWorkingWindow(): void {
  const single: TimeWindow = {
    end: new Date(2026, 7, 18, 0, 0),
    start: new Date(2026, 7, 17, 0, 0),
  };
  const decorations = buildNonWorkingDecorations(
    single,
    { endHour: 22, startHour: 6 },
    false,
  );
  assertEqual(decorations.length, 2);
  assertEqual(decorations[0]?.end.getHours(), 6);
  assertEqual(decorations[1]?.start.getHours(), 22);
  assertEqual(decorations[0]?.resourceId, undefined);
}

function shadesWholeWeekendDaysWhenNonWorking(): void {
  const decorations = buildNonWorkingDecorations(
    week,
    { endHour: 22, startHour: 6 },
    true,
  );
  const fullDays = decorations.filter(
    (decoration) =>
      decoration.end.getTime() - decoration.start.getTime() === 86_400_000,
  );
  assertEqual(fullDays.length, 2);
  assertEqual(fullDays[0]?.start.getDay(), 6);
  assertEqual(fullDays[1]?.start.getDay(), 0);
  // Five weekdays x two spans each.
  assertEqual(decorations.length - fullDays.length, 10);
}

function filtersByResource(): void {
  const decorations: readonly RowDecoration[] = [
    {
      end: new Date(2026, 7, 17, 12, 0),
      kind: "preferred",
      label: "Preferred",
      resourceId: "r-1",
      start: new Date(2026, 7, 17, 6, 0),
    },
    {
      end: new Date(2026, 7, 17, 22, 0),
      kind: "unavailable",
      label: "Unavailable",
      resourceId: "r-2",
      start: new Date(2026, 7, 17, 18, 0),
    },
  ];

  const forR1 = decorationsForResource(decorations, "r-1");
  assertEqual(forR1.length, 1);
  assertEqual(forR1[0]?.resourceId, "r-1");

  const shared = decorationsForResource(
    [
      ...decorations,
      {
        end: new Date(2026, 7, 17, 6, 0),
        kind: "nonWorking",
        start: new Date(2026, 7, 17, 0, 0),
      },
    ],
    "r-1",
  );
  assertEqual(shared.length, 2);
}

function buildsLegendFromPresentKindsOnly(): void {
  const decorations = [
    {
      end: new Date(2026, 7, 17, 12, 0),
      kind: "preferred" as const,
      label: "Preferred",
      resourceId: "r-1",
      start: new Date(2026, 7, 17, 6, 0),
    },
    ...buildNonWorkingDecorations(
      {
        end: new Date(2026, 7, 18, 0, 0),
        start: new Date(2026, 7, 17, 0, 0),
      },
      { endHour: 22, startHour: 6 },
      false,
    ),
  ];

  const entries = buildLegendEntries(decorations, true);
  assertEqual(entries.length, 3);
  assertEqual(entries[0]?.kind, "preferred");
  assertEqual(entries[1]?.kind, "nonWorking");
  assertEqual(entries[1]?.label, "Non-working time");
  assertEqual(entries[2]?.kind, "needsCover");

  assertEqual(buildLegendEntries(undefined, false).length, 0);
  assertEqual(buildLegendEntries([], true)[0]?.kind, "needsCover");
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

buildsLegendFromPresentKindsOnly();
shadesOutsideWorkingWindow();
shadesWholeWeekendDaysWhenNonWorking();
filtersByResource();

console.log("decorations tests passed");

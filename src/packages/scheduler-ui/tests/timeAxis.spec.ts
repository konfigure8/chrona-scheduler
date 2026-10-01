import {
  buildTimeTicks,
  buildTimeTicksEvery,
  buildWeekSpans,
  dateToOffset,
  fitPxPerHour,
  formatDayLabelToFit,
  isoWeekNumber,
  offsetToDate,
  resolveTimeResolution,
  snapDate,
  stepZoom,
  VERTICAL_RESOLUTION_LIMITS,
  windowWidth,
} from "../src/timeAxis";
import type { TimeWindow } from "../src/types";

const window: TimeWindow = {
  end: new Date(2026, 7, 18, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

function convertsDatesToOffsetsAndBack(): void {
  const noon = new Date(2026, 7, 17, 12, 0);
  assertEqual(dateToOffset(noon, window, 60), 720);
  assertEqual(offsetToDate(720, window, 60).getTime(), noon.getTime());
  assertEqual(windowWidth(window, 60), 1440);
}

function snapsToNearestIncrement(): void {
  const value = new Date(2026, 7, 17, 9, 7);
  assertEqual(snapDate(value, 15).getMinutes(), 0);
  const later = new Date(2026, 7, 17, 9, 8);
  assertEqual(snapDate(later, 15).getMinutes(), 15);
}

function snapsCoarseStepsOnTheLocalClock(): void {
  assertEqual(snapDate(new Date(2026, 7, 17, 9, 40), 60).getHours(), 10);
  const sixHours = snapDate(new Date(2026, 7, 17, 14, 0), 360);
  assertEqual(sixHours.getHours(), 12);
  assertEqual(sixHours.getMinutes(), 0);
  const morning = snapDate(new Date(2026, 7, 17, 11, 0), 1440);
  assertEqual(morning.getTime(), new Date(2026, 7, 17).getTime());
  const evening = snapDate(new Date(2026, 7, 17, 13, 0), 1440);
  assertEqual(evening.getTime(), new Date(2026, 7, 18).getTime());
}

function coarsensTheResolutionAsTheZoomWidens(): void {
  const cases: ReadonlyArray<readonly [number, number, number, number]> = [
    // pxPerHour, maker slot, expected slot, expected labels
    [120, 30, 30, 60],
    [60, 30, 30, 60],
    [60, 15, 30, 60],
    [120, 15, 15, 60],
    [30, 30, 60, 120],
    [10, 30, 120, 360],
    [4, 30, 360, 720],
    [2.5, 30, 720, 1440],
    [1, 30, 1440, 1440],
  ];
  for (const [pxPerHour, makerSlot, slot, labels] of cases) {
    const resolution = resolveTimeResolution(pxPerHour, makerSlot);
    assertEqual(`${pxPerHour}: ${resolution.slotMinutes}/${resolution.labelMinutes}`, `${pxPerHour}: ${slot}/${labels}`);
  }
}

function keepsTheMakersSlotAsTheFinestStep(): void {
  // Wide zoom never refines past the maker's slot.
  assertEqual(resolveTimeResolution(600, 30).slotMinutes, 30);
  // A slot off the ladder is still the first step, and labels hold whole slots.
  const offLadder = resolveTimeResolution(60, 45);
  assertEqual(offLadder.slotMinutes, 45);
  assertEqual(offLadder.labelMinutes, 180);
  assertEqual(resolveTimeResolution(60, 20).labelMinutes, 60);
}

function usesTheTighterVerticalLimits(): void {
  const resolution = resolveTimeResolution(48, 30, VERTICAL_RESOLUTION_LIMITS);
  assertEqual(resolution.slotMinutes, 30);
  assertEqual(resolution.labelMinutes, 60);
  const compact = resolveTimeResolution(16, 30, VERTICAL_RESOLUTION_LIMITS);
  assertEqual(compact.slotMinutes, 60);
  assertEqual(compact.labelMinutes, 120);
}

function buildsLabelTicksAtTheChosenStep(): void {
  const ticks = buildTimeTicksEvery(window, 10, 360);
  assertEqual(ticks.length, 4);
  assertEqual(ticks[1]?.date.getHours(), 6);
  assertEqual(ticks[1]?.left, 60);
  assertEqual(ticks[3]?.date.getHours(), 18);
}

function fitsTheWindowToTheBoard(): void {
  const week = { end: new Date(2026, 7, 24), start: new Date(2026, 7, 17) };
  // 168 hours across 1176px: 7px an hour.
  assertEqual(fitPxPerHour(week, 1176), 7);
  // A single hour never zooms closer than the maximum.
  assertEqual(fitPxPerHour({ end: new Date(2026, 7, 17, 1), start: new Date(2026, 7, 17) }, 5000), 240);
  // Steps keep a decimal when fine, whole numbers otherwise, and stay in range.
  assertEqual(stepZoom(1.6, "in", 1.6), 1.9);
  assertEqual(stepZoom(60, "in", 12), 72);
  assertEqual(stepZoom(7, "out", 7), 7);
  assertEqual(stepZoom(240, "in", 12), 240);
}

function fitsTheDayLabelToItsCell(): void {
  const monday = new Date(2026, 7, 17);
  assertEqual(formatDayLabelToFit(monday, 120), "Mon 17 Aug");
  assertEqual(formatDayLabelToFit(monday, 60), "Mon 17");
  assertEqual(formatDayLabelToFit(monday, 24), "17");
}

function buildsHourlyTicksWithDayBoundaries(): void {
  const ticks = buildTimeTicks(window, 60);
  assertEqual(ticks.length, 24);
  const first = ticks[0];
  if (!first) {
    throw new Error("Expected a first tick");
  }
  assertEqual(first.isDayStart, true);
  assertEqual(first.label.includes("17"), true);
  const nine = ticks[9];
  if (!nine) {
    throw new Error("Expected a 09:00 tick");
  }
  assertEqual(nine.label, "09:00");
  assertEqual(nine.left, 540);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function numbersIsoWeeks(): void {
  // 2026-08-17 is the Monday of ISO week 34.
  assertEqual(isoWeekNumber(new Date(2026, 7, 17)), 34);
  assertEqual(isoWeekNumber(new Date(2026, 7, 23)), 34);
  // 2026-01-01 is a Thursday, so it anchors W1.
  assertEqual(isoWeekNumber(new Date(2026, 0, 1)), 1);
  // 2027-01-01 is a Friday, so it still belongs to 2026's final week 53.
  assertEqual(isoWeekNumber(new Date(2027, 0, 1)), 53);
  // 2024-12-30 (Monday) opens 2025-W1.
  assertEqual(isoWeekNumber(new Date(2024, 11, 30)), 1);
}

function buildsWeekSpansClippedToTheWindow(): void {
  // August 2026: Sat 1st through Mon 31st spans ISO weeks 31..36.
  const august = {
    end: new Date(2026, 8, 1),
    start: new Date(2026, 7, 1),
  };
  const spans = buildWeekSpans(august, 2.5);
  assertEqual(spans.length, 6);
  assertEqual(spans[0]?.label, "W31");
  assertEqual(spans[5]?.label, "W36");
  // First span covers Sat+Sun only: 48h at 2.5px/h.
  assertEqual(spans[0]?.width, 120);
  // Middle spans are full weeks.
  assertEqual(spans[1]?.width, 7 * 24 * 2.5);
  // Total width equals the window width exactly.
  const total = spans.reduce((sum, span) => sum + span.width, 0);
  assertEqual(total, 31 * 24 * 2.5);
}

convertsDatesToOffsetsAndBack();
snapsToNearestIncrement();
snapsCoarseStepsOnTheLocalClock();
coarsensTheResolutionAsTheZoomWidens();
keepsTheMakersSlotAsTheFinestStep();
usesTheTighterVerticalLimits();
buildsLabelTicksAtTheChosenStep();
fitsTheWindowToTheBoard();
fitsTheDayLabelToItsCell();
buildsHourlyTicksWithDayBoundaries();
numbersIsoWeeks();
buildsWeekSpansClippedToTheWindow();

console.log("timeAxis tests passed");

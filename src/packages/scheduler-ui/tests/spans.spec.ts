import { beginResizeSession, computeDragResult } from "../src/interactions";
import {
  coverageMinutes,
  gapFractions,
  gapsForChange,
  normalizeGaps,
  spanMinutes,
  workSpans,
  workedMinutes,
} from "../src/spans";
import type { SchedulerUiEvent, TimeWindow } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label = ""): void {
  if (actual !== expected) {
    throw new Error(
      `${label} expected ${String(expected)} but received ${String(actual)}`,
    );
  }
}

const at = (hour: number, minute = 0): Date =>
  new Date(2026, 7, 21, hour, minute);

/** The chef: 9-2, off, 5-10. One split shift, not two shifts. */
const splitShift: SchedulerUiEvent = {
  end: at(22),
  gaps: [{ end: at(17), label: "Split", start: at(14) }],
  id: "split",
  resourceId: "r-sam",
  start: at(9),
  status: "assigned",
  title: "Chef split",
};

/** 9-5 with a paid smoko and an unpaid meal break. */
const twoBreaks: SchedulerUiEvent = {
  end: at(17),
  gaps: [
    { end: at(10, 40), label: "Smoko", paid: true, start: at(10, 30) },
    { end: at(13), label: "Meal break", start: at(12, 30) },
  ],
  id: "breaks",
  resourceId: "r-alex",
  start: at(9),
  status: "assigned",
  title: "Kitchen",
};

function splitIsOneShiftWithTwoWorkSpans(): void {
  const spans = workSpans(splitShift);
  assertEqual(spans.length, 2, "two work spans");
  assertEqual(spans[0]?.start.getHours(), 9);
  assertEqual(spans[0]?.end.getHours(), 14);
  assertEqual(spans[1]?.start.getHours(), 17);
  assertEqual(spans[1]?.end.getHours(), 22);
}

function threeMeasuresDisagreeOnPurpose(): void {
  // The whole point: "do breaks count?" has three right answers.
  assertEqual(spanMinutes(splitShift), 13 * 60, "span of hours 9-10pm");
  assertEqual(workedMinutes(splitShift), 10 * 60, "worked excludes the split");
  assertEqual(coverageMinutes(splitShift), 10 * 60, "coverage excludes it too");

  // 8h envelope, 10m paid smoko, 30m unpaid meal.
  assertEqual(spanMinutes(twoBreaks), 8 * 60);
  assertEqual(workedMinutes(twoBreaks), 8 * 60 - 30, "paid smoko is worked");
  assertEqual(
    coverageMinutes(twoBreaks),
    8 * 60 - 40,
    "coverage loses the paid smoko too",
  );
}

function toleratesMessyHostData(): void {
  const messy: SchedulerUiEvent = {
    ...splitShift,
    gaps: [
      { end: at(17), start: at(14) },
      { end: at(9), start: at(8) }, // entirely before the envelope
      { end: at(12), start: at(12) }, // zero length
      { end: at(25), start: at(21) }, // overruns the envelope
    ],
  };
  const gaps = normalizeGaps(messy);
  assertEqual(gaps.length, 2, "dropped the empty and out-of-range rows");
  assertEqual(gaps[0]?.start.getHours(), 14, "sorted by start");
  assertEqual(gaps[1]?.end.getHours(), 22, "clipped to the envelope");
}

function fractionsArePositionsWithinTheBar(): void {
  const [fraction] = gapFractions(splitShift);
  // 9-10pm envelope: the split starts 5/13 in and ends 8/13 in.
  assertEqual(Math.round((fraction?.startFraction ?? 0) * 1000), 385);
  assertEqual(Math.round((fraction?.endFraction ?? 0) * 1000), 615);
  assertEqual(gapFractions({ ...splitShift, gaps: undefined }).length, 0);
}

function resizeCannotSwallowAGap(): void {
  const window: TimeWindow = { end: at(23), start: at(6) };
  const geometry = { pxPerHour: 60, snapMinutes: 15, window };
  const resizeEnd = beginResizeSession(splitShift, "end");

  // Drag the end back to 11am - past the whole split gap.
  const swallowed = computeDragResult(
    resizeEnd,
    { left: (11 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  assertEqual(swallowed?.end.getHours(), 17, "clamped to the gap end");

  // Dragging to 8pm is inside the last span and passes through.
  const allowed = computeDragResult(
    resizeEnd,
    { left: (20 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  assertEqual(allowed?.end.getHours(), 20, "ordinary resize still works");

  // Same from the left edge.
  const resizeStart = beginResizeSession(splitShift, "start");
  const swallowedStart = computeDragResult(
    resizeStart,
    { left: (19 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  assertEqual(swallowedStart?.start.getHours(), 14, "clamped to the gap start");
}

function movingAShiftTakesItsBreaksWithIt(): void {
  // Matt caught this on the board: dragging the split left the break
  // behind at the old clock time.
  const movedAnHourLater = gapsForChange(splitShift, {
    end: at(23),
    resourceId: "r-sam",
    start: at(10),
  });
  assertEqual(movedAnHourLater?.[0]?.start.getHours(), 15, "gap moved too");
  assertEqual(movedAnHourLater?.[0]?.end.getHours(), 18);

  // Reassigning without moving in time leaves them alone.
  const reassigned = gapsForChange(splitShift, {
    end: at(22),
    resourceId: "r-priya",
    start: at(9),
  });
  assertEqual(reassigned?.[0]?.start.getHours(), 14, "no time change, no move");

  // A resize changes duration, so gaps stay where they are.
  const resized = gapsForChange(splitShift, {
    end: at(21),
    resourceId: "r-sam",
    start: at(9),
  });
  assertEqual(resized?.[0]?.start.getHours(), 14, "resize leaves gaps put");
}

function shiftsWithoutGapsAreUnchanged(): void {
  const plain: SchedulerUiEvent = { ...splitShift, gaps: undefined };
  assertEqual(workSpans(plain).length, 1);
  assertEqual(workedMinutes(plain), 13 * 60);
  assertEqual(coverageMinutes(plain), 13 * 60);
  assertEqual(spanMinutes(plain), 13 * 60);
}

splitIsOneShiftWithTwoWorkSpans();
threeMeasuresDisagreeOnPurpose();
toleratesMessyHostData();
fractionsArePositionsWithinTheBar();
resizeCannotSwallowAGap();
movingAShiftTakesItsBreaksWithIt();
shiftsWithoutGapsAreUnchanged();

console.log("spans tests passed");

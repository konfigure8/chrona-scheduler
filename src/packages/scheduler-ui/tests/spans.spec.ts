import { beginResizeSession, computeDragResult } from "../src/interactions";
import {
  alignGaps,
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

/**
 * A long gap: 9-2, three hours off, 5-10, in one shift. A rostered
 * split is two linked shifts (F48 Split shifts); the arithmetic here
 * holds for any gap.
 */
const longGap: SchedulerUiEvent = {
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

function gapsCutAShiftIntoWorkSpans(): void {
  const spans = workSpans(longGap);
  assertEqual(spans.length, 2, "two work spans");
  assertEqual(spans[0]?.start.getHours(), 9);
  assertEqual(spans[0]?.end.getHours(), 14);
  assertEqual(spans[1]?.start.getHours(), 17);
  assertEqual(spans[1]?.end.getHours(), 22);
}

function threeMeasuresAnswerDoBreaksCount(): void {
  // The whole point: "do breaks count?" has three right answers.
  assertEqual(spanMinutes(longGap), 13 * 60, "span of hours 9-10pm");
  assertEqual(workedMinutes(longGap), 10 * 60, "worked excludes the unpaid gap");
  assertEqual(coverageMinutes(longGap), 13 * 60, "cover counts the whole shift");

  // 8h envelope, 10m paid smoko, 30m unpaid meal.
  assertEqual(spanMinutes(twoBreaks), 8 * 60);
  assertEqual(workedMinutes(twoBreaks), 8 * 60 - 30, "paid smoko is worked");
  // People take breaks in turn: a break leaves no hole in cover.
  assertEqual(coverageMinutes(twoBreaks), 8 * 60, "breaks still count as cover");
}

function toleratesMessyHostData(): void {
  const messy: SchedulerUiEvent = {
    ...longGap,
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
  const [fraction] = gapFractions(longGap);
  // 9-10pm envelope: the split starts 5/13 in and ends 8/13 in.
  assertEqual(Math.round((fraction?.startFraction ?? 0) * 1000), 385);
  assertEqual(Math.round((fraction?.endFraction ?? 0) * 1000), 615);
  assertEqual(gapFractions({ ...longGap, gaps: undefined }).length, 0);
}

function resizeCannotSwallowAGap(): void {
  const window: TimeWindow = { end: at(23), start: at(6) };
  const geometry = { pxPerHour: 60, snapMinutes: 15, window };
  const resizeEnd = beginResizeSession(longGap, "end");

  // Drag the end back to 11am - past the whole split gap.
  const swallowed = computeDragResult(
    resizeEnd,
    { left: (11 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  // It stops a slot past the gap, so the gap stays inside the shift.
  assertEqual(swallowed?.end.getHours(), 17, "clamped past the gap end");
  assertEqual(swallowed?.end.getMinutes(), 15);

  // Dragging to 8pm is inside the last span and passes through.
  const allowed = computeDragResult(
    resizeEnd,
    { left: (20 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  assertEqual(allowed?.end.getHours(), 20, "ordinary resize still works");

  // Same from the left edge.
  const resizeStart = beginResizeSession(longGap, "start");
  const swallowedStart = computeDragResult(
    resizeStart,
    { left: (19 - 6) * 60, resourceId: "r-sam" },
    geometry,
  );
  assertEqual(swallowedStart?.start.getHours(), 13, "clamped before the gap start");
  assertEqual(swallowedStart?.start.getMinutes(), 45);
}

function movingAShiftTakesItsBreaksWithIt(): void {
  // Matt caught this on the board: dragging the split left the break
  // behind at the old clock time.
  const movedAnHourLater = gapsForChange(longGap, {
    end: at(23),
    resourceId: "r-sam",
    start: at(10),
  });
  assertEqual(movedAnHourLater?.[0]?.start.getHours(), 15, "gap moved too");
  assertEqual(movedAnHourLater?.[0]?.end.getHours(), 18);

  // Reassigning without moving in time leaves them alone.
  const reassigned = gapsForChange(longGap, {
    end: at(22),
    resourceId: "r-priya",
    start: at(9),
  });
  assertEqual(reassigned?.[0]?.start.getHours(), 14, "no time change, no move");

  // A resize changes duration, so gaps stay where they are.
  const resized = gapsForChange(longGap, {
    end: at(21),
    resourceId: "r-sam",
    start: at(9),
  });
  assertEqual(resized?.[0]?.start.getHours(), 14, "resize leaves gaps put");
}

function breaksFollowTheServersRule(): void {
  // F48 Split shifts: the rule the server applies on every save.
  const from = { end: at(17), start: at(9) };
  // Moved and lengthened: the breaks move with the start.
  const movedLonger = alignGaps(twoBreaks.gaps, from, { end: at(20), start: at(11) });
  assertEqual(movedLonger?.[1]?.start.getHours(), 14, "meal moved two hours");
  // An earlier start keeps them in place.
  const earlier = alignGaps(twoBreaks.gaps, from, { end: at(17), start: at(7) });
  assertEqual(earlier?.[0]?.start.getMinutes(), 30, "smoko stays at 10:30");
  // A start after the smoko drops it; the meal break stays.
  const later = alignGaps(twoBreaks.gaps, from, { end: at(17), start: at(11) });
  assertEqual(later?.length, 1, "smoko dropped");
  assertEqual(later?.[0]?.label, "Meal break");
  // A break that would touch an end is dropped too.
  const earlyFinish = alignGaps(twoBreaks.gaps, from, { end: at(13), start: at(9) });
  assertEqual(earlyFinish?.length, 1, "meal break touching the end dropped");
  // No change, or no gaps: given back as they are.
  assertEqual(alignGaps(twoBreaks.gaps, from, from), twoBreaks.gaps);
  assertEqual(alignGaps(undefined, from, { end: at(18), start: at(10) }), undefined);
}

function shiftsWithoutGapsAreUnchanged(): void {
  const plain: SchedulerUiEvent = { ...longGap, gaps: undefined };
  assertEqual(workSpans(plain).length, 1);
  assertEqual(workedMinutes(plain), 13 * 60);
  assertEqual(coverageMinutes(plain), 13 * 60);
  assertEqual(spanMinutes(plain), 13 * 60);
}

gapsCutAShiftIntoWorkSpans();
threeMeasuresAnswerDoBreaksCount();
toleratesMessyHostData();
fractionsArePositionsWithinTheBar();
resizeCannotSwallowAGap();
movingAShiftTakesItsBreaksWithIt();
breaksFollowTheServersRule();
shiftsWithoutGapsAreUnchanged();

console.log("spans tests passed");

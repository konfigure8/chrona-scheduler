import {
  formatWindowLabel,
  isSameDay,
  resolveEventColor,
  resolveInitialScrollHour,
  resolveTimeScaleOptions,
  resolveVerticalHourRange,
  resolveWindowForScale,
  startOfWeek,
  stepAnchor,
  weekStartFrom,
  zoomForInterval,
} from "../src/viewConfig";
import type { SchedulerUiEvent } from "../src/types";

function resolvesDayAndDaySpanWindows(): void {
  const anchor = new Date(2026, 7, 19, 14, 30);
  const day = resolveWindowForScale(anchor, {
    representation: "timeline",
    timeScale: "day",
  });
  assertEqual(day.start.getDate(), 19);
  assertEqual(day.start.getHours(), 0);
  assertEqual(day.end.getDate(), 20);

  const span = resolveWindowForScale(anchor, {
    daySpanDays: 5,
    representation: "timeline",
    timeScale: "daySpan",
  });
  assertEqual(span.end.getDate(), 24);
}

function resolvesWeekWindowStartingMonday(): void {
  // 2026-08-19 is a Wednesday; the week starts Monday 2026-08-17.
  const window = resolveWindowForScale(new Date(2026, 7, 19), {
    representation: "timeline",
    timeScale: "week",
  });
  assertEqual(window.start.getDate(), 17);
  assertEqual(window.start.getDay(), 1);
  assertEqual(window.end.getDate(), 24);
  assertEqual(stepAnchor(new Date(2026, 7, 19), "week", 1).getDate(), 26);
}

function resolvesMonthWindow(): void {
  const window = resolveWindowForScale(new Date(2026, 7, 19), {
    representation: "month",
    timeScale: "month",
  });
  assertEqual(window.start.getDate(), 1);
  assertEqual(window.start.getMonth(), 7);
  assertEqual(window.end.getMonth(), 8);
}

function resolvesColorsByStatusAndFieldRules(): void {
  const event: SchedulerUiEvent = {
    end: new Date(2026, 7, 17, 14, 0),
    fields: [{ label: "Role", value: "Supervisor" }],
    id: "e-1",
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 6, 0),
    status: "assigned",
    title: "Shift",
  };

  assertEqual(
    resolveEventColor(event, [
      { color: "#123456", field: "Role", value: "Supervisor" },
    ]),
    "#123456",
  );
  assertEqual(
    resolveEventColor(event, [{ color: "#abcdef", value: "assigned" }]),
    "#abcdef",
  );
  assertEqual(
    resolveEventColor(event, [{ color: "#ff0000", value: "needsCover" }]),
    undefined,
  );
  assertEqual(
    resolveEventColor({ ...event, color: "#explicit" }, [
      { color: "#123456", field: "Role", value: "Supervisor" },
    ]),
    "#explicit",
  );
}

function resolvesVerticalHourRangeFromEvents(): void {
  const buildEvent = (startHour: number, endHour: number): SchedulerUiEvent => ({
    end: new Date(2026, 7, 17, endHour, 0),
    id: `e-${startHour}`,
    resourceId: "r-1",
    start: new Date(2026, 7, 17, startHour, 0),
    status: "assigned",
    title: "Shift",
  });

  const range = resolveVerticalHourRange([
    buildEvent(6, 14),
    buildEvent(13, 21),
  ]);
  assertEqual(range.startHour, 5);
  assertEqual(range.endHour, 22);

  const empty = resolveVerticalHourRange([]);
  assertEqual(empty.startHour, 6);
  assertEqual(empty.endHour, 22);

  const overnight = resolveVerticalHourRange([
    {
      ...buildEvent(22, 23),
      end: new Date(2026, 7, 18, 6, 0),
    },
  ]);
  assertEqual(overnight.endHour, 24);
  assertEqual(overnight.startHour, 21);

  const early = resolveVerticalHourRange([buildEvent(0, 4)]);
  assertEqual(early.startHour, 0);
  assertEqual(early.endHour, 5);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function stepsAnchorsPerInterval(): void {
  const monday = new Date(2026, 7, 17);
  assertEqual(stepAnchor(monday, "day", 1).getDate(), 18);
  assertEqual(stepAnchor(monday, "day", -1).getDate(), 16);
  assertEqual(stepAnchor(monday, "week", 1).getDate(), 24);
  assertEqual(stepAnchor(monday, "daySpan", 1, 3).getDate(), 20);
  assertEqual(stepAnchor(monday, "daySpan", -1, 3).getDate(), 14);
  const nextMonth = stepAnchor(monday, "month", 1);
  assertEqual(nextMonth.getMonth(), 8);
  const december = stepAnchor(new Date(2026, 11, 15), "month", 1);
  assertEqual(december.getFullYear(), 2027);
  assertEqual(december.getMonth(), 0);
}

function formatsWindowLabels(): void {
  assertEqual(
    formatWindowLabel(
      { end: new Date(2026, 7, 20), start: new Date(2026, 7, 17) },
      "daySpan",
    ),
    "Mon 17 Aug - Wed 19 Aug 2026",
  );
  assertEqual(
    formatWindowLabel(
      { end: new Date(2026, 7, 18), start: new Date(2026, 7, 17) },
      "day",
    ),
    "Mon 17 Aug 2026",
  );
  assertEqual(
    formatWindowLabel(
      { end: new Date(2026, 8, 1), start: new Date(2026, 7, 1) },
      "month",
    ),
    "August 2026",
  );
}

function resolvesInitialScrollHour(): void {
  const window = {
    end: new Date(2026, 7, 24),
    start: new Date(2026, 7, 17),
  };
  const buildEvent = (
    id: string,
    start: Date,
    end: Date,
  ): SchedulerUiEvent => ({
    end,
    id,
    resourceId: "r-1",
    start,
    status: "assigned",
    title: "Shift",
  });

  // Explicit host hour wins and is clamped to a valid hour of day.
  assertEqual(resolveInitialScrollHour([], window, 6), 6);
  assertEqual(resolveInitialScrollHour([], window, -2), 0);
  assertEqual(resolveInitialScrollHour([], window, 30), 23);

  // Derived: one hour before the earliest event inside the window.
  const events = [
    buildEvent(
      "outside",
      new Date(2026, 7, 10, 5, 0),
      new Date(2026, 7, 10, 9, 0),
    ),
    buildEvent(
      "inside",
      new Date(2026, 7, 18, 9, 0),
      new Date(2026, 7, 18, 17, 0),
    ),
  ];
  assertEqual(resolveInitialScrollHour(events, window), 8);

  // Empty window falls back to the 08:00 business default.
  assertEqual(resolveInitialScrollHour([], window), 8);

  // An event starting at midnight cannot scroll to a negative hour.
  assertEqual(
    resolveInitialScrollHour(
      [
        buildEvent(
          "midnight",
          new Date(2026, 7, 18, 0, 0),
          new Date(2026, 7, 18, 4, 0),
        ),
      ],
      window,
    ),
    0,
  );
}

function comparesSameDay(): void {
  assertEqual(
    isSameDay(new Date(2026, 7, 17, 0, 0), new Date(2026, 7, 17, 23, 59)),
    true,
  );
  assertEqual(isSameDay(new Date(2026, 7, 17), new Date(2026, 7, 18)), false);
  assertEqual(isSameDay(new Date(2026, 7, 17), new Date(2027, 7, 17)), false);
}

function resolvesTimeScalePerRepresentationAndWindow(): void {
  // Vertical views offer full Teams parity.
  const week = resolveTimeScaleOptions("week", 7, undefined, 15);
  assertEqual(week.visible, true);
  assertEqual(week.effective, 15);
  assertEqual(week.options.length, 6);
  assertEqual(
    week.options.every((option) => option.enabled),
    true,
  );

  // Long timeline spans clamp to hourly, but the request survives.
  const month = resolveTimeScaleOptions("timeline", 31, undefined, 5);
  assertEqual(month.effective, 60);
  assertEqual(
    month.options.filter((option) => option.enabled).length,
    1,
  );
  // Back on an hourly span the same request resolves again.
  const backToWeek = resolveTimeScaleOptions("timeline", 7, undefined, 5);
  assertEqual(backToWeek.effective, 5);

  // Day-cell views have no menu at all.
  assertEqual(resolveTimeScaleOptions("roster", 7, undefined, 15).visible, false);
  assertEqual(resolveTimeScaleOptions("month", 31, undefined, 15).visible, false);
  assertEqual(resolveTimeScaleOptions("agenda", 3, undefined, 15).visible, false);
}

function respectsMakerPolicy(): void {
  // minSlotMinutes disables finer options and clamps the request coarser.
  const limited = resolveTimeScaleOptions(
    "week",
    7,
    { minSlotMinutes: 15 },
    5,
  );
  assertEqual(limited.effective, 15);
  assertEqual(
    limited.options.filter((option) => option.enabled).length,
    3,
  );

  // The lock hides the menu but the clamped default still applies.
  const locked = resolveTimeScaleOptions(
    "week",
    7,
    { allowUserTimeScale: false },
    30,
  );
  assertEqual(locked.visible, false);
  assertEqual(locked.effective, 30);

  // Nonsense maker input cannot disable the 60-minute floor.
  const absurd = resolveTimeScaleOptions(
    "week",
    7,
    { minSlotMinutes: 999 },
    5,
  );
  assertEqual(absurd.effective, 60);
}

stepsAnchorsPerInterval();
formatsWindowLabels();
resolvesVerticalHourRangeFromEvents();
resolvesDayAndDaySpanWindows();
resolvesWeekWindowStartingMonday();
resolvesMonthWindow();
resolvesColorsByStatusAndFieldRules();
resolvesInitialScrollHour();
comparesSameDay();
resolvesTimeScalePerRepresentationAndWindow();
respectsMakerPolicy();

// Ruled 2026-09-26: Day opens at the day zoom, the rest fitted, until the planner zooms that interval.
{
  const fresh = zoomForInterval("week", undefined, 60);
  assertEqual(fresh.fitToWidth, true);
  assertEqual(zoomForInterval("month", {}, 60).fitToWidth, true);
  assertEqual(zoomForInterval("daySpan", {}, 60).fitToWidth, true);
  const day = zoomForInterval("day", {}, 45);
  assertEqual(day.fitToWidth, false);
  assertEqual(day.pxPerHour, 45);
  const chosen = zoomForInterval("week", { day: 90, week: 14 }, 60);
  assertEqual(chosen.fitToWidth, false);
  assertEqual(chosen.pxPerHour, 14);
  assertEqual(zoomForInterval("month", { week: 14 }, 60).fitToWidth, true);
}

// The week starts on the user's first day: Monday by default, Sunday
// or Saturday where the Power Apps regional setting says so.
{
  const wednesday = new Date(2026, 7, 19, 14, 30);
  const week = (weekStartsOn?: number) =>
    resolveWindowForScale(wednesday, { representation: "timeline", timeScale: "week", weekStartsOn });
  assertEqual(week().start.getTime(), new Date(2026, 7, 17).getTime());
  assertEqual(week(1).start.getTime(), new Date(2026, 7, 17).getTime());
  assertEqual(week(0).start.getTime(), new Date(2026, 7, 16).getTime());
  assertEqual(week(0).end.getTime(), new Date(2026, 7, 23).getTime());
  assertEqual(week(6).start.getTime(), new Date(2026, 7, 15).getTime());
  // A Sunday is the first day of its own week when the week starts on Sunday.
  assertEqual(startOfWeek(new Date(2026, 7, 16, 9), 0).getTime(), new Date(2026, 7, 16).getTime());
  assertEqual(startOfWeek(new Date(2026, 7, 16, 9), 1).getTime(), new Date(2026, 7, 10).getTime());
  // Anything but 0 to 6 means Monday.
  assertEqual(weekStartFrom(0), 0);
  assertEqual(weekStartFrom(6), 6);
  assertEqual(weekStartFrom(undefined), 1);
  assertEqual(weekStartFrom(7), 1);
  assertEqual(weekStartFrom(Number.NaN), 1);
  assertEqual(weekStartFrom("0"), 1);
}

console.log("viewConfig tests passed");

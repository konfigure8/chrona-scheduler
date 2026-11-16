import {
  buildRosterDays,
  layoutOpenRow,
  layoutRoster,
  moveRosterFocus,
  rosterCellTarget,
  rosterGroupRows,
  rosterMarkPlacement,
} from "../src/rosterLayout";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "../src/types";

const window: TimeWindow = {
  end: new Date(2026, 7, 20, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

const resources: readonly SchedulerResource[] = [
  { id: "r-1", name: "Alex Chen" },
  { id: "r-2", name: "Riley Patel" },
];

function buildEvent(
  id: string,
  resourceId: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17 + dayOffset, endHour, 0),
    id,
    resourceId,
    start: new Date(2026, 7, 17 + dayOffset, startHour, 0),
    status: "assigned",
    title: id,
  };
}

function buildsOneColumnPerDay(): void {
  const days = buildRosterDays(window);
  assertEqual(days.length, 3);
  assertEqual(days[0]?.label.includes("17"), true);
  assertEqual(days[2]?.label.includes("19"), true);
  // The Roster grid header's two lines, and the weekend flag.
  assertEqual(days[0]?.weekday, "Mon");
  assertEqual(days[0]?.date, "17 Aug");
  assertEqual(days[0]?.weekend, false);
  const weekend = buildRosterDays({ end: new Date(2026, 7, 24), start: new Date(2026, 7, 22) });
  assertEqual(weekend.map((day) => day.weekend).join(), "true,true");
}

function groupsEventsIntoResourceDayCells(): void {
  const days = buildRosterDays(window);
  const rows = layoutRoster(
    resources,
    [
      buildEvent("a", "r-1", 0, 6, 14),
      buildEvent("b", "r-1", 0, 15, 22),
      buildEvent("c", "r-1", 2, 6, 14),
      buildEvent("d", "r-2", 1, 9, 17),
    ],
    days,
  );

  assertEqual(rows[0]?.cells[0]?.length, 2);
  assertEqual(rows[0]?.cells[0]?.[0]?.id, "a");
  assertEqual(rows[0]?.cells[1]?.length, 0);
  assertEqual(rows[0]?.cells[2]?.[0]?.id, "c");
  assertEqual(rows[1]?.cells[1]?.[0]?.id, "d");
}

// A night shift shows once, on the day it starts; an item longer than
// 24 hours shows on every day it covers.
function showsANightShiftOnItsStartDayOnly(): void {
  const days = buildRosterDays(window);
  const overnight: SchedulerUiEvent = {
    end: new Date(2026, 7, 18, 6, 0),
    id: "overnight",
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 22, 0),
    status: "assigned",
    title: "Night shift",
  };

  const rows = layoutRoster(resources, [overnight], days);
  assertEqual(rows[0]?.cells[0]?.length, 1);
  assertEqual(rows[0]?.cells[1]?.length, 0);
  assertEqual(rows[0]?.cells[2]?.length, 0);

  // A two-day job shows on each of the days it covers.
  const job: SchedulerUiEvent = {
    ...overnight,
    end: new Date(2026, 7, 19, 12, 0),
    id: "job",
    title: "Site install",
  };
  const spanning = layoutRoster(resources, [job], days);
  assertEqual(spanning[0]?.cells[0]?.length, 1);
  assertEqual(spanning[0]?.cells[1]?.length, 1);
  assertEqual(spanning[0]?.cells[2]?.length, 1);
}

// The open-shifts row: open shifts by day, whoever they belong to.
function laysOutTheOpenRowByStartDay(): void {
  const days = buildRosterDays(window);
  const open = (id: string, day: number, hour: number): SchedulerUiEvent => ({
    end: new Date(2026, 7, 17 + day, hour + 6, 0),
    id,
    resourceId: "chrona-unassigned",
    start: new Date(2026, 7, 17 + day, hour, 0),
    status: "needsCover",
    title: id,
  });
  const cells = layoutOpenRow([open("late", 0, 16), open("early", 0, 6), open("tue", 1, 9)], days);
  assertEqual(cells[0]?.map((event) => event.id).join(), "early,late");
  assertEqual(cells[1]?.length, 1);
  assertEqual(cells[2]?.length, 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

// A host's day mark (RosterExtension.dayMarks) sits at its time of day across the cell; outside the day it is clipped, empty it is not drawn.
function placesAHostsDayMarkAcrossTheCell(): void {
  assertEqual(rosterMarkPlacement({ from: 0, to: 16 / 24 })?.left, "0%");
  assertEqual(rosterMarkPlacement({ from: 0, to: 16 / 24 })?.width, "66.67%");
  assertEqual(rosterMarkPlacement({ from: 22 / 24, to: 1 })?.left, "91.67%");
  assertEqual(rosterMarkPlacement({ from: 0.5, to: 1.5 })?.width, "50%");
  assertEqual(rosterMarkPlacement({ from: -0.25, to: 0.25 })?.left, "0%");
  assertEqual(rosterMarkPlacement({ from: 0.5, to: 0.5 }), undefined);
  assertEqual(rosterMarkPlacement({ from: 1, to: 2 }), undefined);
}

// A host's group heading (RosterExtension.groups): collapsed shows the heading and the footer only.
function drawsACollapsedGroupAsItsHeadingAndSummary(): void {
  const open = rosterGroupRows({ footer: {} }, true);
  assertEqual(open.open && open.people && open.footer, true);
  const collapsed = rosterGroupRows({ collapsed: true, footer: {} }, true);
  assertEqual(collapsed.open || collapsed.people, false);
  assertEqual(collapsed.footer, true);
  // A heading over subgroups, with nobody of its own: the heading alone.
  const heading = rosterGroupRows({ collapsed: true }, true);
  assertEqual(heading.open || heading.people || heading.footer, false);
  // A grid with no open row never draws one.
  assertEqual(rosterGroupRows({}, false).open, false);
}

// A day cell made into a new item: the extension's form gets the day with no times, the row's person and band.
function makesAnItemFromADayCell(): void {
  const day = buildRosterDays(window, true)[1]!;
  const alex = resources[0]!;
  const band = { Team: "Ward A", Subteam: "Nights" };
  const own = rosterCellTarget({ day, groups: band, resource: alex }, true, "open");
  if (!own || !("request" in own)) throw new Error("With createEvent a day cell hands the extension a request");
  assertEqual(own.request.dayOnly, true);
  assertEqual(own.request.resource, alex);
  assertEqual(own.request.start.getTime(), new Date(2026, 7, 18).getTime());
  assertEqual(own.request.end.getTime(), new Date(2026, 7, 19).getTime());
  assertEqual(JSON.stringify(own.request.groups), JSON.stringify(band));
  // A band grouped by a tag (a role) passes its tags, so the new item lands in that band; none, or empty, passes none.
  const roleBand = rosterCellTarget({ day, requiredTags: ["Nurse"], resource: alex }, true, "open");
  assertEqual(roleBand && "request" in roleBand ? JSON.stringify(roleBand.request.requiredTags) : "", JSON.stringify(["Nurse"]));
  const noTags = rosterCellTarget({ day, requiredTags: [], resource: alex }, true, "open");
  assertEqual(noTags && "request" in noTags ? "requiredTags" in noTags.request : true, false);
  // An open row is nobody: no person, its own band.
  const open = rosterCellTarget({ day, groups: { Team: "Ward A" } }, true, "open");
  if (!open || !("request" in open)) throw new Error("An open row's cell hands the extension a request");
  assertEqual(open.request.resource, undefined);
  assertEqual(JSON.stringify(open.request.groups), JSON.stringify({ Team: "Ward A" }));
  // No band, or an empty one: no groups.
  const flat = rosterCellTarget({ day, groups: {}, resource: alex }, true, "open");
  assertEqual(flat && "request" in flat ? "groups" in flat.request : true, false);
  // The free board (no extension's form): its own dialog gets the cell's range on the row's person, as a drawn range.
  const board = rosterCellTarget({ day, groups: band, resource: alex }, false, "open");
  if (!board || !("range" in board)) throw new Error("Without createEvent the board's own dialog gets the cell's range");
  assertEqual(board.range.resourceId, "r-1");
  assertEqual(board.range.start.getTime(), day.start.getTime());
  assertEqual(board.range.end.getTime(), day.end.getTime());
  // The open row on the free board: the host's nobody, or nothing at all when it has none.
  const nobody = rosterCellTarget({ day }, false, "open");
  assertEqual(nobody && "range" in nobody ? nobody.range.resourceId : undefined, "open");
  assertEqual(rosterCellTarget({ day }, false, undefined), undefined);
}

// No request or range ever carries a time it cannot read (AGENTS.md 0.1): a day whose bounds are not real times makes nothing.
function makesNothingFromADayItCannotRead(): void {
  const day = buildRosterDays(window, true)[0]!;
  const broken = { ...day, start: new Date(Number.NaN) };
  assertEqual(rosterCellTarget({ day: broken, resource: resources[0]! }, true, "open"), undefined);
  assertEqual(rosterCellTarget({ day: broken, resource: resources[0]! }, false, "open"), undefined);
  assertEqual(rosterCellTarget({ day: { ...day, end: new Date(Number.NaN) } }, true, "open"), undefined);
  assertEqual(rosterCellTarget({ day: { ...day, end: day.start } }, true, "open"), undefined);
  for (const target of [rosterCellTarget({ day }, true, "open"), rosterCellTarget({ day }, false, "open")]) {
    const times = target && "request" in target ? target.request : target?.range;
    assertEqual(Number.isNaN(times?.start.getTime() ?? Number.NaN) || Number.isNaN(times?.end.getTime() ?? Number.NaN), false);
  }
}

// The keyboard grid: the arrow keys walk the cells, Down and Up go through a cell's shifts, Home and End along the row.
function movesTheKeyboardFocusThroughTheGrid(): void {
  // Three rows of three days: the open row has two shifts on day 1, the second row one on day 1.
  const chips = [
    [0, 2, 0],
    [0, 1, 0],
    [0, 0, 0],
  ];
  const at = (row: number, col: number, chip?: number): string => JSON.stringify(chip === undefined ? { col, row } : { chip, col, row });
  const move = (from: { row: number; col: number; chip?: number }, key: string, ctrlKey = false): string =>
    JSON.stringify(moveRosterFocus(from, { ctrlKey, key }, chips));
  assertEqual(move({ col: 0, row: 0 }, "ArrowRight"), at(0, 1));
  assertEqual(move({ col: 1, row: 0 }, "ArrowLeft"), at(0, 0));
  // The edges move nothing.
  assertEqual(moveRosterFocus({ col: 0, row: 0 }, { key: "ArrowLeft" }, chips), undefined);
  assertEqual(moveRosterFocus({ col: 2, row: 0 }, { key: "ArrowRight" }, chips), undefined);
  assertEqual(moveRosterFocus({ col: 0, row: 0 }, { key: "ArrowUp" }, chips), undefined);
  assertEqual(moveRosterFocus({ col: 0, row: 2 }, { key: "ArrowDown" }, chips), undefined);
  // Down: the cell, its shifts top to bottom, then the cell below; from the last shift to the cell below.
  assertEqual(move({ col: 1, row: 0 }, "ArrowDown"), at(0, 1, 0));
  assertEqual(move({ chip: 0, col: 1, row: 0 }, "ArrowDown"), at(0, 1, 1));
  assertEqual(move({ chip: 1, col: 1, row: 0 }, "ArrowDown"), at(1, 1));
  // An empty cell goes straight to the cell below.
  assertEqual(move({ col: 0, row: 0 }, "ArrowDown"), at(1, 0));
  // Up: back the same way, from a cell to the last shift of the cell above.
  assertEqual(move({ col: 1, row: 1 }, "ArrowUp"), at(0, 1, 1));
  assertEqual(move({ chip: 1, col: 1, row: 0 }, "ArrowUp"), at(0, 1, 0));
  assertEqual(move({ chip: 0, col: 1, row: 0 }, "ArrowUp"), at(0, 1));
  assertEqual(move({ col: 0, row: 1 }, "ArrowUp"), at(0, 0));
  // Left and Right from a shift go to the next day's cell, not its shifts.
  assertEqual(move({ chip: 0, col: 1, row: 1 }, "ArrowRight"), at(1, 2));
  // Home and End along the row; with Ctrl, the grid's first and last cell.
  assertEqual(move({ chip: 0, col: 1, row: 1 }, "Home"), at(1, 0));
  assertEqual(move({ col: 0, row: 1 }, "End"), at(1, 2));
  assertEqual(move({ col: 1, row: 1 }, "Home", true), at(0, 0));
  assertEqual(move({ col: 1, row: 0 }, "End", true), at(2, 2));
  // Other keys move nothing; an empty grid has nowhere to go.
  assertEqual(moveRosterFocus({ col: 0, row: 0 }, { key: "Enter" }, chips), undefined);
  assertEqual(moveRosterFocus({ col: 0, row: 0 }, { key: "ArrowDown" }, []), undefined);
}

buildsOneColumnPerDay();
makesAnItemFromADayCell();
makesNothingFromADayItCannotRead();
movesTheKeyboardFocusThroughTheGrid();
drawsACollapsedGroupAsItsHeadingAndSummary();
placesAHostsDayMarkAcrossTheCell();
groupsEventsIntoResourceDayCells();
showsANightShiftOnItsStartDayOnly();
laysOutTheOpenRowByStartDay();

console.log("rosterLayout tests passed");

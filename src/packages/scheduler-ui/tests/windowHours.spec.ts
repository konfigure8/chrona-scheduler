import * as assert from "node:assert/strict";

import { problemFromSchedule } from "../src/schedulingContract";
import { maxHoursPerWindow, windowWeeks } from "../src/windowHours";

/*
 * The maximum-hours bound (design CQ3-1): one helper for the solve
 * request and the board's check, so both read the same limit.
 */
const week = { end: new Date(2026, 6, 13), start: new Date(2026, 6, 6) };
const fortnight = { end: new Date(2026, 6, 20), start: new Date(2026, 6, 6) };
const fourDays = { end: new Date(2026, 6, 10), start: new Date(2026, 6, 6) };

assert.equal(windowWeeks(week), 1);
assert.equal(windowWeeks(fortnight), 2);
// Shorter than a week is still one week, as the solve has always counted it.
assert.equal(windowWeeks(fourDays), 1);
assert.equal(maxHoursPerWindow(38, fortnight), 76);
assert.equal(maxHoursPerWindow(37.5, week), 37.5);

// problemFromSchedule sends the same bound.
const problem = problemFromSchedule({
  events: [],
  resources: [{ capacityHours: 38, id: "r-1", name: "Casey" }],
  window: fortnight,
});
assert.equal(problem.resources[0]?.contract?.maxHoursPerWindow, maxHoursPerWindow(38, fortnight));

console.log("windowHours tests passed");

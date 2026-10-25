import * as assert from "node:assert/strict";

import { formatClock, formatClockRange } from "../src/clock";
import { chipCode, chipStartTime, formatHours } from "../src/compactChip";

// The Code binding wins; without it, the title's initials.
{
  assert.equal(chipCode({ code: " ND ", title: "Night duty" }), "ND");
  assert.equal(chipCode({ title: "Kitchen prep" }), "KP");
  assert.equal(chipCode({ title: "late shift close" }), "LS");
  assert.equal(chipCode({ title: "Bakery" }), "BA");
  assert.equal(chipCode({ code: "", title: "Floor open" }), "FO");
  assert.equal(chipCode({ title: "(Bar) - close" }), "BC");
  assert.equal(chipCode({ title: "  " }), "");
  assert.equal(chipCode({ title: "\u00e9quipe nuit" }), "\u00c9N");
}

// The start time follows the board's hour format.
{
  const at = (hours: number, minutes: number): Date =>
    new Date(2026, 9, 5, hours, minutes);
  assert.equal(chipStartTime(at(7, 0)), "07", "on the hour, the hour alone");
  assert.equal(chipStartTime(at(22, 45), "24"), "22:45");
  assert.equal(chipStartTime(at(7, 0), "12"), "7am");
  assert.equal(chipStartTime(at(14, 30), "12"), "2:30pm");
  assert.equal(chipStartTime(at(0, 0), "12"), "12am");
  assert.equal(chipStartTime(at(12, 0), "12"), "12pm");
}
{
  // Every other time the board writes keeps the full form.
  const at = (hours: number, minutes: number): Date => new Date(2026, 9, 5, hours, minutes);
  assert.equal(formatClock(at(7, 0), "12"), "7am");
  assert.equal(formatClock(at(18, 30), "12"), "6:30pm");
  assert.equal(formatClock(at(0, 0), "12"), "12am");
  assert.equal(formatClock(at(7, 5), "24"), "07:05");
  assert.equal(formatClock(at(7, 5)), "07:05", "24-hour unless the host says otherwise");
  assert.equal(formatClockRange(at(18, 0), at(23, 0), "12"), "6pm-11pm");
  assert.equal(formatClockRange(at(18, 0), at(23, 0), "24"), "18:00-23:00");
  assert.equal(formatClockRange(at(9, 0), at(17, 30), "12", " - "), "9am - 5:30pm");
}

// Hours read whole, else with one decimal.
{
  assert.equal(formatHours(2400), "40");
  assert.equal(formatHours(2250), "37.5");
  assert.equal(formatHours(0), "0");
}

console.log("compactChip tests passed");

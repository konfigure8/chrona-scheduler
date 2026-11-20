import * as assert from "node:assert/strict";

import { englishDateNames } from "../src/dateNames";
import { breakTags, formatShiftTimes, hoverCardModel, isSplitShift, type HoverCardInput } from "../src/hoverCard";
import { defaultSchedulerStrings } from "../src/stringResources";
import type { SchedulerUiEvent } from "../src/types";

// The shift hover card's rows (Matt 2026-11-13; decisions 2026-11-16, "yes, take recommendations").
const at = (day: number, hours: number, minutes = 0): Date => new Date(2026, 10, day, hours, minutes);
const input: HoverCardInput = { dateNames: englishDateNames, hourFormat: "12", openWork: false, strings: defaultSchedulerStrings };
const plain: SchedulerUiEvent = { end: at(3, 21, 30), id: "s1", resourceId: "r1", start: at(3, 13), status: "assigned", title: "Late" };

// One Times row: day, start and end, and the length. No Start, End or Duration rows.
{
  const model = hoverCardModel(plain, { ...input, resourceName: "Agnieszka Nowak" });
  assert.deepEqual(model.when, [{ label: "Times", value: "Tue 3 Nov, 1pm – 9:30pm (8 h 30 min)", wide: true }]);
  assert.deepEqual(model.details, [{ label: "Assigned to", value: "Agnieszka Nowak" }]);
  assert.equal(model.pinned, false);
  assert.deepEqual(model.chips, []);
  assert.equal(model.status, undefined, "no status field, no chip");
  // The board's own 24-hour clock.
  assert.equal(formatShiftTimes(plain, { ...input, hourFormat: "24" }), "Tue 3 Nov, 13:00 – 21:30 (8 h 30 min)");
}

// Past midnight: the end day is named (decision 3).
{
  const night: SchedulerUiEvent = { ...plain, end: at(4, 6), start: at(3, 20) };
  assert.equal(formatShiftTimes(night, input), "Tue 3 Nov, 8pm – Wed 4 Nov, 6am (10 h)");
}

// Worked and span both show when breaks make them differ (decision 4); a paid break is time worked.
{
  const unpaid: SchedulerUiEvent = { ...plain, end: at(3, 22), gaps: [{ end: at(3, 18), label: "Meal break", start: at(3, 17) }], start: at(3, 13) };
  assert.equal(formatShiftTimes(unpaid, input), "Tue 3 Nov, 1pm – 10pm (8 h worked, 9 h span)");
  const paid: SchedulerUiEvent = { ...unpaid, gaps: [{ end: at(3, 18), label: "Tea", paid: true, start: at(3, 17) }] };
  assert.equal(formatShiftTimes(paid, input), "Tue 3 Nov, 1pm – 10pm (9 h)");
}

// Breaks as tags, paid or unpaid in brackets, only when present; a break with no name is "Break".
{
  const shift: SchedulerUiEvent = {
    ...plain,
    gaps: [
      { end: at(3, 15, 15), paid: true, start: at(3, 15) },
      { end: at(3, 18), label: " Meal break ", start: at(3, 17, 30) },
    ],
  };
  assert.deepEqual(breakTags(shift, defaultSchedulerStrings), [{ label: "Break (paid)" }, { label: "Meal break (unpaid)" }]);
  const model = hoverCardModel(shift, input);
  assert.deepEqual(model.when[1], { label: "Breaks", tags: [{ label: "Break (paid)" }, { label: "Meal break (unpaid)" }], value: "Break (paid), Meal break (unpaid)", wide: true });
  assert.equal(hoverCardModel(plain, input).when.some((entry) => entry.label === "Breaks"), false);
}

// A split shift: a break of 1 hour or more (Matt 2026-11-14); 59 minutes is not.
{
  const split: SchedulerUiEvent = { ...plain, end: at(3, 19), gaps: [{ end: at(3, 16), start: at(3, 9) }], start: at(3, 6) };
  assert.equal(isSplitShift(split), true);
  assert.equal(isSplitShift({ ...split, gaps: [{ end: at(3, 9, 59), start: at(3, 9) }] }), false);
  assert.equal(isSplitShift({ ...split, gaps: [{ end: at(3, 10), start: at(3, 9) }] }), true, "exactly 1 hour counts");
  assert.deepEqual(hoverCardModel(split, input).chips, [{ kind: "split", label: "Split shift" }]);
}

// Pinned, on call, night and busy elsewhere, only when present (decision 7 and Matt's list).
{
  const model = hoverCardModel({ ...plain, elsewhere: true, night: true, onCall: true, pinned: true }, input);
  assert.equal(model.pinned, true);
  assert.deepEqual(model.chips.map((chip) => chip.label), ["On call", "Night shift", "Busy elsewhere"]);
}

// The status as a chip beside the title only, never also a row (decision 6).
{
  const fields = [
    { key: "status", label: "Status", value: "Assigned" },
    { key: "publishState", label: "Publish state", value: "Published" },
  ];
  const model = hoverCardModel({ ...plain, fields }, input);
  assert.deepEqual(model.status, { text: "Assigned", tone: "assigned" });
  assert.deepEqual(model.details.map((entry) => entry.label), ["Assigned to", "Publish state"]);
  // Needs cover takes the board's attention look; open work that is no gap (on call, an open kind) stays plain.
  const open = { ...plain, fields: [{ key: "status", label: "Status", value: "Needs cover" }], status: "needsCover" as const };
  assert.equal(hoverCardModel(open, input).status?.tone, "needsCover");
  assert.equal(hoverCardModel(open, input).details[0]?.value, "Needs cover");
  assert.equal(hoverCardModel(open, { ...input, openWork: true }).status?.tone, "neutral");
  assert.equal(hoverCardModel(open, { ...input, openWork: true }).details[0]?.value, "Unassigned");
  // An extension's rows take the fields' place, the status chip stays.
  const extended = hoverCardModel({ ...plain, fields }, { ...input, extensionEntries: [{ label: "Group", value: "Ward A", wide: true }] });
  assert.deepEqual(extended.details.map((entry) => entry.label), ["Assigned to", "Group"]);
  assert.equal(extended.status?.text, "Assigned");
}

// An extension's entry can be the On call chip, in its own words, never also a row (a Workforce duty).
{
  const duty = { chip: "onCall" as const, label: "Duty type", value: "On call from home" };
  const model = hoverCardModel({ ...plain, onCall: true }, { ...input, extensionEntries: [duty, { label: "Group", value: "Ward A" }] });
  assert.deepEqual(model.chips, [{ kind: "onCall", label: "On call from home" }]);
  assert.deepEqual(model.details.map((entry) => entry.label), ["Assigned to", "Group"]);
}

// The board's time zone when it has one.
{
  assert.deepEqual(hoverCardModel(plain, { ...input, timeZoneLabel: "Berlin" }).when[1], { label: "Displayed time zone", value: "Berlin", wide: true });
}

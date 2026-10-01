import * as assert from "node:assert/strict";

import {
  bucketCoverage,
  computeCoverage,
  coverageTitle,
  type DemandRow,
} from "../src/coverage";
import type { SchedulerUiEvent, TimeWindow } from "../src/types";

const day = (hour: number, minute = 0): Date =>
  new Date(2026, 7, 17, hour, minute, 0, 0);

const window: TimeWindow = { end: day(22), start: day(6) };

function shift(
  id: string,
  startHour: number,
  endHour: number,
  extra?: Partial<SchedulerUiEvent>,
): SchedulerUiEvent {
  return {
    end: day(endHour),
    id,
    resourceId: `r-${id}`,
    start: day(startHour),
    status: "assigned",
    title: id,
    ...extra,
  };
}

// Merge rule: same curve overlapping rows take max(min) and min(max).
{
  const demand: DemandRow[] = [
    { end: day(14), minHeadcount: 1, start: day(6), tags: ["Kitchen"] },
    {
      end: day(14),
      maxHeadcount: 3,
      minHeadcount: 2,
      start: day(6),
      tags: ["Kitchen"],
    },
  ];
  const slices = computeCoverage(demand, [], window, 30);
  const first = slices[0];
  assert.ok(first);
  assert.equal(first.curves.length, 1);
  assert.equal(first.curves[0]?.min, 2);
  assert.equal(first.curves[0]?.max, 3);
  assert.equal(first.state, "under");
  assert.equal(first.shortfall, 2);
}

// Different tag sets are separate curves that coexist in a slice.
{
  const demand: DemandRow[] = [
    { end: day(14), minHeadcount: 1, start: day(6), tags: ["Kitchen"] },
    { end: day(14), minHeadcount: 1, start: day(6), tags: ["Floor"] },
  ];
  const slices = computeCoverage(demand, [], window, 30);
  assert.equal(slices[0]?.curves.length, 2);
}

// Counting: full-slice span containment, every tag carried, assigned only.
{
  const demand: DemandRow[] = [
    { end: day(14), minHeadcount: 1, start: day(6), tags: ["Kitchen"] },
  ];
  const events = [
    shift("covers", 6, 14, { requiredTags: ["Kitchen", "Bar"] }),
    shift("wrong-tags", 6, 14, { requiredTags: ["Floor"] }),
    shift("unassigned", 6, 14, {
      requiredTags: ["Kitchen"],
      status: "needsCover",
    }),
    // Starts mid-slice: 09:15 covers no whole grid slice until 09:30.
    shift("partial", 9, 14, {
      requiredTags: ["Kitchen"],
      start: day(9, 15),
    }),
  ];
  const slices = computeCoverage(demand, events, window, 30);
  const nine = slices.find((s) => s.start.getTime() === day(9).getTime());
  const nineThirty = slices.find(
    (s) => s.start.getTime() === day(9, 30).getTime(),
  );
  assert.equal(nine?.curves[0]?.scheduled, 1);
  assert.equal(nineThirty?.curves[0]?.scheduled, 2);
}

// A rostered gap breaks coverage for the slices it spans (spans only).
{
  const demand: DemandRow[] = [
    { end: day(14), minHeadcount: 1, start: day(6), tags: [] },
  ];
  const events = [
    shift("split", 6, 14, {
      gaps: [{ end: day(11), start: day(10) }],
    }),
  ];
  const slices = computeCoverage(demand, events, window, 30);
  const before = slices.find((s) => s.start.getTime() === day(9, 30).getTime());
  const during = slices.find((s) => s.start.getTime() === day(10).getTime());
  const after = slices.find((s) => s.start.getTime() === day(11).getTime());
  assert.equal(before?.curves[0]?.scheduled, 1);
  assert.equal(during?.curves[0]?.scheduled, 0);
  assert.equal(during?.state, "under");
  assert.equal(after?.curves[0]?.scheduled, 1);
}

// A row contributes only to slices it fully contains.
{
  const demand: DemandRow[] = [
    { end: day(9, 45), minHeadcount: 1, start: day(9, 15), tags: [] },
  ];
  const slices = computeCoverage(demand, [], window, 30);
  assert.equal(slices.length, 0);
}

// Over-cap state: scheduled above the effective max.
{
  const demand: DemandRow[] = [
    { end: day(14), maxHeadcount: 1, minHeadcount: 1, start: day(6), tags: [] },
  ];
  const events = [shift("a", 6, 14), shift("b", 6, 14)];
  const slices = computeCoverage(demand, events, window, 30);
  assert.equal(slices[0]?.state, "over");
}

// Group scoping: curve group filters events; group param filters rows.
{
  const demand: DemandRow[] = [
    { end: day(14), group: "Kitchen", minHeadcount: 1, start: day(6), tags: [] },
  ];
  const events = [
    shift("kitchen", 6, 14, { groups: { Teams: "Kitchen" } }),
    shift("floor", 6, 14, { groups: { Teams: "Floor" } }),
  ];
  const slices = computeCoverage(
    demand,
    events,
    window,
    30,
    "Kitchen",
    undefined,
    "Teams",
  );
  assert.equal(slices[0]?.curves[0]?.scheduled, 1);
  assert.equal(
    computeCoverage(demand, events, window, 30, "Floor", undefined, "Teams")
      .length,
    0,
  );
}

// Buckets carry the worst state and never average a breach away.
{
  const demand: DemandRow[] = [
    { end: day(8), minHeadcount: 1, start: day(6), tags: [] },
  ];
  const events = [shift("first-hour", 6, 7)];
  const slices = computeCoverage(demand, events, window, 30);
  assert.equal(slices.length, 4);
  const buckets = bucketCoverage(slices, 10, 40);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0]?.state, "under");
  const title = coverageTitle(buckets[0]!, () => "07:00-07:30");
  assert.ok(title.includes("0/1"));
  assert.ok(title.includes("short 1"));
}

// A review ghost marks where a changed item was: it staffs nothing, so
// a proposal that takes someone off reads as the gap it leaves.
{
  const demand: DemandRow[] = [
    { end: day(8), minHeadcount: 1, start: day(6), tags: [] },
  ];
  const ghost = shift("was-here", 6, 8, { review: "ghost" });
  const slices = computeCoverage(demand, [ghost], window, 30);
  assert.equal(slices[0]?.state, "under");
  assert.equal(slices[0]?.shortfall, 1);
}

console.log("coverage tests passed");

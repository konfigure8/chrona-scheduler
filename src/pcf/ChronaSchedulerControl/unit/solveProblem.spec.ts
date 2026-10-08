import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SchedulerResource, SchedulerUiEvent } from "@chrona/scheduler-ui";

import { buildSolveProblem, type SolveClock } from "../SchedulerControl/solveProblem";

/*
 * A new run and a resumed run build the solve problem the same way, so a
 * run that finished while the planner was away matches its payload hash
 * when nothing changed. Before this, the resume path left out the site's
 * zone and real moments (F20 Site time zone), so every such run read as
 * "changed".
 */

const HOUR = 60 * 60 * 1000;
// The board shows the site's clock; the site runs two hours ahead of the display dates here.
const clock: SolveClock = {
  solverZone: () => "Australia/Perth",
  toStored: (display) => new Date(display.getTime() - 2 * HOUR),
};
const resources: SchedulerResource[] = [{ id: "r-1", name: "Alex" }];
const events: SchedulerUiEvent[] = [
  {
    end: new Date("2026-11-03T15:30:00.000Z"),
    id: "s-1",
    resourceId: "r-1",
    start: new Date("2026-11-03T07:00:00.000Z"),
    status: "assigned",
    title: "Day",
  },
  {
    end: new Date("2026-11-04T15:30:00.000Z"),
    id: "s-2",
    resourceId: "open",
    start: new Date("2026-11-04T07:00:00.000Z"),
    status: "needsCover",
    title: "Day",
  },
];
const window = { end: new Date("2026-11-09T00:00:00.000Z"), start: new Date("2026-11-02T00:00:00.000Z") };
const input = { events, now: new Date("2026-11-01T00:00:00.000Z"), resources, window };

function carriesTheSiteZoneAndRealMoments(): void {
  const problem = buildSolveProblem(input, clock);
  assert.equal(problem.timeZone, "Australia/Perth");
  assert.equal(problem.window.start, "2026-11-01T22:00:00.000Z");
  assert.equal(problem.shifts.find((shift) => shift.id === "s-1")?.start, "2026-11-03T05:00:00.000Z");
}

function rebuildsTheSameProblemFromTheSameRows(): void {
  // What a resume does with the same rows: the hash input must not change.
  assert.equal(JSON.stringify(buildSolveProblem(input, clock)), JSON.stringify(buildSolveProblem(input, clock)));
}

function theHostBuildsEveryProblemThroughTheBuilder(): void {
  // A second build path is how the resume hash broke; keep one.
  const host = readFileSync(resolve(process.cwd(), "SchedulerControl/useDataverseHost.ts"), "utf8");
  assert.equal(host.includes("problemFromSchedule("), false, "useDataverseHost.ts builds a problem directly");
  assert.equal(host.split("buildSolveProblem(").length - 1, 2, "a new run and a resume both use buildSolveProblem");
}

carriesTheSiteZoneAndRealMoments();
rebuildsTheSameProblemFromTheSameRows();
theHostBuildsEveryProblemThroughTheBuilder();

console.log("solve problem tests passed");

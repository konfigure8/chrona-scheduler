import { buildSolvableFixture, demoRulesConfig } from "../src/fixtures";
import { evaluateScheduleRules } from "../src/scheduleRules";

/*
 * Seed lint: the solvable fixture's quality guarantees, enforced by
 * the real rules engine so the dataset cannot rot.
 *
 * 1. The baseline (assigned shifts) is conflict-free.
 * 2. Every uncovered shift has at least one candidate.
 * 3. Stronger: EVERY candidate the solver could legally pick (holds
 *    the skill, no overlap, not on leave) is also free of warnings
 *    under the demo rules (cross-group excluded - it is off in the
 *    solvable flow, and the solver does not know groups). This is
 *    what makes "a solve of this dataset is clean" a theorem, not a
 *    hope.
 */

const fixture = buildSolvableFixture();
const config = { ...demoRulesConfig, crossGroupPolicy: "off" as const };
const assigned = fixture.events.filter(
  (event) => event.status !== "needsCover",
);
const uncoveredItems = fixture.events.filter(
  (event) => event.status === "needsCover",
);

function fail(message: string): never {
  throw new Error(message);
}

function baselineIsConflictFree(): void {
  for (const event of assigned) {
    const results = evaluateScheduleRules({
      availabilityBands: fixture.availabilityBands,
      config,
      event,
      events: assigned,
      proposed: {
        end: event.end,
        resourceId: event.resourceId,
        start: event.start,
      },
      resources: fixture.resources,
    });
    if (results.length > 0) {
      fail(
        `Baseline shift ${event.id} is not clean: ${results
          .map((result) => result.reason)
          .join("; ")}`,
      );
    }
  }
}

function everySolverEligibleCandidateIsClean(): void {
  for (const item of uncoveredItems) {
    let eligible = 0;
    for (const person of fixture.resources) {
      const holdsSkill = (item.requiredTags ?? []).every((tag) =>
        (person.tags ?? []).includes(tag),
      );
      if (!holdsSkill) {
        continue;
      }
      const overlaps = assigned.some(
        (candidate) =>
          candidate.resourceId === person.id &&
          candidate.start < item.end &&
          candidate.end > item.start,
      );
      const onLeave = fixture.availabilityBands.some(
        (band) =>
          band.kind === "unavailable" &&
          band.resourceId === person.id &&
          band.start < item.end &&
          band.end > item.start,
      );
      if (overlaps || onLeave) {
        continue;
      }
      // This person is a placement the solver could legally make.
      eligible += 1;
      const results = evaluateScheduleRules({
        availabilityBands: fixture.availabilityBands,
        config,
        event: item,
        events: assigned,
        proposed: { end: item.end, resourceId: person.id, start: item.start },
        resources: fixture.resources,
      });
      if (results.length > 0) {
        fail(
          `${item.id} -> ${person.name} is solver-eligible but not clean: ${results
            .map((result) => result.reason)
            .join("; ")}`,
        );
      }
    }
    if (eligible === 0) {
      fail(`${item.id} has no solver-eligible candidate`);
    }
  }
}

baselineIsConflictFree();
everySolverEligibleCandidateIsClean();

console.log("solvableFixture tests passed");

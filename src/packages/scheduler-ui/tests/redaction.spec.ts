import { problemFromSchedule } from "../src/schedulingContract";
import { redactProblem, redactProblemForTenant, unredactSolution } from "../src/redaction";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const resources: SchedulerResource[] = [
  {
    capacityHours: 40,
    id: "r-alex",
    name: "Alex Chen",
    tags: ["Bar", "Floor"],
  },
  { id: "r-riley", name: "Riley Patel", tags: ["Floor"] },
];

const at = (hour: number): Date => new Date(Date.UTC(2026, 7, 17, hour));

const events: SchedulerUiEvent[] = [
  {
    end: at(17),
    id: "s-morning",
    resourceId: "r-alex",
    start: at(9),
    status: "assigned",
    title: "Morning shift",
  },
  {
    end: at(22),
    id: "s-evening",
    requiredTags: ["Bar"],
    resourceId: "r-open",
    start: at(18),
    status: "needsCover",
    title: "Evening cover",
  },
];

const problem = problemFromSchedule({
  events,
  resources,
  unavailability: [
    {
      end: at(12),
      kind: "unavailable",
      resourceId: "r-riley",
      start: at(8),
    },
  ],
  window: { end: at(24), start: at(0) },
});

const redaction = redactProblem(problem);
const wire = JSON.stringify(redaction.problem);

// Nothing personal survives: no names, no titles, no name-derived ids.
for (const leak of [
  "Alex Chen",
  "Riley Patel",
  "Morning shift",
  "Evening cover",
  "r-alex",
  "r-riley",
]) {
  assertEqual(wire.includes(leak), false, `leak ${leak}`);
}

// Stable re-keying in given order; facts kept.
assertEqual(redaction.problem.resources[0]?.id, "p-1", "resource pseudonym");
assertEqual(redaction.problem.resources[0]?.name, "p-1", "name replaced");
// Cost and contract facts survive redaction (ruled: kept, disclosed).
const costRedaction = redactProblem({
  ...problem,
  resources: [
    {
      contract: { maxHoursPerWindow: 38, type: "minMax" },
      costCentsPerHour: 3200,
      id: "r-alex",
      name: "Alex Chen",
      skills: ["Bar"],
    },
  ],
});
assertEqual(
  costRedaction.problem.resources[0]?.costCentsPerHour,
  3200,
  "cost kept (ruled)",
);
assertEqual(
  costRedaction.problem.resources[0]?.contract?.maxHoursPerWindow,
  38,
  "contract kept",
);
assertEqual(
  redaction.problem.resources[0]?.skills.includes("Bar"),
  true,
  "skills kept as plain tags (ruled)",
);
assertEqual(redaction.problem.shifts[0]?.id, "w-1", "shift pseudonym");
assertEqual(redaction.problem.shifts[0]?.title, "w-1", "title replaced");
assertEqual(
  redaction.problem.shifts[0]?.assignment?.resourceId,
  "p-1",
  "assignment remapped",
);
assertEqual(
  redaction.problem.unavailability[0]?.resourceId,
  "p-2",
  "unavailability remapped",
);
assertEqual(
  redaction.problem.window.start,
  problem.window.start,
  "window untouched",
);

// Round trip: pseudonymous answers map back to the real schedule;
// unknown ids (recorded exchanges predating redaction) pass through.
const solution = unredactSolution(
  {
    assignments: [
      { resourceId: "p-2", shiftId: "w-2" },
      { resourceId: null, shiftId: "w-1" },
      { resourceId: "r-legacy", shiftId: "s-legacy" },
    ],
    runId: "run-1",
    status: "succeeded",
  },
  redaction,
);
assertEqual(solution.assignments[0]?.resourceId, "r-riley", "resource back");
assertEqual(solution.assignments[0]?.shiftId, "s-evening", "shift back");
assertEqual(solution.assignments[1]?.resourceId, null, "null preserved");
assertEqual(solution.assignments[2]?.resourceId, "r-legacy", "pass-through");
assertEqual(solution.assignments[2]?.shiftId, "s-legacy", "pass-through id");

// F38: stable placeholders under the tenant's key - the same record gets the
// same placeholder every run, case and braces aside, and maps back.
const tenantKey = { key: "c2FtcGxlLXRlbmFudC1rZXktZm9yLXRlc3RzLW9ubHk", scheme: "hmac-sha256-v1" };
const otherKey = { key: "YW5vdGhlci10ZW5hbnQta2V5LWZvci10ZXN0cy1vbmx5", scheme: "hmac-sha256-v1" };
void (async () => {
  const first = await redactProblemForTenant(problem, tenantKey);
  const again = await redactProblemForTenant(problem, tenantKey);
  const other = await redactProblemForTenant(problem, otherKey);
  const alex = first.problem.resources[0]?.id ?? "";
  assertEqual(first.resourceKeyScheme, "hmac-sha256-v1", "scheme set");
  assertEqual(/^r-[A-Za-z0-9_-]{22}$/.test(alex), true, "placeholder shape");
  assertEqual(first.problem.resources[0]?.name, alex, "no real name");
  assertEqual(again.problem.resources[0]?.id, alex, "stable across runs");
  assertEqual(other.problem.resources[0]?.id === alex, false, "another tenant, another placeholder");
  assertEqual(first.problem.shifts[0]?.assignment?.resourceId, alex, "assignment keyed the same");
  const upper = await redactProblemForTenant(
    { ...problem, resources: [{ ...problem.resources[0]!, id: "{R-ALEX}" }] },
    tenantKey,
  );
  assertEqual(upper.problem.resources[0]?.id, alex, "case and braces do not change the placeholder");
  const back = unredactSolution(
    { assignments: [{ resourceId: alex, shiftId: "w-1" }], runId: "run-2", status: "succeeded" },
    first,
  );
  assertEqual(back.assignments[0]?.resourceId, "r-alex", "stable placeholder maps back");
  const unkeyed = await redactProblemForTenant(problem, undefined);
  assertEqual(unkeyed.resourceKeyScheme, undefined, "no key, per-run keys");
  assertEqual(unkeyed.problem.resources[0]?.id, "p-1", "per-run fallback");
  console.log("redaction tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

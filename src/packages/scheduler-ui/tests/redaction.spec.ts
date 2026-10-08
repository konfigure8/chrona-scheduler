import { problemFromSchedule, type MustBreachCounts } from "../src/schedulingContract";
import {
  redactCandidate,
  redactProblem,
  redactProblemForTenant,
  unredactCandidateCheck,
  unredactSolution,
} from "../src/redaction";
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

// Release 1: agreement ids are record ids, re-keyed a-1..a-n in given order and
// then any id a person names that the problem does not hold; the rules, the
// history mark and preferred or unpreferred time survive on the pseudonyms.
const agreed = problemFromSchedule({
  agreements: [
    {
      id: "agreement-1f3c-nurses",
      rules: [
        { kind: "minimumRest", on: true, start: "2026-07-01", value: 600 },
        { end: "2026-08-31", kind: "daysInARow", on: true, value: 5 },
      ],
    },
    { id: "agreement-9a2b-casuals", rules: [] },
  ],
  events,
  now: at(10),
  resources: [
    { ...resources[0]!, agreementId: "agreement-9a2b-casuals" },
    { ...resources[1]!, agreementId: "agreement-retired" },
  ],
  unavailability: [
    { end: at(12), kind: "unavailable", resourceId: "r-riley", start: at(8) },
    { end: at(14), kind: "preferred", resourceId: "r-alex", start: at(9) },
    { end: at(23), kind: "unpreferred", resourceId: "r-riley", start: at(20) },
    { end: at(23), kind: "preferred", resourceId: "r-gone", start: at(20) },
  ],
  window: { end: at(24), start: at(0) },
});
const agreedRedaction = redactProblem(agreed);
const agreedWire = JSON.stringify(agreedRedaction.problem);
for (const leak of ["agreement-1f3c-nurses", "agreement-9a2b-casuals", "agreement-retired", "r-gone", "r-alex", "r-riley", "Alex Chen"]) {
  assertEqual(agreedWire.includes(leak), false, `agreement leak ${leak}`);
}
const [nurses, casuals] = agreedRedaction.problem.agreements ?? [];
assertEqual(nurses?.id, "a-1", "agreements re-keyed in given order");
assertEqual(casuals?.id, "a-2", "second agreement");
assertEqual(nurses?.rules.length, 2, "rules kept");
assertEqual(nurses?.rules[0]?.value, 600, "rest minutes kept");
assertEqual(nurses?.rules[0]?.start, "2026-07-01", "start date kept");
assertEqual(nurses?.rules[1]?.end, "2026-08-31", "end date kept");
assertEqual(casuals?.rules.length, 0, "an agreement with no rules still travels");
assertEqual(agreedRedaction.problem.resources[0]?.agreementId, "a-2", "person's agreement re-keyed");
assertEqual(agreedRedaction.problem.resources[1]?.agreementId, "a-3", "an id the problem does not hold gets its own pseudonym");
const preferences = agreedRedaction.problem.timePreferences ?? [];
assertEqual(preferences.length, 2, "time of a person the problem does not hold stays home");
assertEqual(preferences[0]?.resourceId, "p-1", "preferred time on the pseudonym");
assertEqual(preferences[0]?.kind, "preferred", "kind kept");
assertEqual(preferences[0]?.start, agreed.timePreferences?.[0]?.start, "times kept");
assertEqual(preferences[1]?.resourceId, "p-2", "unpreferred time on the pseudonym");
assertEqual(preferences[1]?.kind, "unpreferred", "unpreferred kept");
assertEqual(agreedRedaction.problem.shifts[0]?.history, true, "history mark kept");
assertEqual(agreedRedaction.problem.shifts[0]?.assignment?.pinned, true, "history stays pinned");
assertEqual(agreedRedaction.problem.shifts[1]?.history, undefined, "a shift to come is not history");
assertEqual("agreements" in redaction.problem, false, "no agreements, no key");
assertEqual("timePreferences" in redaction.problem, false, "no preferences, no key");

// The run's rule checks map back to the real person and shifts; days and
// counts stay as they are, and unknown ids pass through.
const counts: MustBreachCounts = {
  daysInARow: 1,
  onLeaveOrUnavailable: 0,
  other: { maximumHours: 0, overlap: 0, splitParts: 0, unlisted: 0 },
  restBetweenShifts: 1,
  skills: 0,
};
const analysed = unredactSolution(
  {
    analysis: {
      current: {
        matches: [{ resourceId: "p-1", rule: "restBetweenShifts", shiftIds: ["w-1", "w-2"] }],
        mustBreaches: counts,
        openShifts: 1,
      },
      proposed: {
        matches: [
          { days: ["2026-08-17", "2026-08-18"], resourceId: "p-2", rule: "daysInARow", shiftIds: ["w-2"] },
          { rule: "unlisted", shiftIds: ["w-9"] },
        ],
        mustBreaches: counts,
        openShifts: 0,
      },
    },
    assignments: [{ resourceId: "p-2", shiftId: "w-2" }],
    runId: "run-analysed",
    status: "succeeded",
  },
  agreedRedaction,
);
const before = analysed.analysis?.current.matches?.[0];
assertEqual(before?.resourceId, "r-alex", "match person back");
assertEqual(before?.shiftIds.join(","), "s-morning,s-evening", "match shifts back");
const run = analysed.analysis?.proposed.matches?.[0];
assertEqual(run?.resourceId, "r-riley", "run person back");
assertEqual(run?.days?.join(","), "2026-08-17,2026-08-18", "run days kept");
assertEqual(run?.shiftIds[0], "s-evening", "run shifts back");
assertEqual(analysed.analysis?.proposed.matches?.[1]?.resourceId, undefined, "a match about no one stays so");
assertEqual(analysed.analysis?.proposed.matches?.[1]?.shiftIds[0], "w-9", "unknown shift passes through");
assertEqual(analysed.analysis?.current.mustBreaches, counts, "counts untouched");
assertEqual(analysed.analysis?.proposed.openShifts, 0, "open shifts untouched");
assertEqual(unredactSolution(solution, redaction).analysis, undefined, "no analysis stays absent");

// "Why not…?": the candidate goes out on pseudonyms, and the answer comes back on real ids.
const candidate = redactCandidate({ resourceId: "r-riley", shiftId: "s-morning" }, agreedRedaction);
assertEqual(candidate.resourceId, "p-2", "candidate person redacted");
assertEqual(candidate.shiftId, "w-1", "candidate shift redacted");
for (const unknown of [
  { resourceId: "r-gone", shiftId: "s-morning" },
  { resourceId: "r-riley", shiftId: "s-gone" },
]) {
  let refused = false;
  try {
    redactCandidate(unknown, agreedRedaction);
  } catch {
    refused = true;
  }
  assertEqual(refused, true, `a candidate outside the problem is refused (${unknown.resourceId}, ${unknown.shiftId})`);
}
const answer = unredactCandidateCheck(
  {
    added: [{ resourceId: "p-2", rule: "restBetweenShifts", shiftIds: ["w-1", "w-2"] }],
    fit: "worse",
    removed: [{ resourceId: "p-1", rule: "unpreferredTime", shiftIds: ["w-1"] }],
  },
  agreedRedaction,
);
assertEqual(answer.added[0]?.resourceId, "r-riley", "added match person back");
assertEqual(answer.added[0]?.shiftIds.join(","), "s-morning,s-evening", "added match shifts back");
assertEqual(answer.removed[0]?.resourceId, "r-alex", "removed match person back");
assertEqual(answer.fit, "worse", "fit kept");

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
  // Under the tenant's key, preferred time follows the stable placeholder and
  // agreements keep their per-run pseudonyms.
  const keyedAgreed = await redactProblemForTenant(agreed, tenantKey);
  assertEqual(keyedAgreed.problem.timePreferences?.[0]?.resourceId, alex, "preference on the stable placeholder");
  assertEqual(keyedAgreed.problem.resources[0]?.agreementId, "a-2", "agreement pseudonym under the tenant's key");
  assertEqual(
    redactCandidate({ resourceId: "r-alex", shiftId: "s-evening" }, keyedAgreed).resourceId,
    alex,
    "candidate on the stable placeholder",
  );

  // F48 Split shifts: breaks and the split reach the solver; the split id is a pseudonym.
  const splitId = "6b1f7c0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
  const split = problemFromSchedule({
    events: [
      {
        end: at(14),
        gaps: [{ end: new Date(Date.UTC(2026, 7, 17, 12, 30)), paid: false, start: at(12) }],
        id: "s-part-1",
        resourceId: "r-open",
        split: { id: splitId, samePerson: "required" },
        start: at(9),
        status: "needsCover",
        title: "Chef (morning)",
      },
      {
        end: at(22),
        id: "s-part-2",
        resourceId: "r-open",
        split: { id: splitId, samePerson: "required" },
        start: at(17),
        status: "needsCover",
        title: "Chef (evening)",
      },
    ],
    resources,
    window: { end: at(24), start: at(0) },
  });
  const sent = await redactProblemForTenant(split, tenantKey);
  const [morning, evening] = sent.problem.shifts;
  assertEqual(morning?.breaks?.length, 1, "F48 the break is sent");
  assertEqual(morning?.breaks?.[0]?.paid, false, "F48 unpaid stays unpaid");
  assertEqual(morning?.split?.samePerson, "required", "F48 the same-person rule is sent");
  assertEqual(morning?.split?.id, evening?.split?.id, "F48 both parts name one split");
  assertEqual(morning?.split?.id, "s-1", "F48 the split id is a pseudonym");
  assertEqual(JSON.stringify(sent.problem).includes(splitId), false, "F48 the real split id stays home");
  assertEqual(evening?.breaks, undefined, "F48 a part without breaks sends none");
  console.log("redaction tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

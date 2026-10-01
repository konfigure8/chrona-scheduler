/**
 * The contract acceptance tests (PLAN: solver boundary doctrine).
 *
 * Outgoing: for every recorded solver scenario, the request built
 * from the fixture through the canonical contract must deep-equal
 * the recorded request the real solver answered - the v2 body is
 * fully deterministic, so no masking.
 *
 * Retirement equivalence: the v2-direct wire replaced the v0 POC
 * wire on 2026-08-23. The final v0 recordings are kept under
 * e2e/recordings/v0/ as fixed evidence, and every scenario's v2
 * assignments must equal the assignments the same solver produced
 * over v0 - Matt's "materially identical schedules" test, enforced
 * permanently so re-recordings cannot silently change semantics.
 *
 * Runs from the package root (the test chain's cwd), reading
 * e2e/recordings/ directly.
 */
import { readFileSync } from "node:fs";
import {
  buildLevel0Fixture,
  buildLevel1Fixture,
  buildLevel2Fixture,
  buildSolvableFixture,
} from "../src/fixtures";
import { periodContaining } from "../src/periods";
import { problemFromSchedule } from "../src/schedulingContract";
import { redactProblem } from "../src/redaction";
import { activeCapabilities, computeCapabilityTiers } from "../src/capabilities";
import { availabilityBandsToDecorations } from "../src/decorations";
import {
  buildSolveRequest,
  type ChronaSolveRequest,
  type SolvePollResponse,
} from "../src/solveTransport";

const scenarios = [
  { build: buildLevel0Fixture, name: "level0" },
  { build: buildLevel1Fixture, name: "level1" },
  { build: buildLevel2Fixture, name: "level2" },
  { build: buildSolvableFixture, name: "solvable" },
] as const;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(`e2e/recordings/${file}`, "utf-8")) as T;
}

/** Order-independent structural equality; throws with the failing path. */
function assertDeepEqual(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`${path}: array mismatch (${String(actual)})`);
    }
    expected.forEach((item, index) =>
      assertDeepEqual(actual[index], item, `${path}[${index}]`),
    );
    return;
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") {
      throw new Error(`${path}: expected object, received ${String(actual)}`);
    }
    const actualKeys = Object.keys(actual as object).sort();
    const expectedKeys = Object.keys(expected as object).sort();
    if (actualKeys.join(",") !== expectedKeys.join(",")) {
      throw new Error(
        `${path}: keys [${actualKeys.join(",")}] != [${expectedKeys.join(",")}]`,
      );
    }
    for (const key of expectedKeys) {
      assertDeepEqual(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  if (actual !== expected) {
    throw new Error(
      `${path}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

interface RetiredV0Poll {
  readonly result?: {
    readonly events?: readonly {
      readonly assignedTo: string;
      readonly id: string;
      readonly status: string;
    }[];
  };
}

for (const scenario of scenarios) {
  const dataset = scenario.build();
  // The problem window is the roster period being solved, mirroring
  // the harness's default period config (as the recorder does).
  const period = periodContaining(
    { anchor: new Date("2026-08-17T00:00:00"), unit: "fortnight" },
    dataset.window.start,
  );
  const problem = problemFromSchedule({
    events: dataset.events,
    resources: dataset.resources,
    unavailability: dataset.availabilityBands,
    window: period,
  });

  // F23 (ruled 2026-09-01): only the redacted problem reaches the
  // wire, so the recordings document the redacted request shape.
  // F22 deliverable 2: the envelope declares the fixture's active
  // tiers (presence-based), exactly as the bench adapter sends them.
  const capabilities = activeCapabilities(
    computeCapabilityTiers({
      decorations: availabilityBandsToDecorations(dataset.availabilityBands),
      events: dataset.events,
      resources: dataset.resources,
    }),
  );
  const built = buildSolveRequest(redactProblem(problem).problem, {
    capabilities,
    solverSeconds: 2,
    tenantId: "tenant-dev-a",
  });
  const recorded = readJson<ChronaSolveRequest>(
    `${scenario.name}.request.json`,
  );
  assertDeepEqual(
    JSON.parse(JSON.stringify(built)),
    recorded,
    `${scenario.name}.request`,
  );

  // Retirement equivalence: same solver, same problem facts, same
  // assignments across the wire change.
  const poll = readJson<SolvePollResponse>(`${scenario.name}.poll.json`);
  const v0Poll = readJson<RetiredV0Poll>(`v0/${scenario.name}.poll.json`);
  const idByName = new Map(
    problem.resources.map((resource) => [resource.name, resource.id]),
  );
  const v0Assignments = new Map<string, string | null>();
  for (const wire of v0Poll.result?.events ?? []) {
    v0Assignments.set(
      wire.id,
      wire.status === "Assigned" ? (idByName.get(wire.assignedTo) ?? null) : null,
    );
  }
  const v2Assignments = poll.result?.assignments ?? [];
  if (v2Assignments.length !== v0Assignments.size) {
    throw new Error(
      `${scenario.name}: ${v2Assignments.length} v2 assignments vs ${v0Assignments.size} v0 events`,
    );
  }
  for (const assignment of v2Assignments) {
    if (!v0Assignments.has(assignment.shiftId)) {
      throw new Error(`${scenario.name}.${assignment.shiftId}: not in the v0 recording`);
    }
    const v0ResourceId = v0Assignments.get(assignment.shiftId) ?? null;
    if (assignment.resourceId !== v0ResourceId) {
      throw new Error(
        `${scenario.name}.${assignment.shiftId}: v2 assigned ${String(assignment.resourceId)}, v0 assigned ${String(v0ResourceId)}`,
      );
    }
  }
}

console.log("contractV2 tests passed");

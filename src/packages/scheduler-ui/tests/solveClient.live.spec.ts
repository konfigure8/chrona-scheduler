import * as assert from "node:assert/strict";

import {
  askCandidate,
  checkCandidate,
  runSolve,
  SolveCancelledError,
  SolveStoppedError,
  stopRun,
  type CandidateCheckOptions,
  type SolveSession,
} from "../src/solveClient";
import type { ScheduleProblemV2 } from "../src/schedulingContract";

/*
 * The solve client against the REAL local solver (Matt 2026-10-13: one
 * solver, used in development). Run with the local stack up:
 *
 *   SOLVER_API_BASE_URL=http://127.0.0.1:3001 pnpm --filter @chrona/scheduler-ui run test:live
 *
 * The session uses CHRONA_ENVIRONMENT_API_KEY for a registered local
 * environment, with no human bearer, and a
 * placeholder key (F38). The tests watch the wire; the solver answers.
 *
 * The roster: one bar shift that needs the Bar skill, given to Ben, who
 * does not hold it. Ann holds it. The real answer moves the shift to Ann.
 */

const apiBaseUrl = process.env.SOLVER_API_BASE_URL;
const headers = { "X-Chrona-Api-Key": process.env.CHRONA_ENVIRONMENT_API_KEY ?? "" };
/** Every run has its own key, so a run never reuses an earlier run's idempotency key. */
const token = (name: string): string => `live-${name}-${Date.now()}`;

const session = (): SolveSession => ({
  apiBaseUrl: apiBaseUrl ?? "",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  quota: { dailySolveLimit: 3, remainingSolves: 2, solvesUsedToday: 1 },
  resourcePlaceholders: { key: "Y2hyb25hLWJlbmNoLXBsYWNlaG9sZGVycy1rZXktMDE", scheme: "hmac-sha256-v1" },
  solverSeconds: { default: 2, max: 600, min: 1 },
  tier: "free",
  token: "",
});

const START = "2027-03-02T08:00:00.000Z";
const END = "2027-03-02T14:00:00.000Z";
const window = { end: new Date("2027-03-08T00:00:00.000Z"), start: new Date("2027-03-01T00:00:00.000Z") };

const rosterWith = (resourceId: string): ScheduleProblemV2 => ({
  contractVersion: "2",
  resources: [
    { id: "res-ann", name: "Ann Lee", skills: ["Bar"] },
    { id: "res-ben", name: "Ben Ode", skills: [] },
  ],
  shifts: [
    {
      assignment: { pinned: false, resourceId },
      end: END,
      id: "shift-real-1",
      requiredSkills: ["Bar"],
      start: START,
      title: "Bar open",
    },
  ],
  unavailability: [],
  window: { end: window.end.toISOString(), start: window.start.toISOString() },
});

const eventsWith = (resourceId: string) =>
  [{ end: new Date(END), id: "shift-real-1", resourceId, start: new Date(START), status: "assigned", title: "Bar open" }] as never;

/**
 * A large roster for the Stop tests: 28 days x three eight-hour slots x `copies`, every shift open,
 * for `people` people under one 10-hour minimum rest. Its size sets how long the solver takes.
 */
const generatedRoster = (copies: number, people: number): ScheduleProblemV2 => {
  const shifts: ScheduleProblemV2["shifts"][number][] = [];
  for (let day = 0; day < 28; day += 1) {
    for (const [slot, hour] of [6, 14, 22].entries()) {
      for (let copy = 0; copy < copies; copy += 1) {
        const start = new Date(Date.UTC(2030, 6, 1 + day, hour));
        shifts.push({
          end: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
          id: `w-${day}-${slot}-${copy}`,
          requiredSkills: [],
          start: start.toISOString(),
          title: "w",
        });
      }
    }
  }
  return {
    agreements: [{ id: "a-1", rules: [{ kind: "minimumRest", value: 600 }] }],
    contractVersion: "2",
    resources: Array.from({ length: people }, (_, index) => ({ agreementId: "a-1", id: `p-${index}`, name: `Person ${index}`, skills: [] })),
    shifts,
    timeZone: "UTC",
    unavailability: [],
    window: { end: "2030-07-29T00:00:00.000Z", start: "2030-07-01T00:00:00.000Z" },
  } as ScheduleProblemV2;
};

/** The board's events for a roster whose shifts are all open. */
const openEvents = (problem: ScheduleProblemV2) =>
  problem.shifts.map((shift) => ({
    end: new Date(shift.end),
    id: shift.id,
    resourceId: "open",
    start: new Date(shift.start),
    status: "needsCover",
    title: shift.title,
  })) as never;

type Call = { readonly body?: string; readonly headers: Record<string, string>; readonly url: string };

/** The real wire, watched: every call goes to the local API as sent. */
function watched(hold?: Promise<void>): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: (init?.headers as Record<string, string>) ?? {},
      url: String(input),
    });
    const response = await fetch(input, init);
    await hold;
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const whyNot = (fetchImpl: typeof fetch, candidate: string): CandidateCheckOptions => ({
  candidate: { resourceId: candidate, shiftId: "shift-real-1" },
  currentRosterVersion: () => 1,
  extraHeaders: headers,
  fetchImpl,
  problem: rosterWith("res-ann"),
  rosterVersion: 1,
  runToken: token("why"),
  session: session(),
  solutionType: "workforce-scheduling",
});

const run = async (): Promise<void> => {
  // A solve: redacted on the wire, answered by the solver, mapped back to the real ids.
  {
    const { calls, fetchImpl } = watched();
    const statuses: string[] = [];
    const proposal = await runSolve({
      currentEvents: eventsWith("res-ben"),
      extraHeaders: headers,
      fetchImpl,
      onStatus: (status) => statuses.push(status),
      problem: rosterWith("res-ben"),
      runToken: token("solve"),
      session: session(),
      solutionType: "workforce-scheduling",
      solverSeconds: 2,
      window,
    });
    // R2.15: the run goes to the product's API, version 1, as Timefold's model request.
    assert.match(calls[0]?.url ?? "", /\/api\/workforce-scheduling\/v1\/schedules$/);
    assert.match(calls[1]?.url ?? "", /\/api\/workforce-scheduling\/v1\/schedules\/[^/]+$/, "followed on the same API");
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as {
      config: { context: { resourceKeyScheme?: string }; run: { termination: { spentLimit: string } } };
      modelInput: { resources: { id: string; name: string }[]; shifts: { id: string; title?: string }[] };
    };
    assert.equal(submitted.config.context.resourceKeyScheme, "hmac-sha256-v1");
    assert.equal(submitted.config.run.termination.spentLimit, "PT2S");
    for (const resource of submitted.modelInput.resources) {
      assert.match(resource.id, /^r-[A-Za-z0-9_-]{22}$/, "F38: stable placeholders");
    }
    for (const real of ["Ann Lee", "Ben Ode", "res-ann", "res-ben", "shift-real-1", "Bar open"]) {
      assert.equal(calls[0]?.body?.includes(real), false, `F23: ${real} stays home`);
    }
    assert.equal(statuses[0], "queued");
    assert.ok(proposal.runId, "the run has an id");
    assert.equal(proposal.window, window, "the proposal carries the period the run solved");
    const moved = proposal.events.find((event) => event.id === "shift-real-1");
    assert.equal(moved?.resourceId, "res-ann", "the solver gives the bar shift to the person who holds Bar");

    // The run's rule checks travel to the proposal on the real ids.
    const current = proposal.analysis?.current;
    assert.equal(current?.mustBreaches.skills, 1, "Ben on the bar shift breaks Skills");
    assert.equal(current?.matches?.[0]?.resourceId, "res-ben", "the match names the real person");
    assert.deepEqual(current?.matches?.[0]?.shiftIds, ["shift-real-1"], "the match names the real shift");
    assert.equal(proposal.analysis?.proposed.mustBreaches.skills, 0);
    assert.equal(proposal.analysis?.countsOnly, undefined);
  }

  // The free scheduler's runs go to its own API and are answered there: one open shift, one person,
  // no skills (the free scheduler does not optimize with roles).
  {
    const { calls, fetchImpl } = watched();
    const free: ScheduleProblemV2 = {
      contractVersion: "2",
      resources: [{ id: "res-ann", name: "Ann Lee", skills: [] }],
      shifts: [{ end: END, id: "shift-real-1", requiredSkills: [], start: START, title: "Bar open" }],
      unavailability: [],
      window: { end: window.end.toISOString(), start: window.start.toISOString() },
    };
    const proposal = await runSolve({
      currentEvents: [{ end: new Date(END), id: "shift-real-1", resourceId: "open", start: new Date(START), status: "needsCover", title: "Bar open" }] as never,
      extraHeaders: headers,
      fetchImpl,
      problem: free,
      runToken: token("free"),
      session: session(),
      solutionType: "scheduler",
      solverSeconds: 2,
    });
    assert.match(calls[0]?.url ?? "", /\/api\/scheduler\/v1\/schedules$/);
    assert.equal(proposal.events.find((event) => event.id === "shift-real-1")?.resourceId, "res-ann", "the open shift is filled");
  }

  // Stop (R2.15) part way through the search: the run hands back the best roster found so far.
  // 840 shifts for 25 people: the first roster comes within seconds and the search runs on after it.
  {
    const big = generatedRoster(10, 25);
    let markSubmitted: (id: string) => void = () => undefined;
    const submitted = new Promise<string>((resolve) => {
      markSubmitted = resolve;
    });
    const pending = runSolve({
      currentEvents: openEvents(big),
      extraHeaders: headers,
      onSubmitted: (id) => markSubmitted(id),
      problem: big,
      runToken: token("stop"),
      session: session(),
      solutionType: "workforce-scheduling",
      solverSeconds: 120,
    });
    const runId = await submitted;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await stopRun({ extraHeaders: headers, runId, session: session(), solutionType: "workforce-scheduling" });
    const proposal = await pending;
    assert.equal(proposal.stopped, true, "the proposal says the run was stopped");
    assert.ok(
      proposal.events.some((event) => event.resourceId !== "open"),
      "the best roster so far fills shifts",
    );
  }

  // F41 Cancel: the same run, stopped to keep nothing. It ends without a roster even though it had one.
  {
    const big = generatedRoster(10, 25);
    let markSubmitted: (id: string) => void = () => undefined;
    const submitted = new Promise<string>((resolve) => {
      markSubmitted = resolve;
    });
    const pending = runSolve({
      currentEvents: openEvents(big),
      extraHeaders: headers,
      onSubmitted: (id) => markSubmitted(id),
      problem: big,
      runToken: token("cancel-run"),
      session: session(),
      solutionType: "workforce-scheduling",
      solverSeconds: 120,
    });
    const runId = await submitted;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // The answer can come while the stop request still waits: take it as it comes.
    const outcome = pending.then(() => "answered", (error: unknown) => error);
    await stopRun({ discard: true, extraHeaders: headers, runId, session: session(), solutionType: "workforce-scheduling" });
    assert.ok((await outcome) instanceof SolveStoppedError, "a cancelled run hands back nothing");
  }

  // Stop before the first roster: nothing to review, and the board says so.
  // 1,848 shifts for 130 people: the first roster takes the solver several seconds.
  {
    const big = generatedRoster(22, 130);
    let markSubmitted: (id: string) => void = () => undefined;
    const submitted = new Promise<string>((resolve) => {
      markSubmitted = resolve;
    });
    const pending = runSolve({
      currentEvents: openEvents(big),
      extraHeaders: headers,
      onSubmitted: (id) => markSubmitted(id),
      problem: big,
      runToken: token("stop-early"),
      session: session(),
      solutionType: "workforce-scheduling",
      solverSeconds: 120,
    });
    const runId = await submitted;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const outcome = pending.then(() => "answered", (error: unknown) => error);
    await stopRun({ extraHeaders: headers, runId, session: session(), solutionType: "workforce-scheduling" });
    assert.ok((await outcome) instanceof SolveStoppedError, "stopped before a roster, the run hands back nothing");
  }

  // F31 cancel: cancelling while the run waits rejects with the cancellation.
  {
    const controller = new AbortController();
    await assert.rejects(
      runSolve({
        currentEvents: eventsWith("res-ben"),
        extraHeaders: headers,
        onStatus: () => controller.abort(),
        problem: rosterWith("res-ben"),
        runToken: token("cancel"),
        session: session(),
        signal: controller.signal,
        solutionType: "workforce-scheduling",
        solverSeconds: 2,
      }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }

  // "Why not…?": one request, answered at once, on the real person and shift.
  {
    const { calls, fetchImpl } = watched();
    const result = await checkCandidate(whyNot(fetchImpl, "res-ben"));
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/api\/solve\/analyze$/);
    for (const real of ["Ann Lee", "Ben Ode", "res-ann", "res-ben", "shift-real-1"]) {
      assert.equal(calls[0]?.body?.includes(real), false, `F23: ${real} stays home`);
    }
    assert.equal(result.status, "answered");
    if (result.status === "answered") {
      assert.equal(result.check.fit, "worse", "Ben does not hold Bar");
      const skills = result.check.added.find((match) => match.rule === "skills");
      assert.equal(skills?.resourceId, "res-ben", "answer on the real person");
      assert.deepEqual(skills?.shiftIds, ["shift-real-1"], "answer on the real shift");
    }
  }

  // RT2-6 (S4-2): the real answer for an older roster is dropped; for the roster on screen it shows.
  {
    let version = 1;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { calls, fetchImpl } = watched(held);
    const pending = checkCandidate({ ...whyNot(fetchImpl, "res-ben"), currentRosterVersion: () => version, rosterVersion: 1 });
    version = 2;
    release();
    assert.deepEqual(await pending, { status: "rosterChanged" }, "the answer for the older roster is dropped");
    assert.equal(calls.length, 1, "the real answer came back");
    const same = await checkCandidate({ ...whyNot(watched().fetchImpl, "res-ben"), currentRosterVersion: () => "v7", rosterVersion: "v7" });
    assert.equal(same.status, "answered");
  }

  // askCandidate, for the board: the real answer, as the board reads it.
  {
    const asked = await askCandidate(whyNot(watched().fetchImpl, "res-ben"));
    assert.equal(asked.status, "answered");
  }

  console.log("solveClient live tests passed");
};

if (!apiBaseUrl) {
  console.log("solveClient live tests skipped: set SOLVER_API_BASE_URL with the local stack up");
} else {
  assert.ok(headers["X-Chrona-Api-Key"], "Set CHRONA_ENVIRONMENT_API_KEY for the connected local environment.");
  // A run that ends without reaching the last line (a wait nothing resolves) fails, never passes quietly.
  process.exitCode = 1;
  run().then(() => {
    process.exitCode = 0;
  }).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

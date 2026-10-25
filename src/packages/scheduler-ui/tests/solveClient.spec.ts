import * as assert from "node:assert/strict";

import {
  askCandidate,
  CandidateCheckUnavailableError,
  canonicalizeProblem,
  checkCandidate,
  clampSolverSeconds,
  hashProblem,
  markRunReviewed,
  followRun,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveNotStoppableError,
  SolveQuotaExceededError,
  SolveSessionExpiredError,
  SolveStoppedError,
  stopRun,
  type CandidateCheckOptions,
  type SolveSession,
} from "../src/solveClient";
import { mustBreachTotal, type MustBreachCounts, type ScheduleProblemV2 } from "../src/schedulingContract";
import { solutionFromPoll } from "../src/solveTransport";

/*
 * F26 stage 3: the package's solve client under a session, without a
 * solver. Only failure states are written here - the ones the real
 * solver cannot produce on cue (Matt 2026-10-13: one solver, used in
 * development) - and the request the client sends, read off those
 * calls. Every answer from the solver is checked against the real
 * local stack in solveClient.live.spec.ts.
 */

const session: SolveSession = {
  apiBaseUrl: "https://api.example",
  expiresAt: "2026-09-03T12:50:00.000Z",
  quota: { dailySolveLimit: 3, remainingSolves: 2, solvesUsedToday: 1 },
  solverSeconds: { default: 30, max: 120, min: 5 },
  tier: "free",
  token: "session-token",
};

const problem: ScheduleProblemV2 = {
  contractVersion: "2",
  resources: [{ id: "res-ann", name: "Ann Lee", skills: ["Bar"] }],
  shifts: [
    {
      end: "2026-09-01T14:00:00.000Z",
      id: "shift-real-1",
      requiredSkills: ["Bar"],
      start: "2026-09-01T08:00:00.000Z",
      title: "Bar open",
    },
  ],
  unavailability: [],
  window: { end: "2026-09-07T00:00:00.000Z", start: "2026-08-31T00:00:00.000Z" },
};

const currentEvents = [
  {
    end: new Date("2026-09-01T14:00:00.000Z"),
    id: "shift-real-1",
    start: new Date("2026-09-01T08:00:00.000Z"),
    status: "needsCover",
    title: "Bar open",
  },
] as never;

const noBreaches: MustBreachCounts = {
  averageHours: 0,
  daysInARow: 0,
  daysOff: 0,
  maximumHours: 0,
  onLeaveOrUnavailable: 0,
  other: { overlap: 0, splitParts: 0, unlisted: 0 },
  restBetweenShifts: 0,
  site: 0,
  skills: 0,
  weeklyRest: 0,
};

/** A "Why not…?" for Ann on the one shift, on an unchanged roster. */
function candidateOptions(fetchImpl: typeof fetch): CandidateCheckOptions {
  return {
    candidate: { resourceId: "res-ann", shiftId: "shift-real-1" },
    currentRosterVersion: () => 1,
    fetchImpl,
    problem,
    rosterVersion: 1,
    runToken: "why-1",
    session,
  };
}

type Call = { readonly body?: string; readonly headers: Record<string, string>; readonly method: string; readonly url: string };

/** A wire that answers every call with one failure status; it records what the client sent. */
function failingFetch(status: number, body?: unknown, headers: Record<string, string> = {}): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: (init?.headers as Record<string, string>) ?? {},
      method: init?.method ?? "GET",
      url: String(input),
    });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      headers: { "content-type": "application/json", ...headers },
      status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** A wire that must not be reached: it counts every call. */
let unreachableCalls = 0;
const unreachable = (async () => {
  unreachableCalls += 1;
  throw new Error("no request may be sent");
}) as unknown as typeof fetch;

const offline = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

// clamp: default when unset, bounded otherwise
assert.equal(clampSolverSeconds(session, undefined), 30);
assert.equal(clampSolverSeconds(session, 1), 5);
assert.equal(clampSolverSeconds(session, 900), 120);
assert.equal(clampSolverSeconds(session, 42.9), 42);

// canonical form is sorted-key JSON, matching the server's hash input
assert.equal(canonicalizeProblem({ b: [{ z: 1, a: 2 }], a: "x" }), '{"a":"x","b":[{"a":2,"z":1}]}');

const run = async (): Promise<void> => {
  // 402 -> quota error; 409 run_in_flight -> follow error with the run id; 401 -> expired.
  // Each submit carries the bearer, the run's key and the redacted body (F23).
  for (const [status, body, check] of [
    [402, { code: "quota_exceeded", message: "Daily free optimization limit reached." }, (e: unknown) => e instanceof SolveQuotaExceededError],
    [409, { code: "run_in_flight", runId: "run-running", status: "running" }, (e: unknown) => e instanceof SolveInFlightError && e.runId === "run-running"],
    [401, {}, (e: unknown) => e instanceof SolveSessionExpiredError],
  ] as const) {
    const { calls, fetchImpl } = failingFetch(status, body);
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl, problem, runToken: "t2", session, solverSeconds: 999 }),
      (error: unknown) => check(error),
      `status ${status}`,
    );
    assert.equal(calls.length, 1, `status ${status}: no poll after a refused submit`);
    // R2.15: a run goes to the product's API, version 1; no product named = the recorded wire's Workforce.
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "https://api.example/api/workforce-scheduling/v1/schedules");
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
    assert.equal(calls[0]?.headers["Idempotency-Key"], "control-t2");
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as {
      config: { run: { termination: { spentLimit: string } } };
      modelInput: { resources: { id: string; name: string }[]; shifts: { id: string }[] };
    };
    assert.equal(submitted.config.run.termination.spentLimit, "PT120S", "clamped to the session ceiling");
    assert.equal(submitted.modelInput.resources[0]?.id, "p-1");
    assert.equal(submitted.modelInput.resources[0]?.name, "p-1", "F23: no real names on the wire");
    assert.equal(submitted.modelInput.shifts[0]?.id, "w-1");
    assert.equal(calls[0]?.body?.includes("res-ann"), false, "F23: no real ids on the wire");
  }

  // F126: the 402's reason travels with the error, so the board tells the free people from the daily allowance.
  for (const code of ["free_people_exceeded", "quota_exceeded"]) {
    const { fetchImpl } = failingFetch(402, { code, message: "Refused." });
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl, problem, runToken: "tp", session }),
      (error: unknown) => error instanceof SolveQuotaExceededError && error.code === code && error.message === "Refused.",
      `402 ${code}`,
    );
  }
  {
    const { fetchImpl } = failingFetch(402, {});
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl, problem, runToken: "tq", session }),
      (error: unknown) => error instanceof SolveQuotaExceededError && error.code === undefined,
      "402 without a body",
    );
  }

  // F38: with the tenant's key the body carries stable placeholders, the scheme and the calendar's product.
  {
    const keyed: SolveSession = { ...session, resourcePlaceholders: { key: "c2FtcGxlLXRlbmFudC1rZXktZm9yLXRlc3RzLW9ubHk", scheme: "hmac-sha256-v1" } };
    const { calls, fetchImpl } = failingFetch(402, { code: "quota_exceeded", message: "Daily free optimization limit reached." });
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl, problem, runToken: "tk", session: keyed, solutionType: "scheduler" }),
      (error: unknown) => error instanceof SolveQuotaExceededError,
    );
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as {
      config: { context: { resourceKeyScheme?: string } };
      modelInput: { resources: { id: string }[] };
    };
    assert.equal(calls[0]?.url, "https://api.example/api/scheduler/v1/schedules", "the free scheduler's API");
    assert.equal(submitted.config.context.resourceKeyScheme, "hmac-sha256-v1");
    assert.match(submitted.modelInput.resources[0]?.id ?? "", /^r-[A-Za-z0-9_-]{22}$/);
  }

  // Stop: DELETE on the run in its product's API. A run that already ended needs nothing;
  // a run an earlier control started through /api/solve says it cannot be stopped.
  {
    const { calls, fetchImpl } = failingFetch(404);
    await stopRun({ fetchImpl, runId: "run-1", session, solutionType: "scheduler" });
    assert.equal(calls[0]?.method, "DELETE");
    assert.equal(calls[0]?.url, "https://api.example/api/scheduler/v1/schedules/run-1");
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
  }
  // F41 Cancel: the same stop, keeping nothing.
  {
    const { calls, fetchImpl } = failingFetch(404);
    await stopRun({ discard: true, fetchImpl, runId: "run-2", session, solutionType: "scheduler" });
    assert.equal(calls[0]?.method, "DELETE");
    assert.equal(calls[0]?.url, "https://api.example/api/scheduler/v1/schedules/run-2?discard=true");
  }
  {
    const { fetchImpl } = failingFetch(409, { code: "run_not_stoppable", message: "This run was not started through this API." });
    await assert.rejects(stopRun({ fetchImpl, runId: "run-old", session }), (error: unknown) => error instanceof SolveNotStoppableError);
  }
  {
    const { fetchImpl } = failingFetch(401, {});
    await assert.rejects(stopRun({ fetchImpl, runId: "run-1", session }), (error: unknown) => error instanceof SolveSessionExpiredError);
  }

  // A run stopped before it found a roster, and a failed run: nothing to review, and why.
  {
    const redaction = { problem, toRealResourceId: new Map(), toRealShiftId: new Map() } as never;
    const stopped = failingFetch(200, { metadata: { id: "run-s", solverStatus: "SOLVING_INCOMPLETE" }, modelOutput: null });
    await assert.rejects(
      followRun({ currentEvents, fetchImpl: stopped.fetchImpl, redaction, runId: "run-s", runToken: "t-s", session }),
      (error: unknown) => error instanceof SolveStoppedError,
    );
    assert.equal(stopped.calls[0]?.url, "https://api.example/api/workforce-scheduling/v1/schedules/run-s");
    const failed = failingFetch(200, { metadata: { failureMessage: "The solver stopped.", id: "run-f", solverStatus: "SOLVING_FAILED" }, modelOutput: null });
    await assert.rejects(
      followRun({ currentEvents, fetchImpl: failed.fetchImpl, redaction, runId: "run-f", runToken: "t-f", session }),
      /The solver stopped\./,
    );
  }

  // A cancelled solve sends nothing.
  {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl: unreachable, problem, runToken: "t-c", session, signal: controller.signal }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }

  // reviewed: POST with bearer; 404 tolerated (run aged out)
  {
    const { calls, fetchImpl } = failingFetch(404);
    await markRunReviewed(session, "run-old", fetchImpl);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "https://api.example/api/solve/run-old/reviewed");
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
  }

  // Answers the running solver cannot send on cue: an unreadable count, and an API newer
  // than a board in the field. Absent is never zero.
  {
    const check = (analysis: unknown): unknown =>
      solutionFromPoll("run-r", "succeeded", { analysis, assignments: [], contractVersion: "2" } as never).analysis;
    const roster = { mustBreaches: noBreaches, openShifts: 0 };
    assert.equal(check({ current: roster }), undefined, "both rosters or none");
    assert.equal(check({ current: roster, proposed: { ...roster, openShifts: -1 } }), undefined, "a negative count");
    assert.equal(
      check({ current: roster, proposed: { mustBreaches: { ...noBreaches, skills: undefined }, openShifts: 0 } }),
      undefined,
      "a missing count",
    );
    assert.equal(
      check({ current: roster, proposed: { mustBreaches: { ...noBreaches, other: { overlap: 0 } }, openShifts: 0 } }),
      undefined,
      "a missing other count",
    );
    // An other Must rule the board does not name yet still counts, as unlisted.
    const unnamed = solutionFromPoll("run-u", "succeeded", {
      analysis: {
        current: roster,
        proposed: {
          mustBreaches: { ...noBreaches, other: { ...noBreaches.other, placeClosed: 2, unlisted: 1 } },
          openShifts: 0,
        },
      },
      assignments: [],
      contractVersion: "2",
    } as never).analysis;
    assert.equal(unnamed?.proposed.mustBreaches.other.unlisted, 3);
    assert.equal(mustBreachTotal(unnamed?.proposed.mustBreaches ?? noBreaches), 3);
    // Matches of rules the board does not name, or unreadable ones, are left out; the counts stay.
    const matches = solutionFromPoll("run-m", "succeeded", {
      analysis: {
        current: roster,
        proposed: {
          matches: [
            { resourceId: "p-1", rule: "restBetweenShifts", shiftIds: ["w-1", "w-2"] },
            { rule: "labourCost", shiftIds: ["w-1"] },
            { rule: "skills", shiftIds: "w-1" },
            { days: [3], rule: "daysInARow", shiftIds: ["w-1"] },
          ],
          mustBreaches: { ...noBreaches, restBetweenShifts: 1 },
          openShifts: 0,
        },
      },
      assignments: [],
      contractVersion: "2",
    } as never).analysis;
    assert.equal(matches?.proposed.matches?.length, 1);
    assert.equal(matches?.proposed.matches?.[0]?.rule, "restBetweenShifts");
  }

  // "Why not…?": one request, redacted, that starts no run and has no run length.
  {
    const { calls, fetchImpl } = failingFetch(401, {});
    await assert.rejects(checkCandidate(candidateOptions(fetchImpl)), (error: unknown) => error instanceof SolveSessionExpiredError);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.example/api/solve/analyze");
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
    assert.equal(calls[0]?.headers["Idempotency-Key"], undefined, "a check starts no run");
    const sent = JSON.parse(calls[0]?.body ?? "{}") as {
      candidate: { resourceId: string; shiftId: string };
      problem: { resources: { name: string }[] };
      solverSeconds?: number;
    };
    assert.deepEqual(sent.candidate, { resourceId: "p-1", shiftId: "w-1" }, "F23: the candidate goes out on pseudonyms");
    assert.equal(sent.problem.resources[0]?.name, "p-1", "F23: no real names on the wire");
    assert.equal(sent.solverSeconds, undefined, "a check has no run length");
    assert.equal(calls[0]?.body?.includes("res-ann"), false, "F23: no real ids on the wire");
  }

  // RT2-6 (S4-2): a failure that arrives after the roster changed is dropped, as an answer is.
  {
    let failingVersion = 1;
    const failing = (async () => {
      failingVersion = 2;
      return new Response(null, { status: 503 });
    }) as unknown as typeof fetch;
    assert.deepEqual(
      await checkCandidate({ ...candidateOptions(failing), currentRosterVersion: () => failingVersion, rosterVersion: 1 }),
      { status: "rosterChanged" },
    );
  }

  // Could not check now: the tenant's limit with when to ask again, a busy or stalled solver, no answer at all.
  for (const [status, retryAfter, expected] of [
    [429, "12", 12],
    [503, "2", 2],
    [504, undefined, undefined],
  ] as const) {
    const { fetchImpl } = failingFetch(status, undefined, retryAfter === undefined ? {} : { "retry-after": retryAfter });
    await assert.rejects(
      checkCandidate(candidateOptions(fetchImpl)),
      (error: unknown) =>
        error instanceof CandidateCheckUnavailableError && error.status === status && error.retryAfterSeconds === expected,
      `status ${status}`,
    );
  }
  await assert.rejects(
    checkCandidate(candidateOptions(offline)),
    (error: unknown) => error instanceof CandidateCheckUnavailableError && error.status === undefined,
  );

  // A refused product and an unreadable answer are not "try again later".
  for (const [status, body, check] of [
    [403, { code: "product_features_exceeded", message: "Not on this product" }, (e: unknown) => e instanceof Error && !(e instanceof CandidateCheckUnavailableError) && e.message === "Not on this product"],
    [200, { added: [], fit: "sideways", removed: [] }, (e: unknown) => e instanceof Error && /unreadable/.test(e.message)],
  ] as const) {
    const { fetchImpl } = failingFetch(status, body);
    await assert.rejects(checkCandidate(candidateOptions(fetchImpl)), (error: unknown) => check(error), `status ${status}`);
  }

  // A candidate outside the problem is refused before anything is sent.
  await assert.rejects(
    checkCandidate({ ...candidateOptions(unreachable), candidate: { resourceId: "res-gone", shiftId: "shift-real-1" } }),
  );
  assert.equal(unreachableCalls, 0, "no request for a candidate the problem does not hold");

  // Leaving the view cancels the check.
  {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      checkCandidate({ ...candidateOptions(unreachable), signal: controller.signal }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }

  // askCandidate, for the board: every failure is "Could not check this now"; a rate limit says when.
  {
    for (const [status, retryAfter, expected] of [
      [429, "12", { retryAfterSeconds: 12, status: "unavailable" }],
      [503, "2", { status: "unavailable" }],
      [504, undefined, { status: "unavailable" }],
      [400, undefined, { status: "unavailable" }],
    ] as const) {
      const { fetchImpl } = failingFetch(status, undefined, retryAfter === undefined ? {} : { "retry-after": retryAfter });
      assert.deepEqual(await askCandidate(candidateOptions(fetchImpl)), expected, `status ${status}`);
    }
    assert.deepEqual(await askCandidate(candidateOptions(offline)), { status: "unavailable" });
    // The host mints a new session and asks again; a cancelled check is dropped by its caller.
    const expired = failingFetch(401, {});
    await assert.rejects(askCandidate(candidateOptions(expired.fetchImpl)), (error: unknown) => error instanceof SolveSessionExpiredError);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      askCandidate({ ...candidateOptions(unreachable), signal: controller.signal }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }
  assert.equal(unreachableCalls, 0, "a cancelled solve or check sends nothing");

  // hashProblem: SHA-256 hex of the canonical form, stable across key order
  {
    const a = await hashProblem({ b: 1, a: 2 } as unknown as ScheduleProblemV2);
    const b = await hashProblem({ a: 2, b: 1 } as unknown as ScheduleProblemV2);
    assert.equal(a, b);
    assert.match(a ?? "", /^[0-9a-f]{64}$/);
    assert.equal(await hashProblem(problem, null), undefined, "no subtle crypto = no hash, never a throw");
  }

  console.log("solveClient tests passed");
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

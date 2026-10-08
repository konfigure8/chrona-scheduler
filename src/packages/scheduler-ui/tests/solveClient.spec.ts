import * as assert from "node:assert/strict";

import {
  askCandidate,
  CandidateCheckUnavailableError,
  canonicalizeProblem,
  checkCandidate,
  clampSolverSeconds,
  hashProblem,
  markRunReviewed,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveQuotaExceededError,
  SolveSessionExpiredError,
  type CandidateCheckOptions,
  type SolveSession,
} from "../src/solveClient";
import { mustBreachTotal, type MustBreachCounts, type ScheduleProblemV2 } from "../src/schedulingContract";
import { solutionFromPoll } from "../src/solveTransport";

/*
 * F26 stage 3: the package's solve client under a session. The wire is
 * stubbed at fetch; the shapes are the recorded ones the e2e suite
 * replays. Redaction (F23) is asserted on the submitted body.
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
  resources: [{ id: "res-ann", name: "Ann Lee", tags: ["Bar"] }],
  shifts: [
    {
      end: "2026-09-01T14:00:00.000Z",
      id: "shift-real-1",
      pinned: false,
      requiredTags: ["Bar"],
      start: "2026-09-01T08:00:00.000Z",
      title: "Bar open",
    },
  ],
  unavailability: [],
  window: { end: "2026-09-07T00:00:00.000Z", start: "2026-08-31T00:00:00.000Z" },
} as unknown as ScheduleProblemV2;

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
  daysInARow: 0,
  onLeaveOrUnavailable: 0,
  other: { maximumHours: 0, overlap: 0, splitParts: 0, unlisted: 0 },
  restBetweenShifts: 0,
  skills: 0,
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

function fakeFetch(
  responder: (call: Call) => { body?: unknown; status: number },
): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const call: Call = {
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: (init?.headers as Record<string, string>) ?? {},
      method: init?.method ?? "GET",
      url: String(input),
    };
    calls.push(call);
    const { body, status } = responder(call);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

// clamp: default when unset, bounded otherwise
assert.equal(clampSolverSeconds(session, undefined), 30);
assert.equal(clampSolverSeconds(session, 1), 5);
assert.equal(clampSolverSeconds(session, 900), 120);
assert.equal(clampSolverSeconds(session, 42.9), 42);

// canonical form is sorted-key JSON, matching the server's hash input
assert.equal(canonicalizeProblem({ b: [{ z: 1, a: 2 }], a: "x" }), '{"a":"x","b":[{"a":2,"z":1}]}');

const run = async (): Promise<void> => {
  // happy path: bearer on both calls, redacted body, proposal mapped back to real ids
  {
    const { calls, fetchImpl } = fakeFetch((call) => {
      if (call.url.endsWith("/api/solve")) {
        return { body: { pollAfterSeconds: 0, runId: "run-1", status: "queued" }, status: 202 };
      }
      return {
        body: {
          result: { assignments: [{ resourceId: "p-1", shiftId: "w-1" }], contractVersion: "2" },
          status: "succeeded",
        },
        status: 200,
      };
    });
    const statuses: string[] = [];
    const solved = { end: new Date("2026-09-07T00:00:00.000Z"), start: new Date("2026-08-31T00:00:00.000Z") };
    const proposal = await runSolve({
      currentEvents,
      fetchImpl,
      onStatus: (status) => statuses.push(status),
      problem,
      runToken: "t1",
      session,
      solverSeconds: 999,
      window: solved,
    });
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
    assert.equal(calls[0]?.headers["Idempotency-Key"], "control-t1");
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as { problem: { resources: { id: string; name: string }[]; shifts: { id: string; title?: string }[] }; solverSeconds: number };
    assert.equal(submitted.solverSeconds, 120, "clamped to the session ceiling");
    assert.equal(submitted.problem.resources[0]?.id, "p-1");
    assert.equal(submitted.problem.resources[0]?.name, "p-1", "F23: no real names on the wire");
    assert.equal(submitted.problem.shifts[0]?.id, "w-1");
    assert.equal(calls[1]?.headers.Authorization, "Bearer session-token");
    assert.deepEqual(statuses, ["queued"]);
    assert.equal(proposal.runId, "run-1");
    assert.equal(proposal.events[0]?.resourceId, "res-ann", "unredacted back to the real resource");
    assert.equal(proposal.window, solved, "the proposal carries the period the run solved");
  }

  // F38: with the tenant's key the body carries stable placeholders, the scheme and the calendar's product
  {
    const keyed: SolveSession = { ...session, resourcePlaceholders: { key: "c2FtcGxlLXRlbmFudC1rZXktZm9yLXRlc3RzLW9ubHk", scheme: "hmac-sha256-v1" } };
    const { calls, fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/api/solve")
        ? { body: { pollAfterSeconds: 0, runId: "run-k", status: "queued" }, status: 202 }
        : { body: { result: { assignments: [], contractVersion: "2" }, status: "succeeded" }, status: 200 },
    );
    await runSolve({ currentEvents, fetchImpl, problem, runToken: "tk", session: keyed, solutionType: "scheduler" });
    const submitted = JSON.parse(calls[0]?.body ?? "{}") as { problem: { resources: { id: string }[] }; resourceKeyScheme?: string; solutionType: string };
    assert.equal(submitted.resourceKeyScheme, "hmac-sha256-v1");
    assert.equal(submitted.solutionType, "scheduler");
    assert.match(submitted.problem.resources[0]?.id ?? "", /^r-[A-Za-z0-9_-]{22}$/);
  }

  // F31 cancel: aborting the signal while polling rejects with the cancellation
  {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/api/solve")
        ? { body: { pollAfterSeconds: 0, runId: "run-c", status: "queued" }, status: 202 }
        : { body: { status: "running" }, status: 200 },
    );
    const controller = new AbortController();
    const pending = runSolve({
      currentEvents,
      fetchImpl,
      onStatus: (status) => {
        if (status === "running") {
          controller.abort();
        }
      },
      problem,
      runToken: "t-c",
      session,
      signal: controller.signal,
    });
    await assert.rejects(pending, (error: unknown) => error instanceof SolveCancelledError);
  }

  // 402 -> quota error; 409 run_in_flight -> follow error with the run id; 401 -> expired
  for (const [status, body, check] of [
    [402, { code: "quota_exceeded", message: "Daily free optimization limit reached." }, (e: unknown) => e instanceof SolveQuotaExceededError],
    [409, { code: "run_in_flight", runId: "run-running", status: "running" }, (e: unknown) => e instanceof SolveInFlightError && e.runId === "run-running"],
    [401, {}, (e: unknown) => e instanceof SolveSessionExpiredError],
  ] as const) {
    const { fetchImpl } = fakeFetch(() => ({ body, status }));
    await assert.rejects(
      runSolve({ currentEvents, fetchImpl, problem, runToken: "t2", session }),
      (error: unknown) => check(error),
      `status ${status}`,
    );
  }

  // reviewed: POST with bearer; 404 tolerated (run aged out)
  {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 404 }));
    await markRunReviewed(session, "run-old", fetchImpl);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "https://api.example/api/solve/run-old/reviewed");
    assert.equal(calls[0]?.headers.Authorization, "Bearer session-token");
  }

  // Release 1: the run's rule checks travel to the proposal on the real ids.
  {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/api/solve")
        ? { body: { pollAfterSeconds: 0, runId: "run-a", status: "queued" }, status: 202 }
        : {
            body: {
              result: {
                analysis: {
                  current: {
                    matches: [{ resourceId: "p-1", rule: "skills", shiftIds: ["w-1"] }],
                    mustBreaches: { ...noBreaches, skills: 1 },
                    openShifts: 1,
                  },
                  proposed: { matches: [], mustBreaches: noBreaches, openShifts: 0 },
                },
                assignments: [{ resourceId: "p-1", shiftId: "w-1" }],
                contractVersion: "2",
              },
              status: "succeeded",
            },
            status: 200,
          },
    );
    const proposal = await runSolve({ currentEvents, fetchImpl, problem, runToken: "ta", session });
    assert.equal(proposal.analysis?.current.matches?.[0]?.resourceId, "res-ann", "match person on the real id");
    assert.equal(proposal.analysis?.current.matches?.[0]?.shiftIds[0], "shift-real-1", "match shift on the real id");
    assert.equal(proposal.analysis?.current.mustBreaches.skills, 1);
    assert.equal(proposal.analysis?.proposed.openShifts, 0);
    assert.equal(proposal.analysis?.countsOnly, undefined);
  }

  // Absent is never zero: an older answer, or one with an unreadable count, has no analysis.
  {
    const check = (analysis: unknown): unknown =>
      solutionFromPoll("run-r", "succeeded", { analysis, assignments: [], contractVersion: "2" } as never).analysis;
    assert.equal(solutionFromPoll("run-old", "succeeded", { assignments: [], contractVersion: "2" }).analysis, undefined);
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
    // Counts only: the rosters carry no matches, whatever came with them.
    const countsOnly = solutionFromPoll("run-c", "succeeded", {
      analysis: {
        countsOnly: true,
        current: { ...roster, matches: [{ rule: "skills", shiftIds: ["w-1"] }] },
        proposed: roster,
      },
      assignments: [],
      contractVersion: "2",
    } as never).analysis;
    assert.equal(countsOnly?.countsOnly, true);
    assert.equal(countsOnly?.current.matches, undefined);
    assert.equal(countsOnly?.current.mustBreaches.skills, 0, "a counted zero is a zero");
  }

  // "Why not…?": one request, redacted, answered at once and mapped back.
  {
    const { calls, fetchImpl } = fakeFetch(() => ({
      body: {
        added: [{ resourceId: "p-1", rule: "restBetweenShifts", shiftIds: ["w-1"] }],
        contractVersion: "2",
        fit: "worse",
        removed: [{ rule: "spreadOfShifts", shiftIds: ["w-1"] }],
      },
      status: 200,
    }));
    const result = await checkCandidate(candidateOptions(fetchImpl));
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
    assert.equal(result.status, "answered");
    if (result.status === "answered") {
      assert.equal(result.check.fit, "worse");
      assert.equal(result.check.added[0]?.resourceId, "res-ann", "answer on the real person");
      assert.equal(result.check.added[0]?.shiftIds[0], "shift-real-1", "answer on the real shift");
      assert.equal(result.check.removed[0]?.rule, "spreadOfShifts");
    }
  }

  // RT2-6 (S4-2): an answer for an older roster is dropped. The response is held
  // until the planner drops a change, so it completes for a roster no longer on screen.
  {
    let version = 1;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = false;
    const fetchImpl = (async () => {
      await held;
      completed = true;
      return new Response(JSON.stringify({ added: [], contractVersion: "2", fit: "equal", removed: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }) as unknown as typeof fetch;
    const pending = checkCandidate({ ...candidateOptions(fetchImpl), currentRosterVersion: () => version, rosterVersion: 1 });
    version = 2;
    release();
    const result = await pending;
    assert.equal(completed, true, "the held response completed");
    assert.deepEqual(result, { status: "rosterChanged" }, "the answer for the older roster is dropped");

    // The same roster on screen: the answer shows.
    const same = await checkCandidate({ ...candidateOptions(fetchImpl), currentRosterVersion: () => "v7", rosterVersion: "v7" });
    assert.equal(same.status, "answered");

    // A failure that arrives after the roster changed is dropped the same way.
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
    const fetchImpl = (async () =>
      new Response(null, {
        headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
        status,
      })) as unknown as typeof fetch;
    await assert.rejects(
      checkCandidate(candidateOptions(fetchImpl)),
      (error: unknown) =>
        error instanceof CandidateCheckUnavailableError && error.status === status && error.retryAfterSeconds === expected,
      `status ${status}`,
    );
  }
  {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await assert.rejects(
      checkCandidate(candidateOptions(offline)),
      (error: unknown) => error instanceof CandidateCheckUnavailableError && error.status === undefined,
    );
  }

  // An expired session, a refused product and an unreadable answer are not "try again later".
  for (const [status, body, check] of [
    [401, {}, (e: unknown) => e instanceof SolveSessionExpiredError],
    [403, { code: "product_features_exceeded", message: "Not on this product" }, (e: unknown) => e instanceof Error && !(e instanceof CandidateCheckUnavailableError) && e.message === "Not on this product"],
    [200, { added: [], fit: "sideways", removed: [] }, (e: unknown) => e instanceof Error && /unreadable/.test(e.message)],
  ] as const) {
    const { fetchImpl } = fakeFetch(() => ({ body, status }));
    await assert.rejects(checkCandidate(candidateOptions(fetchImpl)), (error: unknown) => check(error), `status ${status}`);
  }

  // A candidate outside the problem is refused before anything is sent.
  {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 200 }));
    await assert.rejects(
      checkCandidate({ ...candidateOptions(fetchImpl), candidate: { resourceId: "res-gone", shiftId: "shift-real-1" } }),
    );
    assert.equal(calls.length, 0, "no request for a candidate the problem does not hold");
  }

  // Leaving the view cancels the check.
  {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl } = fakeFetch(() => ({ status: 200 }));
    await assert.rejects(
      checkCandidate({ ...candidateOptions(fetchImpl), signal: controller.signal }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }

  // askCandidate, for the board: every failure is "Could not check this now"; a rate limit says when.
  {
    const answer = fakeFetch(() => ({
      body: { added: [], contractVersion: "2", fit: "equal", removed: [] },
      status: 200,
    }));
    assert.deepEqual(await askCandidate(candidateOptions(answer.fetchImpl)), {
      check: { added: [], fit: "equal", removed: [] },
      status: "answered",
    });
    for (const [status, retryAfter, expected] of [
      [429, "12", { retryAfterSeconds: 12, status: "unavailable" }],
      [503, "2", { status: "unavailable" }],
      [504, undefined, { status: "unavailable" }],
      [400, undefined, { status: "unavailable" }],
    ] as const) {
      const fetchImpl = (async () =>
        new Response(null, {
          headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
          status,
        })) as unknown as typeof fetch;
      assert.deepEqual(await askCandidate(candidateOptions(fetchImpl)), expected, `status ${status}`);
    }
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    assert.deepEqual(await askCandidate(candidateOptions(offline)), { status: "unavailable" });
    // The host mints a new session and asks again; a cancelled check is dropped by its caller.
    const expired = fakeFetch(() => ({ body: {}, status: 401 }));
    await assert.rejects(askCandidate(candidateOptions(expired.fetchImpl)), (error: unknown) => error instanceof SolveSessionExpiredError);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      askCandidate({ ...candidateOptions(answer.fetchImpl), signal: controller.signal }),
      (error: unknown) => error instanceof SolveCancelledError,
    );
  }

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

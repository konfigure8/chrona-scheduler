import * as assert from "node:assert/strict";

import {
  canonicalizeProblem,
  clampSolverSeconds,
  hashProblem,
  markRunReviewed,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveQuotaExceededError,
  SolveSessionExpiredError,
  type SolveSession,
} from "../src/solveClient";
import type { ScheduleProblemV2 } from "../src/schedulingContract";

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
    const proposal = await runSolve({
      currentEvents,
      fetchImpl,
      onStatus: (status) => statuses.push(status),
      problem,
      runToken: "t1",
      session,
      solverSeconds: 999,
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

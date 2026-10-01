import * as assert from "node:assert/strict";

import {
  classifyFailure,
  connectEnvironment,
  CONTROL_VERSION,
  fetchSolveSession,
  SolveBridgeError,
} from "../SchedulerControl/solveBridge";

/*
 * F26 stage 3: the control's two Custom API calls, with fetch stubbed.
 * The Dataverse side is proven in the environment pass; here the wire
 * shape, the session parsing, and the failure classification.
 */

type Call = { readonly body: unknown; readonly url: string };

function fakeFetch(status: number, payload: unknown): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ body: JSON.parse(String(init?.body ?? "null")), url: String(input) });
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

// failure classification drives what the control shows
assert.equal(classifyFailure(400, "Chrona is not connected in this environment. An administrator runs Connect first."), "notConnected");
assert.equal(classifyFailure(403, "Principal user is missing prvCreatechr_chronasolveaccess privilege"), "noPrivilege");
assert.equal(classifyFailure(400, "Access is denied."), "noPrivilege");
assert.equal(classifyFailure(500, "Something else"), "other");

const run = async (): Promise<void> => {
  // session: posts the calendar and default, parses the verbatim JSON, lifts PortalUrl
  {
    const session = { apiBaseUrl: "https://api", entitlement: { capabilities: ["solve"], token: "e" }, quota: { remainingSolves: 2 }, token: "t" };
    const { calls, fetchImpl } = fakeFetch(200, { PortalUrl: " https://portal ", Session: JSON.stringify(session) });
    const result = await fetchSolveSession("https://org.crm6.dynamics.com", "cal-1", { defaultSolverSeconds: 45.7, solutionType: "scheduler" }, fetchImpl);
    assert.equal(calls[0]?.url, "https://org.crm6.dynamics.com/api/data/v9.2/chr_ChronaSolveSession");
    // F27 stage 2: the entitlement session rides along verbatim.
    assert.deepEqual(result.entitlement, { capabilities: ["solve"], token: "e" });
    // F38: the session names the calendar's product.
    assert.deepEqual(calls[0]?.body, { CalendarId: "cal-1", DefaultSolverSeconds: 45, SolutionType: "scheduler" });
    assert.deepEqual(result, { ...session, portalUrl: "https://portal" });
  }
  // session without a default and without a portal URL
  {
    const { calls, fetchImpl } = fakeFetch(200, { PortalUrl: "", Session: "{\"token\":\"t\"}" });
    const result = await fetchSolveSession("https://org", "cal-1", {}, fetchImpl);
    assert.deepEqual(calls[0]?.body, { CalendarId: "cal-1" });
    assert.deepEqual(result, { token: "t" });
  }
  // a Dataverse error becomes a typed failure with the platform's message
  {
    const { fetchImpl } = fakeFetch(400, { error: { message: "Chrona is not connected in this environment." } });
    await assert.rejects(
      fetchSolveSession("https://org", "cal-1", {}, fetchImpl),
      (error: unknown) => error instanceof SolveBridgeError && error.failure === "notConnected",
    );
  }
  // connect: sends the control version, maps the outputs
  {
    const { calls, fetchImpl } = fakeFetch(200, { AccountKey: "tid", DailySolveLimit: 3, EnvironmentId: "org.crm6.dynamics.com", Rotated: true });
    const result = await connectEnvironment("https://org", fetchImpl);
    assert.equal(calls[0]?.url, "https://org/api/data/v9.2/chr_ChronaConnect");
    assert.deepEqual(calls[0]?.body, { ControlVersion: CONTROL_VERSION });
    assert.deepEqual(result, { accountKey: "tid", dailySolveLimit: 3, environmentId: "org.crm6.dynamics.com", rotated: true });
  }
  console.log("solveBridge tests passed");
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

import * as assert from "node:assert/strict";

import {
  calendarSettingsReady,
  classifyFailure,
  connectEnvironment,
  CONTROL_VERSION,
  fetchSolveSession,
  resolveClientUrl,
  SolveBridgeError,
  solveClickAction,
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

// The client URL: the host's answer, else the page origin - also when the
// host cannot answer (the PCF test harness throws from getClientUrl).
const globals = globalThis as { window?: { location: { origin: string } } };
if (!globals.window) {
  globals.window = { location: { origin: "https://org.crm6.dynamics.com" } };
}
const origin = globals.window.location.origin;
assert.equal(resolveClientUrl({ page: { getClientUrl: () => "https://env.crm6.dynamics.com/" } }), "https://env.crm6.dynamics.com");
assert.equal(resolveClientUrl({ page: { getClientUrl: (): string => { throw new TypeError("xrmProxy.Page.getClientUrl is not a function"); } } }), origin);
assert.equal(resolveClientUrl({}), origin);

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

  // A Solve click before the calendar's settings load waits, shown as queued,
  // instead of doing nothing; once they load without a calendar, the board says so.
  {
    const loading = { boundCalendarId: "", effectiveCalendarId: "", loadedFor: undefined, viewRowAnswered: false };
    assert.equal(calendarSettingsReady(loading), false, "the view row has not answered");
    assert.equal(
      calendarSettingsReady({ ...loading, effectiveCalendarId: "cal-1", loadedFor: "", viewRowAnswered: true }),
      false,
      "the view row named a calendar whose settings are still loading",
    );
    assert.equal(
      calendarSettingsReady({ ...loading, effectiveCalendarId: "cal-1", loadedFor: "cal-1", viewRowAnswered: true }),
      true,
    );
    assert.equal(
      calendarSettingsReady({ ...loading, boundCalendarId: "cal-2", effectiveCalendarId: "cal-2", loadedFor: "cal-2" }),
      true,
      "a bound calendar does not wait for the view row",
    );
    assert.equal(calendarSettingsReady({ ...loading, loadedFor: "", viewRowAnswered: true }), true, "no calendar at all");

    assert.equal(solveClickAction({ calendarId: undefined, hasSession: false, settingsReady: false }), "wait");
    assert.equal(solveClickAction({ calendarId: "cal-1", hasSession: false, settingsReady: true }), "run");
    assert.equal(solveClickAction({ calendarId: undefined, hasSession: true, settingsReady: false }), "run");
    assert.equal(solveClickAction({ calendarId: undefined, hasSession: false, settingsReady: true }), "noCalendar");
  }
  console.log("solveBridge tests passed");
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

/**
 * F27 Entitlement session, stage 2 (rulings 2026-09-10): claims drive
 * features; degradation is fail-open on silence and fail-closed only
 * on a signed "no"; the cache reads back exactly what was saved and
 * nothing else; the control-direct refresh classifies its failures.
 */
import {
  CAPABILITY_SOLVE,
  createEntitlementCache,
  deriveEntitlementStatus,
  ENTITLEMENT_PAUSE_AFTER_MS,
  entitlementAllows,
  entitlementDueForRefresh,
  EntitlementExpiredError,
  EntitlementUnreachableError,
  markEntitlementFailure,
  parseEntitlementSession,
  planUsageUrl,
  refreshEntitlement,
  scenarioCapability,
  toEntitlementDisplay,
  type EntitlementSession,
  type EntitlementSnapshot,
} from "../src/entitlement";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function assertRejects(promise: Promise<unknown>, type: new (...args: never[]) => Error, label: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof type) {
      return;
    }
    throw new Error(`${label}: rejected with ${String(error)}`);
  }
  throw new Error(`${label}: did not reject`);
}

const now = new Date("2026-09-10T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const day = 24 * hour;

const paid: EntitlementSession = {
  capabilities: ["solve", "recommend", "workerChangeValidation", "configGenerators", "scenario:workforce-scheduling"],
  expiresAt: new Date(now.getTime() + 14 * day).toISOString(),
  metrics: { resourcesIncluded: 50, resourcesScheduledHighWater: 41, resourcesScheduledLatest: 12 },
  paymentState: "current",
  period: { end: "2026-10-01T00:00:00.000Z", start: "2026-09-01T00:00:00.000Z" },
  refreshAfter: new Date(now.getTime() + hour).toISOString(),
  solutionType: "workforce-scheduling",
  tier: "workforce-pro",
  token: "ent-token",
};
const snapshot = (session: EntitlementSession, fetchedAt: Date = now): EntitlementSnapshot => ({
  apiBaseUrl: "https://api.example",
  fetchedAt: fetchedAt.toISOString(),
  session,
});

const run = async (): Promise<void> => {
  // No claims: the control behaves as before claims existed.
  assertEqual(deriveEntitlementStatus(undefined, now), undefined, "no snapshot, no status");
  assertEqual(entitlementAllows(undefined, CAPABILITY_SOLVE), true, "no claims allow solve");
  assertEqual(entitlementAllows(undefined, scenarioCapability("workforce-scheduling")), true, "no claims allow the scenario");
  assertEqual(toEntitlementDisplay(undefined), undefined, "nothing to display");

  // Paid and current: every claimed capability, the metric with its ceiling.
  const current = deriveEntitlementStatus(snapshot(paid), now);
  assertEqual(current?.kind, "current", "current kind");
  assertEqual(entitlementAllows(current, CAPABILITY_SOLVE), true, "current solves");
  assertEqual(entitlementAllows(current, "scenario:workforce-scheduling"), true, "current has the scenario");
  assertEqual(entitlementAllows(current, "scenario:field-services"), false, "another scenario is not claimed");
  const display = toEntitlementDisplay(current, { planUrl: "https://portal.example/plan?environment=org" });
  assertEqual(display?.resourcesScheduled, 41, "high-water mark wins over the latest count");
  assertEqual(display?.resourcesIncluded, 50, "ceiling shown");
  assertEqual(display?.planUrl, "https://portal.example/plan?environment=org", "plan link carried");
  assertEqual(display?.aboveCeiling, undefined, "under the ceiling");
  const above = deriveEntitlementStatus(snapshot({ ...paid, metrics: { resourcesIncluded: 50, resourcesScheduledHighWater: 50 } }), now);
  assertEqual(toEntitlementDisplay(above)?.aboveCeiling, true, "at the ceiling counts as above plan");
  assertEqual(planUsageUrl("https://portal.example/environments?x=1#y", "org.crm6.dynamics.com"), "https://portal.example/plan?environment=org.crm6.dynamics.com", "plan link from any portal link");
  assertEqual(planUsageUrl("https://portal.example/"), "https://portal.example/plan", "plan link without an environment");
  assertEqual(planUsageUrl(undefined, "org"), undefined, "no portal link, no plan link");
  assertEqual(planUsageUrl("not a url"), undefined, "a broken link yields none");

  // Free registered: solve only, no metric.
  const free = deriveEntitlementStatus(snapshot({ ...paid, capabilities: ["solve"], metrics: {}, paymentState: "free", tier: "free" }), now);
  assertEqual(free?.kind, "free", "free kind");
  assertEqual(entitlementAllows(free, "scenario:workforce-scheduling"), false, "free has no scenario");
  assertEqual(toEntitlementDisplay(free)?.resourcesScheduled, undefined, "free shows no metric");

  // Grace: everything stays, the end of grace is shown.
  const graceUntil = new Date(now.getTime() + 3 * day).toISOString();
  const grace = deriveEntitlementStatus(snapshot({ ...paid, graceUntil, paymentState: "grace" }), now);
  assertEqual(grace?.kind, "grace", "grace kind");
  assertEqual(grace?.graceUntil?.toISOString(), graceUntil, "grace end");
  assertEqual(entitlementAllows(grace, CAPABILITY_SOLVE), true, "grace still solves");

  // Lapsed: the signed "no" - nothing is offered, whatever the claims list.
  const lapsed = deriveEntitlementStatus(snapshot({ ...paid, paymentState: "lapsed" }), now);
  assertEqual(lapsed?.kind, "lapsed", "lapsed kind");
  assertEqual(entitlementAllows(lapsed, CAPABILITY_SOLVE), false, "lapsed cannot solve");
  assertEqual(entitlementAllows(lapsed, "scenario:workforce-scheduling"), false, "lapsed domain is read-only");
  assertEqual(toEntitlementDisplay(lapsed)?.kind, "lapsed", "lapsed display");

  // Silence: a failed refresh before the hint is a blip; the first failure past the hint pauses
  // the optimizer since that moment, the rest keeps working; a very old snapshot pauses too.
  const early = markEntitlementFailure(snapshot(paid), now);
  assertEqual(early.failedSince, undefined, "a failure before the hint is not recorded");
  const dueSnapshot = snapshot({ ...paid, refreshAfter: new Date(now.getTime() - 30 * 60 * 1000).toISOString() }, new Date(now.getTime() - 2 * hour));
  const failed = markEntitlementFailure(dueSnapshot, now);
  assertEqual(failed.failedSince, now.toISOString(), "the first failure past the hint is recorded");
  assertEqual(markEntitlementFailure(failed, new Date(now.getTime() + hour)).failedSince, now.toISOString(), "later failures keep the first");
  assertEqual(deriveEntitlementStatus(dueSnapshot, now)?.kind, "current", "a missed hint alone changes nothing");
  const paused = deriveEntitlementStatus(failed, new Date(now.getTime() + 10 * 60 * 1000));
  assertEqual(paused?.kind, "paused", "a failed refresh past the hint pauses");
  assertEqual(paused?.pausedSince?.toISOString(), now.toISOString(), "paused since the failure");
  assertEqual(entitlementAllows(paused, CAPABILITY_SOLVE), false, "paused withdraws solve");
  assertEqual(entitlementAllows(paused, "scenario:workforce-scheduling"), true, "paused keeps the domain");
  const staleHint = new Date(now.getTime() - 23 * hour).toISOString();
  const stale = deriveEntitlementStatus(
    snapshot({ ...paid, refreshAfter: staleHint }, new Date(now.getTime() - ENTITLEMENT_PAUSE_AFTER_MS - 1)),
    now,
  );
  assertEqual(stale?.kind, "paused", "a day-old snapshot with no recorded failure pauses");
  assertEqual(stale?.pausedSince?.toISOString(), staleHint, "paused since the hint when no failure was recorded");
  const expired = deriveEntitlementStatus(snapshot({ ...paid, expiresAt: new Date(now.getTime() - 1).toISOString() }), now);
  assertEqual(expired?.kind, "paused", "past the hard expiry reads as paused");
  const lapsedAndSilent = deriveEntitlementStatus(snapshot({ ...paid, paymentState: "lapsed" }, new Date(now.getTime() - 2 * day)), now);
  assertEqual(lapsedAndSilent?.kind, "lapsed", "a signed no outranks silence");

  // Refresh timing follows the server's hint.
  assertEqual(entitlementDueForRefresh(snapshot(paid), now), false, "not yet due");
  assertEqual(entitlementDueForRefresh(snapshot(paid), new Date(now.getTime() + hour)), true, "due at the hint");
  assertEqual(entitlementDueForRefresh(undefined, now), false, "nothing to refresh");

  // Parsing accepts the server's shape and refuses anything else.
  assertEqual(parseEntitlementSession(paid)?.token, "ent-token", "parses the server shape");
  assertEqual(parseEntitlementSession({ ...paid, paymentState: "unknown" }), undefined, "unknown payment state refused");
  assertEqual(parseEntitlementSession({ ...paid, token: "" }), undefined, "empty token refused");
  assertEqual(parseEntitlementSession("text"), undefined, "non-object refused");
  assertEqual(parseEntitlementSession({ ...paid, capabilities: ["solve", 7, ""] })?.capabilities.join(","), "solve", "capabilities filtered to names");

  // The cache round-trips a snapshot, ignores foreign payloads, and survives a missing store.
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => store.get(key) ?? null,
    removeItem: (key: string): void => {
      store.delete(key);
    },
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
  };
  const cache = createEntitlementCache("chrona-sched:entitlement:v1:org.crm6.dynamics.com:cal-1", storage);
  assertEqual(cache.load(), undefined, "empty cache");
  cache.save({ ...snapshot(paid), failedSince: now.toISOString(), portalUrl: "https://portal.example/" });
  assertEqual(cache.load()?.session.token, "ent-token", "round trip");
  assertEqual(cache.load()?.apiBaseUrl, "https://api.example", "api base kept");
  assertEqual(cache.load()?.failedSince, now.toISOString(), "failure kept");
  assertEqual(cache.load()?.portalUrl, "https://portal.example/", "portal link kept for the rope");
  store.set("chrona-sched:entitlement:v1:org.crm6.dynamics.com:cal-1", JSON.stringify({ v: 2, session: paid }));
  assertEqual(cache.load(), undefined, "another version reads as absent");
  store.set("chrona-sched:entitlement:v1:org.crm6.dynamics.com:cal-1", "{not json");
  assertEqual(cache.load(), undefined, "corrupt payload reads as absent");
  cache.clear();
  assertEqual(store.size, 0, "cleared");
  assertEqual(createEntitlementCache("scope", undefined).load(), undefined, "no storage, no claims");
  createEntitlementCache("scope", undefined).save(snapshot(paid));

  // Control-direct refresh: the cached session is the bearer; failures are classified.
  const calls: { body: string; headers: Record<string, string>; url: string }[] = [];
  const respond = (status: number, body: unknown): typeof fetch =>
    (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({
        body: String(init?.body ?? ""),
        headers: (init?.headers ?? {}) as Record<string, string>,
        url: String(input),
      });
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
    }) as typeof fetch;
  const fresh = await refreshEntitlement({
    apiBaseUrl: "https://api.example/",
    calendarId: "cal-1",
    fetchImpl: respond(200, { ...paid, token: "ent-token-2" }),
    solutionType: "workforce-scheduling",
    token: "ent-token",
  });
  assertEqual(fresh.token, "ent-token-2", "fresh session returned");
  assertEqual(calls[0]?.url, "https://api.example/api/environment/entitlement/refresh", "refresh route, trailing slash trimmed");
  assertEqual(calls[0]?.headers.authorization, "Bearer ent-token", "the entitlement session is the bearer");
  assertEqual(calls[0]?.body, JSON.stringify({ calendarId: "cal-1", solutionType: "workforce-scheduling" }), "body names the calendar and solution");
  await assertRejects(
    refreshEntitlement({ apiBaseUrl: "https://api.example", fetchImpl: respond(401, { code: "unauthorized" }), token: "old" }),
    EntitlementExpiredError,
    "401 is a refused bearer",
  );
  await assertRejects(
    refreshEntitlement({ apiBaseUrl: "https://api.example", fetchImpl: respond(503, { code: "down" }), token: "t" }),
    EntitlementUnreachableError,
    "503 is unreachable",
  );
  await assertRejects(
    refreshEntitlement({ apiBaseUrl: "https://api.example", fetchImpl: respond(200, { nope: true }), token: "t" }),
    EntitlementUnreachableError,
    "an unexpected shape is unreachable, never claims",
  );
  const failing = (async () => {
    throw new TypeError("network down");
  }) as unknown as typeof fetch;
  await assertRejects(
    refreshEntitlement({ apiBaseUrl: "https://api.example", fetchImpl: failing, token: "t" }),
    EntitlementUnreachableError,
    "a network error is unreachable",
  );

  console.log("entitlement tests passed");
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

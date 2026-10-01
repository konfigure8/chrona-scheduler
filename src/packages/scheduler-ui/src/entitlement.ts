/**
 * F27 Entitlement session, stage 2 (rulings 2026-09-10): the control
 * enables domain features from the claims the server signed, never
 * from a flag in the package. The entitlement session travels beside
 * the solve token (two artefacts), is cached to its hard expiry, and
 * is refreshed control-direct with itself as the bearer.
 *
 * Degradation is fail-open on silence, fail-closed only on "no"
 * (rulings 2026-09-10, revised the same day for visibility):
 * - a refresh that fails once the server's hint has passed pauses the
 *   optimizer: a warning chip says since when, offers Retry, and keeps
 *   every other feature working - the planner is the one who raises
 *   the alarm, so silence is never silent;
 * - a signed lapsed claim (past due beyond grace, blocked, cancelled)
 *   turns the paid domain read-only: Optimize and Generate withdraw
 *   behind a warning bar that says why;
 * - grace and a count above the plan's ceiling are warning chips;
 * - no claims at all (not connected, or a server that sends none)
 *   leaves the control exactly as it was before claims existed.
 * Never modal, never blocking, never a locked roster. The standing
 * "Plan and usage" link is there whenever claims are, trouble or not.
 */

export type EntitlementPaymentState = "current" | "free" | "grace" | "lapsed";

/** What the session endpoint returns under `entitlement`; the server's shape, verbatim. */
export interface EntitlementSession {
  readonly capabilities: readonly string[];
  readonly expiresAt: string;
  readonly graceUntil?: string;
  readonly metrics: {
    readonly resourcesIncluded?: number;
    readonly resourcesScheduledHighWater?: number;
    readonly resourcesScheduledLatest?: number;
  };
  readonly paymentState: EntitlementPaymentState;
  readonly period: { readonly end: string; readonly start: string };
  readonly refreshAfter: string;
  readonly solutionType: string;
  readonly tier: string;
  readonly token: string;
}

/** The capability names the claims use; unknown names are kept and ignored. */
export const CAPABILITY_SOLVE = "solve";
export const CAPABILITY_RECOMMEND = "recommend";
export const CAPABILITY_WORKER_CHANGE_VALIDATION = "workerChangeValidation";
export const CAPABILITY_CONFIG_GENERATORS = "configGenerators";
export const scenarioCapability = (solutionType: string): string => `scenario:${solutionType}`;

/** A cached entitlement: the session, where it came from, and when it was last confirmed. */
export interface EntitlementSnapshot {
  readonly apiBaseUrl: string;
  /** ISO instant of the first refresh that failed after the hint; cleared by a success. */
  readonly failedSince?: string;
  /** ISO instant of the last successful fetch or refresh. */
  readonly fetchedAt: string;
  /** The portal link the host learned with the session; cached so the rope survives an outage. */
  readonly portalUrl?: string;
  readonly session: EntitlementSession;
}

/** A snapshot this old with no recorded failure (the app was closed) also reads as paused. */
export const ENTITLEMENT_PAUSE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Record a failed refresh: the first failure past the hint starts the pause. */
export function markEntitlementFailure(snapshot: EntitlementSnapshot, now: Date): EntitlementSnapshot {
  if (snapshot.failedSince || !entitlementDueForRefresh(snapshot, now)) {
    return snapshot;
  }
  return { ...snapshot, failedSince: now.toISOString() };
}

export type EntitlementStatusKind = "current" | "free" | "grace" | "lapsed" | "paused";

export interface EntitlementStatus {
  /** Capabilities in force now: the claims, minus what the state withdraws. */
  readonly capabilities: readonly string[];
  readonly graceUntil?: Date;
  readonly kind: EntitlementStatusKind;
  /** When the optimizer paused: the first failed refresh, else the hint, else the hard expiry. */
  readonly pausedSince?: Date;
  readonly session: EntitlementSession;
}

/**
 * The state the claims are in at `now`. Undefined when there is no
 * snapshot: the control then behaves as it did before claims existed.
 */
export function deriveEntitlementStatus(
  snapshot: EntitlementSnapshot | undefined,
  now: Date,
): EntitlementStatus | undefined {
  if (!snapshot) {
    return undefined;
  }
  const { session } = snapshot;
  const nowMs = now.getTime();
  const fetchedMs = Date.parse(snapshot.fetchedAt);
  const expiresMs = Date.parse(session.expiresAt);
  const refreshMs = Date.parse(session.refreshAfter);
  const failedMs = snapshot.failedSince ? Date.parse(snapshot.failedSince) : NaN;
  const expired = Number.isFinite(expiresMs) && nowMs >= expiresMs;
  const stale = !Number.isFinite(fetchedMs) || nowMs - fetchedMs > ENTITLEMENT_PAUSE_AFTER_MS;
  const failed = Number.isFinite(failedMs) && nowMs >= failedMs;
  if (session.paymentState === "lapsed") {
    return { capabilities: [], kind: "lapsed", session };
  }
  if (failed || stale || expired) {
    const pausedSinceMs = failed
      ? failedMs
      : Number.isFinite(refreshMs) && refreshMs <= nowMs
        ? refreshMs
        : Number.isFinite(expiresMs)
          ? Math.min(expiresMs, nowMs)
          : nowMs;
    return {
      capabilities: session.capabilities.filter((name) => name !== CAPABILITY_SOLVE),
      kind: "paused",
      pausedSince: new Date(pausedSinceMs),
      session,
    };
  }
  if (session.paymentState === "grace") {
    const graceMs = session.graceUntil ? Date.parse(session.graceUntil) : NaN;
    return {
      capabilities: session.capabilities,
      ...(Number.isFinite(graceMs) ? { graceUntil: new Date(graceMs) } : {}),
      kind: "grace",
      session,
    };
  }
  return {
    capabilities: session.capabilities,
    kind: session.paymentState === "free" ? "free" : "current",
    session,
  };
}

/** True when the claims allow the capability, or when there are no claims to consult. */
export function entitlementAllows(status: EntitlementStatus | undefined, capability: string): boolean {
  return status ? status.capabilities.includes(capability) : true;
}

/** When the cached claims should next be refreshed (the server's hint). */
export function entitlementDueForRefresh(snapshot: EntitlementSnapshot | undefined, now: Date): boolean {
  if (!snapshot) {
    return false;
  }
  const dueMs = Date.parse(snapshot.session.refreshAfter);
  return !Number.isFinite(dueMs) || now.getTime() >= dueMs;
}

/** What the surface shows about the entitlement (display only, F19). */
export interface EntitlementDisplay {
  /** True when the scheduled count has reached the plan's ceiling. */
  readonly aboveCeiling?: boolean;
  readonly graceUntil?: Date;
  readonly kind: EntitlementStatusKind;
  /** Runs a refresh now; shown as Retry beside the paused chip. */
  readonly onRetry?: () => void;
  readonly pausedSince?: Date;
  /** The portal's Plan and usage page; the standing link. */
  readonly planUrl?: string;
  /** The plan's ceiling, when it states one. */
  readonly resourcesIncluded?: number;
  /** Resources scheduled this period: the high-water mark, else the calendar's latest. */
  readonly resourcesScheduled?: number;
}

export interface EntitlementDisplayOptions {
  readonly onRetry?: () => void;
  readonly planUrl?: string;
}

export function toEntitlementDisplay(
  status: EntitlementStatus | undefined,
  options: EntitlementDisplayOptions = {},
): EntitlementDisplay | undefined {
  if (!status) {
    return undefined;
  }
  const metrics = status.session.metrics;
  const scheduled = metrics.resourcesScheduledHighWater ?? metrics.resourcesScheduledLatest;
  const included = metrics.resourcesIncluded;
  return {
    ...(scheduled !== undefined && included !== undefined && scheduled >= included ? { aboveCeiling: true } : {}),
    ...(status.graceUntil ? { graceUntil: status.graceUntil } : {}),
    kind: status.kind,
    ...(options.onRetry ? { onRetry: options.onRetry } : {}),
    ...(status.pausedSince ? { pausedSince: status.pausedSince } : {}),
    ...(options.planUrl ? { planUrl: options.planUrl } : {}),
    ...(included !== undefined ? { resourcesIncluded: included } : {}),
    ...(scheduled !== undefined ? { resourcesScheduled: scheduled } : {}),
  };
}

/**
 * The portal's Plan and usage page for this environment, from the
 * portal link the session carried. The environment host lets the
 * portal preselect the environment; the control never hardcodes the
 * portal's address.
 */
export function planUsageUrl(portalUrl: string | undefined, environmentHost?: string): string | undefined {
  if (!portalUrl) {
    return undefined;
  }
  try {
    const url = new URL(portalUrl);
    url.pathname = "/plan";
    url.search = "";
    url.hash = "";
    if (environmentHost) {
      url.searchParams.set("environment", environmentHost);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ cache */

export interface EntitlementCache {
  readonly clear: () => void;
  readonly load: () => EntitlementSnapshot | undefined;
  readonly save: (snapshot: EntitlementSnapshot) => void;
}

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The cached entitlement under the versioned key seam. A host scopes
 * the key by environment and calendar. Corrupt or foreign payloads
 * read as absent, never as claims.
 */
export function createEntitlementCache(
  scopeKey: string,
  storage: StorageLike | undefined = defaultStorage(),
): EntitlementCache {
  return {
    clear: (): void => {
      try {
        storage?.removeItem(scopeKey);
      } catch {
        // Storage may be unavailable; the claims simply do not persist.
      }
    },
    load: (): EntitlementSnapshot | undefined => {
      try {
        const raw = storage?.getItem(scopeKey);
        if (!raw) {
          return undefined;
        }
        return parseSnapshot(JSON.parse(raw));
      } catch {
        return undefined;
      }
    },
    save: (snapshot): void => {
      try {
        storage?.setItem(scopeKey, JSON.stringify({ v: 1, ...snapshot }));
      } catch {
        // Ignored: an unpersisted snapshot only costs a refresh next load.
      }
    },
  };
}

export function parseEntitlementSession(value: unknown): EntitlementSession | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const token = asString(record.token);
  const expiresAt = asString(record.expiresAt);
  const refreshAfter = asString(record.refreshAfter);
  const tier = asString(record.tier);
  const solutionType = asString(record.solutionType);
  const paymentState = asString(record.paymentState);
  const period = record.period as Record<string, unknown> | undefined;
  const periodStart = asString(period?.start);
  const periodEnd = asString(period?.end);
  if (
    !token ||
    !expiresAt ||
    !refreshAfter ||
    !tier ||
    !solutionType ||
    !periodStart ||
    !periodEnd ||
    !isPaymentState(paymentState)
  ) {
    return undefined;
  }
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
  const metrics = (record.metrics ?? {}) as Record<string, unknown>;
  const graceUntil = asString(record.graceUntil);
  return {
    capabilities,
    expiresAt,
    ...(graceUntil ? { graceUntil } : {}),
    metrics: {
      ...(asNumber(metrics.resourcesIncluded) !== undefined ? { resourcesIncluded: asNumber(metrics.resourcesIncluded) } : {}),
      ...(asNumber(metrics.resourcesScheduledHighWater) !== undefined
        ? { resourcesScheduledHighWater: asNumber(metrics.resourcesScheduledHighWater) }
        : {}),
      ...(asNumber(metrics.resourcesScheduledLatest) !== undefined
        ? { resourcesScheduledLatest: asNumber(metrics.resourcesScheduledLatest) }
        : {}),
    },
    paymentState,
    period: { end: periodEnd, start: periodStart },
    refreshAfter,
    solutionType,
    tier,
    token,
  };
}

function parseSnapshot(value: unknown): EntitlementSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.v !== 1) {
    return undefined;
  }
  const apiBaseUrl = asString(record.apiBaseUrl);
  const fetchedAt = asString(record.fetchedAt);
  const failedSince = asString(record.failedSince);
  const portalUrl = asString(record.portalUrl);
  const session = parseEntitlementSession(record.session);
  return apiBaseUrl && fetchedAt && session
    ? {
        apiBaseUrl,
        ...(failedSince ? { failedSince } : {}),
        fetchedAt,
        ...(portalUrl ? { portalUrl } : {}),
        session,
      }
    : undefined;
}

function isPaymentState(value: string | undefined): value is EntitlementPaymentState {
  return value === "current" || value === "free" || value === "grace" || value === "lapsed";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/* ---------------------------------------------------------------- refresh */

/** The server refused the bearer: re-bootstrap through the host's session call. */
export class EntitlementExpiredError extends Error {}
/** Chrona could not be reached, or answered with a server error: keep the cache. */
export class EntitlementUnreachableError extends Error {}

export interface RefreshEntitlementOptions {
  readonly apiBaseUrl: string;
  /** Names the calendar whose latest count the metrics should carry. */
  readonly calendarId?: string;
  readonly fetchImpl?: typeof fetch;
  readonly solutionType?: string;
  /** The cached entitlement session token: the bearer for the refresh. */
  readonly token: string;
}

/**
 * Control-direct refresh (ruled 2026-09-10, option A): the cached
 * entitlement session is the bearer, so the refresh can widen nothing
 * and needs no plugin round trip.
 */
export async function refreshEntitlement(options: RefreshEntitlementOptions): Promise<EntitlementSession> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, "")}/api/environment/entitlement/refresh`, {
      body: JSON.stringify({
        ...(options.calendarId ? { calendarId: options.calendarId } : {}),
        ...(options.solutionType ? { solutionType: options.solutionType } : {}),
      }),
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    throw new EntitlementUnreachableError(error instanceof Error ? error.message : String(error));
  }
  if (response.status === 401 || response.status === 403) {
    throw new EntitlementExpiredError(`Entitlement refresh refused (${response.status})`);
  }
  if (!response.ok) {
    throw new EntitlementUnreachableError(`Entitlement refresh failed (${response.status})`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new EntitlementUnreachableError(error instanceof Error ? error.message : String(error));
  }
  const session = parseEntitlementSession(payload);
  if (!session) {
    throw new EntitlementUnreachableError("Entitlement refresh returned an unexpected shape");
  }
  return session;
}

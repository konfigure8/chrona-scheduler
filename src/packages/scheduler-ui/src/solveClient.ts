/**
 * The solve client (F26 stage 3): submit, poll, map the answer back.
 * Moved here from the harness so the PCF control can use it. It talks
 * to the solver API directly with a SOLVE SESSION (Q3 option C): the
 * host obtains the session - base URL, short-lived bearer token, the
 * tier's seconds bounds, quota state, the calendar's latest run - and
 * this client never sees the environment key.
 *
 * F23 still applies: the problem is redacted before it becomes a wire
 * request, and the answer is unredacted with the request's own map.
 * A run reviewed AFTER a navigation has no map in memory; `hashProblem`
 * lets the host prove the rebuilt problem is byte-identical to what
 * the server hashed, so the rebuilt map is the right one.
 *
 * "Why not…?" (`checkCandidate`) is one request and one answer: no run,
 * no queue, no poll. Each check keeps the version of the roster it was
 * built from (in the browser; it never goes on the wire), and an answer
 * for a roster that has changed since is dropped, so a shown answer
 * always belongs to the roster on screen.
 */
import type { ScheduleCandidate, ScheduleCandidateCheck, ScheduleProblemV2 } from "./schedulingContract";
import type { ScheduleProposal } from "./solve";
import {
  buildCandidateRequest,
  buildSolveRequest,
  proposalFromSolution,
  readCandidateCheck,
  solutionFromPoll,
  type SolvePollResponse,
  type SolveSubmitResponse,
} from "./solveTransport";
import {
  redactCandidate,
  redactProblemForTenant,
  unredactCandidateCheck,
  unredactSolution,
  type RedactedProblem,
  type ResourcePlaceholderKey,
} from "./redaction";
import type { SolveCapability } from "./capabilities";
import type { EntitlementSession } from "./entitlement";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export type SolveSessionRunStatus = "failed" | "queued" | "running" | "succeeded";

/** The calendar's most recent run, as the session endpoint reports it. */
export interface SolveSessionLatestRun {
  readonly completedAt?: string;
  readonly createdAt: string;
  /** Server hash of the redacted problem it solved; lets a review
   * after navigation prove the rebuilt problem matches. */
  readonly payloadHash?: string;
  readonly reviewedAt?: string;
  readonly runId: string;
  readonly status: SolveSessionRunStatus;
  readonly submittedByUserId?: string;
}

/** What "get solve session" returns; the server's shape, verbatim. */
export interface SolveSession {
  readonly apiBaseUrl: string;
  readonly expiresAt: string;
  readonly latestRun?: SolveSessionLatestRun;
  /** Portal deep link for "Open Chrona account"; empty until Stage 4. */
  readonly portalUrl?: string;
  readonly quota: {
    readonly dailySolveLimit: number;
    readonly remainingSolves: number;
    readonly solvesUsedToday: number;
  };
  readonly solverSeconds: {
    readonly default: number;
    readonly max: number;
    readonly min: number;
  };
  readonly tier: string;
  readonly token: string;
  /** F27 stage 1: the entitlement session beside the solve token; absent from older servers. */
  readonly entitlement?: EntitlementSession;
  /** F38: the tenant's key for stable resource placeholders; absent from older servers. */
  readonly resourcePlaceholders?: ResourcePlaceholderKey;
}

/** HTTP 402 quota_exceeded (F19: enforcement is server-side; this
 * only carries the fact to the UI). */
export class SolveQuotaExceededError extends Error {}

/** HTTP 409 run_in_flight: another run is already queued or running
 * for this calendar; the UI follows that one instead. */
export class SolveInFlightError extends Error {
  constructor(
    readonly runId: string,
    readonly runStatus: SolveSessionRunStatus,
  ) {
    super("An optimization is already running for this schedule.");
  }
}

/** HTTP 401 on a session token: expired or revoked; the host mints a
 * new session and retries once. */
export class SolveSessionExpiredError extends Error {}

/** The planner cancelled the wait: the host stops following the run. */
export class SolveCancelledError extends Error {}

export interface SolveRunOptions {
  readonly capabilities?: readonly SolveCapability[];
  /** Current schedule state the proposal is computed against. */
  readonly currentEvents: readonly SchedulerUiEvent[];
  readonly fetchImpl?: typeof fetch;
  readonly onStatus?: (status: "queued" | "running") => void;
  /** Called with the run id as soon as submit succeeds, so the host
   * can follow the run if the page is left before it completes. */
  readonly onSubmitted?: (runId: string) => void;
  readonly problem: ScheduleProblemV2;
  readonly runToken: string;
  readonly session: SolveSession;
  /** Aborting it stops the submit or the polling with SolveCancelledError. */
  readonly signal?: AbortSignal;
  /** The host's resource id for "nobody": an empty answer takes the person off (F40). */
  readonly unassignedResourceId?: string;
  /** Requested seconds; clamped to the session bounds, default when absent. */
  readonly solverSeconds?: number;
  /** F38: the calendar's product. */
  readonly solutionType?: string;
  /** F39: the calendar's name, for Plan and billing's breakdown by calendar. */
  readonly calendarName?: string;
  /** Bench/dev only: headers the local API's tenant-header bypass needs. */
  readonly extraHeaders?: Record<string, string>;
  /** Envelope tenant id. Ignored by the server when the session token
   * names the tenant; the bench keeps the recorded wire with its own. */
  readonly tenantId?: string;
  /** The period this run solves, on the board's clock; the proposal carries it. */
  readonly window?: TimeWindow;
}

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SolveCancelledError("Solve cancelled"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new SolveCancelledError("Solve cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** A fetch that fails because the signal fired reports the cancellation. */
async function fetchOrCancelled(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<Response> {
  if (signal?.aborted) {
    throw new SolveCancelledError("Solve cancelled");
  }
  try {
    return await fetchImpl(url, signal ? { ...init, signal } : init);
  } catch (error) {
    if (signal?.aborted) {
      throw new SolveCancelledError("Solve cancelled");
    }
    throw error;
  }
}

/** Clamp a requested solve length to the session's tier bounds. */
export function clampSolverSeconds(
  session: SolveSession,
  requested: number | undefined,
): number {
  const { default: fallback, max, min } = session.solverSeconds;
  const value = requested === undefined ? fallback : Math.trunc(requested);
  return Math.max(min, Math.min(max, value));
}

function authHeaders(
  session: SolveSession,
  runToken: string,
  phase: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    "X-Request-Id": `control-${phase}-${runToken}`,
    ...extra,
  };
}

async function readError(response: Response): Promise<{ code?: string; message?: string; runId?: string; status?: string }> {
  try {
    return (await response.json()) as { code?: string; message?: string; runId?: string; status?: string };
  } catch {
    return {};
  }
}

function throwForStatus(response: Response, body: { code?: string; message?: string; runId?: string; status?: string }, phase: string): never {
  if (response.status === 401) {
    throw new SolveSessionExpiredError("Solve session expired.");
  }
  if (response.status === 402) {
    throw new SolveQuotaExceededError(body.message ?? "Daily free optimization limit reached.");
  }
  if (response.status === 409 && body.code === "run_in_flight" && body.runId) {
    throw new SolveInFlightError(body.runId, (body.status as SolveSessionRunStatus | undefined) ?? "running");
  }
  throw new Error(body.message ?? `${phase} failed: HTTP ${response.status}`);
}

/** Submit the problem under the session and poll until the solver answers. */
export async function runSolve(options: SolveRunOptions): Promise<ScheduleProposal> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const redaction = await redactProblemForTenant(options.problem, options.session.resourcePlaceholders);
  const request = buildSolveRequest(redaction.problem, {
    calendarName: options.calendarName,
    capabilities: options.capabilities,
    resourceKeyScheme: redaction.resourceKeyScheme,
    solutionType: options.solutionType,
    solverSeconds: clampSolverSeconds(options.session, options.solverSeconds),
    tenantId: options.tenantId ?? "session",
  });
  const submitResponse = await fetchOrCancelled(
    fetchImpl,
    `${options.session.apiBaseUrl}/api/solve`,
    {
      body: JSON.stringify(request),
      headers: {
        ...authHeaders(options.session, options.runToken, "submit", options.extraHeaders),
        "Content-Type": "application/json",
        "Idempotency-Key": `control-${options.runToken}`,
      },
      method: "POST",
    },
    options.signal,
  );
  if (!submitResponse.ok) {
    throwForStatus(submitResponse, await readError(submitResponse), "Submit");
  }
  const submitted = (await submitResponse.json()) as SolveSubmitResponse;
  if (!submitted.runId) {
    throw new Error("Submit returned no runId");
  }
  options.onSubmitted?.(submitted.runId);
  options.onStatus?.("queued");
  await wait(Math.max(1, submitted.pollAfterSeconds ?? 2) * 1000, options.signal);
  return followRun({
    currentEvents: options.currentEvents,
    extraHeaders: options.extraHeaders,
    fetchImpl,
    onStatus: options.onStatus,
    redaction,
    runId: submitted.runId,
    runToken: options.runToken,
    session: options.session,
    signal: options.signal,
    unassignedResourceId: options.unassignedResourceId,
    window: options.window,
  });
}

export interface FollowRunOptions {
  readonly currentEvents: readonly SchedulerUiEvent[];
  readonly extraHeaders?: Record<string, string>;
  readonly fetchImpl?: typeof fetch;
  readonly onStatus?: (status: "queued" | "running") => void;
  /** The request's redaction map, or one rebuilt from an identical problem. */
  readonly redaction: RedactedProblem;
  readonly runId: string;
  readonly runToken: string;
  readonly session: SolveSession;
  /** Aborting it stops the polling with SolveCancelledError. */
  readonly signal?: AbortSignal;
  /** The host's resource id for "nobody": an empty answer takes the person off (F40). */
  readonly unassignedResourceId?: string;
  /** The period the run solved, on the board's clock; the proposal carries it. */
  readonly window?: TimeWindow;
}

/** Poll an existing run (fresh or resumed) until it answers. */
export async function followRun(options: FollowRunOptions): Promise<ScheduleProposal> {
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const pollResponse = await fetchOrCancelled(
      fetchImpl,
      `${options.session.apiBaseUrl}/api/solve/${encodeURIComponent(options.runId)}`,
      { headers: authHeaders(options.session, options.runToken, "poll", options.extraHeaders) },
      options.signal,
    );
    if (!pollResponse.ok) {
      throwForStatus(pollResponse, await readError(pollResponse), "Poll");
    }
    const poll = (await pollResponse.json()) as SolvePollResponse;
    if (poll.status === "succeeded") {
      const solution = unredactSolution(
        solutionFromPoll(options.runId, "succeeded", poll.result),
        options.redaction,
      );
      return proposalFromSolution(solution, options.currentEvents, {
        unassignedResourceId: options.unassignedResourceId,
        window: options.window,
      });
    }
    if (poll.status === "failed") {
      throw new Error(poll.error ?? "Solve failed");
    }
    options.onStatus?.(poll.status === "queued" ? "queued" : "running");
    await wait(1000, options.signal);
  }
  throw new Error("Solve timed out");
}

/**
 * Which roster a request was built from: any value the host changes
 * whenever the roster as it would be applied changes (an edit, a
 * dropped or held-back change, a new proposal).
 */
export type RosterVersion = number | string;

/**
 * "Why not…?" could not be answered now: the per-tenant limit (429), a
 * busy or stalled solver (503, 504), or no answer at all (status
 * absent). Asking again later can succeed; on 429 the API says when.
 */
export class CandidateCheckUnavailableError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`Candidate check unavailable${status === undefined ? "" : ` (HTTP ${status})`}`);
  }
}

export interface CandidateCheckOptions {
  /** F39: the calendar's name. */
  readonly calendarName?: string;
  /** The person and the shift to check, in the board's ids. */
  readonly candidate: ScheduleCandidate;
  /** The version of the roster on screen now; read when the answer arrives. */
  readonly currentRosterVersion: () => RosterVersion;
  /** Bench/dev only: headers the local API's tenant-header bypass needs. */
  readonly extraHeaders?: Record<string, string>;
  readonly fetchImpl?: typeof fetch;
  /** The roster as it would be applied: the current one plus the kept changes. */
  readonly problem: ScheduleProblemV2;
  /** The version of the roster `problem` was built from. */
  readonly rosterVersion: RosterVersion;
  /** Names the request in the API's log (X-Request-Id). */
  readonly runToken: string;
  readonly session: SolveSession;
  /** Aborting it stops the request with SolveCancelledError. */
  readonly signal?: AbortSignal;
  /** F38: the calendar's product. */
  readonly solutionType?: string;
  /** Envelope tenant id; the session token's tenant wins on the server. */
  readonly tenantId?: string;
}

/**
 * "answered": the check, on the board's ids. "rosterChanged": the
 * roster changed while the request was out, so its answer was dropped.
 */
export type CandidateCheckResult =
  | { readonly check: ScheduleCandidateCheck; readonly status: "answered" }
  | { readonly status: "rosterChanged" };

const CANDIDATE_UNAVAILABLE = new Set([429, 502, 503, 504]);

/** Retry-After in seconds, from seconds or an HTTP date; undefined when absent or unreadable. */
function retryAfterSeconds(value: string | null): number | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : undefined;
}

/**
 * "Why not…?": check one person on one shift of the roster as it would
 * be applied. The problem and the candidate are redacted (F23) and the
 * answer is mapped back with the same map. An answer that arrives after
 * the roster changed is dropped (`rosterChanged`), whether it is a
 * check or a failure.
 */
export async function checkCandidate(options: CandidateCheckOptions): Promise<CandidateCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const changed = (): boolean => options.currentRosterVersion() !== options.rosterVersion;
  const redaction = await redactProblemForTenant(options.problem, options.session.resourcePlaceholders);
  const request = buildCandidateRequest(redaction.problem, redactCandidate(options.candidate, redaction), {
    calendarName: options.calendarName,
    resourceKeyScheme: redaction.resourceKeyScheme,
    solutionType: options.solutionType,
    tenantId: options.tenantId ?? "session",
  });
  let response: Response;
  try {
    response = await fetchOrCancelled(
      fetchImpl,
      `${options.session.apiBaseUrl}/api/solve/analyze`,
      {
        body: JSON.stringify(request),
        headers: {
          ...authHeaders(options.session, options.runToken, "analyze", options.extraHeaders),
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      options.signal,
    );
  } catch (error) {
    if (error instanceof SolveCancelledError) {
      throw error;
    }
    if (changed()) {
      return { status: "rosterChanged" };
    }
    throw new CandidateCheckUnavailableError(undefined, undefined);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (options.signal?.aborted) {
    throw new SolveCancelledError("Candidate check cancelled");
  }
  // The version is read once the whole answer is in, so none slips past it.
  if (changed()) {
    return { status: "rosterChanged" };
  }
  if (CANDIDATE_UNAVAILABLE.has(response.status)) {
    throw new CandidateCheckUnavailableError(response.status, retryAfterSeconds(response.headers.get("retry-after")));
  }
  if (!response.ok) {
    const failure = body !== null && typeof body === "object" ? (body as { code?: string; message?: string }) : {};
    throwForStatus(response, failure, "Candidate check");
  }
  const check = readCandidateCheck(body);
  if (!check) {
    throw new Error("Candidate check returned an unreadable answer");
  }
  return { check: unredactCandidateCheck(check, redaction), status: "answered" };
}

/**
 * A "Why not…?" answer as the board shows it, or why there is none:
 * - answered: the check;
 * - rosterChanged: the roster changed while the request was out;
 * - readFailed: the host could not read what the check needs (the
 *   shifts before the period, the agreements), so nothing was sent;
 * - unavailable: the API or the solver could not answer now; on a rate
 *   limit (429) the API says when to try again.
 */
export type CandidateAnswer =
  | { readonly check: ScheduleCandidateCheck; readonly status: "answered" }
  | { readonly message: string; readonly status: "readFailed" }
  | { readonly retryAfterSeconds?: number; readonly status: "unavailable" }
  | { readonly status: "rosterChanged" };

/**
 * checkCandidate for the board: every failure becomes "unavailable", the
 * board's own "Could not check this now" (lane E: 429, 503 and 504; a
 * refused or unreadable answer too). An expired session and a
 * cancellation still throw, so the host can mint a session and ask
 * again, or drop the answer.
 */
export async function askCandidate(options: CandidateCheckOptions): Promise<CandidateAnswer> {
  try {
    return await checkCandidate(options);
  } catch (error) {
    if (error instanceof SolveSessionExpiredError || error instanceof SolveCancelledError) {
      throw error;
    }
    if (error instanceof CandidateCheckUnavailableError && error.status === 429 && error.retryAfterSeconds !== undefined) {
      return { retryAfterSeconds: error.retryAfterSeconds, status: "unavailable" };
    }
    return { status: "unavailable" };
  }
}

/** Record that the planner reviewed (or discarded) a run - telemetry only. */
export async function markRunReviewed(
  session: SolveSession,
  runId: string,
  fetchImpl: typeof fetch = fetch,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const response = await fetchImpl(
    `${session.apiBaseUrl}/api/solve/${encodeURIComponent(runId)}/reviewed`,
    { headers: authHeaders(session, runId, "reviewed", extraHeaders), method: "POST" },
  );
  if (!response.ok && response.status !== 404) {
    throwForStatus(response, await readError(response), "Reviewed");
  }
}

/** Sorted-key JSON, matching the server's canonical form byte for byte. */
export function canonicalizeProblem(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      next[key] = sortValue(record[key]);
    }
    return next;
  }
  return value;
}

/** SHA-256 hex of the canonical redacted problem; equals the ledger's payloadHash. */
/** The one Web Crypto call used; typed structurally so the package
 * compiles without the DOM lib. */
export interface DigestProvider {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

export async function hashProblem(
  redactedProblem: ScheduleProblemV2,
  subtle: DigestProvider | null | undefined = (globalThis as { crypto?: { subtle?: DigestProvider } }).crypto?.subtle,
): Promise<string | undefined> {
  // null = explicitly no provider (tests, exotic hosts); undefined = the default above.
  if (!subtle) {
    return undefined;
  }
  const bytes = new TextEncoder().encode(canonicalizeProblem(redactedProblem));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

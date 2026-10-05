/**
 * F26 stage 3: the control's side of the bridge. Two Custom API calls
 * on the org's own Web API, made with the user's Dataverse session (no
 * credential in the browser): chr_ChronaSolveSession mints a solve
 * session (Q3-C) and chr_ChronaConnect registers the environment
 * (Q4-D, admin only). Everything after that is the package's solve
 * client talking to the Chrona API directly with the session token.
 */
import type { SolveSession } from "@chrona/scheduler-ui";

export interface ConnectResult {
  readonly accountKey: string;
  readonly dailySolveLimit: number;
  readonly environmentId: string;
  readonly rotated: boolean;
}

/** Why a session could not be minted, as the control needs to react. */
export type SessionFailure =
  /** No connection row: the environment has not run Connect. */
  | "notConnected"
  /** The caller lacks the solve (or connect) privilege. */
  | "noPrivilege"
  | "other";

export class SolveBridgeError extends Error {
  constructor(
    readonly failure: SessionFailure,
    message: string,
  ) {
    super(message);
  }
}

export const CONTROL_VERSION = "0.0.89";

export function resolveClientUrl(context: unknown): string {
  const page = (context as { page?: { getClientUrl?: () => string } }).page;
  let fromContext: string | undefined;
  try {
    fromContext = page?.getClientUrl?.();
  } catch {
    // The PCF test harness defines getClientUrl but cannot answer it.
    fromContext = undefined;
  }
  if (fromContext?.trim()) {
    return fromContext.trim().replace(/\/+$/, "");
  }
  return window.location.origin;
}

async function callCustomApi<T>(
  clientUrl: string,
  name: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(`${clientUrl}/api/data/v9.2/${name}`, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    method: "POST",
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  const message = await describeDataverseError(response);
  throw new SolveBridgeError(classifyFailure(response.status, message), message);
}

async function describeDataverseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    // fall through
  }
  return `Dataverse returned HTTP ${response.status}`;
}

export function classifyFailure(status: number, message: string): SessionFailure {
  const lowered = message.toLowerCase();
  if (lowered.includes("not connected")) {
    return "notConnected";
  }
  if (status === 403 || lowered.includes("privilege") || lowered.includes("access is denied") || lowered.includes("access denied")) {
    return "noPrivilege";
  }
  return "other";
}

/**
 * Whether the board knows its calendar: the view row has answered,
 * unless the control names the calendar itself, and the settings have
 * loaded for the calendar the board uses now.
 */
export function calendarSettingsReady(input: {
  readonly boundCalendarId: string;
  readonly effectiveCalendarId: string;
  readonly loadedFor: string | undefined;
  readonly viewRowAnswered: boolean;
}): boolean {
  return (
    (input.boundCalendarId !== "" || input.viewRowAnswered) &&
    input.loadedFor === input.effectiveCalendarId
  );
}

/**
 * What a Solve click does. With a session or a calendar it runs. A
 * click before the calendar's settings load waits for them, shown as
 * queued, instead of doing nothing; once they load without a calendar,
 * the board says so.
 */
export function solveClickAction(input: {
  readonly calendarId: string | undefined;
  readonly hasSession: boolean;
  readonly settingsReady: boolean;
}): "noCalendar" | "run" | "wait" {
  if (input.hasSession || input.calendarId) {
    return "run";
  }
  return input.settingsReady ? "noCalendar" : "wait";
}

/** "Get solve session": the plugin adds the key and the caller's attribution. */
export interface SolveSessionRequest {
  readonly defaultSolverSeconds?: number;
  /** F38: the calendar's product; the session's entitlement and limits follow it. */
  readonly solutionType?: string;
}

export async function fetchSolveSession(
  clientUrl: string,
  calendarId: string,
  request: SolveSessionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SolveSession> {
  const result = await callCustomApi<{ PortalUrl?: string; Session: string }>(
    clientUrl,
    "chr_ChronaSolveSession",
    {
      CalendarId: calendarId,
      ...(request.defaultSolverSeconds ? { DefaultSolverSeconds: Math.trunc(request.defaultSolverSeconds) } : {}),
      ...(request.solutionType ? { SolutionType: request.solutionType } : {}),
    },
    fetchImpl,
  );
  const session = JSON.parse(result.Session) as SolveSession;
  const portalUrl = result.PortalUrl?.trim();
  return portalUrl ? { ...session, portalUrl } : session;
}

/** Register the environment (admin privilege). Re-running rotates the key. */
export async function connectEnvironment(
  clientUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectResult> {
  const result = await callCustomApi<{
    AccountKey: string;
    DailySolveLimit: number;
    EnvironmentId: string;
    Rotated: boolean;
  }>(clientUrl, "chr_ChronaConnect", { ControlVersion: CONTROL_VERSION }, fetchImpl);
  return {
    accountKey: result.AccountKey,
    dailySolveLimit: result.DailySolveLimit,
    environmentId: result.EnvironmentId,
    rotated: result.Rotated,
  };
}

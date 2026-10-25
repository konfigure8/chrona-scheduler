/**
 * Optimize always shows and is always active (Matt 2026-10-21): "When
 * the user clicks it and it cannot run, the board shows the reason then,
 * and the button stays active." What stops a run at the click, in the
 * order the board says it. A run that can start returns undefined; the
 * reasons found later (a passed period, no calendar, a failed read, the
 * day's free runs used) are the run's own and say themselves.
 */
import { CAPABILITY_SOLVE, entitlementAllows, type EntitlementStatus } from "@chrona/scheduler-ui";

import type { SessionFailure } from "./solveBridge";

export type SolveBlock =
  /** The user lacks the Chrona Scheduler User role. */
  | "noPrivilege"
  /** The subscription has lapsed. */
  | "lapsed"
  /** Chrona has been unreachable past the claims' life: the optimizer paused. */
  | "paused";

/**
 * Whether the button's run can start now. Claims without the solve
 * capability in any other state read as lapsed: the server withdraws it
 * only there.
 */
export function solveBlock(input: {
  readonly entitlement: EntitlementStatus | undefined;
  readonly sessionFailure: SessionFailure | undefined;
}): SolveBlock | undefined {
  if (input.sessionFailure === "noPrivilege") {
    return "noPrivilege";
  }
  if (input.entitlement?.kind === "lapsed") {
    return "lapsed";
  }
  if (input.entitlement?.kind === "paused") {
    return "paused";
  }
  if (!entitlementAllows(input.entitlement, CAPABILITY_SOLVE)) {
    return "lapsed";
  }
  return undefined;
}

/**
 * Whether the board shows its run button: with a session or cached
 * claims, and when the user lacks the privilege (the click says so).
 * Otherwise the environment is not connected yet, or the session is
 * still starting: the explainer's Optimize stands in, and its click
 * shows the reason and the way to connect.
 */
export function showsRunButton(input: {
  readonly hasClaims: boolean;
  readonly hasSession: boolean;
  readonly sessionFailure: SessionFailure | undefined;
}): boolean {
  return input.hasSession || input.hasClaims || input.sessionFailure === "noPrivilege";
}

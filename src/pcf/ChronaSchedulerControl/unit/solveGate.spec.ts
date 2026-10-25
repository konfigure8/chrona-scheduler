import * as assert from "node:assert/strict";

import type { EntitlementStatus } from "@chrona/scheduler-ui";

import { showsRunButton, solveBlock } from "../SchedulerControl/solveGate";

/*
 * Optimize always shows and is always active (Matt 2026-10-21): what
 * stops a run at the click, which the board says then, and when the
 * board shows its run button rather than the explainer's Optimize.
 */

const status = (kind: EntitlementStatus["kind"], capabilities: readonly string[]): EntitlementStatus =>
  ({ capabilities, kind, session: {} }) as unknown as EntitlementStatus;

{
  assert.equal(solveBlock({ entitlement: status("free", ["solve"]), sessionFailure: undefined }), undefined, "a run can start");
  assert.equal(solveBlock({ entitlement: undefined, sessionFailure: undefined }), undefined, "no claims yet: the run asks for them");
  assert.equal(solveBlock({ entitlement: status("free", ["solve"]), sessionFailure: "noPrivilege" }), "noPrivilege");
  assert.equal(solveBlock({ entitlement: status("lapsed", []), sessionFailure: undefined }), "lapsed");
  assert.equal(solveBlock({ entitlement: status("paused", []), sessionFailure: "other" }), "paused");
  assert.equal(solveBlock({ entitlement: status("current", []), sessionFailure: undefined }), "lapsed", "claims without the run read as lapsed");
  console.log("solve gate block tests passed");
}

{
  assert.equal(showsRunButton({ hasClaims: false, hasSession: true, sessionFailure: undefined }), true);
  assert.equal(showsRunButton({ hasClaims: true, hasSession: false, sessionFailure: "other" }), true);
  assert.equal(showsRunButton({ hasClaims: false, hasSession: false, sessionFailure: "noPrivilege" }), true);
  assert.equal(showsRunButton({ hasClaims: false, hasSession: false, sessionFailure: "notConnected" }), false);
  assert.equal(showsRunButton({ hasClaims: false, hasSession: false, sessionFailure: undefined }), false);
  console.log("solve gate button tests passed");
}

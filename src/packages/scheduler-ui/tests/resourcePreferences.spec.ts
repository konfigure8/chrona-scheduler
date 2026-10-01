import * as assert from "node:assert/strict";

import {
  evaluateResourcePreferences,
  isPreferredResource,
  type ResourcePreferenceRule,
} from "../src/resourcePreferences";

const at = new Date("2026-08-17T09:00:00Z");
const item = { id: "shift-1" };

// Restricted blocks the named resource, with the rule's label as reason.
{
  const rules: ResourcePreferenceRule[] = [
    {
      label: "Banned from Northside",
      resourceIds: ["r-1"],
      tier: "restricted",
      workItemId: "shift-1",
    },
  ];
  const verdict = evaluateResourcePreferences(rules, item, "r-1", at);
  assert.equal(verdict.kind, "block");
  assert.equal(
    verdict.kind === "block" ? verdict.reason : "",
    "Banned from Northside",
  );
  assert.equal(
    evaluateResourcePreferences(rules, item, "r-2", at).kind,
    "allow",
  );
}

// A rule with no workItemId applies to every item (banned-from-site).
{
  const rules: ResourcePreferenceRule[] = [
    { resourceIds: ["r-1"], tier: "restricted" },
  ];
  assert.equal(
    evaluateResourcePreferences(rules, { id: "other" }, "r-1", at).kind,
    "block",
  );
}

// Effective dating follows the proposed start, not the clock.
{
  const rules: ResourcePreferenceRule[] = [
    {
      effectiveFrom: new Date("2026-08-01T00:00:00Z"),
      effectiveTo: new Date("2026-08-10T00:00:00Z"),
      resourceIds: ["r-1"],
      tier: "restricted",
    },
  ];
  assert.equal(
    evaluateResourcePreferences(
      rules,
      item,
      "r-1",
      new Date("2026-08-05T09:00:00Z"),
    ).kind,
    "block",
  );
  assert.equal(evaluateResourcePreferences(rules, item, "r-1", at).kind, "allow");
}

// Must-choose-from blocks anyone outside the union of allowlists.
{
  const rules: ResourcePreferenceRule[] = [
    {
      resourceIds: ["r-1", "r-2"],
      tier: "mustChooseFrom",
      workItemId: "shift-1",
    },
    {
      resourceIds: ["r-3"],
      tier: "mustChooseFrom",
      workItemId: "shift-1",
    },
  ];
  assert.equal(
    evaluateResourcePreferences(rules, item, "r-3", at).kind,
    "allow",
  );
  const blocked = evaluateResourcePreferences(rules, item, "r-9", at);
  assert.equal(blocked.kind, "block");
  // An allowlist scoped to another item never constrains this one.
  assert.equal(
    evaluateResourcePreferences(rules, { id: "other" }, "r-9", at).kind,
    "allow",
  );
}

// Restricted wins over an allowlist that also names the resource.
{
  const rules: ResourcePreferenceRule[] = [
    { resourceIds: ["r-1"], tier: "mustChooseFrom", workItemId: "shift-1" },
    { resourceIds: ["r-1"], tier: "restricted", workItemId: "shift-1" },
  ];
  assert.equal(
    evaluateResourcePreferences(rules, item, "r-1", at).kind,
    "block",
  );
}

// Preferred is soft: never a verdict, only a ranking signal.
{
  const rules: ResourcePreferenceRule[] = [
    { resourceIds: ["r-1"], tier: "preferred", workItemId: "shift-1" },
  ];
  assert.equal(
    evaluateResourcePreferences(rules, item, "r-2", at).kind,
    "allow",
  );
  assert.equal(isPreferredResource(rules, item, "r-1", at), true);
  assert.equal(isPreferredResource(rules, item, "r-2", at), false);
}

// No rules: everything allowed.
assert.equal(evaluateResourcePreferences([], item, "r-1", at).kind, "allow");

console.log("resourcePreferences tests passed");

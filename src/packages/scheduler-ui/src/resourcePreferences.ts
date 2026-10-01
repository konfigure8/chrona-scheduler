/**
 * Per-demand resource preference rules (domain model section 13.3),
 * the shape copied from D365 fulfillment preferences because it is
 * proven: PREFERRED is soft (solver weight + picker ranking, never a
 * verdict), RESTRICTED is a hard never, MUST-CHOOSE-FROM is a hard
 * allowlist. Restrictions may carry effective dates ("banned from the
 * site until March").
 *
 * Rules are DATA (section 12): the host expands its chr_ rows into
 * this shape and both consumers - this evaluator for interactive
 * verdicts, the solver as hard/soft constraints - read the same rows.
 * This module holds mechanism only; no policy numbers live here.
 */
import type { ChangeVerdict } from "./interactions";

export type ResourcePreferenceTier =
  | "mustChooseFrom"
  | "preferred"
  | "restricted";

export interface ResourcePreferenceRule {
  /** Inclusive start of validity; open-ended when omitted. */
  readonly effectiveFrom?: Date;
  /** Exclusive end of validity; open-ended when omitted. */
  readonly effectiveTo?: Date;
  /** Shown in the verdict reason ("Banned from Northside"). */
  readonly label?: string;
  readonly resourceIds: readonly string[];
  readonly tier: ResourcePreferenceTier;
  /** The demand this rule scopes to; omitted = applies to every item. */
  readonly workItemId?: string;
}

function ruleActive(rule: ResourcePreferenceRule, at: Date): boolean {
  if (rule.effectiveFrom && at < rule.effectiveFrom) {
    return false;
  }
  if (rule.effectiveTo && at >= rule.effectiveTo) {
    return false;
  }
  return true;
}

function ruleApplies(
  rule: ResourcePreferenceRule,
  workItemId: string | undefined,
  at: Date,
): boolean {
  if (!ruleActive(rule, at)) {
    return false;
  }
  return rule.workItemId === undefined || rule.workItemId === workItemId;
}

/**
 * Hard-tier verdict for placing a work item on a resource. `at` is the
 * proposed START instant (effective dating follows the work, not the
 * clock). Preferred never produces a verdict - it feeds ranking via
 * `isPreferredResource`.
 */
export function evaluateResourcePreferences(
  rules: readonly ResourcePreferenceRule[],
  workItem: { readonly id: string } | undefined,
  resourceId: string,
  at: Date,
): ChangeVerdict {
  const restricted = rules.find(
    (rule) =>
      rule.tier === "restricted" &&
      ruleApplies(rule, workItem?.id, at) &&
      rule.resourceIds.includes(resourceId),
  );
  if (restricted) {
    return {
      kind: "block",
      reason: restricted.label ?? "Restricted resource",
    };
  }
  const allowlists = rules.filter(
    (rule) =>
      rule.tier === "mustChooseFrom" && ruleApplies(rule, workItem?.id, at),
  );
  if (allowlists.length > 0) {
    const allowed = allowlists.some((rule) =>
      rule.resourceIds.includes(resourceId),
    );
    if (!allowed) {
      return {
        kind: "block",
        reason: allowlists[0]?.label ?? "Not in the allowed resource list",
      };
    }
  }
  return { kind: "allow" };
}

/** Soft tier: ranks pickers and feeds the solver's soft weight. */
export function isPreferredResource(
  rules: readonly ResourcePreferenceRule[],
  workItem: { readonly id: string } | undefined,
  resourceId: string,
  at: Date,
): boolean {
  return rules.some(
    (rule) =>
      rule.tier === "preferred" &&
      ruleApplies(rule, workItem?.id, at) &&
      rule.resourceIds.includes(resourceId),
  );
}

import type { RowDecoration } from "./decorations";
import { isPinned } from "./locks";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

/**
 * F22 deliverable 2 - the minimum solvable mapping declaration
 * (rulings 2026-09-01). The solve is always the same solve; each
 * mapped extra activates a TIER that lets it optimize more:
 *
 *   assignment   title/start/end + a resource population - fill open
 *                work, eliminate double-booking, move any unlocked item
 *   locks        lock/pinned mapped - honor "don't move this" facts
 *   roles        required tags + resource tags resolved (roles resolve
 *                to skill tags at the adapter boundary) - qualified
 *                people only, work moved to better fits
 *   availability unavailability bands - never place work on someone
 *                unavailable
 *   hours        capacity mapped - keep everyone inside their hours
 *   cost         cost rates mapped - prefer cheaper qualified cover
 *
 * Activation is PRESENCE-BASED (Q2-A): a tier is `active` when its
 * data resolves to at least one value; `mapped` is what the host
 * says it configured (defaults to active when the host is silent).
 * One computation, three renderings (Q3-A): maker diagnostics, the
 * user's "Optimizing with" line, and the conversion dialog's claim.
 */

export type SolveCapability =
  | "assignment"
  | "availability"
  | "cost"
  | "hours"
  | "locks"
  | "roles";

export const SOLVE_CAPABILITIES: readonly SolveCapability[] = [
  "assignment",
  "locks",
  "roles",
  "availability",
  "hours",
  "cost",
];

export interface CapabilityTier {
  readonly active: boolean;
  readonly capability: SolveCapability;
  readonly mapped: boolean;
}

export interface CapabilityInput {
  readonly decorations?: readonly RowDecoration[];
  readonly events: readonly SchedulerUiEvent[];
  /** Host-declared mapping presence; inferred from data when absent. */
  readonly mapped?: Partial<Record<SolveCapability, boolean>>;
  readonly resources: readonly SchedulerResource[];
  readonly unscheduledEvents?: readonly SchedulerUiEvent[];
}

export function computeCapabilityTiers(
  input: CapabilityInput,
): readonly CapabilityTier[] {
  const people = input.resources.filter((resource) => resource.id !== "r-open");
  const work = [...input.events, ...(input.unscheduledEvents ?? [])];
  const active: Record<SolveCapability, boolean> = {
    assignment: work.length > 0 && people.length > 0,
    availability: (input.decorations ?? []).some(
      (decoration) =>
        decoration.kind === "unavailable" && decoration.resourceId !== undefined,
    ),
    cost: people.some((resource) => resource.costCentsPerHour !== undefined),
    hours: people.some((resource) => resource.capacityHours !== undefined),
    locks: work.some((event) => isPinned(event)),
    roles:
      work.some((event) => (event.requiredTags?.length ?? 0) > 0) &&
      people.some((resource) => (resource.tags?.length ?? 0) > 0),
  };
  return SOLVE_CAPABILITIES.map((capability) => ({
    active: active[capability],
    capability,
    mapped: input.mapped?.[capability] ?? active[capability],
  }));
}

export function activeCapabilities(
  tiers: readonly CapabilityTier[],
): readonly SolveCapability[] {
  return tiers.filter((tier) => tier.active).map((tier) => tier.capability);
}

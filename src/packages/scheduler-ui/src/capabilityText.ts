import type { SolveCapability } from "./capabilities";
import type { SchedulerStrings } from "./strings";

/** Localized tier names, in the register's canonical order. */
export function capabilityLabel(
  strings: SchedulerStrings,
  capability: SolveCapability,
): string {
  switch (capability) {
    case "assignment":
      return strings.capabilityAssignment;
    case "locks":
      return strings.capabilityLocks;
    case "roles":
      return strings.capabilityRoles;
    case "availability":
      return strings.capabilityAvailability;
    case "hours":
      return strings.capabilityHours;
    case "cost":
      return strings.capabilityCost;
  }
}

/** "a, b and c" with the localized conjunction; optional sentence case. */
export function formatCapabilityList(
  strings: SchedulerStrings,
  capabilities: readonly SolveCapability[],
  options: { readonly sentenceCase?: boolean } = {},
): string {
  const labels = capabilities.map((capability) =>
    capabilityLabel(strings, capability),
  );
  let text: string;
  if (labels.length <= 1) {
    text = labels[0] ?? "";
  } else {
    text = `${labels.slice(0, -1).join(", ")} ${strings.listAnd} ${labels[labels.length - 1] ?? ""}`;
  }
  return options.sentenceCase && text.length > 0
    ? text.charAt(0).toUpperCase() + text.slice(1)
    : text;
}

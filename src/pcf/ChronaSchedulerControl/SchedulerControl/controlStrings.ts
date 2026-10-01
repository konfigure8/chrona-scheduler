/**
 * Localizable strings for the control layer (the adapter's verdict
 * reasons and status messages), resolved from the manifest resx via
 * context.resources.getString. Package UI strings resolve the same
 * way and feed SchedulerSurface's `strings` prop, so one resx file
 * per language translates the whole control. Defaults below are the
 * English fallbacks; strings/SchedulerControl.<lcid>.resx carries
 * every key of both sets per language (English 1033, German 1031),
 * and unit/strings.spec.ts fails when a file falls behind.
 *
 * Rule labels from chr_ rows (preference labels, availability types,
 * skill names) are customer data and are never translated here.
 */
import {
  defaultSchedulerStrings,
  type SchedulerStrings,
} from "@chrona/scheduler-ui";

export interface ControlMessages {
  readonly msgCannotCreateHere: string;
  /** F26 stage 3: bridge messages. */
  readonly msgConnectAdminOnly: string;
  readonly msgConnectFailed: string;
  readonly msgConnected: string;
  readonly msgConnectedUnlimited: string;
  readonly msgResumeChanged: string;
  readonly msgSessionFailed: string;
  readonly msgSolveNoPrivilege: string;
  readonly msgGenerateFailed: string;
  readonly msgGenerateNoTemplates: string;
  readonly msgGenerateNotBound: string;
  readonly msgGenerated: string;
  /** F1: appended when rotating templates were skipped for want of a period anchor. */
  readonly msgGenerateUnanchored: string;
  readonly msgCreateFailed: string;
  readonly msgCreated: string;
  readonly msgDeletedMany: string;
  readonly msgDeletedOne: string;
  readonly msgLocalOnly: string;
  readonly msgMovedMany: string;
  readonly msgPinnedMany: string;
  readonly msgPinnedOne: string;
  readonly msgRedid: string;
  readonly msgRestored: string;
  readonly msgRestoreSkipped: string;
  readonly msgRowCapReached: string;
  readonly msgRowsSkipped: string;
  readonly msgSelected: string;
  /** A held role whose skills the person lacks: the pill's note. */
  readonly msgRoleMissingSkills: string;
  readonly msgSkillsUpdated: string;
  readonly msgUndid: string;
  readonly msgUnpinnedMany: string;
  readonly msgUnpinnedOne: string;
  readonly msgUnscheduled: string;
  readonly msgUpdated: string;
  readonly msgWarningSuffix: string;
  readonly reasonMinimumBreak: string;
  readonly reasonMissingSkill: string;
  readonly reasonOutsideGroup: string;
  readonly reasonOutsideHours: string;
  readonly reasonOverlap: string;
  readonly reasonUnavailable: string;
  readonly reasonUnavailableNoLabel: string;
  readonly msgSettingsFailed: string;
}

export const defaultControlMessages: ControlMessages = {
  msgCannotCreateHere: "Cannot create here",
  msgConnectAdminOnly: "An administrator connects Chrona for this environment (Chrona Scheduler Admin role).",
  msgConnectFailed: "Chrona Connect failed: {message}",
  msgConnected: "Connected to Chrona ({limit} free optimizations per day). Running your first sample optimization...",
  msgConnectedUnlimited: "Connected to Chrona. Running your first optimization...",
  msgResumeChanged: "An optimization finished while you were away, but the schedule has changed since. Its result no longer applies.",
  msgSessionFailed: "Could not start a Chrona solve session: {message}",
  msgSolveNoPrivilege: "Optimizing needs the Chrona Scheduler User role.",
  msgGenerateFailed: "Generate failed: {message}",
  msgGenerateNoTemplates: "No work item templates are configured",
  msgGenerateNotBound: "Generate needs the template and origin columns bound",
  msgGenerated: "Generated: {added} added, {removed} removed, {flagged} flagged",
  msgGenerateUnanchored: "{count} rotating templates skipped: the view has no period anchor",
  msgCreateFailed: "Could not create {title} (missing required columns?)",
  msgCreated: "Created {title}",
  msgDeletedMany: "Deleted {count} items",
  msgDeletedOne: "Deleted {title}",
  msgLocalOnly: " (local only - no Dataverse connection)",
  msgMovedMany: "Moved {count} items",
  msgPinnedMany: "Pinned {count} items",
  msgPinnedOne: "Pinned {title}",
  msgRedid: "Redid change",
  msgRestored: "Restored",
  msgRestoreSkipped: " ({count} item(s) could not be restored)",
  msgRowCapReached: "Only the first {count} rows of this view are shown. Narrow the view to see the rest.",
  msgRowsSkipped: "{count} row(s) skipped (missing or invalid start/end)",
  msgSelected: "Selected {title}",
  msgRoleMissingSkills: "Missing {skills}",
  msgSkillsUpdated: "Updated role for {title}",
  msgUndid: "Undid change",
  msgUnpinnedMany: "Unpinned {count} items",
  msgUnpinnedOne: "Unpinned {title}",
  msgUnscheduled: "Unscheduled {title}",
  msgUpdated: "Updated {title}",
  msgWarningSuffix: " (warning: {reason})",
  reasonMinimumBreak: "Break under {minimum} min ({gap} min gap)",
  reasonMissingSkill: "Not a {names}",
  reasonOutsideGroup: "Outside {group}",
  reasonOutsideHours: "Outside working hours ({start}-{end})",
  reasonOverlap: "Overlaps an existing item",
  reasonUnavailable: "Unavailable: {label}",
  reasonUnavailableNoLabel: "Unavailable",
  msgSettingsFailed: "Could not open the scheduler settings",
};

export interface ControlStrings {
  readonly messages: ControlMessages;
  /** Overrides for the package UI, fed to SchedulerSurface. */
  readonly surface: Partial<SchedulerStrings> | undefined;
}

type ResourceReader = { getString(id: string): string } | undefined;

function lookup(resources: ResourceReader, key: string): string | undefined {
  if (!resources) {
    return undefined;
  }
  try {
    const value = resources.getString(key);
    // The harness and unlocalized hosts echo the key or return empty.
    return value && value !== key ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve every string once per language from the manifest resx. */
export function resolveControlStrings(
  resources: ResourceReader,
): ControlStrings {
  const messages: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(defaultControlMessages) as readonly [
    string,
    string,
  ][]) {
    messages[key] = lookup(resources, key) ?? fallback;
  }
  const surface: Record<string, string> = {};
  for (const key of Object.keys(defaultSchedulerStrings)) {
    const value = lookup(resources, key);
    if (value !== undefined) {
      surface[key] = value;
    }
  }
  return {
    messages: messages as unknown as ControlMessages,
    surface:
      Object.keys(surface).length > 0
        ? (surface as Partial<SchedulerStrings>)
        : undefined,
  };
}

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
  /** Hover card labels for the bound row's own fields. */
  readonly fieldBundle: string;
  readonly fieldProvenance: string;
  readonly fieldPublishState: string;
  readonly fieldStatus: string;
  readonly msgCannotCreateHere: string;
  /** F26 stage 3: bridge messages. */
  readonly msgConnectAdminOnly: string;
  readonly msgConnectFailed: string;
  readonly msgConnected: string;
  readonly msgConnectedUnlimited: string;
  readonly msgResumeChanged: string;
  readonly msgSessionFailed: string;
  readonly msgSolveNoPrivilege: string;
  readonly msgSolveNoCalendar: string;
  readonly msgCreateFailed: string;
  readonly msgCreated: string;
  readonly msgDeletedMany: string;
  readonly msgDeletedOne: string;
  readonly msgLocalOnly: string;
  readonly msgMovedMany: string;
  /** A person could not be saved: the board refused the change. */
  readonly msgPersonNotSaved: string;
  readonly msgPinnedMany: string;
  readonly msgPinnedOne: string;
  readonly msgRedid: string;
  readonly msgRestored: string;
  readonly msgRestoreSkipped: string;
  readonly msgRowCapReached: string;
  readonly msgRowsSkipped: string;
  readonly msgSelected: string;
  readonly msgUndid: string;
  readonly msgUnpinnedMany: string;
  readonly msgUnpinnedOne: string;
  readonly msgUnscheduled: string;
  readonly msgUpdated: string;
  readonly msgWarningSuffix: string;
  readonly reasonMinimumBreak: string;
  readonly reasonOutsideGroup: string;
  readonly reasonOutsideHours: string;
  readonly reasonOverlap: string;
  readonly msgSettingsFailed: string;
}

export const defaultControlMessages: ControlMessages = {
  fieldBundle: "Bundle",
  fieldProvenance: "Provenance",
  fieldPublishState: "Publish state",
  fieldStatus: "Status",
  msgCannotCreateHere: "Cannot create here",
  msgConnectAdminOnly: "An administrator connects Chrona for this environment (Chrona Scheduler Admin role).",
  msgConnectFailed: "Chrona Connect failed: {message}",
  msgConnected: "Connected to Chrona ({limit} free optimizations per day). Running your first sample optimization...",
  msgConnectedUnlimited: "Connected to Chrona. Running your first optimization...",
  msgResumeChanged: "An optimization finished while you were away, but the schedule has changed since. Its result no longer applies.",
  msgSessionFailed: "Could not start a Chrona solve session: {message}",
  msgSolveNoPrivilege: "Optimizing needs the Chrona Scheduler User role.",
  msgSolveNoCalendar: "This view has no Chrona calendar yet, so it cannot optimize.",
  msgCreateFailed: "Could not create {title} (missing required columns?)",
  msgCreated: "Created {title}",
  msgDeletedMany: "Deleted {count} items",
  msgDeletedOne: "Deleted {title}",
  msgLocalOnly: " (local only - no Dataverse connection)",
  msgMovedMany: "Moved {count} items",
  msgPersonNotSaved: "Not saved: the board cannot save the person yet. Try again.",
  msgPinnedMany: "Pinned {count} items",
  msgPinnedOne: "Pinned {title}",
  msgRedid: "Redid change",
  msgRestored: "Restored",
  msgRestoreSkipped: " ({count} item(s) could not be restored)",
  msgRowCapReached: "Only the first {count} rows of this view are shown. Narrow the view to see the rest.",
  msgRowsSkipped: "{count} row(s) skipped (missing or invalid start/end)",
  msgSelected: "Selected {title}",
  msgUndid: "Undid change",
  msgUnpinnedMany: "Unpinned {count} items",
  msgUnpinnedOne: "Unpinned {title}",
  msgUnscheduled: "Unscheduled {title}",
  msgUpdated: "Updated {title}",
  msgWarningSuffix: " (warning: {reason})",
  reasonMinimumBreak: "Break under {minimum} min ({gap} min gap)",
  reasonOutsideGroup: "Outside {group}",
  reasonOutsideHours: "Outside working hours ({start}-{end})",
  reasonOverlap: "Overlaps an existing item",
  msgSettingsFailed: "Could not open the scheduler settings",
};

export interface ControlStrings {
  readonly messages: ControlMessages;
  /** Overrides for the package UI, fed to SchedulerSurface. */
  readonly surface: Partial<SchedulerStrings> | undefined;
}

export type ResourceReader = { getString(id: string): string } | undefined;

export function lookup(resources: ResourceReader, key: string): string | undefined {
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
  const surface = overrides(resources, Object.keys(defaultSchedulerStrings));
  return {
    messages: messages as unknown as ControlMessages,
    surface: surface as Partial<SchedulerStrings> | undefined,
  };
}

/** The resx values for some keys; undefined when the reader has none of them. */
export function overrides(
  resources: ResourceReader,
  keys: readonly string[],
): Record<string, string> | undefined {
  const found: Record<string, string> = {};
  for (const key of keys) {
    const value = lookup(resources, key);
    if (value !== undefined) {
      found[key] = value;
    }
  }
  return Object.keys(found).length > 0 ? found : undefined;
}

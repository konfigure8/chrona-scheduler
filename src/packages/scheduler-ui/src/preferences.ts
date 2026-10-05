/**
 * Per-user, per-view preference persistence. The package stays
 * storage-agnostic in its components (everything is controlled props);
 * hosts use this helper so the harness and the PCF adapter share one
 * implementation. The PCF scopes the key by context.userSettings.userId
 * plus the view-config row id - shared frontline devices must not leak
 * one user's preferences into the next login.
 *
 * The blob is versioned and unknown keys are preserved on save, so
 * future preferences (collapsed groups, panel state, ...) can join
 * without a migration.
 */

export interface SchedulerPreferencesV1 {
  /** Last active saved view (scheduler-level views, not Dataverse ones). */
  readonly activeViewId?: string;
  /** The zoom saved before zoom was kept per interval; a Day zoom now. */
  readonly pxPerHour?: number;
  /** The zoom the planner chose in each interval (day, week, month, span). */
  readonly zoomByInterval?: Readonly<Record<string, number>>;
  readonly resourceColumnWidth?: number;
  /** Workforce: the stats right of the Roster grid's last day, in order. */
  readonly rosterStats?: readonly string[];
  /** True folds the review's scorecard; the summary line stays. */
  readonly scorecardHidden?: boolean;
  readonly slotMinutes?: number;
  /** Primary grouping-set name; "" = flat; unset = data default. */
  readonly groupBy?: string;
  /** True filters the unscheduled panel to the visible window. */
  readonly unscheduledInViewOnly?: boolean;
  /** True hides the unscheduled side panel (lanes stay). */
  readonly unscheduledPanelHidden?: boolean;
  readonly unscheduledPanelWidth?: number;
  readonly v: 1;
}

export interface PreferenceStore {
  readonly load: () => SchedulerPreferencesV1 | undefined;
  readonly save: (
    patch: Partial<Omit<SchedulerPreferencesV1, "v">>,
  ) => void;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    // Some embedded webviews throw on access; preferences become inert.
    return undefined;
  }
}

export function createPreferenceStore(
  scopeKey: string,
  storage: StorageLike | undefined = defaultStorage(),
): PreferenceStore {
  const readRaw = (): Record<string, unknown> | undefined => {
    if (!storage) {
      return undefined;
    }
    try {
      const raw = storage.getItem(scopeKey);
      if (!raw) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        return undefined;
      }
      return parsed as Record<string, unknown>;
    } catch {
      // Corrupt payloads are ignored, never fatal.
      return undefined;
    }
  };

  return {
    load: (): SchedulerPreferencesV1 | undefined => {
      const raw = readRaw();
      if (!raw || raw["v"] !== 1) {
        return undefined;
      }
      const activeViewId = raw["activeViewId"];
      const pxPerHour = raw["pxPerHour"];
      const resourceColumnWidth = raw["resourceColumnWidth"];
      const slotMinutes = raw["slotMinutes"];
      const groupBy = raw["groupBy"];
      const unscheduledInViewOnly = raw["unscheduledInViewOnly"];
      const unscheduledPanelHidden = raw["unscheduledPanelHidden"];
      const unscheduledPanelWidth = raw["unscheduledPanelWidth"];
      const scorecardHidden = raw["scorecardHidden"];
      const rosterStatsRaw = raw["rosterStats"];
      const rosterStats = Array.isArray(rosterStatsRaw)
        ? rosterStatsRaw
            .filter((entry): entry is string => typeof entry === "string")
            .slice(0, 40)
        : undefined;
      const zoomRaw = raw["zoomByInterval"];
      const zoomByInterval =
        typeof zoomRaw === "object" && zoomRaw !== null
          ? Object.fromEntries(
              Object.entries(zoomRaw as Record<string, unknown>).filter(
                (entry): entry is [string, number] =>
                  typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
              ),
            )
          : undefined;
      return {
        ...(typeof activeViewId === "string" ? { activeViewId } : {}),
        ...(typeof pxPerHour === "number" ? { pxPerHour } : {}),
        ...(typeof resourceColumnWidth === "number"
          ? { resourceColumnWidth }
          : {}),
        ...(rosterStats ? { rosterStats } : {}),
        ...(typeof scorecardHidden === "boolean" ? { scorecardHidden } : {}),
        ...(typeof slotMinutes === "number" ? { slotMinutes } : {}),
        ...(typeof groupBy === "string" ? { groupBy } : {}),
        ...(typeof unscheduledInViewOnly === "boolean"
          ? { unscheduledInViewOnly }
          : {}),
        ...(typeof unscheduledPanelHidden === "boolean"
          ? { unscheduledPanelHidden }
          : {}),
        ...(typeof unscheduledPanelWidth === "number"
          ? { unscheduledPanelWidth }
          : {}),
        ...(zoomByInterval ? { zoomByInterval } : {}),
        v: 1,
      };
    },
    save: (patch): void => {
      if (!storage) {
        return;
      }
      try {
        // Merge over the raw blob so keys this version does not know
        // about survive a round trip.
        const next = { ...readRaw(), ...patch, v: 1 };
        storage.setItem(scopeKey, JSON.stringify(next));
      } catch {
        // Quota or privacy-mode failures degrade to session-only.
      }
    },
  };
}

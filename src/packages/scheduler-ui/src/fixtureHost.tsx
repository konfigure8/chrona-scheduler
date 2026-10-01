/**
 * The complete fixture-backed host, extracted so every harness (Vite
 * dev harness, PCF sandbox preview) consumes ONE implementation of the
 * demo host semantics - status flips, skills rules, tag colors, layout
 * widths, preferences, undo, saved views, and the display-timezone
 * boundary - instead of drifting hand-written copies. This is the
 * fixture side of the Phase F1 HostDataSource boundary; the Dataverse
 * adapter replaces it behind the same Surface props (saved views come
 * from chr_chronaschedulerview rows keyed to native view ids, skill
 * colors from chr_skill, availability from chr_availability).
 */
import * as React from "react";

import {
  availabilityBandsToDecorations,
  buildNonWorkingDecorations,
  type RowDecoration,
} from "./decorations";
import type { DemandRow } from "./coverage";
import {
  buildFixtureSchedule,
  demoRulesConfig,
  type FixtureSchedule,
} from "./fixtures";
export { demoRulesConfig } from "./fixtures";
import {
  aggregateVerdict,
  type ChangeVerdict,
  type DragResult,
  type TimelineChange,
} from "./interactions";
import {
  buildEventsByResource,
  evaluateScheduleRules,
  type SchedulerRulesConfig,
} from "./scheduleRules";
import { createPreferenceStore } from "./preferences";
import {
  isPreferredResource as isPreferredByRules,
  type ResourcePreferenceRule,
} from "./resourcePreferences";
import type { SchedulerSurfaceProps } from "./SchedulerSurface";
import type { TagColorMap } from "./tagColors";
import {
  formatTimeZoneLabel,
  fromDisplayZone,
  toDisplayZone,
} from "./timeZone";
import {
  resolveWindowForScale,
  type SchedulerTimeScale,
  zoomForInterval,
} from "./viewConfig";
import type {
  AvailabilityBand,
  SchedulerResource,
  SchedulerUiEvent,
  SchedulerViewKind,
  TimeWindow,
} from "./types";
import { defaultTimelineConfig } from "./types";
import { gapsForChange } from "./spans";
import {
  canRedo,
  canUndo,
  emptyUndoRedo,
  popRedo,
  popUndo,
  pushEntry,
  type UndoRedoState,
} from "./undoRedo";
import type { UnscheduledFilter } from "./UnscheduledPanel";
import {
  isUntouchedGenerated,
  reconcileGeneration,
  type ShiftDemandTemplate,
} from "./generation";
import type { PeriodLifecycle, PeriodPublication } from "./horizon";

/**
 * Maker skill colors (chr_skill.color in the real adapter). Maker
 * input is arbitrary, but the demo palette sticks to Fluent v9
 * palette values (purpleBorderActive, paletteRedBackground3, brand,
 * paletteGreenBackground3) so demo surfaces stay on-system.
 */
export const fixtureTagColors: TagColorMap = {
  Bar: "#5c2e91",
  "First Aid": "#d13438",
  Floor: "#0f6cbd",
  Kitchen: "#107c10",
};

/**
 * Demo saved views proving the two timezone modes end to end: per-site
 * planning views pin a resource filter plus a display zone (mode 1);
 * the "all" view is the cross-site overview in one frame (mode 2). In
 * the Dataverse adapter these are chr_chronaschedulerview rows keyed
 * to native view ids.
 */
export interface FixtureView {
  /** Optional filter: only rows/work matching this set value. */
  readonly filter?: { readonly set: string; readonly value: string };
  readonly id: string;
  readonly label: string;
  readonly zone: string;
}

export const fixtureViews: readonly FixtureView[] = [
  { id: "all", label: "All teams - site time", zone: "site" },
  {
    filter: { set: "Teams", value: "Front of house" },
    id: "foh-akl",
    label: "Front of house - Auckland",
    zone: "Pacific/Auckland",
  },
  {
    filter: { set: "Teams", value: "Kitchen" },
    id: "kitchen-adl",
    label: "Kitchen - Adelaide",
    zone: "Australia/Adelaide",
  },
];

interface UndoEntry {
  readonly after: readonly SchedulerUiEvent[];
  readonly before: readonly SchedulerUiEvent[];
}

export interface FixtureHostOptions {
  /** Preference persistence scope; omit for an isolated default. */
  readonly preferenceKey?: string;
  /** Maker-default grouping (ordered set names) before any user choice. */
  readonly defaultGroupBy?: readonly string[];
  /** Bench data-editor override for the maker skill colors. */
  readonly tagColors?: TagColorMap;
  /** Bench data-editor override for the saved views. */
  readonly views?: readonly FixtureView[];
  /** Availability-band decorations on rows (default true). */
  readonly showAvailabilityBands?: boolean;
  /** Weekend columns shown (default true; also shades them off). */
  readonly showWeekends?: boolean;
  /**
   * The representation the caller renders; top-down narrows the window
   * to a single day regardless of the toolbar interval.
   */
  readonly viewKind?: SchedulerViewKind;
  /**
   * Alternative dataset routed through the full stateful host (the
   * stress fixture) - swapping reseeds events, history, and anchor.
   */
  readonly dataset?: FixtureSchedule;
  /**
   * Maker rules configuration; defaults to demoRulesConfig. The
   * harness config panel supplies an edited copy.
   */
  readonly rulesConfig?: SchedulerRulesConfig;
  /** Working-hours shading: "none", "6-22", "8-18" (default "6-22"). */
  readonly workingHours?: string;
  /**
   * Clamp anchor navigation and the derived window inside these
   * bounds (the selected planning period - doctrine: the viewport
   * never shows content from another period).
   */
  readonly navigationBounds?: TimeWindow;
  /** Seed period lifecycle by periodKey; absent entries are draft. */
  readonly lifecycleSeed?: Readonly<Record<string, PeriodLifecycle>>;
  /**
   * Gallery-default mode: withhold every demo-only seam (saved
   * views, tag colors, preference rules) so the control behaves as
   * a fresh install. Maker RULES stay live from options.rulesConfig
   * - a gallery user configures policies too; plain strips demo
   * data and Chrona services, never configurability.
   */
  readonly plain?: boolean;
}

/**
 * A publication freezes a snapshot (domain model 6.3: immutable,
 * created only on explicit publish); later change batches touching
 * the period append to the audited delta count.
 */
interface LifecycleEntry {
  readonly lifecycle: PeriodLifecycle;
  readonly snapshots: readonly (readonly SchedulerUiEvent[])[];
  readonly window?: TimeWindow;
}

export interface FixtureHostResult {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  /**
   * Remove the period's untouched generated shifts (what
   * reconciliation would remove) - the data half of deleting a
   * roster card. Returns the removed count.
   */
  readonly clearGeneratedInPeriod: (window: TimeWindow, note: string) => number;
  /** Period lifecycle by periodKey (seed plus publishes). */
  readonly lifecycleByKey: ReadonlyMap<string, PeriodLifecycle>;
  /** Show a host message without touching events or undo. */
  readonly notify: (message: string) => void;
  /** Bench only: forget the zoom chosen in the current interval (Week and Month fit again). */
  readonly resetIntervalZoom: () => void;
  /**
   * Return the period to draft. The snapshots stay in the entry as
   * the audit record; only the exposed lifecycle resets.
   */
  readonly unpublishPeriod: (key: string) => void;
  /**
   * Publish the period: freeze a snapshot of its events, flip it to
   * Published, start the delta count at zero (domain model 6.3).
   */
  readonly publishPeriod: (key: string, window: TimeWindow) => void;
  /** Current display zone ("site" renders stored wall clock). */
  readonly displayZone: string;
  /**
   * Expand demand templates over the period and reconcile (domain
   * model 6.4); one undoable batch, reported added/removed/flagged.
   */
  readonly generate: (
    templates: readonly ShiftDemandTemplate[],
    period: TimeWindow,
    cycleAnchor?: Date,
  ) => void;
  /** Last applied change note ("Updated Kitchen prep", ...). */
  readonly message: string;
  readonly redo: () => void;
  /** Manual zone override (the saved view applies its own on switch). */
  readonly setDisplayZone: (zone: string) => void;
  /** Spread onto SchedulerSurface; add `view` and any overrides. */
  readonly surfaceProps: Omit<SchedulerSurfaceProps, "view">;
  readonly undo: () => void;
}

let createCounter = 0;

/*
 * Demo soft preferences: Priya is the preferred cook for Kitchen prep
 * (e-05), so she ranks first among fitting people in the dialog's
 * "Best options". Hard tiers would join fixtureValidateChange.
 */
const fixturePreferenceRules: readonly ResourcePreferenceRule[] = [
  {
    label: "Preferred cook",
    resourceIds: ["r-priya"],
    tier: "preferred",
    workItemId: "e-05",
  },
];

/** Memoized per-render rule data so drag-frame and candidate-loop
 * evaluations reuse one index instead of scanning per call. */
interface FixtureRuleData {
  readonly availabilityBands: readonly AvailabilityBand[];
  readonly config: SchedulerRulesConfig;
  readonly events: readonly SchedulerUiEvent[];
  readonly eventsByResource: ReadonlyMap<
    string,
    readonly SchedulerUiEvent[]
  >;
  readonly resources: readonly SchedulerResource[];
}

function fixtureValidateChange(
  event: SchedulerUiEvent | undefined,
  proposed: DragResult,
  data: FixtureRuleData,
): ChangeVerdict {
  // One engine for every host (section 12.2): the fixture only
  // supplies data and the demo config. The open row is a queue, not a
  // person, so it sits outside the person-scoped rules.
  return aggregateVerdict(
    evaluateScheduleRules({
      availabilityBands: data.availabilityBands,
      config: data.config,
      event,
      events: data.events,
      eventsByResource: data.eventsByResource,
      proposed,
      resources: data.resources,
    }),
  );
}

export function useFixtureScheduleHost(
  options?: FixtureHostOptions,
): FixtureHostResult {
  const showBands = options?.showAvailabilityBands ?? true;
  const showWeekends = options?.showWeekends ?? true;
  const viewKind = options?.viewKind ?? "timeline";
  const rulesConfig = options?.rulesConfig ?? demoRulesConfig;
  const workingHours = options?.workingHours ?? "6-22";

  const defaultFixture = React.useMemo(() => buildFixtureSchedule(), []);
  const fixture = options?.dataset ?? defaultFixture;
  const hostTagColors = options?.tagColors ?? fixtureTagColors;
  const hostViews = options?.views ?? fixtureViews;
  const store = React.useMemo(
    () =>
      createPreferenceStore(
        options?.preferenceKey ?? "chrona-sched:v1:fixture-host",
      ),
    [options?.preferenceKey],
  );
  const stored = React.useMemo(() => store.load(), [store]);

  const [events, setEvents] = React.useState<readonly SchedulerUiEvent[]>(
    fixture.events,
  );
  const [message, setMessage] = React.useState("");
  const [history, setHistory] = React.useState<UndoRedoState<UndoEntry>>(
    emptyUndoRedo(),
  );
  const [anchor, setAnchorState] = React.useState<Date>(fixture.window.start);
  const bounds = options?.navigationBounds;
  const setAnchor = React.useCallback(
    (next: Date): void => {
      if (!bounds) {
        setAnchorState(next);
        return;
      }
      const lastDay = new Date(bounds.end.getTime() - 1);
      setAnchorState(
        next < bounds.start ? bounds.start : next > lastDay ? bounds.start : next,
      );
    },
    [bounds],
  );
  const [lifecycleEntries, setLifecycleEntries] = React.useState<
    ReadonlyMap<string, LifecycleEntry>
  >(() => {
    const seeded = new Map<string, LifecycleEntry>();
    for (const [key, lifecycle] of Object.entries(options?.lifecycleSeed ?? {})) {
      seeded.set(key, { lifecycle, snapshots: [] });
    }
    return seeded;
  });
  /*
   * Dataset swaps (the stress fixture) reseed the stateful host the
   * same way the adapter reseeds when the bound view changes: fresh
   * events, cleared history, window start as the anchor.
   */
  const lastFixture = React.useRef(fixture);
  React.useEffect(() => {
    if (lastFixture.current !== fixture) {
      lastFixture.current = fixture;
      setEvents(fixture.events);
      setHistory(emptyUndoRedo());
      setAnchorState(fixture.window.start);
      setLifecycleEntries(() => {
        const seeded = new Map<string, LifecycleEntry>();
        for (const [key, lifecycle] of Object.entries(
          options?.lifecycleSeed ?? {},
        )) {
          seeded.set(key, { lifecycle, snapshots: [] });
        }
        return seeded;
      });
      setSelectedEventIds([]);
      setMessage("");
    }
  }, [fixture]);
  const [interval, setIntervalState] = React.useState<SchedulerTimeScale>(
    "week",
  );
  const [selectedEventIds, setSelectedEventIds] = React.useState<
    readonly string[]
  >([]);
  // Ruled 2026-09-26: each interval keeps the zoom the planner chose; Week and Month open fitted.
  const [zoomByInterval, setZoomByInterval] = React.useState<Readonly<Record<string, number>>>(
    stored?.zoomByInterval ?? {},
  );
  const dayZoom = stored?.pxPerHour ?? defaultTimelineConfig.pxPerHour;
  const [slotMinutes, setSlotMinutesState] = React.useState(
    stored?.slotMinutes ?? 30,
  );
  const [resourceColumnWidth, setResourceColumnWidthState] = React.useState(
    stored?.resourceColumnWidth ?? 168,
  );
  const [panelWidth, setPanelWidthState] = React.useState(
    stored?.unscheduledPanelWidth ?? 200,
  );
  const [unscheduledFilter, setUnscheduledFilterState] =
    React.useState<UnscheduledFilter>(
      stored?.unscheduledInViewOnly ? "window" : "all",
    );
  // Primary grouping set: "" = flat, undefined = data default.
  const [groupBySet, setGroupBySet] = React.useState<string | undefined>(
    stored?.groupBy,
  );
  const [panelVisible, setPanelVisibleState] = React.useState<boolean>(
    !stored?.unscheduledPanelHidden,
  );
  const [activeViewId, setActiveViewIdState] = React.useState(
    stored?.activeViewId ?? "all",
  );
  // The restored saved view brings its zone with it.
  const [displayZone, setDisplayZone] = React.useState(
    () =>
      hostViews.find(
        (view) => view.id === (stored?.activeViewId ?? "all"),
      )?.zone ?? "site",
  );
  const activeView =
    hostViews.find((view) => view.id === activeViewId) ?? hostViews[0];

  const setActiveViewId = React.useCallback(
    (next: string): void => {
      setActiveViewIdState(next);
      store.save({ activeViewId: next });
      // A view change applies the view's zone; manual overrides after.
      const view = hostViews.find((candidate) => candidate.id === next);
      if (view) {
        setDisplayZone(view.zone);
      }
    },
    [store],
  );

  /*
   * The host-boundary contract the Dataverse adapter follows: stored
   * instants convert to display dates on the way in, edited results
   * convert back on the way out. "site" renders the stored wall clock
   * untouched.
   */
  const toDisplay = React.useCallback(
    (date: Date): Date =>
      displayZone === "site" ? date : toDisplayZone(date, displayZone),
    [displayZone],
  );
  const toStored = React.useCallback(
    (date: Date): Date =>
      displayZone === "site" ? date : fromDisplayZone(date, displayZone),
    [displayZone],
  );

  const window = React.useMemo(() => {
    const scale = viewKind === "topDown" ? ("day" as const) : interval;
    const resolved = resolveWindowForScale(anchor, {
      representation: "timeline",
      timeScale: scale,
    });
    if (!bounds) {
      return resolved;
    }
    // The viewport may show all or part of the selected period, but
    // never content from another period (ratified scope wording).
    const start = resolved.start < bounds.start ? bounds.start : resolved.start;
    const end = resolved.end > bounds.end ? bounds.end : resolved.end;
    return end > start ? { end, start } : bounds;
  }, [anchor, bounds, interval, viewKind]);

  // Demand travels with the dataset (chr_demand stand-in), so the
  // stress fixture brings region-scale curves and the demo fixture
  // its kitchen/front-of-house shapes.
  const demand = fixture.demand;

  const decorations = React.useMemo(() => {
    const collected: RowDecoration[] = [];
    if (workingHours !== "none") {
      const [startHour, endHour] = workingHours.split("-").map(Number);
      collected.push(
        ...buildNonWorkingDecorations(
          window,
          { endHour: endHour ?? 22, startHour: startHour ?? 6 },
          !showWeekends,
        ),
      );
    }
    if (showBands) {
      collected.push(
        ...availabilityBandsToDecorations(fixture.availabilityBands),
      );
    }
    return collected;
  }, [window, workingHours, showBands, showWeekends, fixture]);

  const workingStartHour = React.useMemo(() => {
    const parsed = Number(workingHours.split("-")[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [workingHours]);

  /*
   * On-demand rule data: filtered once and indexed by person per data
   * change, so drag-frame streams and the dialog's candidate loop
   * evaluate against buckets instead of rescanning every event.
   */
  const ruleData = React.useMemo<FixtureRuleData>(() => {
    const ruleEvents = events.filter(
      (candidate) => candidate.resourceId !== "r-open",
    );
    return {
      availabilityBands: fixture.availabilityBands,
      config: rulesConfig,
      events: ruleEvents,
      eventsByResource: buildEventsByResource(ruleEvents),
      resources: fixture.resources.filter(
        (resource) => resource.id !== "r-open",
      ),
    };
  }, [events, fixture, rulesConfig]);

  /*
   * Audited deltas (domain model 6.3): each change batch touching a
   * PUBLISHED period counts against its latest publication. The
   * snapshot itself never changes.
   */
  const recordDeltas = React.useCallback(
    (
      before: readonly SchedulerUiEvent[],
      after: readonly SchedulerUiEvent[],
    ): void => {
      setLifecycleEntries((entries) => {
        let mutated: Map<string, LifecycleEntry> | undefined;
        for (const [key, entry] of entries) {
          if (entry.lifecycle.status !== "published" || !entry.window) {
            continue;
          }
          const bounds = entry.window;
          const touches = (event: SchedulerUiEvent): boolean =>
            event.end > bounds.start && event.start < bounds.end;
          const beforeById = new Map(before.map((event) => [event.id, event]));
          const afterById = new Map(after.map((event) => [event.id, event]));
          let touched = false;
          for (const event of after) {
            const previous = beforeById.get(event.id);
            if (previous !== event && (touches(event) || (previous && touches(previous)))) {
              touched = true;
              break;
            }
          }
          if (!touched) {
            for (const event of before) {
              if (!afterById.has(event.id) && touches(event)) {
                touched = true;
                break;
              }
            }
          }
          if (!touched) {
            continue;
          }
          const publications = entry.lifecycle.publications;
          const latest = publications[publications.length - 1];
          if (!latest) {
            continue;
          }
          mutated = mutated ?? new Map(entries);
          mutated.set(key, {
            ...entry,
            lifecycle: {
              publications: [
                ...publications.slice(0, -1),
                { ...latest, changesSince: latest.changesSince + 1 },
              ],
              status: "published",
            },
          });
        }
        return mutated ?? entries;
      });
    },
    [],
  );

  const applyEvents = React.useCallback(
    (
      next:
        | readonly SchedulerUiEvent[]
        | ((
            previous: readonly SchedulerUiEvent[],
          ) => readonly SchedulerUiEvent[]),
      note: string,
    ): void => {
      // The updater form is for callers that can fire in the same tick
      // as another change (dialog save = move + skills); a pre-built
      // array would clobber the sibling update from a stale closure.
      setEvents((previous) => {
        const resolved = typeof next === "function" ? next(previous) : next;
        setHistory((h) => pushEntry(h, { after: resolved, before: previous }));
        recordDeltas(previous, resolved);
        return resolved;
      });
      setMessage(note);
    },
    [],
  );

  const applyChanges = React.useCallback(
    (changes: readonly TimelineChange[]): void => {
      const byId = new Map(
        changes
          .filter((change) => change.event)
          .map((change) => [change.event?.id ?? "", change]),
      );
      if (byId.size === 0) {
        return;
      }
      setEvents((previous) => {
        const next = previous.map((candidate) => {
          const change = byId.get(candidate.id);
          if (!change || !change.event) {
            return candidate;
          }
          return {
            ...candidate,
            end: toStored(change.result.end),
            // Gaps travel with a move and stay put on a resize; the rule
            // lives in the package so every host gets it right.
            gaps: gapsForChange(candidate, {
              end: toStored(change.result.end),
              resourceId: change.result.resourceId,
              start: toStored(change.result.start),
            }),
            resourceId: change.result.resourceId,
            start: toStored(change.result.start),
            // Nobody means open, as in the Dataverse host: a move to
            // the open row (F40: the solver takes someone off) needs
            // cover, and a move off it is assigned.
            status:
              change.result.resourceId === "r-open"
                ? ("needsCover" as const)
                : change.event.status === "needsCover"
                  ? ("assigned" as const)
                  : candidate.status,
            title: change.title ?? candidate.title,
            undated: undefined,
          };
        });
        setHistory((h) => pushEntry(h, { after: next, before: previous }));
        return next;
      });
      const first = changes[0];
      const warned = changes.find(
        (change) => change.verdict.kind === "warn" && change.verdict.reason,
      );
      const verdictNote = warned ? ` (warning: ${warned.verdict.reason})` : "";
      setMessage(
        changes.length === 1
          ? `Updated ${first?.event?.title ?? "item"}${verdictNote}`
          : `Moved ${changes.length} shifts${verdictNote}`,
      );
    },
    [toStored],
  );

  const undo = React.useCallback((): void => {
    setHistory((h) => {
      const { entry, state } = popUndo(h);
      if (entry) {
        setEvents(entry.before);
        setMessage("Undid change");
      }
      return state;
    });
  }, []);

  const redo = React.useCallback((): void => {
    setHistory((h) => {
      const { entry, state } = popRedo(h);
      if (entry) {
        setEvents(entry.after);
        setMessage("Redid change");
      }
      return state;
    });
  }, []);

  React.useEffect(() => {
    const handler = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.ctrlKey && keyEvent.key.toLowerCase() === "z") {
        keyEvent.preventDefault();
        undo();
      }
      if (keyEvent.ctrlKey && keyEvent.key.toLowerCase() === "y") {
        keyEvent.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const displayEvents = React.useMemo(
    () =>
      displayZone === "site"
        ? events
        : events.map((event) => ({
            ...event,
            end: toDisplay(event.end),
            start: toDisplay(event.start),
          })),
    [events, displayZone, toDisplay],
  );
  // Undated rows wait in the panel only, as the Dataverse host keeps them.
  const scheduled = displayEvents.filter(
    (event) => !event.undated && event.status !== "needsCover",
  );
  const viewFilter = activeView?.filter;
  const undated = displayEvents.filter((event) => event.undated);
  const unscheduled = displayEvents.filter(
    (event) =>
      !event.undated &&
      event.status === "needsCover" &&
      (!viewFilter || event.groups?.[viewFilter.set] === viewFilter.value),
  );
  const resources = React.useMemo(
    () =>
      fixture.resources.filter(
        (resource) =>
          resource.id !== "r-open" &&
          (!viewFilter ||
            resource.groups?.[viewFilter.set] === viewFilter.value),
      ),
    [fixture, viewFilter],
  );

  const surfaceProps: Omit<SchedulerSurfaceProps, "view"> = {
    activeViewId,
    availableTags: Object.keys(hostTagColors).sort(),
    anchor,
    announcement: message,
    config: { ...defaultTimelineConfig, ...zoomForInterval(interval, zoomByInterval, dayZoom) },
    decorations,
    demand,
    events: scheduled,
    initialScrollHour: workingStartHour,
    interval,
    now: toDisplay(fixture.now),
    onActiveViewChange: setActiveViewId,
    onAnchorChange: setAnchor,
    onCreateEvent: (draft) => {
      createCounter += 1;
      applyEvents(
        [
          ...events,
          {
            end: toStored(draft.end),
            fields: [{ label: "Role", value: "New" }],
            id: `new-${createCounter}`,
            requiredTags: draft.requiredTags,
            resourceId: draft.resourceId,
            start: toStored(draft.start),
            status: "assigned",
            title: draft.title,
          },
        ],
        `Created ${draft.title}`,
      );
    },
    onDeleteEvent: (event) =>
      applyEvents(
        events.filter((candidate) => candidate.id !== event.id),
        `Deleted ${event.title}`,
      ),
    onDeleteEvents: (doomed) => {
      const doomedIds = new Set(doomed.map((event) => event.id));
      applyEvents(
        events.filter((candidate) => !doomedIds.has(candidate.id)),
        `Deleted ${doomed.length} shifts`,
      );
    },
    onDuplicateEvent: (event) => {
      createCounter += 1;
      const source =
        events.find((candidate) => candidate.id === event.id) ?? event;
      applyEvents(
        [
          ...events,
          {
            ...source,
            id: `copy-${createCounter}`,
            title: `${source.title} (copy)`,
          },
        ],
        `Duplicated ${source.title}`,
      );
    },
    onDuplicateEvents: (sources) => {
      const copies = sources.map((event) => {
        createCounter += 1;
        const source =
          events.find((candidate) => candidate.id === event.id) ?? event;
        return {
          ...source,
          id: `copy-${createCounter}`,
          title: `${source.title} (copy)`,
        };
      });
      applyEvents(
        [...events, ...copies],
        `Duplicated ${copies.length} shifts`,
      );
    },
    onEventChange: (change) => applyChanges([change]),
    onEventsChange: applyChanges,
    onEventClick: (event) => setMessage(`Clicked ${event.title}`),
    onOpenEvent: (event) => setMessage(`Opened ${event.title}`),
    onRequiredTagsChange: (event, tags) => {
      applyEvents(
        (previous) =>
          previous.map((candidate) =>
            candidate.id === event.id
              ? {
                  ...candidate,
                  requiredTags: tags.length > 0 ? tags : undefined,
                }
              : candidate,
          ),
        `Updated skills for ${event.title}`,
      );
    },
    onResourceColumnWidthChange: (width) => {
      setResourceColumnWidthState(width);
      store.save({ resourceColumnWidth: width });
    },
    onSelectionChange: setSelectedEventIds,
    onSetPinned: (targets, pinned) => {
      const ids = new Set(targets.map((target) => target.id));
      const first = events.find((candidate) => ids.has(candidate.id));
      applyEvents(
        events.map((candidate) =>
          ids.has(candidate.id) ? { ...candidate, pinned } : candidate,
        ),
        ids.size === 1
          ? `${pinned ? "Pinned" : "Unpinned"} ${first?.title ?? "item"}`
          : `${pinned ? "Pinned" : "Unpinned"} ${ids.size} shifts`,
      );
    },
    onSlotMinutesChange: (minutes) => {
      setSlotMinutesState(minutes);
      store.save({ slotMinutes: minutes });
    },
    onTogglePin: (event) => {
      const source = events.find((candidate) => candidate.id === event.id);
      if (!source) {
        return;
      }
      applyEvents(
        events.map((candidate) =>
          candidate.id === event.id
            ? { ...candidate, pinned: !candidate.pinned }
            : candidate,
        ),
        source.pinned ? `Unpinned ${source.title}` : `Pinned ${source.title}`,
      );
    },
    onIntervalChange: setIntervalState,
    onAssignEvent: (event, resourceId) => {
      const name =
        fixture.resources.find((resource) => resource.id === resourceId)
          ?.name ?? resourceId;
      applyEvents(
        events.map((candidate) =>
          candidate.id === event.id
            ? {
                ...candidate,
                resourceId,
                status: "assigned" as const,
              }
            : candidate,
        ),
        `Assigned ${event.title} to ${name}`,
      );
    },
    onUnscheduleEvent: (event) => {
      // The lane and panel bucket by the event's classification map;
      // stamp it from the row the shift is leaving (the Dataverse
      // adapter knows the memberships the same way).
      const groups =
        event.groups ??
        fixture.resources.find(
          (resource) => resource.id === event.resourceId,
        )?.groups;
      applyEvents(
        events.map((candidate) =>
          candidate.id === event.id
            ? {
                ...candidate,
                groups,
                resourceId: "r-open",
                status: "needsCover" as const,
              }
            : candidate,
        ),
        `Unscheduled ${event.title}`,
      );
    },
    // Grouping is only offered when the data actually carries
    // classification sets (the plain gallery fixture does not).
    ...(fixture.resources.some(
      (resource) => Object.keys(resource.groups ?? {}).length > 0,
    )
      ? {
          groupBy:
            groupBySet === undefined
              ? options?.defaultGroupBy
              : groupBySet === ""
                ? []
                : [groupBySet],
          onGroupByChange: (set: string | undefined): void => {
            setGroupBySet(set ?? "");
            store.save({ groupBy: set ?? "" });
          },
        }
      : {}),
    unscheduledPanelVisible: panelVisible,
    onUnscheduledPanelVisibleChange: (visible) => {
      setPanelVisibleState(visible);
      store.save({ unscheduledPanelHidden: !visible });
    },
    onUnscheduledFilterChange: (filter) => {
      setUnscheduledFilterState(filter);
      store.save({ unscheduledInViewOnly: filter === "window" });
    },
    onUnscheduledPanelWidthChange: (width) => {
      setPanelWidthState(width);
      store.save({ unscheduledPanelWidth: width });
    },
    isPreferredResource: options?.plain
      ? undefined
      : (event, candidateId, at) =>
          isPreferredByRules(fixturePreferenceRules, event, candidateId, at),
    onZoomChange: (next) => {
      const zooms = { ...zoomByInterval, [interval]: next };
      setZoomByInterval(zooms);
      store.save({ zoomByInterval: zooms });
    },
    resourceColumnWidth,
    resources,
    selectedEventIds,
    showWeekends,
    slotMinutes,
    tagColors: options?.plain ? undefined : hostTagColors,
    timeZoneLabel:
      displayZone === "site" ? undefined : formatTimeZoneLabel(displayZone),
    today: fixture.window.start,
    undatedEvents: undated,
    unscheduledEvents: unscheduled,
    unscheduledFilter,
    unscheduledPanelWidth: panelWidth,
    validateChange: (event, proposed) =>
      fixtureValidateChange(event, proposed, ruleData),
    views: options?.plain
      ? undefined
      : hostViews.map((view) => ({ id: view.id, label: view.label })),
    window,
  };

  const clearGeneratedInPeriod = React.useCallback(
    (periodWindow: TimeWindow, note: string): number => {
      const keep = events.filter(
        (event) =>
          !(
            event.origin &&
            event.end > periodWindow.start &&
            event.start < periodWindow.end &&
            isUntouchedGenerated(event)
          ),
      );
      const removed = events.length - keep.length;
      if (removed > 0) {
        applyEvents(keep, note);
      } else {
        setMessage(note);
      }
      return removed;
    },
    [applyEvents, events],
  );

  const publishPeriod = React.useCallback(
    (key: string, periodWindow: TimeWindow): void => {
      setLifecycleEntries((entries) => {
        const next = new Map(entries);
        const existing = next.get(key);
        const snapshot = events.filter(
          (event) =>
            event.end > periodWindow.start && event.start < periodWindow.end,
        );
        const publication: PeriodPublication = {
          at: new Date(fixture.now.getTime()),
          changesSince: 0,
        };
        const publications =
          existing && existing.lifecycle.status !== "draft"
            ? [...existing.lifecycle.publications, publication]
            : [publication];
        next.set(key, {
          lifecycle: { publications, status: "published" },
          snapshots: [...(existing?.snapshots ?? []), snapshot],
          window: periodWindow,
        });
        return next;
      });
      setMessage(`Published ${key}`);
    },
    [events, fixture.now],
  );

  const unpublishPeriod = React.useCallback((key: string): void => {
    setLifecycleEntries((entries) => {
      const existing = entries.get(key);
      if (!existing || existing.lifecycle.status === "draft") {
        return entries;
      }
      const next = new Map(entries);
      next.set(key, { ...existing, lifecycle: { status: "draft" } });
      return next;
    });
    setMessage(`Unpublished ${key}`);
  }, []);

  const lifecycleByKey = React.useMemo(() => {
    const map = new Map<string, PeriodLifecycle>();
    for (const [key, entry] of lifecycleEntries) {
      map.set(key, entry.lifecycle);
    }
    return map;
  }, [lifecycleEntries]);

  const generate = React.useCallback(
    (templates: readonly ShiftDemandTemplate[], period: TimeWindow, cycleAnchor?: Date): void => {
      const result = reconcileGeneration({
        cycleAnchor,
        demand: fixture.demandDrivers,
        events,
        openResourceId: "open",
        period,
        templates,
      });
      const anchorNote =
        result.unanchored.length > 0
          ? `, ${result.unanchored.length} need a period anchor`
          : "";
      const note = `Generated shifts: ${result.added.length} added, ${result.removed.length} removed, ${result.flagged.length} flagged${anchorNote}`;
      if (!result.changed) {
        // Nothing changed on the canvas - report without burning an
        // undo step on an identical state.
        setMessage(note);
        return;
      }
      applyEvents(result.events, note);
    },
    [applyEvents, events, fixture.demandDrivers],
  );

  return {
    canRedo: canRedo(history),
    canUndo: canUndo(history),
    clearGeneratedInPeriod,
    displayZone,
    generate,
    lifecycleByKey,
    message,
    notify: setMessage,
    resetIntervalZoom: () => {
      const { [interval]: _dropped, ...rest } = zoomByInterval;
      setZoomByInterval(rest);
      store.save({ zoomByInterval: rest });
    },
    publishPeriod,
    unpublishPeriod,
    redo,
    setDisplayZone,
    surfaceProps,
    undo,
  };
}

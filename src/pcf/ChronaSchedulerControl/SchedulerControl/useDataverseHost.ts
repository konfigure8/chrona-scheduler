/**
 * The Dataverse-backed host: the real-adapter counterpart of the
 * package's useFixtureScheduleHost, built on the decided binding model
 * - dataset-bound work items, chr_ config rows keyed to the native
 * view id, WebAPI (not a second dataset) for resources and bands,
 * in-place row updates, display-zone conversion at this boundary
 * (the site's zone from the calendar row; without one, the Power Apps
 * user's own zone, labeled).
 *
 * Resource loading today is the zero-config fallback: rows derived
 * from the work items' lookups. The config-driven WebAPI load (the
 * customer's resource table named by the calendarConfigId mapping
 * rows, with groups, timezones, and people who hold no assignments)
 * replaces the derivation at F3 behind the same seam.
 *
 * Write path: edits apply to local state immediately (optimistic,
 * undoable) and PATCH the bound rows in place; provenance stamps
 * "manual" when the column is mapped. When no Dataverse answers - the
 * local test harness - the edit stays local and the status message
 * says so. Creation/duplication are omitted until the config surface
 * can supply the maker's required columns (F3).
 */
import * as React from "react";

import {
  activeCapabilities,
  defaultSchedulerStrings,
  buildNonWorkingDecorations,
  computeCapabilityTiers,
  createPreferenceStore,
  CAPABILITY_SOLVE,
  createEntitlementCache,
  deriveEntitlementStatus,
  entitlementAllows,
  entitlementDueForRefresh,
  EntitlementExpiredError,
  markEntitlementFailure,
  planUsageUrl,
  refreshEntitlement,
  scenarioCapability,
  toEntitlementDisplay,
  type EntitlementSession,
  type EntitlementSnapshot,
  diffProposal,
  followRun,
  hashProblem,
  normalizeRecordId,
  outOfDateChanges,
  type AvailabilityBand,
  type FreshnessData,
  idleSolveState,
  markRunReviewed,
  problemFromSchedule,
  redactProblemForTenant,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveQuotaExceededError,
  SolveSessionExpiredError,
  periodContaining,
  rosterPeriodWindow,
  stepPeriod,
  defaultTimelineConfig,
  emptyUndoRedo,
  canRedo,
  canUndo,
  aggregateVerdict,
  buildEventsByResource,
  evaluateScheduleRules,
  formatString,
  browserTimeZone,
  formatFixedOffsetZone,
  formatTimeZoneCity,
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  normalizeTimeZoneId,
  parseDateOnly,
  zoneOffsetMinutes,
  popRedo,
  popUndo,
  isPinned,
  pushEntry,
  resolveWindowForScale,
  showsPin,
  weekStartFrom,
  withPin,
  zoomForInterval,
  toDisplayZone,
  toOffsetZone,
  type ChangeVerdict,
  type DragResult,
  type ProposalChange,
  type ResumeRunDisplay,
  type ScheduleProposal,
  type SolveSession,
  type SolveState,
  type PeriodUnit,
  type RowDecoration,
  type RuleReasonStrings,
  type SchedulerPeriodConfig,
  type SchedulerRulesConfig,
  type SchedulerSurfaceProps,
  type SchedulerTimeScale,
  type SchedulerUiEvent,
  type TimelineChange,
  type TimeWindow,
  type UndoRedoState,
} from "@chrona/scheduler-ui";


import {
  canChangeViewSettings,
  recheckPrivilege,
  openRecordInDialog,
  readRowsVersion,
  VIEW_SETTINGS_TABLE,
  watchWhileOpen,
} from "./settingsDialog";
import { createAppNotifier, type NoticeLevel } from "./hostNotifications";
import {
  calendarsNamedLikeQuery,
  emptyHostConfig,
  loadHostConfig,
  nextCalendarName,
  PRODUCT_CHOICE,
  type HostConfig,
} from "./configLoader";
import {
  calendarSettingsReady,
  connectEnvironment,
  fetchSolveSession,
  resolveClientUrl,
  SolveBridgeError,
  solveClickAction,
} from "./solveBridge";
import { resolveControlStrings } from "./controlStrings";
import {
  readPersonVersions,
  readShiftRows,
  type ShiftRow,
  type ShiftTableSpec,
  type TimeRange,
} from "./solveReads";
import {
  buildLockPayload,
  type ColorBy,
  colorByFromChoice,
  eventColorFor,
  isChoiceColumn,
  layoutFromChoice,
  type MakerLayout,
  STATUS_CHOICE,
  buildProvenance,
  lookupSchemaName,
  lookupTarget,
  givesPerson,
  buildUnschedulePayload,
  buildUpdatePayload,
  columnLogicalName,
  DATASET_ROW_CAP,
  hasColumn,
  mapWorkItems,
  representationFor,
  retrieveRecordCommands,
  type WriteProvenance,
  UNASSIGNED_RESOURCE_ID,
} from "./dataverseData";
import type { IInputs } from "./generated/ManifestTypes";
import type {
  ControlScenario,
  ScenarioBoard,
  ScenarioConfig,
  ScenarioData,
} from "./scenario";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The longest a save waits for the names a person's bind needs. */
const BINDING_WAIT_MS = 10_000;

/* The Web API reads the freshness check compares (F31 rework); a part
 * that could not be read is undefined and the check skips it. */
interface FreshnessReads {
  readonly bands?: readonly AvailabilityBand[];
  readonly personVersions?: ReadonlyMap<string, string>;
  readonly rows?: readonly ShiftRow[];
}

/* What a solve was sent, for the freshness check. */
interface SolveSnapshot {
  /** The solve's events: what the solver saw of the view's rows. */
  readonly events: readonly SchedulerUiEvent[];
  /** The stored range the reads cover: the window and a day either side. */
  readonly range: TimeRange;
  /** The reads taken as the solve started. */
  readonly reads: FreshnessReads;
}

interface UndoEntry {
  readonly after: readonly SchedulerUiEvent[];
  readonly before: readonly SchedulerUiEvent[];
}

/** chr_chronaschedulerview row fields consumed as maker defaults. */
interface ViewConfig {
  /** The maker's "Color by" for this view; empty leaves the bars neutral. */
  readonly colorBy?: ColorBy;
  readonly displayTimeZone?: string;
  /** The maker's layout for this view; empty means the timeline. */
  readonly layout?: MakerLayout;
  /** F25 (Q1-C): when both are set, Generate runs per roster period;
   * otherwise it asks for an explicit window. */
  readonly periodAnchor?: Date;
  readonly periodUnit?: PeriodUnit;
  readonly pxPerHour?: number;
  readonly showWeekends?: boolean;
  readonly slotMinutes?: number;
  readonly workingEndHour?: number;
  readonly workingStartHour?: number;
}

export interface DataverseHostResult {
  readonly message: string;
  readonly surfaceProps: Omit<SchedulerSurfaceProps, "view">;
  /** Lanes with a Resource bound; the calendar layouts without one. */
  readonly view: ReturnType<typeof representationFor>;
}


/**
 * The user's first day of the week from their Power Apps regional
 * settings (0 Sunday to 6 Saturday); Monday when a host leaves it out.
 */
function userWeekStart(context: ComponentFramework.Context<IInputs>): number {
  const info = context.userSettings.dateFormattingInfo as
    | Partial<ComponentFramework.UserSettingApi.DateFormattingInfo>
    | undefined;
  return weekStartFrom(info?.firstDayOfWeek);
}

/** F27 stage 2: the entitlement clock tick and the minimum gap between refresh attempts. */
const ENTITLEMENT_TICK_MS = 60 * 1000;
const ENTITLEMENT_RETRY_MS = 5 * 60 * 1000;

/** The generic scheduler has no scenario: no spans, rules, tags or extension. */
const noScenarioData: ScenarioData = {
  bands: [],
  capabilities: { availability: false, roles: false },
  decorations: [],
  extraRules: [],
};
const noScenarioBoard: ScenarioBoard = {};

export function useDataverseScheduleHost<
  TConfig extends ScenarioConfig = ScenarioConfig,
  TData extends ScenarioData = ScenarioData,
>(
  context: ComponentFramework.Context<IInputs>,
  dataFingerprint: string,
  rowCapReached = false,
  scenario?: ControlScenario<TConfig, TData>,
): DataverseHostResult {
  const workItems = context.parameters.workItems;
  const viewId = workItems.getViewId?.() || "default";
  const userId = context.userSettings.userId || "user";
  const userName = context.userSettings.userName || undefined;
  // Every write the control makes says who made it (F26).
  const manualProvenance = React.useMemo(
    () => buildProvenance({ kind: "manual", userName }),
    [userName],
  );

  /*
   * One resx read per mount: adapter messages and the package UI
   * overrides both come from the manifest resx, so one file per
   * language translates the whole control.
   */
  const controlStrings = React.useMemo(
    () => resolveControlStrings(context.resources),
    // The context object is mutated in place; resources are per-mount.
    [],
  );
  const messages = controlStrings.messages;
  // The bundle the surface renders with: package defaults under the
  // resx overrides, so labels built here read the user's language too.
  const surfaceStrings = React.useMemo(
    () => ({ ...defaultSchedulerStrings, ...controlStrings.surface }),
    [controlStrings.surface],
  );
  const LOCAL_ONLY_NOTE = messages.msgLocalOnly;

  const store = React.useMemo(
    () => createPreferenceStore(`chrona-sched:v1:${userId}:${viewId}`),
    [userId, viewId],
  );
  const stored = React.useMemo(() => store.load(), [store]);

  const calendarConfigId =
    context.parameters.calendarConfigId?.raw?.trim() ?? "";
  const [hostConfig, setHostConfig] =
    React.useState<HostConfig<TConfig>>(emptyHostConfig);
  // The calendar id the loaded settings belong to: current once it matches.
  const [configLoadedFor, setConfigLoadedFor] = React.useState<string | undefined>();
  /*
   * A stranger's install binds the control through the maker portal and
   * binds no calendarConfigId. The view row's calendar lookup then names
   * the configuration, which Connect creates (ensureCalendarConfiguration),
   * so the connection survives a reload.
   */
  const [viewCalendarId, setViewCalendarId] = React.useState<string | undefined>();
  const effectiveCalendarConfigId =
    calendarConfigId !== "" ? calendarConfigId : (viewCalendarId ?? "");
  // Bumped while the settings dialog is open and when it closes, so a
  // saved calendar row applies at once too.
  const [calendarConfigRevision, setCalendarConfigRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    loadHostConfig(context.webAPI, effectiveCalendarConfigId, scenario)
      .then((config) => {
        if (!cancelled) {
          setHostConfig(config);
          setConfigLoadedFor(effectiveCalendarConfigId);
        }
        return null;
      })
      .catch(() => {
        // loadHostConfig never throws; belt and braces.
      });
    return () => {
      cancelled = true;
    };
    // The context object is mutated in place; the id and the revision are the signals.
  }, [effectiveCalendarConfigId, calendarConfigRevision]);

  const mapped = React.useMemo(
    () =>
      mapWorkItems(workItems, {
        bundle: messages.fieldBundle,
        provenance: messages.fieldProvenance,
        publishState: messages.fieldPublishState,
        status: messages.fieldStatus,
      }),
    // The context object is mutated in place; the fingerprint is the
    // change signal (the messages are fixed per mount).
    [dataFingerprint, messages],
  );

  const [events, setEvents] = React.useState<readonly SchedulerUiEvent[]>(
    mapped.events,
  );
  const [history, setHistory] = React.useState<UndoRedoState<UndoEntry>>(
    emptyUndoRedo(),
  );
  const [message, setMessage] = React.useState("");
  // The model-driven app's own notification bar makes host messages
  // visible; the live region still announces every one for screen
  // readers. Routine edit notes and selection stay in the live region:
  // the board already shows them.
  const appNotifier = React.useMemo(() => createAppNotifier(), []);
  React.useEffect(() => () => appNotifier.dispose(), [appNotifier]);
  // The board shows the same notice itself while it is full screen.
  const [notice, setNotice] = React.useState<SchedulerSurfaceProps["notice"]>();
  const notify = React.useCallback(
    (level: NoticeLevel, text: string): void => {
      setMessage(text);
      setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, level, text }));
      void appNotifier.show(level, text);
    },
    [appNotifier],
  );
  const lastFingerprint = React.useRef(dataFingerprint);
  React.useEffect(() => {
    if (lastFingerprint.current !== dataFingerprint) {
      lastFingerprint.current = dataFingerprint;
      // The bound view changed underneath us: reseed and drop history.
      setEvents(mapped.events);
      setHistory(emptyUndoRedo());
    }
  }, [dataFingerprint, mapped]);

  /*
   * Maker defaults arrive async from the chr_chronaschedulerview row
   * keyed to the native view id; user-stored preferences overlay them
   * (the standing defaults-then-user-override rule). Absent both, the
   * built-ins apply. Missing table or no row is the zero-config path.
   */
  const [viewConfig, setViewConfig] = React.useState<ViewConfig>({});
  const [viewRowId, setViewRowId] = React.useState<string | undefined>();
  // Whether the view row's lookup has answered: until then a calendar may still come from it.
  const [viewRowAnswered, setViewRowAnswered] = React.useState(false);
  // Bumped when the maker closes the settings dialog, so saved settings apply at once.
  const [viewConfigRevision, setViewConfigRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    const webApi = context.webAPI;
    if (!webApi?.retrieveMultipleRecords || viewId === "default") {
      setViewRowAnswered(true);
      return undefined;
    }
    try {
      webApi
        .retrieveMultipleRecords(
          "chr_chronaschedulerview",
          `?$select=chr_chronaschedulerviewid,chr_layout,chr_colorby,chr_displaytimezone,chr_slotminutes,chr_pxperhour,chr_workingstart,chr_workingend,chr_showweekends,chr_periodunit,chr_periodanchor,_chr_calendar_value&$filter=chr_viewid eq '${viewId}'&$top=1`,
        )
        .then((result) => {
          const row = result.entities[0];
          if (cancelled) {
            return null;
          }
          if (!row) {
            setViewRowAnswered(true);
            return null;
          }
          setViewRowId(
            typeof row.chr_chronaschedulerviewid === "string" ? row.chr_chronaschedulerviewid : undefined,
          );
          setViewCalendarId(
            typeof row._chr_calendar_value === "string" ? row._chr_calendar_value : undefined,
          );
          const periodUnit: PeriodUnit | undefined =
            row.chr_periodunit === 1
              ? "week"
              : row.chr_periodunit === 2
                ? "fortnight"
                : row.chr_periodunit === 3
                  ? "month"
                  : undefined;
          // A Date Only value names a day; read as UTC midnight it is the day before west of UTC.
          const periodAnchorRaw =
            typeof row.chr_periodanchor === "string" ? parseDateOnly(row.chr_periodanchor) : undefined;
          setViewConfig({
            colorBy: colorByFromChoice(row.chr_colorby),
            displayTimeZone:
              typeof row.chr_displaytimezone === "string"
                ? row.chr_displaytimezone
                : undefined,
            layout: layoutFromChoice(row.chr_layout),
            periodAnchor:
              periodAnchorRaw && !Number.isNaN(periodAnchorRaw.getTime())
                ? periodAnchorRaw
                : undefined,
            periodUnit,
            pxPerHour:
              typeof row.chr_pxperhour === "number"
                ? row.chr_pxperhour
                : undefined,
            showWeekends:
              typeof row.chr_showweekends === "boolean"
                ? row.chr_showweekends
                : undefined,
            slotMinutes:
              typeof row.chr_slotminutes === "number"
                ? row.chr_slotminutes
                : undefined,
            workingEndHour:
              typeof row.chr_workingend === "number"
                ? row.chr_workingend / 60
                : undefined,
            workingStartHour:
              typeof row.chr_workingstart === "number"
                ? row.chr_workingstart / 60
                : undefined,
          });
          setViewRowAnswered(true);
          return null;
        })
        .catch(() => {
          // Zero-config path: table absent or no row for this view.
          if (!cancelled) {
            setViewRowAnswered(true);
          }
        });
    } catch {
      // Feature unavailable in this host: zero-config path.
      setViewRowAnswered(true);
    }
    return () => {
      cancelled = true;
    };
  }, [context.webAPI, viewId, viewConfigRevision]);
  const settingsReady = calendarSettingsReady({
    boundCalendarId: calendarConfigId,
    effectiveCalendarId: effectiveCalendarConfigId,
    loadedFor: configLoadedFor,
    viewRowAnswered,
  });

  /*
   * Display zone (ruled 2026-10-02, option A): a roster belongs to a
   * site, so the board shows the site's clock to everyone who plans or
   * works it - the calendar row's time zone. A view row may name another
   * zone ("user" asks for each viewer's own); "site" or empty takes the
   * calendar's. A calendar without a zone falls back to the Power Apps
   * user's own zone, labeled with its offset, as before.
   */
  const userOffsetMinutes = React.useCallback(
    (date: Date): number => context.userSettings.getTimeZoneOffsetMinutes(date),
    [context],
  );
  const viewZoneSetting = viewConfig.displayTimeZone?.trim().toLowerCase();
  const displayZone: string =
    viewZoneSetting === "user"
      ? "user"
      : ((viewZoneSetting && viewZoneSetting !== "site"
          ? normalizeTimeZoneId(viewConfig.displayTimeZone)
          : undefined) ??
        normalizeTimeZoneId(hostConfig.timeZone) ??
        "user");
  const toDisplay = React.useCallback(
    (date: Date): Date =>
      displayZone === "user"
        ? toOffsetZone(date, userOffsetMinutes)
        : toDisplayZone(date, displayZone),
    [displayZone, userOffsetMinutes],
  );
  const toStored = React.useCallback(
    (date: Date): Date =>
      displayZone === "user"
        ? fromOffsetZone(date, userOffsetMinutes)
        : fromDisplayZone(date, displayZone),
    [displayZone, userOffsetMinutes],
  );
  /*
   * The zone the solver counts days and paid hours in: the site's, or
   * for a viewer's own zone the browser's when it runs at the same
   * offset, else that offset fixed.
   */
  const solverZone = React.useCallback(
    (at: Date): string => {
      if (displayZone !== "user") {
        return displayZone;
      }
      const offset = userOffsetMinutes(at);
      const browser = browserTimeZone();
      return browser && zoneOffsetMinutes(at, browser) === offset
        ? browser
        : formatFixedOffsetZone(offset);
    },
    [displayZone, userOffsetMinutes],
  );

  // Ruled 2026-09-26: each interval keeps the zoom the planner chose; Week and Month open fitted.
  const [zoomByInterval, setZoomByInterval] = React.useState<Readonly<Record<string, number>>>(
    stored?.zoomByInterval ?? {},
  );
  const [userSlotMinutes, setUserSlotMinutes] = React.useState<
    number | undefined
  >(stored?.slotMinutes);
  // The maker's zoom (chr_pxperhour) is the Day zoom; a zoom saved before zoom was kept per interval wins.
  const dayZoom =
    stored?.pxPerHour ?? viewConfig.pxPerHour ?? defaultTimelineConfig.pxPerHour;
  const slotMinutes = userSlotMinutes ?? viewConfig.slotMinutes ?? 30;
  const [resourceColumnWidth, setResourceColumnWidth] = React.useState(
    stored?.resourceColumnWidth ?? 168,
  );
  // The review's scorecard, open or folded, remembered per person per view.
  const [scorecardVisible, setScorecardVisible] = React.useState<boolean>(
    !stored?.scorecardHidden,
  );
  const [panelWidth, setPanelWidth] = React.useState(
    stored?.unscheduledPanelWidth ?? 200,
  );
  const [unscheduledFilter, setUnscheduledFilter] = React.useState<
    "all" | "window"
  >(stored?.unscheduledInViewOnly ? "window" : "all");
  const [selectedEventIds, setSelectedEventIds] = React.useState<
    readonly string[]
  >([]);
  const [interval, setIntervalState] =
    React.useState<SchedulerTimeScale>("week");
  const weekStartsOn = userWeekStart(context);
  /*
   * The board opens on today, as the Today button does: the window
   * derives the week (from the user's first day) or the roster period
   * holding it. A week-start anchor could fall in the period before.
   */
  const [anchor, setAnchor] = React.useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  /*
   * The site's today: the zone arrives with the calendar row, after the
   * first render, and a site east or west of the browser can be on
   * another day. Until the planner moves, the board follows it.
   */
  const openedOnRef = React.useRef(anchor.getTime());
  React.useEffect(() => {
    const siteToday = toDisplay(new Date());
    siteToday.setHours(0, 0, 0, 0);
    setAnchor((current) => {
      if (current.getTime() !== openedOnRef.current) {
        return current;
      }
      openedOnRef.current = siteToday.getTime();
      return siteToday;
    });
  }, [toDisplay]);

  const view = representationFor(
    mapped.resourceMapped,
    interval,
    viewConfig.layout,
  );
  /*
   * The roster period from the view row, when the maker sets one: the
   * Roster grid shows it whole (F31 rework), Generate runs per period,
   * and a solve plans the period holding the anchor. Keyed by value so
   * the window below stays stable between renders.
   */
  const periodAnchorTime = viewConfig.periodAnchor?.getTime();
  const periodUnit = viewConfig.periodUnit;
  const periodConfig = React.useMemo<SchedulerPeriodConfig | undefined>(
    () =>
      periodAnchorTime !== undefined && periodUnit
        ? { anchor: new Date(periodAnchorTime), unit: periodUnit }
        : undefined,
    [periodAnchorTime, periodUnit],
  );
  const rosterPeriod = React.useMemo(
    () => rosterPeriodWindow(view, periodConfig, anchor),
    [anchor, periodConfig, view],
  );
  const window = React.useMemo(
    () =>
      rosterPeriod ??
      resolveWindowForScale(anchor, {
        representation: view,
        timeScale: interval,
        weekStartsOn,
      }),
    [anchor, interval, rosterPeriod, view, weekStartsOn],
  );

  const showWeekends = viewConfig.showWeekends ?? true;
  // A scenario control's data for the board, the rules and the solve.
  const scenarioParts = scenario
    ? { data: scenario.useData({ config: hostConfig.scenario, context, toDisplay }), scenario }
    : undefined;
  const scenarioData: ScenarioData = scenarioParts?.data ?? noScenarioData;
  const decorations = React.useMemo<readonly RowDecoration[]>(() => {
    const collected: RowDecoration[] = [];
    if (
      viewConfig.workingStartHour !== undefined ||
      viewConfig.workingEndHour !== undefined
    ) {
      collected.push(
        ...buildNonWorkingDecorations(
          window,
          {
            endHour: viewConfig.workingEndHour ?? 24,
            startHour: viewConfig.workingStartHour ?? 0,
          },
          !showWeekends,
        ),
      );
    }
    collected.push(...scenarioData.decorations);
    return collected;
  }, [window, viewConfig, showWeekends, scenarioData.decorations]);

  /*
   * Metadata for the lookup rebind, cached once: the referenced
   * table's entity-set name, and the lookup's NAVIGATION property on
   * the work-item table (SchemaName casing - @odata.bind rejects the
   * logical name, as the environment pass proved).
   */
  const entitySetRef = React.useRef<string | undefined>(undefined);
  const resourceNavRef = React.useRef<string | undefined>(undefined);
  /*
   * A save that gives a shift its person needs both names, which
   * resolve a moment after the board loads. Such a save waits for
   * them and then saves as usual; only when they never come does
   * the board refuse it and say so (Matt 2026-09-30, B).
   */
  const bindingRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const createEventRef = React.useRef<SchedulerSurfaceProps["onCreateEvent"]>(undefined);
  const whenBindable = React.useCallback(async (): Promise<boolean> => {
    if (!(entitySetRef.current && resourceNavRef.current)) {
      await Promise.race([
        bindingRef.current,
        // The global timer: `window` here is the board's time window.
        new Promise((resolve) => setTimeout(resolve, BINDING_WAIT_MS)),
      ]);
    }
    return Boolean(entitySetRef.current && resourceNavRef.current);
  }, []);
  React.useEffect(() => {
    const utils = context.utils;
    if (!utils?.getEntityMetadata) {
      return;
    }
    const workItemType = workItems.getTargetEntityType?.();
    const lookupLogical = columnLogicalName(workItems, "resource");
    const resolveEntitySet = (referencedType: string): Promise<void> => {
      try {
        return utils
          .getEntityMetadata(referencedType, [])
          .then((metadata) => {
            const setName = (metadata as { EntitySetName?: string })
              ?.EntitySetName;
            if (setName) {
              entitySetRef.current = setName;
            }
            return undefined;
          })
          .catch(() => {
            // Metadata unavailable (harness): rebinds stay local.
          });
      } catch {
        // Feature stub threw: rebinds stay local.
        return Promise.resolve();
      }
    };
    const referencedType = mapped.resourceEntityType;
    let entitySet: Promise<void> = Promise.resolve();
    if (referencedType) {
      entitySet = resolveEntitySet(referencedType);
    } else if (workItemType && lookupLogical) {
      // No row has a person yet, as on a fresh roster: the lookup's
      // definition names the table, so the first assignment binds.
      entitySet = lookupTarget(resolveClientUrl(context), workItemType, lookupLogical)
        .then((target) => (target ? resolveEntitySet(target) : undefined))
        .catch(() => {
          // Definition unreadable: rebinds stay local.
        });
    }
    bindingRef.current = entitySet;
    /*
     * The @odata.bind key is the nav property's SchemaName, which the
     * client metadata API does not expose. Any populated lookup value
     * carries it as the associatednavigationproperty annotation, so
     * one annotated row resolves it for the table.
     */
    const webApi = context.webAPI;
    if (!workItemType || !lookupLogical || !webApi?.retrieveMultipleRecords) {
      return;
    }
    const annotationKey = `_${lookupLogical}_value@Microsoft.Dynamics.CRM.associatednavigationproperty`;
    const resolveNavProperty = async (): Promise<string> => {
      // A row with the lookup populated carries the name as an
      // annotation; a table with no assignment yet has no such row.
      try {
        const result = await webApi.retrieveMultipleRecords(
          workItemType,
          `?$select=_${lookupLogical}_value&$filter=_${lookupLogical}_value ne null&$top=1`,
        );
        for (const entity of result.entities as readonly Record<string, unknown>[]) {
          const annotation = entity[annotationKey];
          if (typeof annotation === "string" && annotation !== "") {
            return annotation;
          }
        }
      } catch {
        // No populated row, or the filter refused: the definition answers.
      }
      // The lookup's definition names it.
      try {
        const schemaName = await lookupSchemaName(
          resolveClientUrl(context),
          workItemType,
          lookupLogical,
        );
        if (schemaName) {
          return schemaName;
        }
      } catch {
        // Metadata unreachable: the logical name is the last resort.
      }
      return lookupLogical;
    };
    bindingRef.current = Promise.all([
      entitySet,
      resolveNavProperty()
        .then((name) => {
          resourceNavRef.current = name;
          return null;
        })
        .catch(() => {
          resourceNavRef.current = lookupLogical;
        }),
    ]);
  }, [mapped.resourceEntityType]);
  const applyEvents = React.useCallback(
    (next: readonly SchedulerUiEvent[], note: string): void => {
      setEvents((previous) => {
        setHistory((h) => pushEntry(h, { after: next, before: previous }));
        return next;
      });
      setMessage(note);
    },
    [],
  );

  const patchRecord = React.useCallback(
    (recordId: string, payload: Record<string, unknown>, note: string): void => {
      const entityType = workItems.getTargetEntityType?.();
      if (!entityType || !context.webAPI?.updateRecord) {
        notify("warning", note + LOCAL_ONLY_NOTE);
        return;
      }
      try {
        context.webAPI
          .updateRecord(entityType, recordId, payload)
          .then(() => {
            setMessage(note);
            return null;
          })
          .catch(() => notify("warning", note + LOCAL_ONLY_NOTE));
      } catch {
        notify("warning", note + LOCAL_ONLY_NOTE);
      }
    },
    [dataFingerprint],
  );

  /*
   * Deletion bypasses undo history: the surface has already confirmed,
   * the row is removed server-side, and resurrecting it locally would
   * be a ghost (its id is gone).
   */
  const applyDelete = React.useCallback(
    (targets: readonly SchedulerUiEvent[]): void => {
      const ids = new Set(targets.map((target) => target.id));
      setEvents((previous) =>
        previous.filter((candidate) => !ids.has(candidate.id)),
      );
      setHistory(emptyUndoRedo());
      const note =
        targets.length === 1
          ? formatString(messages.msgDeletedOne, {
              title: targets[0]?.title ?? "item",
            })
          : formatString(messages.msgDeletedMany, {
              count: targets.length,
            });
      const entityType = workItems.getTargetEntityType?.();
      if (!entityType || !context.webAPI?.deleteRecord) {
        notify("warning", note + LOCAL_ONLY_NOTE);
        return;
      }
      let failed = 0;
      let done = 0;
      for (const target of targets) {
        try {
          context.webAPI
            .deleteRecord(entityType, target.id)
            .then(() => null)
            .catch(() => {
              failed += 1;
              return null;
            })
            .then(() => {
              done += 1;
              if (done === targets.length) {
                if (failed > 0) {
                  notify("warning", note + LOCAL_ONLY_NOTE);
                } else {
                  setMessage(note);
                }
              }
              return null;
            })
            .catch(() => undefined);
        } catch {
          notify("warning", note + LOCAL_ONLY_NOTE);
        }
      }
    },
    [workItems],
  );

  const applyChangesRef = React.useRef<
    | ((changes: readonly TimelineChange[], options?: { provenance?: WriteProvenance }) => void)
    | undefined
  >(undefined);
  const applyChanges = React.useCallback(
    (changes: readonly TimelineChange[], options?: { provenance?: WriteProvenance }): void => {
      // A change that gives a shift its person waits for the bind's names.
      const waits =
        (Boolean(workItems.getTargetEntityType?.()) && typeof context.webAPI?.updateRecord === "function") &&
        !(entitySetRef.current && resourceNavRef.current) &&
        changes.some(
          (change) =>
            change.event !== undefined &&
            givesPerson(change.event.resourceId, change.result.resourceId),
        );
      if (waits) {
        void whenBindable().then((ready) => {
          if (ready) {
            applyChangesRef.current?.(changes, options);
          } else {
            notify("warning", messages.msgPersonNotSaved);
          }
          return null;
        });
        return;
      }
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
          if (!change?.event) {
            return candidate;
          }
          return {
            ...candidate,
            end: toStored(change.result.end),
            resourceId: change.result.resourceId,
            start: toStored(change.result.start),
            status:
              change.result.resourceId === UNASSIGNED_RESOURCE_ID
                ? ("needsCover" as const)
                : ("assigned" as const),
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
      const verdictNote = warned?.verdict.reason
        ? formatString(messages.msgWarningSuffix, {
            reason: warned.verdict.reason,
          })
        : "";
      const note =
        (changes.length === 1
          ? formatString(messages.msgUpdated, {
              title: first?.event?.title ?? "item",
            })
          : formatString(messages.msgMovedMany, {
              count: changes.length,
            })) + verdictNote;
      for (const change of changes) {
        if (!change.event) {
          continue;
        }
        const previous = events.find(
          (candidate) => candidate.id === change.event?.id,
        );
        const statusField = previous?.fields?.find(
          (field) => field.key === "status",
        );
        const provenance = options?.provenance ?? manualProvenance;
        let payload = buildUpdatePayload({
          dataset: workItems,
          end: toStored(change.result.end),
          provenance,
          previousResourceId:
            previous && previous.resourceId !== UNASSIGNED_RESOURCE_ID
              ? previous.resourceId
              : undefined,
          resourceEntitySetName: entitySetRef.current,
          resourceNavProperty: resourceNavRef.current,
          resourceRecordId:
            change.result.resourceId === UNASSIGNED_RESOURCE_ID
              ? undefined
              : change.result.resourceId,
          start: toStored(change.result.start),
          statusNeedsCover: previous ? previous.status === "needsCover" : undefined,
          statusText: statusField?.value,
          title: change.title,
        });
        // Moving an assigned row to nobody clears its person the way
        // Unschedule does (F40: the solver takes someone off); the
        // update alone only ever binds a new person.
        if (
          payload &&
          change.result.resourceId === UNASSIGNED_RESOURCE_ID &&
          previous &&
          previous.resourceId !== UNASSIGNED_RESOURCE_ID
        ) {
          const unschedule = buildUnschedulePayload(
            workItems,
            resourceNavRef.current ?? columnLogicalName(workItems, "resource"),
            provenance,
          );
          if (unschedule) {
            payload = { ...payload, ...unschedule };
          }
        }
        if (payload) {
          patchRecord(change.event.id, payload, note);
        } else {
          notify("warning", note + LOCAL_ONLY_NOTE);
        }
      }
    },
    [events, manualProvenance, patchRecord, toStored, whenBindable, workItems],
  );
  applyChangesRef.current = applyChanges;

  /*
   * Undo/redo are WRITE-THROUGH: restoring a snapshot PATCHes every
   * changed row back, so the server always matches what the planner
   * sees (a local-only undo silently reverted on reload - found live
   * in the F3 environment pass). Deletion is excluded from history
   * because a removed row cannot honestly come back with its id.
   */
  const syncSnapshot = React.useCallback(
    (
      current: readonly SchedulerUiEvent[],
      target: readonly SchedulerUiEvent[],
    ): string => {
      const currentById = new Map(current.map((row) => [row.id, row]));
      const targetById = new Map(target.map((row) => [row.id, row]));
      let skipped = 0;
      for (const row of target) {
        const was = currentById.get(row.id);
        if (!was) {
          skipped += 1;
          continue;
        }
        const timesChanged =
          was.start.getTime() !== row.start.getTime() ||
          was.end.getTime() !== row.end.getTime() ||
          was.title !== row.title;
        const resourceChanged = was.resourceId !== row.resourceId;
        const lockChanged = isPinned(was) !== isPinned(row);
        if (!timesChanged && !resourceChanged && !lockChanged) {
          continue;
        }
        let payload: Record<string, unknown> = {};
        const statusField = was.fields?.find(
          (field) => field.key === "status",
        );
        const base = buildUpdatePayload({
          dataset: workItems,
          end: row.end,
          provenance: manualProvenance,
          previousResourceId:
            was.resourceId === UNASSIGNED_RESOURCE_ID
              ? undefined
              : was.resourceId,
          resourceEntitySetName: entitySetRef.current,
          resourceNavProperty: resourceNavRef.current,
          resourceRecordId:
            row.resourceId === UNASSIGNED_RESOURCE_ID
              ? undefined
              : row.resourceId,
          start: row.start,
          statusNeedsCover: was.status === "needsCover",
          statusText: statusField?.value,
          title: row.title !== was.title ? row.title : undefined,
        });
        if (base) {
          payload = { ...payload, ...base };
        }
        if (
          resourceChanged &&
          row.resourceId === UNASSIGNED_RESOURCE_ID
        ) {
          const unschedule = buildUnschedulePayload(
            workItems,
            resourceNavRef.current ??
              columnLogicalName(workItems, "resource"),
            manualProvenance,
          );
          if (unschedule) {
            payload = { ...payload, ...unschedule };
          }
        }
        // Undoing the drop that dated a row makes it undated again.
        if (row.undated && !was.undated) {
          const startName = columnLogicalName(workItems, "start");
          const endName = columnLogicalName(workItems, "end");
          if (startName && endName) {
            payload = { ...payload, [endName]: null, [startName]: null };
          }
        }
        if (lockChanged) {
          // Undo and redo write the row's pin back.
          const lock = buildLockPayload(workItems, isPinned(row));
          if (lock) {
            payload = { ...payload, ...lock };
          }
        }
        if (Object.keys(payload).length > 0) {
          patchRecord(row.id, payload, messages.msgRestored);
        }
      }
      const entityType = workItems.getTargetEntityType?.();
      for (const row of current) {
        if (!targetById.has(row.id) && entityType && context.webAPI?.deleteRecord) {
          try {
            context.webAPI
              .deleteRecord(entityType, row.id)
              .then(() => null)
              .catch(() => undefined);
          } catch {
            // Harness: local removal is all there is.
          }
        }
      }
      return skipped > 0
        ? formatString(messages.msgRestoreSkipped, { count: skipped })
        : "";
    },
    [manualProvenance, patchRecord, workItems],
  );

  const undo = React.useCallback((): void => {
    setHistory((h) => {
      const { entry, state } = popUndo(h);
      if (entry) {
        setEvents(entry.before);
        const note = syncSnapshot(entry.after, entry.before);
        notify("info", messages.msgUndid + note);
      }
      return state;
    });
  }, [syncSnapshot]);
  const redo = React.useCallback((): void => {
    setHistory((h) => {
      const { entry, state } = popRedo(h);
      if (entry) {
        setEvents(entry.after);
        const note = syncSnapshot(entry.before, entry.after);
        notify("info", messages.msgRedid + note);
      }
      return state;
    });
  }, [syncSnapshot]);
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

  /*
   * Overlap detection is geometry (mechanism, per section 12.2), so it
   * lives here; preference rules are data-driven through the package
   * evaluator; policy numbers never appear as literals (E1).
   */

  const displayEvents = React.useMemo(
    () =>
      events.map((event) => {
        const tags = scenarioData.eventTags?.(event.id);
        const tagged =
          tags && tags.length > 0
            ? { ...event, requiredTags: tags }
            : event;
        // The maker's "Color by" tints the row; the board stays neutral without it.
        const color = eventColorFor(tagged, viewConfig.colorBy, scenarioData.tagColors);
        const decorated = color ? { ...tagged, color } : tagged;
        return {
          ...decorated,
          end: toDisplay(decorated.end),
          start: toDisplay(decorated.start),
        };
      }),
    [events, scenarioData, toDisplay, viewConfig.colorBy],
  );
  // Undated rows wait in the panel only: never on the board, in rules, counts or an optimization.
  const datedEvents = React.useMemo(
    () => displayEvents.filter((event) => !event.undated),
    [displayEvents],
  );
  const scheduled = datedEvents.filter(
    (event) => event.status !== "needsCover",
  );
  const unscheduled = datedEvents.filter(
    (event) => event.status === "needsCover",
  );
  const undated = React.useMemo(
    () => displayEvents.filter((event) => event.undated),
    [displayEvents],
  );

  const skippedNote =
    mapped.skipped > 0
      ? formatString(messages.msgRowsSkipped, { count: mapped.skipped })
      : "";

  const ruleStrings: RuleReasonStrings = React.useMemo(
    () => ({
      minimumBreak: messages.reasonMinimumBreak,
      outsideGroup: messages.reasonOutsideGroup,
      outsideHours: messages.reasonOutsideHours,
      overlap: messages.reasonOverlap,
    }),
    [messages],
  );
  /*
   * On-demand rule data (conversion and indexing once per data
   * change, not once per verdict): drag-frame streams and the
   * dialog's candidate loop reuse these instead of remapping 20k
   * events every call.
   */
  const ruleIndex = React.useMemo(
    () => buildEventsByResource(datedEvents),
    [datedEvents],
  );

  const validateChange = React.useCallback(
    (
      event: SchedulerUiEvent | undefined,
      proposed: DragResult,
    ): ChangeVerdict => {
      // One engine for every host (section 12.2): this adapter only
      // resolves chr_ config into SchedulerRulesConfig, converts
      // stored instants into display space, and localizes reasons.
      // Minimum break stays at its defaults (minutes 0 = off) until
      // the rule-set/award layering design lands its storage.
      const config: SchedulerRulesConfig = {
        crossGroupPolicy: "off",
        minimumBreakMinutes: 0,
        minimumBreakPolicy: "warn",
        overlapPolicy: hostConfig.policies.overlap,
        workingEndHour: viewConfig.workingEndHour,
        workingHoursPolicy: hostConfig.policies.workingHours,
        workingStartHour: viewConfig.workingStartHour,
      };
      return aggregateVerdict(
        evaluateScheduleRules({
          config,
          event,
          events: datedEvents,
          eventsByResource: ruleIndex,
          extraRules: scenarioData.extraRules,
          proposed,
          resources: hostConfig.resources ?? mapped.resources,
          strings: ruleStrings,
        }),
      );
    },
    [
      datedEvents,
      hostConfig.policies,
      hostConfig.resources,
      mapped.resources,
      ruleIndex,
      ruleStrings,
      scenarioData.extraRules,
      toStored,
      viewConfig,
    ],
  );

  const setLocked = React.useCallback(
    (targets: readonly SchedulerUiEvent[], locked: boolean): void => {
      const ids = new Set(targets.map((target) => target.id));
      const first = events.find((candidate) => ids.has(candidate.id));
      applyEvents(
        events.map((candidate) =>
          ids.has(candidate.id) ? withPin(candidate, locked) : candidate,
        ),
        ids.size === 1
          ? formatString(
              locked ? messages.msgPinnedOne : messages.msgUnpinnedOne,
              { title: first?.title ?? "item" },
            )
          : formatString(
              locked ? messages.msgPinnedMany : messages.msgUnpinnedMany,
              { count: ids.size },
            ),
      );
      for (const id of new Set(targets.map((target) => target.id))) {
        const payload = buildLockPayload(workItems, locked);
        if (payload) {
          patchRecord(
            id,
            payload,
            formatString(
              locked ? messages.msgPinnedOne : messages.msgUnpinnedOne,
              { title: first?.title ?? "item" },
            ),
          );
        }
      }
    },
    [applyEvents, events, patchRecord, workItems],
  );

  // F22 deliverable 2: the minimum solvable mapping declaration. One
  // computation, three renderings (Q3-A) - the surface's "Optimizing
  // with" line and the conversion claim take `solveCapabilities`; the
  // maker's rendering is the structured diagnostics record below,
  // listing every tier with mapped/active and the column that would
  // activate it (the control has no maker-facing chrome of its own).
  const capabilityTiers = React.useMemo(
    () =>
      computeCapabilityTiers({
        decorations,
        events: scheduled,
        mapped: {
          availability: scenarioData.capabilities.availability,
          cost: hostConfig.resourceMapping?.costColumn !== undefined,
          hours: hostConfig.resourceMapping?.capacityColumn !== undefined,
          locks: hasColumn(workItems, "pinned"),
          roles: scenarioData.capabilities.roles,
        },
        resources: hostConfig.resources ?? mapped.resources,
        unscheduledEvents: unscheduled,
      }),
    [decorations, hostConfig, mapped.resources, scenarioData.capabilities, scheduled, unscheduled, workItems],
  );
  const solveCapabilities = React.useMemo(
    () => activeCapabilities(capabilityTiers),
    [capabilityTiers],
  );
  React.useEffect(() => {
    const activateBy: Record<string, string> = {
      availability: "Chrona Workforce Scheduler availability",
      cost: "chr_resourcecostcolumn on the calendar row",
      hours: "chr_resourcecapacitycolumn on the calendar row",
      locks: "bind the pinned property-set",
      roles: "Chrona Workforce Scheduler roles with the role binding",
    };
    console.info(
      JSON.stringify({
        event: "chrona.capabilities",
        tiers: capabilityTiers.map((tier) => ({
          ...tier,
          ...(tier.active ? {} : { activateBy: activateBy[tier.capability] }),
        })),
      }),
    );
  }, [capabilityTiers]);

  /*
   * F26 stage 3: the bridge. A solve session is minted from
   * chr_ChronaSolveSession (the plugin holds the key); the package's
   * client then talks to the Chrona API directly with the session
   * token. "Not connected" renders the conversion surface, whose
   * Connect calls chr_ChronaConnect and runs the first sample solve
   * (Q6-A). Session refreshes after every solve so quota and the
   * latest run stay server-truthful.
   */
  const clientUrl = React.useMemo(() => resolveClientUrl(context), [context]);
  const [session, setSession] = React.useState<SolveSession | undefined>();
  /*
   * F27 stage 2 (ruled 2026-09-10, option A): the entitlement session
   * that arrives beside the solve token is cached to its hard expiry
   * under the versioned key seam, keyed by environment and calendar,
   * and refreshed control-direct with itself as the bearer. Claims
   * drive what is offered: `solve` keeps Optimize, the scenario
   * capability keeps Generate; a lapsed claim withdraws both and a
   * day of silence pauses the optimizer. No claims = the control as
   * it was before claims existed.
   */
  const environmentHost = React.useMemo(() => {
    try {
      return new URL(clientUrl).host.toLowerCase();
    } catch {
      return clientUrl;
    }
  }, [clientUrl]);
  const entitlementCache = React.useMemo(
    () => createEntitlementCache(`chrona-sched:entitlement:v1:${environmentHost}:${hostConfig.calendarId ?? ""}`),
    [environmentHost, hostConfig.calendarId],
  );
  const [entitlementSnapshot, setEntitlementSnapshot] = React.useState<EntitlementSnapshot | undefined>(() =>
    entitlementCache.load(),
  );
  React.useEffect(() => {
    setEntitlementSnapshot(entitlementCache.load());
  }, [entitlementCache]);
  const [entitlementClock, setEntitlementClock] = React.useState(() => Date.now());
  const adoptEntitlement = React.useCallback(
    (apiBaseUrl: string, fresh: EntitlementSession, portalUrl?: string): void => {
      setEntitlementSnapshot((previous) => {
        const rope = portalUrl ?? previous?.portalUrl;
        const snapshot: EntitlementSnapshot = {
          apiBaseUrl,
          fetchedAt: new Date().toISOString(),
          ...(rope ? { portalUrl: rope } : {}),
          session: fresh,
        };
        entitlementCache.save(snapshot);
        return snapshot;
      });
    },
    [entitlementCache],
  );
  // A failed refresh past the hint starts the pause; the first one is kept.
  const recordEntitlementFailure = React.useCallback((): void => {
    setEntitlementSnapshot((previous) => {
      if (!previous) {
        return previous;
      }
      const marked = markEntitlementFailure(previous, new Date());
      if (marked !== previous) {
        entitlementCache.save(marked);
      }
      return marked;
    });
  }, [entitlementCache]);
  const [sessionFailure, setSessionFailure] = React.useState<
    "noPrivilege" | "notConnected" | "other" | undefined
  >();
  const [solveState, setSolveState] = React.useState<SolveState>(idleSolveState);
  const [proposal, setProposal] = React.useState<ScheduleProposal | undefined>();
  /* The running solve's abort handle and run id, for Cancel. */
  const solveAbortRef = React.useRef<AbortController | undefined>(undefined);
  const solveRunIdRef = React.useRef<string | undefined>(undefined);
  const [resumeDismissed, setResumeDismissed] = React.useState<string | undefined>();
  /* F31 rework: the proposal's out-of-date changes and why, and what
   * the freshness check compares against. */
  const [proposalOutOfDate, setProposalOutOfDate] = React.useState<
    ReadonlyMap<string, string>
  >(() => new Map<string, string>());
  const solveSnapshotRef = React.useRef<SolveSnapshot | undefined>(undefined);
  const proposalRef = React.useRef<ScheduleProposal | undefined>(undefined);
  React.useEffect(() => {
    proposalRef.current = proposal;
  }, [proposal]);
  const publishingRef = React.useRef(false);

  const mintSession = React.useCallback(async (calendarIdOverride?: string): Promise<SolveSession | undefined> => {
    // Connect passes the configuration it just created; state catches up after.
    const calendarId = calendarIdOverride ?? hostConfig.calendarId;
    if (!calendarId || !context.webAPI) {
      return undefined;
    }
    try {
      const minted = await fetchSolveSession(clientUrl, calendarId, {
        defaultSolverSeconds: hostConfig.defaultSolverSeconds,
        solutionType: hostConfig.product,
      });
      setSession(minted);
      setSessionFailure(undefined);
      if (minted.entitlement) {
        adoptEntitlement(minted.apiBaseUrl, minted.entitlement, minted.portalUrl);
      }
      return minted;
    } catch (error) {
      setSession(undefined);
      const failure = error instanceof SolveBridgeError ? error.failure : "other";
      setSessionFailure(failure);
      if (failure === "other") {
        notify(
          "error",
          formatString(messages.msgSessionFailed, {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return undefined;
    }
  }, [adoptEntitlement, clientUrl, context.webAPI, hostConfig.calendarId, hostConfig.defaultSolverSeconds, messages]);

  React.useEffect(() => {
    void mintSession();
  }, [mintSession]);

  // The refresh loop: once a minute the clock advances and, when the
  // server's hint says so, one refresh runs (at most every few minutes
  // while it keeps failing). A refused bearer re-bootstraps through the
  // plugin session; an unreachable Chrona keeps the cache and records
  // the failure, which is what pauses the optimizer. Retry on the chip
  // runs the same refresh at once.
  const entitlementAttemptRef = React.useRef(0);
  const entitlementInFlightRef = React.useRef(false);
  const refreshEntitlementNow = React.useCallback(
    (force: boolean): void => {
      const snapshot = entitlementSnapshot;
      const now = new Date();
      if (entitlementInFlightRef.current || !snapshot) {
        return;
      }
      if (!force && (!entitlementDueForRefresh(snapshot, now) || now.getTime() - entitlementAttemptRef.current < ENTITLEMENT_RETRY_MS)) {
        return;
      }
      entitlementAttemptRef.current = now.getTime();
      entitlementInFlightRef.current = true;
      refreshEntitlement({
        apiBaseUrl: snapshot.apiBaseUrl,
        calendarId: hostConfig.calendarId,
        solutionType: snapshot.session.solutionType,
        token: snapshot.session.token,
      })
        .then((fresh) => {
          entitlementInFlightRef.current = false;
          adoptEntitlement(snapshot.apiBaseUrl, fresh);
          setEntitlementClock(Date.now());
          return null;
        })
        .catch((error: unknown) => {
          entitlementInFlightRef.current = false;
          if (error instanceof EntitlementExpiredError) {
            void mintSession();
            return;
          }
          recordEntitlementFailure();
          setEntitlementClock(Date.now());
        });
    },
    [adoptEntitlement, entitlementSnapshot, hostConfig.calendarId, mintSession, recordEntitlementFailure],
  );
  React.useEffect(() => {
    const tick = (): void => {
      setEntitlementClock(Date.now());
      refreshEntitlementNow(false);
    };
    const id = setInterval(tick, ENTITLEMENT_TICK_MS);
    tick();
    return () => {
      clearInterval(id);
    };
  }, [refreshEntitlementNow]);
  const entitlementStatus = React.useMemo(
    () => deriveEntitlementStatus(entitlementSnapshot, new Date(entitlementClock)),
    [entitlementClock, entitlementSnapshot],
  );
  const solveAllowed = entitlementAllows(entitlementStatus, CAPABILITY_SOLVE);
  const scenarioAllowed = entitlementAllows(
    entitlementStatus,
    scenarioCapability(entitlementStatus?.session.solutionType ?? scenario?.product ?? hostConfig.product),
  );

  /*
   * F31 rework: a solve plans the roster period holding the anchor or,
   * without one on the view row, the period on the board. Its open
   * shifts are the decisions; its assigned ones and a day either side
   * travel along, pinned where they are outside it or have started.
   */
  const solveWindowNow = React.useCallback(
    (): TimeWindow => (periodConfig ? periodContaining(periodConfig, anchor) : window),
    [anchor, periodConfig, window],
  );
  const solveEventsFor = React.useCallback(
    (solveWindow: TimeWindow) => {
      const rangeStart = new Date(solveWindow.start.getTime() - DAY_MS);
      const rangeEnd = new Date(solveWindow.end.getTime() + DAY_MS);
      return [...scheduled, ...unscheduled].filter((event) =>
        event.status === "needsCover"
          ? event.start >= solveWindow.start && event.start < solveWindow.end
          : event.end > rangeStart && event.start < rangeEnd,
      );
    },
    [scheduled, unscheduled],
  );
  const solveRangeFor = React.useCallback(
    (solveWindow: TimeWindow): TimeRange => ({
      end: toStored(new Date(solveWindow.end.getTime() + DAY_MS)),
      start: toStored(new Date(solveWindow.start.getTime() - DAY_MS)),
    }),
    [toStored],
  );
  const latestEventsRef = React.useRef<readonly SchedulerUiEvent[]>([]);
  React.useEffect(() => {
    latestEventsRef.current = [...scheduled, ...unscheduled];
  });

  /*
   * The work-item table and the person table as the Web API names
   * them, for the freshness reads; resolved once each.
   */
  const primaryIdOf = React.useCallback(
    async (entity: string): Promise<string | undefined> => {
      try {
        const metadata = (await context.utils?.getEntityMetadata?.(entity, [])) as
          | { readonly PrimaryIdAttribute?: unknown }
          | undefined;
        return typeof metadata?.PrimaryIdAttribute === "string"
          ? metadata.PrimaryIdAttribute
          : undefined;
      } catch {
        return undefined;
      }
    },
    [context.utils],
  );
  const shiftTableRef = React.useRef<ShiftTableSpec | undefined>(undefined);
  const personTableRef = React.useRef<{ entity: string; idColumn: string } | undefined>(
    undefined,
  );
  const resolveTables = React.useCallback(async (): Promise<void> => {
    const entity = workItems.getTargetEntityType?.();
    const startColumn = columnLogicalName(workItems, "start");
    const endColumn = columnLogicalName(workItems, "end");
    if (!shiftTableRef.current && entity && startColumn && endColumn) {
      const idColumn = await primaryIdOf(entity);
      if (idColumn) {
        shiftTableRef.current = {
          endColumn,
          entity,
          idColumn,
          resourceColumn: columnLogicalName(workItems, "resource"),
          startColumn,
          statusColumn: hasColumn(workItems, "status")
            ? columnLogicalName(workItems, "status")
            : undefined,
        };
      }
    }
    const personEntity = mapped.resourceEntityType;
    if (!personTableRef.current && personEntity) {
      const idColumn = await primaryIdOf(personEntity);
      if (idColumn) {
        personTableRef.current = { entity: personEntity, idColumn };
      }
    }
  }, [mapped.resourceEntityType, primaryIdOf, workItems]);

  /* The reads the freshness check compares, each degrading on its own. */
  const readFreshness = React.useCallback(
    async (range: TimeRange, personIds: readonly string[]): Promise<FreshnessReads> => {
      const webApi = context.webAPI;
      if (!webApi?.retrieveMultipleRecords) {
        return {};
      }
      await resolveTables();
      const shiftTable = shiftTableRef.current;
      const personTable = personTableRef.current;
      // Only a scenario control has unavailable spans to read.
      const [rows, bands, personVersions] = await Promise.all([
        shiftTable ? readShiftRows(webApi, shiftTable, range) : Promise.resolve(undefined),
        scenario?.readBands ? scenario.readBands(webApi, range) : Promise.resolve(undefined),
        personTable && personIds.length > 0
          ? readPersonVersions(webApi, personTable.entity, personTable.idColumn, personIds)
          : Promise.resolve(undefined),
      ]);
      return { bands, personVersions, rows };
    },
    [context.webAPI, resolveTables],
  );

  /*
   * F31 rework, freshness: read again and compare with what the solve
   * started from. What the solver saw of the view's rows wins over the
   * read taken beside it, so a board that was already stale shows too.
   * A part either read could not see is left out of the comparison.
   */
  const checkFreshness = React.useCallback(
    async (target: ScheduleProposal): Promise<ReadonlyMap<string, string>> => {
      const snapshot = solveSnapshotRef.current;
      const current = latestEventsRef.current;
      const changes = diffProposal(current, target);
      if (!snapshot || changes.length === 0) {
        return new Map<string, string>();
      }
      const people = [
        ...new Set(
          changes
            .filter((change) => change.proposed.status !== "needsCover")
            .map((change) => change.proposed.resourceId),
        ),
      ];
      const now = await readFreshness(snapshot.range, people);
      const before = snapshot.reads;
      const asEvents = (rows: readonly ShiftRow[]): SchedulerUiEvent[] =>
        rows.map((row) => ({
          end: toDisplay(row.end),
          id: row.id,
          resourceId: row.resourceId ?? UNASSIGNED_RESOURCE_ID,
          start: toDisplay(row.start),
          status: row.resourceId ? ("assigned" as const) : ("needsCover" as const),
          title: "",
        }));
      const asBands = (bands: readonly AvailabilityBand[]): AvailabilityBand[] =>
        bands.map((band) => ({ ...band, end: toDisplay(band.end), start: toDisplay(band.start) }));
      let beforeData: FreshnessData = { bands: [], events: current };
      let afterData: FreshnessData = { bands: [], events: current };
      if (before.rows && now.rows) {
        const seen = new Map(
          asEvents(before.rows).map((event) => [normalizeRecordId(event.id), event]),
        );
        for (const event of snapshot.events) {
          seen.set(normalizeRecordId(event.id), event);
        }
        beforeData = { ...beforeData, events: [...seen.values()] };
        afterData = { ...afterData, events: asEvents(now.rows) };
      }
      if (before.bands && now.bands) {
        beforeData = { ...beforeData, bands: asBands(before.bands) };
        afterData = { ...afterData, bands: asBands(now.bands) };
      }
      if (before.personVersions && now.personVersions) {
        beforeData = { ...beforeData, personVersions: before.personVersions };
        afterData = { ...afterData, personVersions: now.personVersions };
      }
      const names = new Map(
        (hostConfig.resources ?? mapped.resources).map((resource) => [
          normalizeRecordId(resource.id),
          resource.name,
        ]),
      );
      return outOfDateChanges({
        after: afterData,
        at: toDisplay(new Date()),
        before: beforeData,
        changes,
        resourceName: (id) => names.get(normalizeRecordId(id)) ?? id,
        strings: surfaceStrings,
      });
    },
    [hostConfig.resources, mapped.resources, readFreshness, surfaceStrings, toDisplay],
  );

  /*
   * F31: the answer is a proposal until Apply. The surface previews
   * it on the board; Apply writes the kept changes with solver
   * provenance as one undo step and marks the run reviewed; Discard
   * and Cancel mark it too, so it never returns as "finished while
   * you were away".
   */
  const applySolved = React.useCallback(
    (solved: ScheduleProposal): void => {
      solveAbortRef.current = undefined;
      setProposal(solved);
      setProposalOutOfDate(new Map<string, string>());
      setSolveState(idleSolveState);
      void mintSession();
      // F31 rework: mark what went out of date while the solver ran.
      void checkFreshness(solved)
        .then((found) => {
          if (proposalRef.current?.runId === solved.runId) {
            setProposalOutOfDate(found);
          }
          return null;
        })
        .catch(() => undefined);
    },
    [checkFreshness, mintSession],
  );

  const markReviewed = React.useCallback(
    (runId: string | undefined): void => {
      if (session && runId) {
        void markRunReviewed(session, runId).catch(() => undefined);
      }
    },
    [session],
  );

  const publishProposal = React.useCallback(
    (changes: readonly ProposalChange[]): void => {
      if (!proposal || publishingRef.current) {
        return;
      }
      const target = proposal;
      publishingRef.current = true;
      const publish = async (): Promise<void> => {
        try {
          // F31 rework: nothing out of date is written. A change that went
          // out of date since the last check stops Apply, so the planner
          // sees what Apply would write before it writes.
          const found = await checkFreshness(target).catch(
            () => new Map<string, string>(),
          );
          const newlyFound = changes.filter(
            (change) =>
              found.has(change.current.id) && !proposalOutOfDate.has(change.current.id),
          );
          if (newlyFound.length > 0) {
            setProposalOutOfDate(found);
            notify(
              "warning",
              newlyFound.length === 1
                ? surfaceStrings.proposalCheckFoundOne
                : formatString(surfaceStrings.proposalCheckFoundMany, {
                    count: newlyFound.length,
                  }),
            );
            return;
          }
          // Apply writes nothing, and the proposal stays open, until
          // the people it gives shifts can be saved.
          if (
            changes.some((change) =>
              givesPerson(change.current.resourceId, change.proposed.resourceId),
            ) &&
            (Boolean(workItems.getTargetEntityType?.()) && typeof context.webAPI?.updateRecord === "function") &&
            !(await whenBindable())
          ) {
            notify("warning", messages.msgPersonNotSaved);
            return;
          }
          if (changes.length > 0) {
            applyChanges(
              changes.map((change) => ({
                event: change.current,
                result: {
                  end: change.proposed.end,
                  resourceId: change.proposed.resourceId,
                  start: change.proposed.start,
                },
                verdict: { kind: "allow" as const },
              })),
              { provenance: buildProvenance({ kind: "solver", runId: target.runId, userName }) },
            );
          }
          markReviewed(target.runId);
          setResumeDismissed(target.runId);
          setProposal(undefined);
          setProposalOutOfDate(new Map<string, string>());
          notify(
            "success",
            changes.length === 1
              ? surfaceStrings.proposalAppliedOne
              : formatString(surfaceStrings.proposalAppliedMany, { count: changes.length }),
          );
        } finally {
          publishingRef.current = false;
        }
      };
      void publish();
    },
    [applyChanges, checkFreshness, markReviewed, proposal, proposalOutOfDate, surfaceStrings, userName, whenBindable],
  );

  const discardProposal = React.useCallback((): void => {
    markReviewed(proposal?.runId);
    setResumeDismissed(proposal?.runId);
    setProposal(undefined);
    setProposalOutOfDate(new Map<string, string>());
    setSolveState(idleSolveState);
  }, [markReviewed, proposal]);

  // A Solve click that came before the calendar's settings loaded (see requestSolve).
  const [solvePending, setSolvePending] = React.useState(false);
  const cancelSolve = React.useCallback((): void => {
    setSolvePending(false);
    solveAbortRef.current?.abort();
    solveAbortRef.current = undefined;
    // The server finishes the run regardless; reviewed keeps it out
    // of the resume prompt.
    markReviewed(solveRunIdRef.current);
    setResumeDismissed(solveRunIdRef.current);
    solveRunIdRef.current = undefined;
    setSolveState(idleSolveState);
  }, [markReviewed]);

  const failSolve = React.useCallback((error: unknown): void => {
    if (error instanceof SolveCancelledError) {
      setSolveState(idleSolveState);
      return;
    }
    if (error instanceof SolveInFlightError) {
      // Another run holds this calendar: refresh so the prompt shows it.
      setSolveState(idleSolveState);
      setResumeDismissed(undefined);
      void mintSession();
      return;
    }
    setSolveState({
      message: error instanceof Error ? error.message : String(error),
      reason: error instanceof SolveQuotaExceededError ? "quota" : undefined,
      status: "failed",
    });
  }, [mintSession]);

  const runWithSession = React.useCallback(
    async (active: SolveSession): Promise<void> => {
      const solveWindow = solveWindowNow();
      const now = toDisplay(new Date());
      if (solveWindow.end <= now) {
        return;
      }
      const events = solveEventsFor(solveWindow);
      const resources = hostConfig.resources ?? mapped.resources;
      setSolveState({ status: "queued" });
      setProposal(undefined);
      setProposalOutOfDate(new Map<string, string>());
      const range = solveRangeFor(solveWindow);
      solveSnapshotRef.current = {
        events,
        range,
        reads: await readFreshness(
          range,
          resources.map((resource) => resource.id),
        ),
      };
      const controller = new AbortController();
      solveAbortRef.current = controller;
      solveRunIdRef.current = undefined;
      const solved = await runSolve({
        capabilities: solveCapabilities.length > 0 ? solveCapabilities : undefined,
        currentEvents: events,
        unassignedResourceId: UNASSIGNED_RESOURCE_ID,
        onStatus: (status) => setSolveState({ status }),
        onSubmitted: (runId) => {
          solveRunIdRef.current = runId;
        },
        signal: controller.signal,
        problem: problemFromSchedule({
          events,
          now,
          resources,
          // The wire carries real moments and the site's zone (ruled 2026-10-02).
          timeZone: solverZone(toStored(solveWindow.start)),
          toInstant: toStored,
          unavailability: scenarioData.bands.filter(
            (band) => band.end > solveWindow.start && band.start < solveWindow.end,
          ),
          window: solveWindow,
        }),
        runToken: Date.now().toString(36),
        session: active,
        solutionType: hostConfig.product,
        calendarName: hostConfig.calendarName,
        window: solveWindow,
      });
      applySolved(solved);
    },
    [
      applySolved,
      hostConfig.calendarName,
      hostConfig.product,
      hostConfig.resources,
      mapped.resources,
      readFreshness,
      scenarioData.bands,
      solveCapabilities,
      solveEventsFor,
      solveRangeFor,
      solveWindowNow,
      solverZone,
      toDisplay,
      toStored,
    ],
  );

  const requestSolve = React.useCallback((): void => {
    const action = solveClickAction({
      calendarId: hostConfig.calendarId,
      hasSession: session !== undefined,
      settingsReady,
    });
    if (action === "wait") {
      // Before the calendar's settings load: hold the click, shown as queued.
      setSolvePending(true);
      setSolveState({ status: "queued" });
      return;
    }
    if (action === "noCalendar") {
      setSolveState(idleSolveState);
      notify("warning", messages.msgSolveNoCalendar);
      return;
    }
    const start = async (): Promise<void> => {
      const active = session ?? (await mintSession());
      if (!active) {
        return;
      }
      try {
        await runWithSession(active);
      } catch (error) {
        if (error instanceof SolveSessionExpiredError) {
          // One refresh, then the same request under the new token.
          const fresh = await mintSession();
          if (fresh) {
            await runWithSession(fresh);
            return;
          }
        }
        throw error;
      }
    };
    void start().catch(failSolve);
  }, [
    failSolve,
    hostConfig.calendarId,
    messages.msgSolveNoCalendar,
    mintSession,
    notify,
    runWithSession,
    session,
    settingsReady,
  ]);

  // The held click replays once the settings load: it runs, or says why it cannot.
  React.useEffect(() => {
    if (solvePending && settingsReady) {
      setSolvePending(false);
      requestSolve();
    }
  }, [requestSolve, settingsReady, solvePending]);

  /*
   * Connect without a bound calendarConfigId (the stranger's install):
   * create a Chrona Scheduler Calendar row named after the table and
   * point this view's row at it, so the session has a calendar to scope
   * and the next load finds the configuration through the view row.
   */
  const ensureCalendarConfiguration = React.useCallback(async (): Promise<string> => {
    const webApi = context.webAPI;
    if (!webApi?.createRecord) {
      throw new Error("Dataverse is not available in this host.");
    }
    const entityType = workItems.getTargetEntityType?.() ?? "";
    let name = entityType || "Chrona Scheduler";
    if (entityType && context.utils?.getEntityMetadata) {
      try {
        const metadata = (await context.utils.getEntityMetadata(entityType, [])) as {
          DisplayCollectionName?: string;
          DisplayName?: string;
        };
        const collection = metadata.DisplayCollectionName;
        const display = metadata.DisplayName;
        if (typeof collection === "string" && collection !== "") {
          name = collection;
        } else if (typeof display === "string" && display !== "") {
          name = display;
        }
      } catch {
        // Metadata unavailable: the logical name names the row.
      }
    }
    // F39: a second calendar on the same table gets the next number ("Tasks 2"); Plan and billing shows calendars by name.
    try {
      const named = await webApi.retrieveMultipleRecords("chr_chronaschedulercalendar", calendarsNamedLikeQuery(name));
      name = nextCalendarName(
        name,
        named.entities.map((entity) => (typeof entity.chr_name === "string" ? entity.chr_name : "")),
      );
    } catch {
      // The lookup is a courtesy: the calendar is still created under the table's name.
    }
    // F38: a calendar this control creates names its product: a scenario control's, else the free scheduler's.
    const product =
      scenario?.product === "workforce-scheduling" ? PRODUCT_CHOICE.workforce : PRODUCT_CHOICE.scheduler;
    // A new calendar takes the maker's zone: the browser's, when it runs at their Power Apps offset.
    const makerZone = browserTimeZone();
    const now = new Date();
    const zone =
      makerZone && zoneOffsetMinutes(now, makerZone) === context.userSettings.getTimeZoneOffsetMinutes(now)
        ? { chr_timezone: makerZone }
        : {};
    const created = await webApi.createRecord("chr_chronaschedulercalendar", { chr_name: name, chr_product: product, ...zone });
    const calendarId = created.id;
    if (viewId !== "default") {
      const bind = { "chr_Calendar@odata.bind": `/chr_chronaschedulercalendars(${calendarId})` };
      const existing = await webApi.retrieveMultipleRecords(
        "chr_chronaschedulerview",
        `?$select=chr_chronaschedulerviewid&$filter=chr_viewid eq '${viewId}'&$top=1`,
      );
      const row = existing.entities[0];
      if (row && typeof row.chr_chronaschedulerviewid === "string") {
        await webApi.updateRecord("chr_chronaschedulerview", row.chr_chronaschedulerviewid, bind);
      } else {
        await webApi.createRecord("chr_chronaschedulerview", {
          chr_name: workItems.getTitle?.() || name,
          chr_viewid: viewId,
          ...bind,
        });
      }
    }
    setViewCalendarId(calendarId);
    return calendarId;
  }, [context.userSettings, context.utils, context.webAPI, viewId, workItems]);

  /*
   * Only users who can change a board's settings see the gear. On a cold
   * page the privilege answer can start as no, so it lives in state (not
   * a memo) and turns to yes when the re-check says so.
   */
  const [settingsPrivilege, setSettingsPrivilege] = React.useState(() =>
    canChangeViewSettings(context.utils),
  );
  React.useEffect(() => {
    if (settingsPrivilege || viewId === "default") {
      return undefined;
    }
    return recheckPrivilege(
      () => canChangeViewSettings(context.utils),
      () => context.utils?.getEntityMetadata?.(VIEW_SETTINGS_TABLE, []),
      () => setSettingsPrivilege(true),
    );
  }, [context.utils, settingsPrivilege, viewId]);
  const canChangeSettings = viewId !== "default" && settingsPrivilege;

  /*
   * The maker's settings for this board: the view row's form in the
   * model-driven app's side dialog. A board without a row yet gets one,
   * named after the view and tied to its resolved calendar, so the form
   * always has a record to edit. While the dialog is open the board
   * re-reads the view and calendar rows whenever a Save moves them.
   */
  const openSettings = React.useCallback((): void => {
    const open = async (): Promise<void> => {
      let rowId = viewRowId;
      // The resolved id: the calendar property can hold a name.
      const calendarId = hostConfig.calendarId;
      if (!rowId) {
        const calendarBind = calendarId
          ? { "chr_Calendar@odata.bind": `/chr_chronaschedulercalendars(${calendarId})` }
          : {};
        const created = await context.webAPI.createRecord(VIEW_SETTINGS_TABLE, {
          chr_name: workItems.getTitle?.() || "Chrona Scheduler",
          chr_viewid: viewId,
          ...calendarBind,
        });
        rowId = created.id;
        setViewRowId(rowId);
      }
      const refresh = (): void => {
        setViewConfigRevision((revision) => revision + 1);
        setCalendarConfigRevision((revision) => revision + 1);
      };
      const viewRow = rowId;
      const stopWatching = watchWhileOpen(
        () =>
          readRowsVersion(context.webAPI, [
            { entity: VIEW_SETTINGS_TABLE, id: viewRow },
            { entity: "chr_chronaschedulercalendar", id: calendarId },
          ]),
        refresh,
      );
      try {
        await openRecordInDialog(VIEW_SETTINGS_TABLE, rowId, (options) => context.navigation.openForm(options));
      } finally {
        stopWatching();
      }
      refresh();
    };
    // The live region tells screen readers; the platform's error dialog
    // shows everyone, with the reason under its details.
    const showFailure = async (error: unknown): Promise<void> => {
      setMessage(messages.msgSettingsFailed);
      try {
        await context.navigation.openErrorDialog({
          details: error instanceof Error ? error.message : String(error),
          message: messages.msgSettingsFailed,
        });
      } catch {
        // No dialog API here: the live region is all there is.
      }
    };
    void open().catch(showFailure);
  }, [context.navigation, context.webAPI, hostConfig.calendarId, messages, viewId, viewRowId, workItems]);

  /* Q6-A: "Try a free sample run" IS the consent. Connect (admin
   * privilege), then the first free solve on the redacted payload. */
  const connectAndSample = React.useCallback((): void => {
    const start = async (): Promise<void> => {
      try {
        await connectEnvironment(clientUrl);
      } catch (error) {
        if (error instanceof SolveBridgeError && error.failure === "noPrivilege") {
          notify("warning", messages.msgConnectAdminOnly);
          return;
        }
        notify(
          "error",
          formatString(messages.msgConnectFailed, {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      }
      let calendarId = hostConfig.calendarId;
      if (!calendarId) {
        try {
          calendarId = await ensureCalendarConfiguration();
        } catch (error) {
          notify(
            "error",
            formatString(messages.msgConnectFailed, {
              message: error instanceof Error ? error.message : String(error),
            }),
          );
          return;
        }
      }
      const fresh = await mintSession(calendarId);
      if (fresh) {
        // F38 rule C: an account paying for any product has no daily limit; say so rather than print a number.
        notify(
          "success",
          fresh.quota.dailySolveLimit < Number.MAX_SAFE_INTEGER
            ? formatString(messages.msgConnected, { limit: fresh.quota.dailySolveLimit })
            : messages.msgConnectedUnlimited,
        );
        await runWithSession(fresh);
      }
    };
    void start().catch(failSolve);
  }, [clientUrl, ensureCalendarConfiguration, failSolve, hostConfig.calendarId, messages, mintSession, runWithSession]);

  /* Resume-or-discard (F26): the session's latest run, when it is not
   * this page's own and not yet dealt with. Review rebuilds the
   * problem, proves it matches the server's payload hash, and follows
   * the run with the rebuilt redaction map; otherwise "changed". */
  const latestRun = session?.latestRun;
  const resumeRun: ResumeRunDisplay | undefined =
    latestRun &&
    latestRun.runId !== resumeDismissed &&
    latestRun.runId !== proposal?.runId &&
    !latestRun.reviewedAt &&
    latestRun.status !== "failed"
      ? {
          kind: latestRun.status === "succeeded" ? "finished" : "running",
          onDiscard: () => {
            setResumeDismissed(latestRun.runId);
            if (session) {
              void markRunReviewed(session, latestRun.runId).catch(() => undefined);
            }
          },
          onReview: () => {
            if (!session) {
              return;
            }
            const solveWindow = solveWindowNow();
            const events = solveEventsFor(solveWindow);
            const resources = hostConfig.resources ?? mapped.resources;
            // History as the run saw it: what had started when it was submitted.
            const problem = problemFromSchedule({
              events,
              now: toDisplay(new Date(latestRun.createdAt)),
              resources,
              unavailability: scenarioData.bands.filter(
                (band) => band.end > solveWindow.start && band.start < solveWindow.end,
              ),
              window: solveWindow,
            });
            const range = solveRangeFor(solveWindow);
            setResumeDismissed(latestRun.runId);
            const controller = new AbortController();
            solveAbortRef.current = controller;
            solveRunIdRef.current = latestRun.runId;
            setSolveState({ status: latestRun.status === "succeeded" ? "running" : "queued" });
            // F38: the same key rebuilds the same placeholders, so an unchanged schedule hashes the same.
            void readFreshness(range, resources.map((resource) => resource.id))
              .then((reads) => {
                solveSnapshotRef.current = { events, range, reads };
                return redactProblemForTenant(problem, session.resourcePlaceholders);
              })
              .then(async (redaction) => ({ hash: await hashProblem(redaction.problem), redaction }))
              .then(({ hash, redaction }) => {
                if (latestRun.payloadHash && hash && hash !== latestRun.payloadHash) {
                  setSolveState(idleSolveState);
                  notify("info", messages.msgResumeChanged);
                  void markRunReviewed(session, latestRun.runId).catch(() => undefined);
                  return null;
                }
                return followRun({
                  currentEvents: events,
                  unassignedResourceId: UNASSIGNED_RESOURCE_ID,
                  onStatus: (status) => setSolveState({ status }),
                  redaction,
                  runId: latestRun.runId,
                  runToken: Date.now().toString(36),
                  session,
                  signal: controller.signal,
                  window: solveWindow,
                }).then((solved) => {
                  applySolved(solved);
                  return null;
                });
              })
              .catch(failSolve);
          },
          runId: latestRun.runId,
        }
      : undefined;

  // A scenario control's board extension and its writes.
  const scenarioBoard =
    scenarioParts?.scenario.useBoard({
      config: hostConfig.scenario,
      context,
      data: scenarioParts.data,
      hostConfig,
      localOnlyNote: LOCAL_ONLY_NOTE,
      notify,
      patchRecord,
      periodConfig,
      scenarioAllowed,
      scheduled,
      setEvents,
      store,
      toStored,
      unscheduled,
      window,
      workItems,
    }) ?? noScenarioBoard;
  const surfaceProps: Omit<SchedulerSurfaceProps, "view"> = {
    anchor,
    announcement: message,
    notice,
    dataNotice: rowCapReached
      ? formatString(messages.msgRowCapReached, { count: DATASET_ROW_CAP })
      : undefined,
    unassignedResourceId: UNASSIGNED_RESOURCE_ID,
    // F27: cached claims mean a connected instance whose Chrona is
    // unreachable; the free-control explainer is for the unconnected,
    // bound calendar or not: Connect creates the configuration it needs.
    conversionSurface:
      !session && !entitlementSnapshot
        ? {
            connected: false,
            onConnect: sessionFailure === "noPrivilege" ? undefined : connectAndSample,
          }
        : undefined,
    onCancelSolve: cancelSolve,
    onDiscardProposal: discardProposal,
    onPublishProposal: publishProposal,
    // Optimize is offered from the claims: with a live session, or with
    // cached claims after an outage (the request mints a session first).
    onRequestSolve: (session || entitlementSnapshot) && solveAllowed
      ? sessionFailure === "noPrivilege"
        ? undefined
        : requestSolve
      : undefined,
    proposal,
    proposalOutOfDate,
    proposalOverlapPolicy: hostConfig.policies.overlap,
    resumeRun,
    solveUnavailableReason:
      solveWindowNow().end <= toDisplay(new Date())
        ? surfaceStrings.solvePeriodPassed
        : undefined,
    // A paid tier reports no finite allowance; the entitlement line
    // carries the resource metric instead.
    solveQuota:
      session && session.quota.dailySolveLimit < Number.MAX_SAFE_INTEGER
        ? {
            dailySolveLimit: session.quota.dailySolveLimit,
            portalUrl: session.portalUrl,
            remainingSolves: session.quota.remainingSolves,
          }
        : undefined,
    entitlement: toEntitlementDisplay(entitlementStatus, {
      onRetry: () => refreshEntitlementNow(true),
      planUrl: planUsageUrl(session?.portalUrl ?? entitlementSnapshot?.portalUrl, environmentHost),
    }),
    solveState: session ? solveState : undefined,
    solveCapabilities:
      solveCapabilities.length > 0 ? solveCapabilities : undefined,
    extension: scenarioBoard.extension,
    config: { ...defaultTimelineConfig, ...zoomForInterval(interval, zoomByInterval, dayZoom) },
    decorations: decorations.length > 0 ? decorations : undefined,
    events: scheduled,
    availableTags: scenarioData.availableTags,
    tagMode: scenarioData.tagMode,
    initialScrollHour: viewConfig.workingStartHour ?? 6,
    interval,
    now: toDisplay(new Date()),
    onAnchorChange: setAnchor,
    // A Roster grid showing the roster period steps by the period and
    // offers no interval switcher.
    ...(rosterPeriod && periodConfig
      ? {
          intervals: [],
          onStep: (direction: -1 | 1): void =>
            setAnchor(stepPeriod(periodConfig, anchor, direction).start),
        }
      : {}),
    onCreateEvent: (draft) => {
      // A new shift on a person's row waits for the bind's names.
      if (
        draft.resourceId !== UNASSIGNED_RESOURCE_ID &&
        !(resourceNavRef.current && entitySetRef.current) &&
        (Boolean(workItems.getTargetEntityType?.()) && typeof context.webAPI?.createRecord === "function")
      ) {
        // The dialog stays open until this answers, so a refusal keeps what was typed.
        return whenBindable().then((ready) => {
          if (ready) {
            void createEventRef.current?.(draft);
            return true;
          }
          notify("warning", messages.msgPersonNotSaved);
          return false;
        });
      }
      const entityType = workItems.getTargetEntityType?.();
      const startName = columnLogicalName(workItems, "start");
      const endName = columnLogicalName(workItems, "end");
      const titleName = columnLogicalName(workItems, "title");
      if (
        !entityType ||
        !context.webAPI?.createRecord ||
        !startName ||
        !endName ||
        !titleName
      ) {
        notify("warning", messages.msgCannotCreateHere + LOCAL_ONLY_NOTE);
        return;
      }
      const payload: Record<string, unknown> = {
        [titleName]: draft.title,
        [startName]: toStored(draft.start).toISOString(),
        [endName]: toStored(draft.end).toISOString(),
      };
      if (
        draft.resourceId !== UNASSIGNED_RESOURCE_ID &&
        resourceNavRef.current &&
        entitySetRef.current
      ) {
        payload[`${resourceNavRef.current}@odata.bind`] =
          `/${entitySetRef.current}(${draft.resourceId})`;
        const statusName = columnLogicalName(workItems, "status");
        if (statusName) {
          payload[statusName] = isChoiceColumn(workItems, "status")
            ? STATUS_CHOICE.assigned
            : "Assigned";
        }
      }
      const provenanceName = columnLogicalName(workItems, "provenance");
      if (provenanceName) {
        payload[provenanceName] = "manual";
      }
      Object.assign(payload, scenarioBoard.createPayload?.(draft));
      // An item keeps one tag: the draft's first.
      const tag = draft.requiredTags?.[0];
      try {
        context.webAPI
          .createRecord(entityType, payload)
          .then((reference) => {
            const id =
              typeof reference.id === "object" && reference.id
                ? (reference.id as { guid: string }).guid
                : (reference.id as unknown as string);
            applyEvents(
              [
                ...events,
                {
                  end: toStored(draft.end),
                  id,
                  requiredTags: tag ? [tag] : undefined,
                  resourceId: draft.resourceId,
                  start: toStored(draft.start),
                  status: "assigned",
                  title: draft.title,
                },
              ],
              formatString(messages.msgCreated, { title: draft.title }),
            );
            return null;
          })
          .catch(() =>
            notify(
              "error",
              formatString(messages.msgCreateFailed, { title: draft.title }),
            ),
          );
      } catch {
        notify("warning", messages.msgCannotCreateHere + LOCAL_ONLY_NOTE);
      }
    },
    onDeleteEvent: (event) => applyDelete([event]),
    onDeleteEvents: (doomed) => applyDelete(doomed),
    onEventChange: (change) => applyChanges([change]),
    onEventsChange: applyChanges,
    onOpenSettings: canChangeSettings ? openSettings : undefined,
    undoRedo: {
      canRedo: canRedo(history),
      canUndo: canUndo(history),
      onRedo: redo,
      onUndo: undo,
    },
    onEventClick: (event) =>
      setMessage(formatString(messages.msgSelected, { title: event.title })),
    onRequiredTagsChange: scenarioBoard.onRequiredTagsChange,
    onIntervalChange: setIntervalState,
    onResourceColumnWidthChange: (width) => {
      setResourceColumnWidth(width);
      store.save({ resourceColumnWidth: width });
    },
    // F28: the app's own commands, the record's own form, and the app's
    // command bar acting on the board's selection.
    loadContextMenuItems: (event) => retrieveRecordCommands(workItems, event.id),
    onOpenRecord: (event) => {
      void context.navigation.openForm({
        entityId: event.id,
        entityName: workItems.getTargetEntityType(),
      });
    },
    onSelectionChange: (ids) => {
      setSelectedEventIds(ids);
      try {
        workItems.setSelectedRecordIds([...ids]);
      } catch {
        // A host without selection support (the test harness) keeps the board's own selection.
      }
    },
    onSetPinned: setLocked,
    onSlotMinutesChange: (minutes) => {
      setUserSlotMinutes(minutes);
      store.save({ slotMinutes: minutes });
    },
    onTogglePin: (event) => {
      const source = events.find((candidate) => candidate.id === event.id);
      if (!source) {
        return;
      }
      setLocked([source], !showsPin(source));
    },
    onUnscheduleEvent: (event) => {
      applyEvents(
        events.map((candidate) =>
          candidate.id === event.id
            ? {
                ...candidate,
                resourceId: UNASSIGNED_RESOURCE_ID,
                status: "needsCover" as const,
              }
            : candidate,
        ),
        formatString(messages.msgUnscheduled, { title: event.title }),
      );
      const payload = buildUnschedulePayload(
        workItems,
        resourceNavRef.current ?? columnLogicalName(workItems, "resource"),
        manualProvenance,
      );
      if (payload) {
        patchRecord(
          event.id,
          payload,
          formatString(messages.msgUnscheduled, { title: event.title }),
        );
      }
    },
    onUnscheduledFilterChange: (filter) => {
      setUnscheduledFilter(filter);
      store.save({ unscheduledInViewOnly: filter === "window" });
    },
    onUnscheduledPanelWidthChange: (width) => {
      setPanelWidth(width);
      store.save({ unscheduledPanelWidth: width });
    },
    onZoomChange: (next) => {
      const zooms = { ...zoomByInterval, [interval]: next };
      setZoomByInterval(zooms);
      store.save({ zoomByInterval: zooms });
    },
    resourceColumnWidth,
    resources: hostConfig.resources ?? mapped.resources,
    scorecardVisible,
    onScorecardVisibleChange: (visible) => {
      setScorecardVisible(visible);
      store.save({ scorecardHidden: !visible });
    },
    // The month grid and the date picker start on the user's first day.
    weekStartsOn,
    selectedEventIds,
    showWeekends,
    slotMinutes,
    strings: controlStrings.surface,
    tagColors: scenarioData.tagColors,
    // The site's city on the toolbar; the zone in full and its offset in the tooltip.
    timeZoneDetail:
      displayZone === "user" || formatTimeZoneCity(displayZone) === "UTC"
        ? undefined
        : `${formatTimeZoneLabel(displayZone)} (${formatUtcOffsetLabel(zoneOffsetMinutes(new Date(), displayZone))})`,
    timeZoneLabel:
      displayZone === "user"
        ? formatUtcOffsetLabel(userOffsetMinutes(new Date()))
        : formatTimeZoneCity(displayZone),
    // Today is the site's today.
    today: toDisplay(new Date()),
    toInstant: toStored,
    undatedEvents: undated,
    unscheduledEvents: unscheduled,
    unscheduledFilter,
    unscheduledPanelWidth: panelWidth,
    validateChange,
    window,
    wireTimeZone: solverZone(toStored(window.start)),
  };
  createEventRef.current = surfaceProps.onCreateEvent;

  return {
    message: skippedNote ? `${message} ${skippedNote}`.trim() : message,
    surfaceProps,
    view,
  };
}

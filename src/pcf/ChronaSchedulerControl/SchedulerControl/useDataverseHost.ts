/**
 * The Dataverse-backed host: the real-adapter counterpart of the
 * package's useFixtureScheduleHost, built on the decided binding model
 * - dataset-bound work items, chr_ config rows keyed to the native
 * view id, WebAPI (not a second dataset) for resources and bands,
 * in-place row updates, display-zone conversion at this boundary
 * (zero-config default: UTC, labeled).
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
  availabilityBandsToDecorations,
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
  followRun,
  hashProblem,
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
  reconcileGeneration,
  defaultTimelineConfig,
  emptyUndoRedo,
  canRedo,
  canUndo,
  aggregateVerdict,
  buildEventsByResource,
  evaluateScheduleRules,
  isPreferredResource,
  formatString,
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  isLocked,
  popRedo,
  popUndo,
  pushEntry,
  resolveWindowForScale,
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

import { currentAppUniqueName, WORKFORCE_APP_UNIQUE_NAME } from "./appContext";
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
  connectEnvironment,
  fetchSolveSession,
  resolveClientUrl,
  SolveBridgeError,
} from "./solveBridge";
import { resolveControlStrings } from "./controlStrings";
import {
  buildLockPayload,
  type ColorBy,
  colorByFromChoice,
  eventColorFor,
  isChoiceColumn,
  layoutFromChoice,
  type MakerLayout,
  lockWriteValue,
  STATUS_CHOICE,
  buildProvenance,
  lookupSchemaName,
  buildUnschedulePayload,
  buildUpdatePayload,
  columnLogicalName,
  DATASET_ROW_CAP,
  hasColumn,
  mapWorkItems,
  representationFor,
  retrieveRecordCommands,
  serializeOrigin,
  type WriteProvenance,
  UNASSIGNED_RESOURCE_ID,
} from "./dataverseData";
import type { IInputs } from "./generated/ManifestTypes";

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


function startOfWeek(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - ((day + 6) % 7));
  return monday;
}

/** F27 stage 2: the entitlement clock tick and the minimum gap between refresh attempts. */
const ENTITLEMENT_TICK_MS = 60 * 1000;
const ENTITLEMENT_RETRY_MS = 5 * 60 * 1000;

export function useDataverseScheduleHost(
  context: ComponentFramework.Context<IInputs>,
  dataFingerprint: string,
  rowCapReached = false,
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
    React.useState<HostConfig>(emptyHostConfig);
  /*
   * A stranger's install binds the control through the maker portal and
   * binds no calendarConfigId. The view row's calendar lookup then names
   * the configuration, which Connect creates (ensureCalendarConfiguration),
   * so the connection survives a reload.
   */
  const [viewCalendarId, setViewCalendarId] = React.useState<string | undefined>();
  const effectiveCalendarConfigId =
    calendarConfigId !== "" ? calendarConfigId : (viewCalendarId ?? "");
  /*
   * Skill edits apply locally at once; the loader map refreshes only
   * on a config reload, so overrides bridge the gap. Session ids
   * track junction rows created in-session so a later removal can
   * delete them.
   */
  const [tagOverrides, setTagOverrides] = React.useState<
    ReadonlyMap<string, readonly string[]>
  >(new Map());
  // Bumped while the settings dialog is open and when it closes, so a
  // saved calendar row applies at once too.
  const [calendarConfigRevision, setCalendarConfigRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    loadHostConfig(context.webAPI, effectiveCalendarConfigId, (skills) =>
      formatString(messages.msgRoleMissingSkills, { skills: skills.join(", ") }),
    )
      .then((config) => {
        if (!cancelled) {
          setHostConfig(config);
          setTagOverrides(new Map());
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
    () => mapWorkItems(workItems),
    // The context object is mutated in place; the fingerprint is the
    // change signal.
    [dataFingerprint],
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
  const notify = React.useCallback(
    (level: NoticeLevel, text: string): void => {
      setMessage(text);
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
  // Bumped when the maker closes the settings dialog, so saved settings apply at once.
  const [viewConfigRevision, setViewConfigRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    const webApi = context.webAPI;
    if (!webApi?.retrieveMultipleRecords || viewId === "default") {
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
          if (!row || cancelled) {
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
          const periodAnchorRaw =
            typeof row.chr_periodanchor === "string" ? new Date(row.chr_periodanchor) : undefined;
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
          return null;
        })
        .catch(() => {
          // Zero-config path: table absent or no row for this view.
        });
    } catch {
      // Feature unavailable in this host: zero-config path.
    }
    return () => {
      cancelled = true;
    };
  }, [context.webAPI, viewId, viewConfigRevision]);

  /*
   * Display zone: a config row wins; otherwise the Power Apps user's own
   * time zone, the one the platform's forms use, so the scheduler and
   * the form agree without configuration. "site" in a config row renders
   * stored wall clock untouched.
   */
  const userOffsetMinutes = React.useCallback(
    (date: Date): number => context.userSettings.getTimeZoneOffsetMinutes(date),
    [context],
  );
  const displayZone = viewConfig.displayTimeZone ?? "user";
  const toDisplay = React.useCallback(
    (date: Date): Date =>
      displayZone === "site"
        ? date
        : displayZone === "user"
          ? toOffsetZone(date, userOffsetMinutes)
          : toDisplayZone(date, displayZone),
    [displayZone, userOffsetMinutes],
  );
  const toStored = React.useCallback(
    (date: Date): Date =>
      displayZone === "site"
        ? date
        : displayZone === "user"
          ? fromOffsetZone(date, userOffsetMinutes)
          : fromDisplayZone(date, displayZone),
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
  const [anchor, setAnchor] = React.useState<Date>(() =>
    startOfWeek(new Date()),
  );

  const view = representationFor(
    mapped.resourceMapped,
    interval,
    viewConfig.layout,
  );
  const window = React.useMemo(
    () =>
      resolveWindowForScale(anchor, {
        representation: view,
        timeScale: interval,
      }),
    [anchor, interval, view],
  );

  const showWeekends = viewConfig.showWeekends ?? true;
  /*
   * Config instants (bands, demand) are stored UTC like events, so
   * they cross the display boundary the same way - the environment
   * pass caught strips rendering 10h off the bars when they did not.
   */
  const displayBands = React.useMemo(
    () =>
      hostConfig.bands.map((band) => ({
        ...band,
        end: toDisplay(band.end),
        start: toDisplay(band.start),
      })),
    [hostConfig.bands, toDisplay],
  );
  const displayDemand = React.useMemo(
    () =>
      hostConfig.demand.map((row) => ({
        ...row,
        end: toDisplay(row.end),
        start: toDisplay(row.start),
      })),
    [hostConfig.demand, toDisplay],
  );
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
    if (displayBands.length > 0) {
      collected.push(
        ...availabilityBandsToDecorations(displayBands, {
          busyElsewhere: surfaceStrings.bandBusyElsewhere,
          preferred: surfaceStrings.bandPreferred,
          unavailable: surfaceStrings.bandUnavailable,
          unpreferred: surfaceStrings.bandUnpreferred,
        }),
      );
    }
    return collected;
  }, [window, viewConfig, showWeekends, displayBands, surfaceStrings]);

  /*
   * Metadata for the lookup rebind, cached once: the referenced
   * table's entity-set name, and the lookup's NAVIGATION property on
   * the work-item table (SchemaName casing - @odata.bind rejects the
   * logical name, as the environment pass proved).
   */
  const entitySetRef = React.useRef<string | undefined>(undefined);
  const resourceNavRef = React.useRef<string | undefined>(undefined);
  const roleNavRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!context.utils?.getEntityMetadata) {
      return;
    }
    const referencedType = mapped.resourceEntityType;
    if (referencedType) {
      try {
        context.utils
          .getEntityMetadata(referencedType, [])
          .then((metadata) => {
            const setName = (metadata as { EntitySetName?: string })
              ?.EntitySetName;
            if (setName) {
              entitySetRef.current = setName;
            }
            return null;
          })
          .catch(() => {
            // Metadata unavailable (harness): rebinds stay local.
          });
      } catch {
        // Feature stub threw: rebinds stay local.
      }
    }
    /*
     * The @odata.bind key is the nav property's SchemaName, which the
     * client metadata API does not expose. Any populated lookup value
     * carries it as the associatednavigationproperty annotation, so
     * one annotated row resolves it for the table.
     */
    const workItemType = workItems.getTargetEntityType?.();
    const lookupLogical = columnLogicalName(workItems, "resource");
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
    resolveNavProperty()
      .then((name) => {
        resourceNavRef.current = name;
        return null;
      })
      .catch(() => {
        resourceNavRef.current = lookupLogical;
      });
  }, [mapped.resourceEntityType]);
  // The role lookup's navigation name, from its definition.
  const roleLogical = columnLogicalName(workItems, "role");
  const workItemTypeName = workItems.getTargetEntityType?.();
  React.useEffect(() => {
    if (!workItemTypeName || !roleLogical) {
      roleNavRef.current = undefined;
      return;
    }
    lookupSchemaName(resolveClientUrl(context), workItemTypeName, roleLogical)
      .then((name) => {
        roleNavRef.current = name ?? roleLogical;
        return null;
      })
      .catch(() => {
        roleNavRef.current = roleLogical;
      });
  }, [roleLogical, workItemTypeName]);

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

  const applyChanges = React.useCallback(
    (changes: readonly TimelineChange[], options?: { provenance?: WriteProvenance }): void => {
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
          (field) => field.label === "Status",
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
    [events, manualProvenance, patchRecord, toStored, workItems],
  );

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
        const lockChanged = isLocked(was) !== isLocked(row);
        if (!timesChanged && !resourceChanged && !lockChanged) {
          continue;
        }
        let payload: Record<string, unknown> = {};
        const statusField = was.fields?.find(
          (field) => field.label === "Status",
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
          const lock = buildLockPayload(workItems, isLocked(row));
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
        const tags = tagOverrides.get(event.id.toLowerCase());
        const tagged =
          tags && tags.length > 0
            ? { ...event, requiredTags: tags }
            : event;
        // The maker's "Color by" tints the row; the board stays neutral without it.
        const color = eventColorFor(tagged, viewConfig.colorBy, hostConfig.tagColors);
        const decorated = color ? { ...tagged, color } : tagged;
        if (displayZone === "site") {
          return decorated;
        }
        return {
          ...decorated,
          end: toDisplay(decorated.end),
          start: toDisplay(decorated.start),
        };
      }),
    [events, displayZone, hostConfig.tagColors, tagOverrides, toDisplay, viewConfig.colorBy],
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
      missingSkill: messages.reasonMissingSkill,
      outsideGroup: messages.reasonOutsideGroup,
      outsideHours: messages.reasonOutsideHours,
      overlap: messages.reasonOverlap,
      unavailable: messages.reasonUnavailable,
      unavailableNoLabel: messages.reasonUnavailableNoLabel,
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
        availabilityPolicy: hostConfig.policies.availability,
        crossGroupPolicy: "off",
        minimumBreakMinutes: 0,
        minimumBreakPolicy: "warn",
        overlapPolicy: hostConfig.policies.overlap,
        skillMismatchPolicy: hostConfig.policies.skillMismatch,
        workingEndHour: viewConfig.workingEndHour,
        workingHoursPolicy: hostConfig.policies.workingHours,
        workingStartHour: viewConfig.workingStartHour,
      };
      return aggregateVerdict(
        evaluateScheduleRules({
          availabilityBands: displayBands,
          config,
          event,
          events: datedEvents,
          eventsByResource: ruleIndex,
          preferenceDatingInstant: toStored(proposed.start),
          preferenceRules: hostConfig.preferenceRules,
          proposed,
          resources: hostConfig.resources ?? mapped.resources,
          strings: ruleStrings,
        }),
      );
    },
    [
      datedEvents,
      displayBands,
      hostConfig.policies,
      hostConfig.preferenceRules,
      hostConfig.resources,
      mapped.resources,
      ruleIndex,
      ruleStrings,
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
          ids.has(candidate.id)
            ? {
                ...candidate,
                lock: locked ? ("both" as const) : undefined,
                pinned: locked || undefined,
              }
            : candidate,
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
      const payload = buildLockPayload(workItems, locked);
      if (payload) {
        for (const id of ids) {
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
          availability: hostConfig.bands.length > 0,
          cost: hostConfig.resourceMapping?.costColumn !== undefined,
          hours: hostConfig.resourceMapping?.capacityColumn !== undefined,
          locks: hasColumn(workItems, "lockType") || hasColumn(workItems, "pinned"),
          roles: hostConfig.roleNames.length > 0,
        },
        resources: hostConfig.resources ?? mapped.resources,
        unscheduledEvents: unscheduled,
      }),
    [decorations, hostConfig, mapped.resources, scheduled, unscheduled, workItems],
  );
  const solveCapabilities = React.useMemo(
    () => activeCapabilities(capabilityTiers),
    [capabilityTiers],
  );
  React.useEffect(() => {
    const activateBy: Record<string, string> = {
      availability: "chr_availability rows",
      cost: "chr_resourcecostcolumn on the calendar row",
      hours: "chr_resourcecapacitycolumn on the calendar row",
      locks: "bind the lockType (or pinned) property-set",
      roles: "chr_role and chr_resourcerole rows with the role binding",
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
   * F25 Generate (Q1-C, Q2-A, Q3-A): reconcile the loaded templates
   * against the loaded work items for a window, then persist the
   * diff - one createRecord per added item (template lookup + origin
   * JSON + provenance "generated"), one deleteRecord per untouched
   * surplus. Flags stay in memory (the surface renders them). The
   * window is the roster period when the view row configures one,
   * else the explicit window the surface asked the planner for.
   */
  const periodConfig: SchedulerPeriodConfig | undefined =
    viewConfig.periodAnchor && viewConfig.periodUnit
      ? { anchor: viewConfig.periodAnchor, unit: viewConfig.periodUnit }
      : undefined;
  const generate = React.useCallback(
    (requested: TimeWindow): void => {
      const entityType = workItems.getTargetEntityType?.();
      const startName = columnLogicalName(workItems, "start");
      const endName = columnLogicalName(workItems, "end");
      const titleName = columnLogicalName(workItems, "title");
      const templateName = columnLogicalName(workItems, "template");
      const originName = columnLogicalName(workItems, "origin");
      if (hostConfig.templates.length === 0) {
        notify("info", messages.msgGenerateNoTemplates);
        return;
      }
      if (
        !entityType ||
        !context.webAPI?.createRecord ||
        !context.webAPI?.deleteRecord ||
        !startName ||
        !endName ||
        !titleName ||
        !templateName ||
        !originName
      ) {
        notify("warning", messages.msgGenerateNotBound + LOCAL_ONLY_NOTE);
        return;
      }
      const period = periodConfig
        ? periodContaining(periodConfig, requested.start)
        : requested;
      const result = reconcileGeneration({
        // F1: the period anchor is cycle week 1; without it rotating
        // templates are skipped and the summary says so.
        cycleAnchor: periodConfig?.anchor,
        events: [...scheduled, ...unscheduled],
        openResourceId: UNASSIGNED_RESOURCE_ID,
        period,
        demand: hostConfig.demandDrivers,
        templates: hostConfig.templates,
      });
      const summary = (added: number, removed: number): string => {
        const generated = formatString(messages.msgGenerated, {
          added,
          flagged: result.flagged.length,
          removed,
        });
        return result.unanchored.length > 0
          ? `${generated}. ${formatString(messages.msgGenerateUnanchored, { count: result.unanchored.length })}`
          : generated;
      };
      if (!result.changed) {
        notify("info", summary(0, 0));
        return;
      }
      const creates = result.added.map((event) => {
        const payload: Record<string, unknown> = {
          [titleName]: event.title,
          [startName]: toStored(event.start).toISOString(),
          [endName]: toStored(event.end).toISOString(),
          [`${templateName}@odata.bind`]: `/chr_workitemtemplates(${event.origin?.templateId ?? ""})`,
          [originName]: event.origin ? serializeOrigin(event.origin) : "",
        };
        const provenanceName = columnLogicalName(workItems, "provenance");
        if (provenanceName) {
          payload[provenanceName] = "generated";
        }
        const lockName = columnLogicalName(workItems, "lockType");
        if (lockName) {
          payload[lockName] = lockWriteValue(workItems, "time");
        }
        // The template's role and lane persist with the row.
        const roleName = event.requiredTags?.[0];
        const roleId = roleName
          ? hostConfig.roleIdsByName.get(roleName)
          : undefined;
        if (roleId && roleNavRef.current) {
          payload[`${roleNavRef.current}@odata.bind`] = `/chr_roles(${roleId})`;
        }
        const groupName = columnLogicalName(workItems, "group");
        if (groupName && event.groups?.Team) {
          payload[groupName] = event.groups.Team;
        }
        const subgroupName = columnLogicalName(workItems, "subgroup");
        if (subgroupName && event.groups?.Subteam) {
          payload[subgroupName] = event.groups.Subteam;
        }
        return context.webAPI.createRecord(entityType, payload);
      });
      const deletes = result.removed.map((event) =>
        context.webAPI.deleteRecord(entityType, event.id),
      );
      Promise.all([...creates, ...deletes])
        .then(() => {
          notify("success", summary(result.added.length, result.removed.length));
          workItems.refresh?.();
          return null;
        })
        .catch((error: unknown) => {
          notify(
            "error",
            formatString(messages.msgGenerateFailed, {
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        });
    },
    [context.webAPI, hostConfig.templates, messages, periodConfig, scheduled, toStored, unscheduled, workItems],
  );

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
    scenarioCapability(entitlementStatus?.session.solutionType ?? "workforce-scheduling"),
  );

  const solveEventsFor = React.useCallback(
    (period: TimeWindow | undefined) => {
      const all = [...scheduled, ...unscheduled];
      if (!period) {
        return all;
      }
      const DAY_MS = 24 * 60 * 60 * 1000;
      const rangeStart = new Date(period.start.getTime() - DAY_MS);
      const rangeEnd = new Date(period.end.getTime() + DAY_MS);
      return all.filter((event) =>
        event.status === "needsCover"
          ? event.start >= period.start && event.start < period.end
          : event.end > rangeStart && event.start < rangeEnd,
      );
    },
    [scheduled, unscheduled],
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
      setSolveState(idleSolveState);
      void mintSession();
    },
    [mintSession],
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
      if (!proposal) {
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
          { provenance: buildProvenance({ kind: "solver", runId: proposal.runId, userName }) },
        );
      }
      markReviewed(proposal.runId);
      setResumeDismissed(proposal.runId);
      setProposal(undefined);
      notify(
        "success",
        changes.length === 1
          ? surfaceStrings.proposalAppliedOne
          : formatString(surfaceStrings.proposalAppliedMany, { count: changes.length }),
      );
    },
    [applyChanges, markReviewed, proposal, surfaceStrings, userName],
  );

  const discardProposal = React.useCallback((): void => {
    markReviewed(proposal?.runId);
    setResumeDismissed(proposal?.runId);
    setProposal(undefined);
    setSolveState(idleSolveState);
  }, [markReviewed, proposal]);

  const cancelSolve = React.useCallback((): void => {
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
      const period = periodConfig ? periodContaining(periodConfig, anchor) : undefined;
      const events = solveEventsFor(period);
      const window: TimeWindow = period ?? {
        end: new Date(Math.max(...events.map((event) => event.end.getTime()), anchor.getTime() + 7 * 24 * 60 * 60 * 1000)),
        start: new Date(Math.min(...events.map((event) => event.start.getTime()), anchor.getTime())),
      };
      setSolveState({ status: "queued" });
      setProposal(undefined);
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
          resources: hostConfig.resources ?? mapped.resources,
          unavailability: displayBands.filter(
            (band) => band.end > window.start && band.start < window.end,
          ),
          window,
        }),
        runToken: Date.now().toString(36),
        session: active,
        solutionType: hostConfig.product,
        calendarName: hostConfig.calendarName,
      });
      applySolved(solved);
    },
    [
      anchor,
      applySolved,
      displayBands,
      hostConfig.calendarName,
      hostConfig.product,
      hostConfig.resources,
      mapped.resources,
      periodConfig,
      solveCapabilities,
      solveEventsFor,
    ],
  );

  const requestSolve = React.useCallback((): void => {
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
  }, [failSolve, mintSession, runWithSession, session]);

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
    // F38: a calendar created from the Workforce app names the Workforce product; any other is the free scheduler's.
    const product = (await currentAppUniqueName())?.toLowerCase() === WORKFORCE_APP_UNIQUE_NAME ? PRODUCT_CHOICE.workforce : PRODUCT_CHOICE.scheduler;
    const created = await webApi.createRecord("chr_chronaschedulercalendar", { chr_name: name, chr_product: product });
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
  }, [context.utils, context.webAPI, viewId, workItems]);

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
            const period = periodConfig ? periodContaining(periodConfig, anchor) : undefined;
            const events = solveEventsFor(period);
            const window: TimeWindow = period ?? {
              end: new Date(Math.max(...events.map((event) => event.end.getTime()), anchor.getTime() + 7 * 24 * 60 * 60 * 1000)),
              start: new Date(Math.min(...events.map((event) => event.start.getTime()), anchor.getTime())),
            };
            const problem = problemFromSchedule({
              events,
              resources: hostConfig.resources ?? mapped.resources,
              unavailability: displayBands.filter(
                (band) => band.end > window.start && band.start < window.end,
              ),
              window,
            });
            setResumeDismissed(latestRun.runId);
            const controller = new AbortController();
            solveAbortRef.current = controller;
            solveRunIdRef.current = latestRun.runId;
            setSolveState({ status: latestRun.status === "succeeded" ? "running" : "queued" });
            // F38: the same key rebuilds the same placeholders, so an unchanged schedule hashes the same.
            void redactProblemForTenant(problem, session.resourcePlaceholders)
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

  const surfaceProps: Omit<SchedulerSurfaceProps, "view"> = {
    anchor,
    announcement: message,
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
    resumeRun,
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
    generation:
      hostConfig.templates.length > 0 && scenarioAllowed
        ? { onGenerate: generate, periodConfigured: periodConfig !== undefined }
        : undefined,
    config: { ...defaultTimelineConfig, ...zoomForInterval(interval, zoomByInterval, dayZoom) },
    decorations: decorations.length > 0 ? decorations : undefined,
    demand: displayDemand.length > 0 ? displayDemand : undefined,
    events: scheduled,
    availableTags:
      hostConfig.roleNames.length > 0 ? hostConfig.roleNames : undefined,
    tagMode: "single",
    initialScrollHour: viewConfig.workingStartHour ?? 6,
    interval,
    isPreferredResource: (event, candidateId, at) =>
      isPreferredResource(
        hostConfig.preferenceRules,
        event,
        candidateId,
        toStored(at),
      ),
    now: toDisplay(new Date()),
    onAnchorChange: setAnchor,
    onCreateEvent: (draft) => {
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
      // The roster is written in roles: the draft's role is its one tag.
      const roleName = draft.requiredTags?.[0];
      const roleId = roleName
        ? hostConfig.roleIdsByName.get(roleName)
        : undefined;
      if (roleId && roleNavRef.current) {
        payload[`${roleNavRef.current}@odata.bind`] = `/chr_roles(${roleId})`;
      }
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
                  requiredTags: roleName ? [roleName] : undefined,
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
    onRequiredTagsChange: (event, tags) => {
      // One role per row: the first chip is the role, none clears it.
      const key = event.id.toLowerCase();
      const roleName = tags[0];
      const roleId = roleName
        ? hostConfig.roleIdsByName.get(roleName)
        : undefined;
      const next = roleName ? [roleName] : [];
      setTagOverrides((previous) => {
        const map = new Map(previous);
        map.set(key, next);
        return map;
      });
      setEvents((previous) =>
        previous.map((candidate) =>
          candidate.id === event.id
            ? {
                ...candidate,
                requiredTags: next.length > 0 ? next : undefined,
              }
            : candidate,
        ),
      );
      const note = formatString(messages.msgSkillsUpdated, {
        title: event.title,
      });
      if (!roleNavRef.current || (roleName && !roleId)) {
        notify("warning", note + LOCAL_ONLY_NOTE);
        return;
      }
      patchRecord(
        event.id,
        {
          [`${roleNavRef.current}@odata.bind`]: roleId
            ? `/chr_roles(${roleId})`
            : null,
        },
        note,
      );
    },
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
      setLocked([source], !isLocked(source));
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
    selectedEventIds,
    showWeekends,
    slotMinutes,
    strings: controlStrings.surface,
    tagColors: hostConfig.tagColors,
    timeZoneLabel:
      displayZone === "site"
        ? undefined
        : displayZone === "user"
          ? formatUtcOffsetLabel(userOffsetMinutes(new Date()))
          : formatTimeZoneLabel(displayZone),
    today: new Date(),
    undatedEvents: undated,
    unscheduledEvents: unscheduled,
    unscheduledFilter,
    unscheduledPanelWidth: panelWidth,
    validateChange,
    window,
  };

  return {
    message: skippedNote ? `${message} ${skippedNote}`.trim() : message,
    surfaceProps,
    view,
  };
}

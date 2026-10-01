import * as React from "react";

import { AgendaView } from "./AgendaView";
import { ChronaRoster } from "./ChronaRoster";
import { ChronaTimeline, type TimelineChange } from "./ChronaTimeline";
import { AssignDialog } from "./AssignDialog";
import { ConversionDialog } from "./ConversionDialog";
import type { SolveCapability } from "./capabilities";
import { formatCapabilityList } from "./capabilityText";
import { groupSetNames } from "./groupSets";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { DemandRow } from "./coverage";
import type { RowDecoration } from "./decorations";
import { dateNamesFrom, formatDateLabel, formatDayTimeLabel } from "./dateNames";
import { planUsageUrl, type EntitlementDisplay } from "./entitlement";
import { DragProvider, useDragController } from "./dragContext";
import { EventDialog, type DraftEventInput } from "./EventDialog";
import { EventHoverCard, type HoverAnchorRect } from "./EventHoverCard";
import {
  PlanningChrome,
  type SchedulerPlanningProps,
} from "./PlanningChrome";
import {
  GroupActionDialog,
  type GroupActionKind,
} from "./GroupActionDialog";
import {
  isDeleteLocked,
  isLocked,
  isResourceLocked,
  isTimeLocked,
} from "./locks";
import { MonthView } from "./MonthView";
import {
  dayOfPeriod,
  periodBoundariesInRange,
  periodContaining,
  stepPeriod,
  type SchedulerPeriodConfig,
} from "./periods";
import {
  diffProposal,
  isGhostEvent,
  openShiftCount,
  previewProposal,
  proposalMustRules,
  type ProposalChange,
  type ScheduleProposal,
  type ResumeRunDisplay,
  type SolveProgress,
  type SolveQuotaDisplay,
  type SolveState,
} from "./solve";
import { ProposalPanel } from "./ProposalPanel";
import { SolveProgressIndicator, useElapsedSeconds } from "./SolveProgress";
import { SchedulerLegend } from "./SchedulerLegend";
import { SchedulerToolbar } from "./SchedulerToolbar";
import { themeToCssVariables, type SchedulerTheme } from "./theme";
import {
  SchedulerStringsProvider,
  formatString,
  useSchedulerStrings,
  type SchedulerStrings,
} from "./strings";
import {
  UnscheduledPanel,
  type UnscheduledFilter,
} from "./UnscheduledPanel";
import { DayColumnsView, TopDownView } from "./VerticalViews";
import type { HourFormat } from "./timeAxis";
import type { DragResult, ValidateChange } from "./interactions";
import {
  resolveTimeScaleOptions,
  type SchedulerTimeScale,
  type StatusColorRule,
} from "./viewConfig";
import type { TagColorMap } from "./tagColors";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  SchedulerViewKind,
  TimelineConfig,
  TimeWindow,
} from "./types";

export interface SchedulerSurfaceProps {
  /** Maker lock: false hides the user-facing time-scale menu. */
  readonly allowUserTimeScale?: boolean;
  /**
   * Navigation anchor date. Providing it together with onAnchorChange and
   * onIntervalChange renders the package toolbar (New event, Today,
   * arrows, date picker, range label, and the Day/Week/Month interval
   * switcher). The representation is maker configuration via `view`.
   */
  readonly anchor?: Date;
  /** Announced politely to screen readers when it changes (e.g. "Shift moved"). */
  readonly announcement?: string;
  /**
   * Maker period grid (unit + anchor). Present = the period chip,
   * stepping, and canvas boundary marks render; absent = no period
   * concept on screen.
   */
  readonly periodConfig?: SchedulerPeriodConfig;
  /**
   * Workforce planning chrome (PLAN doctrine 2026-08-24): mode
   * tabs, horizon rail, and the period header that names the
   * optimization scope. Absent = generic instance, none of it
   * renders and the classic period bar (if periodConfig) stays.
   */
  readonly planning?: SchedulerPlanningProps;
  /** Opens the maker's settings for this board; the host shows it only to users who can change them. */
  readonly onOpenSettings?: () => void;
  /** Undo/redo for the toolbar buttons; keyboard stays host-side. */
  readonly undoRedo?: {
    readonly canRedo: boolean;
    readonly canUndo: boolean;
    readonly onRedo: () => void;
    readonly onUndo: () => void;
  };
  /** In-flight/failed solve presentation; hosts own the solving. */
  /** F25 Generate: expands the host's templates for a window. When
   * `periodConfigured`, the host resolves the roster period itself
   * and the surface passes the current anchor; otherwise the surface
   * asks the planner for an explicit window, prefilled from the view. */
  readonly generation?: {
    readonly onGenerate: (window: TimeWindow) => void;
    readonly periodConfigured: boolean;
  };
  /** Active constraint tiers the host's mapping resolved (F22
   * deliverable 2). Rendered as "Optimizing with: ..." beside the
   * solve entry and drives the conversion dialog's claim. Absent =
   * the dialog computes presence-based tiers from its own data. */
  readonly solveCapabilities?: readonly SolveCapability[];
  /** Server-reported free-tier allowance; display-only (F19). Absent
   * = no quota to show (paid/unlimited or not connected). */
  readonly solveQuota?: SolveQuotaDisplay;
  /** F27: the entitlement's state beside the solve entry - a quiet chip
   * for paused or grace, a calm notice for lapsed, the resource metric
   * as quiet metadata. Display only; the host withdraws Optimize and
   * Generate itself from the claims. */
  readonly entitlement?: EntitlementDisplay;
  /** F26: resume-or-discard prompt for a run the session reported. */
  readonly resumeRun?: ResumeRunDisplay;
  /** A host-side note about the data (a row cap reached, for instance),
   * rendered as a calm status line above the grid. */
  readonly dataNotice?: string;
  readonly solveState?: SolveState;
  /**
   * A solver answer to review (F31): the board previews it, the
   * planner drops what they disagree with, Apply hands the kept
   * changes to the host. Editing is off while it is open.
   */
  readonly proposal?: ScheduleProposal;
  readonly onRequestSolve?: () => void;
  /** Stops the wait for a running solve; renders Cancel while solving. */
  readonly onCancelSolve?: () => void;
  /** The kept, unblocked changes to write; the host clears the proposal. */
  readonly onPublishProposal?: (
    changes: readonly ProposalChange[],
  ) => void;
  readonly onDiscardProposal?: () => void;
  readonly config: TimelineConfig;
  /** Extra host/scenario context-menu items appended to the built-ins. */
  readonly contextMenuItems?: (
    event: SchedulerUiEvent,
  ) => readonly ContextMenuItem[];
  /** Selectable tags for the create and edit dialogs (host-supplied). */
  readonly availableTags?: readonly string[];
  /** "single" makes the dialog chips a one-of choice (a role). */
  readonly tagMode?: "single" | "multiple";
  /**
   * Soft preference tier for ranking "Best options" in the dialogs;
   * hard tiers stay inside validateChange.
   */
  readonly isPreferredResource?: (
    event: SchedulerUiEvent,
    resourceId: string,
    at: Date,
  ) => boolean;
  /** Coverage-strip slice size in minutes (default 30). */
  readonly coverageSliceMinutes?: number;
  readonly decorations?: readonly RowDecoration[];
  /**
   * Expanded demand rows; when present the timeline renders the
   * coverage strip (required vs scheduled per interval, per group).
   */
  readonly demand?: readonly DemandRow[];
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly hourFormat?: HourFormat;
  /**
   * Hour of day time-axis views open scrolled to (e.g. the working-day
   * start), re-applied on navigation. Defaults to just before the
   * earliest visible event.
   */
  readonly initialScrollHour?: number;
  /** Active time interval driving the window span and navigation step. */
  readonly interval?: SchedulerTimeScale;
  /** Intervals offered by the toolbar switcher. */
  readonly intervals?: readonly SchedulerTimeScale[];
  /** Finest slot granularity the maker permits (e.g. 15 forbids 5/6/10). */
  readonly minSlotMinutes?: number;
  /** Span in days used when the "daySpan" interval is active. */
  readonly navigationStepDays?: number;
  readonly now?: Date;
  readonly onAnchorChange?: (next: Date) => void;
  /** A confirmed create-dialog save; the host materializes the item. */
  readonly onCreateEvent?: (draft: DraftEventInput) => void;
  /**
   * The resource id the host gives rows without an assignee. New event
   * drafts against it when no resource lane exists, so a calendar layout
   * (no Resource bound) and a lane layout before its first rows can both
   * create.
   */
  readonly unassignedResourceId?: string;
  readonly onDeleteEvent?: (event: SchedulerUiEvent) => void;
  /** Group delete in one host transaction; falls back to onDeleteEvent. */
  readonly onDeleteEvents?: (events: readonly SchedulerUiEvent[]) => void;
  readonly onDuplicateEvent?: (event: SchedulerUiEvent) => void;
  /** Group duplicate (ctrl+V of a multi-copy) in one host transaction. */
  readonly onDuplicateEvents?: (events: readonly SchedulerUiEvent[]) => void;
  readonly onEventChange?: (change: TimelineChange) => void;
  /** Edit-dialog skill changes; the host persists them. */
  readonly onRequiredTagsChange?: (
    event: SchedulerUiEvent,
    tags: readonly string[],
  ) => void;
  /** Group move in one host transaction; falls back to onEventChange. */
  readonly onEventsChange?: (changes: readonly TimelineChange[]) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly onOpenEvent?: (event: SchedulerUiEvent) => void;
  /** F28: the host opens the record's own form (the platform's open-item
   * method); rendered as "Open record" ahead of Chrona's own Open. */
  readonly onOpenRecord?: (event: SchedulerUiEvent) => void;
  /** F28: host menu items that arrive later (the app's own record
   * commands); appended to the open menu when they resolve. */
  readonly loadContextMenuItems?: (
    event: SchedulerUiEvent,
  ) => Promise<readonly ContextMenuItem[]>;
  /** Pin/unpin toggle; a pin protects an assignment from every change. */
  readonly onTogglePin?: (event: SchedulerUiEvent) => void;
  /** Group pin/unpin in one host transaction; falls back to onTogglePin. */
  readonly onSetPinned?: (
    events: readonly SchedulerUiEvent[],
    pinned: boolean,
  ) => void;
  readonly onIntervalChange?: (interval: SchedulerTimeScale) => void;
  /** Selection is a set: click replaces, ctrl toggles, shift extends. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /** Saved-view switch; the host owns and applies what a view means. */
  readonly onActiveViewChange?: (id: string) => void;
  readonly activeViewId?: string;
  /** Saved views offered by the toolbar switcher (host-defined). */
  readonly views?: readonly { readonly id: string; readonly label: string }[];
  /** Renders the resource-column splitter; the host persists the width. */
  readonly onResourceColumnWidthChange?: (width: number) => void;
  /**
   * Teams-style time-scale change (user picked a granularity). Providing
   * it renders the toolbar menu; the host owns and persists the value.
   */
  readonly onSlotMinutesChange?: (minutes: number) => void;
  /** Renders the All / In view panel filter; the host persists the choice. */
  readonly onUnscheduledFilterChange?: (filter: UnscheduledFilter) => void;
  /** Renders the unscheduled-panel splitter; the host persists the width. */
  readonly onUnscheduledPanelWidthChange?: (width: number) => void;
  /** Enables ctrl+wheel zoom on the timeline; the host owns pxPerHour. */
  readonly onZoomChange?: (pxPerHour: number) => void;
  /**
   * Standalone conversion surface (F22): the quiet Optimize entry and
   * its explainer. The entry renders whenever this prop is present
   * and no real solve is offered; `hidden` is honored ONLY when
   * `connected` is true - the ratified price of the free control.
   */
  readonly conversionSurface?: {
    readonly connected: boolean;
    readonly hidden?: boolean;
    readonly onConnect?: () => void;
    readonly onLearnMore?: () => void;
    /** F26: "Open Chrona account" link in the dialog; absent = no link. */
    readonly portalUrl?: string;
  };
  /** Ordered grouping-set names; [] = flat. Omitted: first set. */
  readonly groupBy?: readonly string[];
  /** Renders the "Group rows" toolbar select; the host persists. */
  readonly onGroupByChange?: (set: string | undefined) => void;
  /** Renders the panel toggle; the host persists the visibility. */
  readonly onUnscheduledPanelVisibleChange?: (visible: boolean) => void;
  /** Unscheduled side panel visibility (default true; lanes stay). */
  readonly unscheduledPanelVisible?: boolean;
  /** Assigns an unscheduled event to the chosen resource. */
  readonly onAssignEvent?: (
    event: SchedulerUiEvent,
    resourceId: string,
  ) => void;
  /** Sends a scheduled event back to the unscheduled list. */
  readonly onUnscheduleEvent?: (event: SchedulerUiEvent) => void;
  /** Deterministic "today" for the toolbar; defaults to the real clock. */
  readonly today?: Date;
  readonly resources: readonly SchedulerResource[];
  readonly selectedEventIds?: readonly string[];
  /** Renders the shading legend under the view. Defaults to on. */
  readonly showLegend?: boolean;
  readonly showWeekends?: boolean;
  /**
   * Requested time scale (maker default overlaid with the stored user
   * preference). Clamped per representation/interval at render time;
   * the requested value itself is never rewritten.
   */
  readonly slotMinutes?: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  /** Maker-configured colors for skill/tag pills, keyed by exact tag. */
  readonly tagColors?: TagColorMap;
  /** Resource column width in px (user preference over the maker default). */
  readonly resourceColumnWidth?: number;
  /** Unscheduled panel width in px (user preference over the maker default). */
  readonly unscheduledPanelWidth?: number;
  /**
   * Label overrides merged over the English defaults. The PCF adapter
   * feeds resx resources here in Phase F; components read via context.
   */
  readonly strings?: Partial<SchedulerStrings>;
  /** Fluent token overrides applied as CSS custom properties on the root. */
  readonly theme?: Partial<SchedulerTheme>;
  /** Display-zone label chip shown in the toolbar (host converts dates). */
  readonly timeZoneLabel?: string;
  /** Events shown in the unscheduled side panel (drag onto a row to assign). */
  readonly unscheduledEvents?: readonly SchedulerUiEvent[];
  /** Rows with no dates yet (`undated`): listed after the unscheduled items, dated by a drop. */
  readonly undatedEvents?: readonly SchedulerUiEvent[];
  /** Panel scope: every open item or only those in the visible window. */
  readonly unscheduledFilter?: UnscheduledFilter;
  readonly validateChange?: ValidateChange;
  readonly view: SchedulerViewKind;
  readonly window: TimeWindow;
}

interface MenuState {
  readonly event: SchedulerUiEvent;
  readonly x: number;
  readonly y: number;
}

interface HoverState {
  readonly anchor: HoverAnchorRect;
  readonly bounds: { readonly height: number; readonly width: number };
  readonly event: SchedulerUiEvent;
}

const hoverDelayMs = 250;
/** Fixed slot height (Teams-style): density comes from slots per hour. */
const verticalSlotHeightPx = 24;

function InteractionShell(props: SchedulerSurfaceProps): JSX.Element {
  const strings = useSchedulerStrings();
  const drag = useDragController();

  /*
   * Time scale: the requested value (maker default overlaid with the
   * user preference) resolves against what this representation and
   * window can support. Snapping everywhere follows the effective
   * scale; vertical density is slots-per-hour times a fixed slot height.
   */
  const windowDays =
    (props.window.end.getTime() - props.window.start.getTime()) / 86_400_000;
  const resolvedScale = resolveTimeScaleOptions(
    props.view,
    windowDays,
    {
      allowUserTimeScale: props.allowUserTimeScale,
      minSlotMinutes: props.minSlotMinutes,
    },
    props.slotMinutes ?? props.config.snapMinutes,
  );
  const effectiveSlotMinutes = resolvedScale.effective;
  const effectiveConfig = React.useMemo(
    () => ({ ...props.config, snapMinutes: effectiveSlotMinutes }),
    [props.config, effectiveSlotMinutes],
  );
  const pxPerHourVertical =
    verticalSlotHeightPx * (60 / effectiveSlotMinutes);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [menu, setMenu] = React.useState<MenuState | undefined>();
  const [loadedMenuItems, setLoadedMenuItems] = React.useState<
    | { readonly eventId: string; readonly items: readonly ContextMenuItem[] }
    | undefined
  >();
  const openMenu = (event: SchedulerUiEvent, x: number, y: number): void => {
    setMenu({ event, x, y });
    setLoadedMenuItems(undefined);
    props.loadContextMenuItems?.(event).then(
      (items) => setLoadedMenuItems({ eventId: event.id, items }),
      () => undefined,
    );
  };
  const [dialogEvent, setDialogEvent] = React.useState<
    SchedulerUiEvent | undefined
  >();
  const [assignFor, setAssignFor] = React.useState<
    SchedulerUiEvent | undefined
  >(undefined);
  const [conversionOpen, setConversionOpen] = React.useState(false);
  const [generateWindow, setGenerateWindow] = React.useState<
    { readonly end: string; readonly start: string } | undefined
  >();
  const toDateInput = (date: Date): string => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };
  const openGenerate = (): void => {
    if (!props.generation) {
      return;
    }
    if (props.generation.periodConfigured) {
      props.generation.onGenerate(props.window);
      return;
    }
    setGenerateWindow({
      end: toDateInput(new Date(props.window.end.getTime() - 1)),
      start: toDateInput(props.window.start),
    });
  };
  const confirmGenerate = (): void => {
    if (!generateWindow || !props.generation) {
      return;
    }
    const start = new Date(`${generateWindow.start}T00:00:00`);
    const endDay = new Date(`${generateWindow.end}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime()) || endDay < start) {
      return;
    }
    const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1);
    setGenerateWindow(undefined);
    props.generation.onGenerate({ end, start });
  };
  const conversion = props.conversionSurface;
  // Hiding the conversion surface is a connected-instance privilege.
  const conversionVisible =
    conversion !== undefined &&
    !props.onRequestSolve &&
    !(conversion.hidden && conversion.connected);
  const [pendingUnschedule, setPendingUnschedule] = React.useState<
    SchedulerUiEvent | undefined
  >(undefined);
  const [draftRange, setDraftRange] = React.useState<DragResult | undefined>();
  const [hover, setHover] = React.useState<HoverState | undefined>();
  const [scrollRequest, setScrollRequest] = React.useState<
    { readonly date: Date; readonly nonce: number } | undefined
  >();
  const [groupAction, setGroupAction] = React.useState<
    | {
        readonly events: readonly SchedulerUiEvent[];
        readonly kind: GroupActionKind;
      }
    | undefined
  >();

  /*
   * Proposal review (F31): the solver returns a complete schedule;
   * the diff against current state is ours to compute, verdict and
   * preview. While a proposal is open the board shows the proposed
   * state (or the current one, on the pill), editing is off, and the
   * planner drops single changes before Apply.
   */
  const proposalChanges = React.useMemo(
    () =>
      props.proposal
        ? diffProposal(
            // Assigns come FROM the unscheduled panel: diff against
            // the whole schedule, not just the placed items.
            [...props.events, ...(props.unscheduledEvents ?? [])],
            props.proposal,
          )
        : undefined,
    [props.events, props.proposal, props.unscheduledEvents],
  );
  const resourceNameById = React.useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource.name])),
    [props.resources],
  );
  /*
   * Every suggested change earns its own verdict through the same
   * engine as a drag, so a conflicted suggestion shows its note
   * before Apply, not after.
   */
  const proposalVerdicts = React.useMemo(() => {
    if (!proposalChanges || !props.validateChange) {
      return undefined;
    }
    return proposalChanges.map((change) =>
      props.validateChange?.(change.proposed, {
        end: change.proposed.end,
        resourceId: change.proposed.resourceId,
        start: change.proposed.start,
      }),
    );
  }, [proposalChanges, props.validateChange]);
  const blockedChangeIds = React.useMemo(() => {
    const ids = new Set<string>();
    proposalChanges?.forEach((change, index) => {
      if (proposalVerdicts?.[index]?.kind === "block") {
        ids.add(change.current.id);
      }
    });
    return ids;
  }, [proposalChanges, proposalVerdicts]);
  const [droppedChangeIds, setDroppedChangeIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set<string>());
  const [reviewView, setReviewView] = React.useState<"current" | "proposed">(
    "proposed",
  );
  const proposalRunId = props.proposal?.runId;
  React.useEffect(() => {
    // A new answer starts a fresh review.
    setDroppedChangeIds(new Set<string>());
    setReviewView("proposed");
  }, [proposalRunId]);
  const toggleDropped = React.useCallback((change: ProposalChange): void => {
    setDroppedChangeIds((previous) => {
      const next = new Set(previous);
      if (next.has(change.current.id)) {
        next.delete(change.current.id);
      } else {
        next.add(change.current.id);
      }
      return next;
    });
  }, []);
  const applicableChanges = React.useMemo(
    () =>
      proposalChanges?.filter(
        (change) =>
          !droppedChangeIds.has(change.current.id) &&
          !blockedChangeIds.has(change.current.id),
      ) ?? [],
    [blockedChangeIds, droppedChangeIds, proposalChanges],
  );
  // F40 Three-level score: the shifts left open and whether a Must
  // rule breaks, as the planner's drops leave the proposal.
  const proposalOpenCount = React.useMemo(
    () =>
      props.proposal && proposalChanges
        ? openShiftCount(props.proposal, proposalChanges, {
            blocked: blockedChangeIds,
            dropped: droppedChangeIds,
          })
        : 0,
    [blockedChangeIds, droppedChangeIds, proposalChanges, props.proposal],
  );
  const proposalMust = React.useMemo(
    () =>
      props.proposal
        ? proposalMustRules(props.proposal, {
            blocked: blockedChangeIds,
            dropped: droppedChangeIds,
          })
        : undefined,
    [blockedChangeIds, droppedChangeIds, props.proposal],
  );
  // High-level only (Matt): the canvas is the detail; the bar
  // carries counts.
  const proposalNoteCounts = React.useMemo(() => {
    let warn = 0;
    let block = 0;
    proposalVerdicts?.forEach((verdict) => {
      if (verdict?.kind === "warn") {
        warn += 1;
      } else if (verdict?.kind === "block") {
        block += 1;
      }
    });
    return { block, warn };
  }, [proposalVerdicts]);
  const preview = React.useMemo(
    () =>
      proposalChanges && reviewView === "proposed"
        ? previewProposal(
            [...props.events, ...(props.unscheduledEvents ?? [])],
            proposalChanges,
            { blocked: blockedChangeIds, dropped: droppedChangeIds },
          )
        : undefined,
    [
      blockedChangeIds,
      droppedChangeIds,
      proposalChanges,
      props.events,
      props.unscheduledEvents,
      reviewView,
    ],
  );
  const reviewing = proposalChanges !== undefined;
  const boardEvents = preview ? preview.scheduled : props.events;
  const boardUnscheduled = preview
    ? props.unscheduledEvents === undefined
      ? undefined
      : preview.unscheduled
    : props.unscheduledEvents;
  const canEdit = props.editable !== false && !reviewing;
  const canCreate = canEdit && Boolean(props.onCreateEvent);
  /* A running solve shows as progress with Cancel; the board stays live. */
  const solving =
    props.solveState?.status === "queued" ||
    props.solveState?.status === "running";
  const solveSeconds = useElapsedSeconds(solving);
  const solveProgress: SolveProgress | undefined = solving
    ? {
        label:
          props.solveState?.status === "queued"
            ? strings.solveQueued
            : strings.solveSolving,
        onCancel: props.onCancelSolve,
        seconds: solveSeconds,
      }
    : undefined;
  /*
   * Every delete path (menu, keyboard, dialog, group) funnels through
   * one confirmation - deletion is the one edit undo cannot honestly
   * reverse once a host has removed the row (found live in the F3
   * environment pass).
   */
  const [pendingDelete, setPendingDelete] = React.useState<
    readonly SchedulerUiEvent[] | undefined
  >();
  const requestDelete = React.useCallback(
    (targets: readonly SchedulerUiEvent[]): void => {
      const deletable = targets.filter(
        (target) => !isDeleteLocked(target),
      );
      if (deletable.length > 0) {
        setPendingDelete(deletable);
      }
    },
    [],
  );
  const confirmPendingDelete = (): void => {
    const targets = pendingDelete ?? [];
    setPendingDelete(undefined);
    if (targets.length === 0) {
      return;
    }
    if (targets.length === 1) {
      const only = targets[0];
      if (only) {
        props.onDeleteEvent?.(only);
      }
      return;
    }
    if (props.onDeleteEvents) {
      props.onDeleteEvents(targets);
    } else {
      for (const target of targets) {
        props.onDeleteEvent?.(target);
      }
    }
    props.onSelectionChange?.([]);
  };
  const handleDraftRange = React.useCallback(
    (result: DragResult): void => {
      // No creation handler means no create affordance: a dialog whose
      // Save has nowhere to go is worse than no dialog (found live in
      // the F3 environment pass when the host omitted onCreateEvent).
      if (!canCreate) {
        return;
      }
      setDraftRange(result);
    },
    [canCreate],
  );

  const draftDialogEvent = React.useMemo<SchedulerUiEvent | undefined>(
    () =>
      draftRange
        ? {
            end: draftRange.end,
            id: "__draft__",
            resourceId: draftRange.resourceId,
            start: draftRange.start,
            status: "assigned",
            title: "New item",
          }
        : undefined,
    [draftRange],
  );

  const allEvents = React.useMemo(
    () => boardEvents.concat(boardUnscheduled ?? []),
    [boardEvents, boardUnscheduled],
  );

  const groupSetOptions = React.useMemo(
    () =>
      groupSetNames(props.resources, [
        ...props.events,
        ...(props.unscheduledEvents ?? []),
      ]),
    [props.resources, props.events, props.unscheduledEvents],
  );

  /*
   * Internal clipboard: ctrl+C snapshots the selection, ctrl+V
   * materializes copies through the duplicate seam (copies keep their
   * original slots, Bryntum-style). Snapshots survive deletion of the
   * originals. Never intercepts typing surfaces or open dialogs.
   */
  const clipboardRef = React.useRef<readonly SchedulerUiEvent[]>([]);
  const selectedIdSet = React.useMemo(
    () => new Set(props.selectedEventIds ?? []),
    [props.selectedEventIds],
  );
  const {
    events,
    onDuplicateEvent,
    onDuplicateEvents,
  } = props;
  React.useEffect(() => {
    const handler = (keyEvent: KeyboardEvent): void => {
      if (!keyEvent.ctrlKey && !keyEvent.metaKey) {
        return;
      }
      const key = keyEvent.key.toLowerCase();
      if (key !== "c" && key !== "v") {
        return;
      }
      const target = keyEvent.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (dialogEvent || draftRange) {
        return;
      }
      if (key === "c") {
        const selected = events.filter((candidate) =>
          selectedIdSet.has(candidate.id),
        );
        if (selected.length > 0) {
          clipboardRef.current = selected;
        }
        return;
      }
      if (!canEdit || clipboardRef.current.length === 0) {
        return;
      }
      if (clipboardRef.current.length > 1 && onDuplicateEvents) {
        onDuplicateEvents(clipboardRef.current);
        return;
      }
      for (const event of clipboardRef.current) {
        onDuplicateEvent?.(event);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    events,
    selectedIdSet,
    dialogEvent,
    draftRange,
    canEdit,
    onDuplicateEvent,
    onDuplicateEvents,
  ]);
  const resourcesById = React.useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource])),
    [props.resources],
  );

  const findEvent = React.useCallback(
    (target: EventTarget | null): SchedulerUiEvent | undefined => {
      const element = (target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-event-id]",
      );
      const id = element?.dataset["eventId"];
      return id
        ? allEvents.find((candidate) => candidate.id === id)
        : undefined;
    },
    [allEvents],
  );

  const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  };

  const clearHover = React.useCallback((): void => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHover(undefined);
  }, []);

  React.useEffect(() => {
    if (drag.session) {
      clearHover();
      setMenu(undefined);
    }
  }, [drag.session, clearHover]);

  const openDialog = React.useCallback(
    (event: SchedulerUiEvent): void => {
      clearHover();
      setDialogEvent(event);
      props.onOpenEvent?.(event);
    },
    [clearHover, props],
  );

  const handleContextMenu = (
    contextEvent: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const event = findEvent(contextEvent.target);
    if (!event || isGhostEvent(event)) {
      return;
    }
    contextEvent.preventDefault();
    clearHover();
    const local = toLocal(contextEvent.clientX, contextEvent.clientY);
    openMenu(event, local.x, local.y);
  };

  // Lane bars open the same context menu on a plain click: the ruled
  // entry points are right-click and click, and a per-bar ellipsis
  // would not fit a dense lane.
  const handleLaneClick = (
    clickEvent: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const target = clickEvent.target as HTMLElement | null;
    if (!target?.closest(".chrona-sched__lane-bar")) {
      return;
    }
    const event = findEvent(clickEvent.target);
    if (!event || isGhostEvent(event)) {
      return;
    }
    clearHover();
    const local = toLocal(clickEvent.clientX, clickEvent.clientY);
    openMenu(event, local.x, local.y);
  };

  const handleMouseOver = (overEvent: React.MouseEvent<HTMLDivElement>): void => {
    if (drag.session || menu || dialogEvent) {
      return;
    }
    const element = (overEvent.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-event-id]",
    );
    const event = findEvent(overEvent.target);
    if (!event || !element || isGhostEvent(event)) {
      clearHover();
      return;
    }
    if (hover?.event.id === event.id) {
      return;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      if (!wrapperRect) {
        return;
      }
      setHover({
        anchor: {
          height: elementRect.height,
          left: elementRect.left - wrapperRect.left,
          top: elementRect.top - wrapperRect.top,
          width: elementRect.width,
        },
        bounds: { height: wrapperRect.height, width: wrapperRect.width },
        event,
      });
    }, hoverDelayMs);
  };

  const handleMouseOut = (outEvent: React.MouseEvent<HTMLDivElement>): void => {
    const from = findEvent(outEvent.target);
    const to = findEvent(outEvent.relatedTarget);
    if (from && from.id !== to?.id) {
      clearHover();
    }
  };

  const handleDoubleClick = (
    clickEvent: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const event = findEvent(clickEvent.target);
    if (event) {
      openDialog(event);
    }
  };

  const buildMenuItems = (event: SchedulerUiEvent): readonly ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (reviewing) {
      if (props.onOpenRecord) {
        const openRecord = props.onOpenRecord;
        items.push({
          id: "open-record",
          label: strings.menuOpenRecord,
          onSelect: () => openRecord(event),
        });
      }
      items.push({ id: "open", label: strings.menuOpen, onSelect: () => openDialog(event) });
      const change = proposalChanges?.find(
        (candidate) => candidate.current.id === event.id,
      );
      if (change && !blockedChangeIds.has(change.current.id)) {
        const dropped = droppedChangeIds.has(change.current.id);
        items.push({
          id: dropped ? "keep-change" : "drop-change",
          label: dropped ? strings.proposalKeepChange : strings.proposalDropChange,
          onSelect: () => toggleDropped(change),
        });
      }
      return items;
    }
    if (props.onOpenRecord) {
      const openRecord = props.onOpenRecord;
      items.push({
        id: "open-record",
        label: strings.menuOpenRecord,
        onSelect: () => openRecord(event),
      });
    }
    items.push({ id: "open", label: strings.menuOpen, onSelect: () => openDialog(event) });
    if (
      canEdit &&
      props.onAssignEvent &&
      event.status === "needsCover"
    ) {
      items.unshift({
        id: "assign",
        label: strings.menuAssign,
        onSelect: () => setAssignFor(event),
      });
    }
    if (canEdit && props.onDuplicateEvent) {
      items.push({
        id: "duplicate",
        label: strings.menuDuplicate,
        onSelect: () => props.onDuplicateEvent?.(event),
      });
    }
    if (
      canEdit &&
      props.onTogglePin &&
      event.status !== "needsCover"
    ) {
      const setPinned = (
        targets: readonly SchedulerUiEvent[],
        pinned: boolean,
      ): void => {
        if (props.onSetPinned) {
          props.onSetPinned(targets, pinned);
          return;
        }
        for (const target of targets) {
          props.onTogglePin?.(target);
        }
      };
      const inSelection =
        selectedIdSet.has(event.id) && selectedIdSet.size > 1;
      if (!inSelection) {
        items.push({
          id: "pin",
          label: isLocked(event) ? strings.menuUnpin : strings.menuPin,
          onSelect: () => setPinned([event], !isLocked(event)),
        });
      } else {
        // A mixed selection offers both directions, each acting only on
        // the members that actually change.
        const selected = props.events.filter(
          (candidate) =>
            selectedIdSet.has(candidate.id) &&
            candidate.status !== "needsCover",
        );
        const toPin = selected.filter((candidate) => !isLocked(candidate));
        const toUnpin = selected.filter((candidate) => isLocked(candidate));
        if (toPin.length > 0) {
          items.push({
            id: "pin",
            label:
              toPin.length === 1
                ? strings.menuPin
                : formatString(strings.menuPinCount, {
                    count: toPin.length,
                  }),
            onSelect: () => setPinned(toPin, true),
          });
        }
        if (toUnpin.length > 0) {
          items.push({
            id: "unpin",
            label:
              toUnpin.length === 1
                ? strings.menuUnpin
                : formatString(strings.menuUnpinCount, {
                    count: toUnpin.length,
                  }),
            onSelect: () => setPinned(toUnpin, false),
          });
        }
      }
    }
    if (
      canEdit &&
      (props.onEventsChange || props.onEventChange) &&
      event.status !== "needsCover"
    ) {
      // Field Service-style explicit group actions: act on the whole
      // selection when the right-clicked event is part of one. Locked
      // members sit out PER DIMENSION - "Move to..." only changes times,
      // so a resource-locked booking still moves; "Reassign to..." only
      // changes the assignee, so a time-locked booking still reassigns.
      // A fully locked event yields two empty lists and neither action.
      const inSelection =
        selectedIdSet.has(event.id) && selectedIdSet.size > 1;
      const candidates = inSelection
        ? props.events.filter(
            (candidate) =>
              selectedIdSet.has(candidate.id) &&
              candidate.status !== "needsCover",
          )
        : [event];
      const moveTargets = candidates.filter(
        (candidate) => !isTimeLocked(candidate),
      );
      const reassignTargets = candidates.filter(
        (candidate) => !isResourceLocked(candidate),
      );
      if (moveTargets.length > 0) {
        items.push({
          id: "move-to",
          label:
            moveTargets.length === 1
              ? strings.menuMoveTo
              : formatString(strings.menuMoveToCount, {
                  count: moveTargets.length,
                }),
          onSelect: () => setGroupAction({ events: moveTargets, kind: "move" }),
        });
      }
      if (reassignTargets.length > 0) {
        items.push({
          id: "reassign-to",
          label:
            reassignTargets.length === 1
              ? strings.menuReassign
              : formatString(strings.menuReassignCount, {
                  count: reassignTargets.length,
                }),
          onSelect: () =>
            setGroupAction({ events: reassignTargets, kind: "reassign" }),
        });
      }
    }
    if (
      canEdit &&
      props.onUnscheduleEvent &&
      event.status !== "needsCover" &&
      !isDeleteLocked(event)
    ) {
      items.push({
        id: "unschedule",
        label: strings.menuUnschedule,
        onSelect: () => setPendingUnschedule(event),
      });
    }
    if (canEdit && props.onDeleteEvent && !isDeleteLocked(event)) {
      // Right-clicking inside a multi-selection deletes the whole group;
      // pinned members are protected and sit deletion out.
      const groupDelete =
        selectedIdSet.has(event.id) && selectedIdSet.size > 1;
      const selectedEvents = props.events.filter(
        (candidate) => selectedIdSet.has(candidate.id) && !isDeleteLocked(candidate),
      );
      items.push({
        danger: true,
        id: "delete",
        label: groupDelete
          ? formatString(strings.menuDeleteCount, {
              count: selectedEvents.length,
            })
          : strings.delete,
        onSelect: () =>
          requestDelete(groupDelete ? selectedEvents : [event]),
      });
    }
    return items.concat(
      props.contextMenuItems?.(event) ?? [],
      loadedMenuItems?.eventId === event.id ? loadedMenuItems.items : [],
    );
  };

  const panelAllowed =
    (props.view === "timeline" || props.view === "topDown") &&
    props.unscheduledEvents !== undefined;
  const showPanel = panelAllowed && (props.unscheduledPanelVisible ?? true);

  const renderView = (): JSX.Element => {
    if (props.view === "roster") {
      return (
        <ChronaRoster
          editable={canEdit}
          events={boardEvents}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          resources={props.resources}
          showWeekends={props.showWeekends}
          statusColorRules={props.statusColorRules}
          today={props.today}
          validateChange={props.validateChange}
          window={props.window}
        />
      );
    }
    if (props.view === "topDown") {
      return (
        <TopDownView
          draftRange={draftRange}
          editable={canEdit}
          events={boardEvents}
          hourFormat={props.hourFormat}
          onDraftRange={canCreate ? handleDraftRange : undefined}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          pxPerHourVertical={pxPerHourVertical}
          resources={props.resources}
          slotMinutes={effectiveSlotMinutes}
          snapMinutes={effectiveSlotMinutes}
          statusColorRules={props.statusColorRules}
          today={props.today}
          validateChange={props.validateChange}
          window={props.window}
        />
      );
    }
    if (props.view === "day" || props.view === "week") {
      return (
        <DayColumnsView
          editable={canEdit}
          events={boardEvents}
          hourFormat={props.hourFormat}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          pxPerHourVertical={pxPerHourVertical}
          resources={props.resources}
          showWeekends={props.showWeekends}
          slotMinutes={effectiveSlotMinutes}
          snapMinutes={effectiveSlotMinutes}
          statusColorRules={props.statusColorRules}
          today={props.today}
          validateChange={props.validateChange}
          window={props.window}
        />
      );
    }
    if (props.view === "month") {
      return (
        <MonthView
          anchor={props.window.start}
          editable={canEdit}
          events={boardEvents}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          showWeekends={props.showWeekends}
          statusColorRules={props.statusColorRules}
          today={props.today}
          validateChange={props.validateChange}
        />
      );
    }
    if (props.view === "agenda") {
      return (
        <AgendaView
          events={boardEvents}
          onEventClick={props.onEventClick}
          resources={props.resources}
          window={props.window}
        />
      );
    }
    return (
      <ChronaTimeline
        periodBoundaries={periodBoundaries}
        config={effectiveConfig}
        coverageSliceMinutes={props.coverageSliceMinutes}
        decorations={props.decorations}
        demand={props.demand}
        draftRange={draftRange}
        editable={canEdit}
        events={boardEvents}
        groupBy={props.groupBy}
        hourFormat={props.hourFormat}
        initialScrollHour={props.initialScrollHour}
        labelColumnWidth={props.resourceColumnWidth}
        now={props.now}
        onDeleteEvent={
          props.onDeleteEvent
            ? (event) => requestDelete([event])
            : undefined
        }
        onDeleteEvents={
          props.onDeleteEvent || props.onDeleteEvents
            ? (doomed) => requestDelete(doomed)
            : undefined
        }
        onDraftRange={canCreate ? handleDraftRange : undefined}
        onEventChange={props.onEventChange}
        onEventsChange={props.onEventsChange}
        onEventClick={props.onEventClick}
        onLabelColumnWidthChange={props.onResourceColumnWidthChange}
        onOpenEvent={openDialog}
        onSelectionChange={props.onSelectionChange}
        onZoomChange={props.onZoomChange}
        resources={props.resources}
        scrollToRequest={scrollRequest}
        selectedEventIds={props.selectedEventIds}
        slotMinutes={effectiveSlotMinutes}
        statusColorRules={props.statusColorRules}
        tagColors={props.tagColors}
        unscheduledEvents={props.unscheduledEvents}
        today={props.today}
        validateChange={props.validateChange}
        window={props.window}
      />
    );
  };


  /*
   * The roster period the planner is in: derived from config plus the
   * navigation anchor (window start when no toolbar). Boundaries mark
   * where one block ends on the canvas.
   */
  const currentPeriod = React.useMemo(
    () =>
      props.periodConfig
        ? periodContaining(
            props.periodConfig,
            props.anchor ?? props.window.start,
          )
        : undefined,
    [props.anchor, props.periodConfig, props.window.start],
  );
  const periodBoundaries = React.useMemo(
    () =>
      props.periodConfig
        ? periodBoundariesInRange(
            props.periodConfig,
            props.window.start,
            props.window.end,
          )
        : undefined,
    [props.periodConfig, props.window.end, props.window.start],
  );
  const periodDay = React.useMemo(
    () =>
      currentPeriod
        ? dayOfPeriod(currentPeriod, props.anchor ?? props.window.start)
        : undefined,
    [currentPeriod, props.anchor, props.window.start],
  );
  const formatPeriodDate = (date: Date): string =>
    formatDateLabel(date, dateNamesFrom(strings));
  const stepToPeriod = (direction: -1 | 1): void => {
    if (!props.periodConfig || !props.onAnchorChange) {
      return;
    }
    const next = stepPeriod(
      props.periodConfig,
      props.anchor ?? props.window.start,
      direction,
    );
    props.onAnchorChange(next.start);
  };

  const handleNewEvent = (): void => {
    // No lane yet: the draft goes to the host's unassigned id when it has one.
    const resourceId = props.resources[0]?.id ?? props.unassignedResourceId;
    if (!resourceId) {
      return;
    }
    const start = new Date(props.window.start.getTime());
    start.setHours(9, 0, 0, 0);
    if (
      start.getTime() < props.window.start.getTime() ||
      start.getTime() >= props.window.end.getTime()
    ) {
      start.setTime(props.window.start.getTime());
    }
    setDraftRange({
      end: new Date(start.getTime() + 3_600_000),
      resourceId,
      start,
    });
  };

  const toolbarAnchor = props.anchor;
  const toolbarAnchorChange = props.onAnchorChange;
  const toolbarInterval = props.interval;
  const toolbarIntervalChange = props.onIntervalChange;

  return (
    <div
      className="chrona-sched__shell"
      onClick={handleLaneClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseOut={handleMouseOut}
      onMouseOver={handleMouseOver}
      ref={wrapperRef}
    >
      {toolbarAnchor &&
      toolbarAnchorChange &&
      toolbarInterval &&
      toolbarIntervalChange ? (
        <SchedulerToolbar
          activeViewId={props.activeViewId}
          anchor={toolbarAnchor}
          modeToggle={
            props.planning && props.planning.modes === "both"
              ? {
                  activeMode: props.planning.activeMode,
                  onModeChange: (mode) =>
                    props.planning?.onModeChange?.(mode),
                }
              : undefined
          }
          undoRedo={props.undoRedo}
          settings={props.onOpenSettings ? { onOpen: props.onOpenSettings } : undefined}
          conversionOptimize={
            conversionVisible
              ? { onOpen: () => setConversionOpen(true) }
              : undefined
          }
          generate={props.generation ? { onOpen: openGenerate } : undefined}
          groupBy={
            props.onGroupByChange
              ? {
                  onChange: props.onGroupByChange,
                  options: groupSetOptions,
                  value: (props.groupBy ?? groupSetOptions.slice(0, 1))[0],
                }
              : undefined
          }
          daySpanDays={props.navigationStepDays}
          interval={toolbarInterval}
          intervals={props.intervals}
          onAnchorChange={toolbarAnchorChange}
          onIntervalChange={toolbarIntervalChange}
          onActiveViewChange={props.onActiveViewChange}
          onNewEvent={
            canEdit && props.onCreateEvent
              ? handleNewEvent
              : undefined
          }
          timeScale={
            resolvedScale.visible && props.onSlotMinutesChange
              ? {
                  effective: effectiveSlotMinutes,
                  onChange: props.onSlotMinutesChange,
                  options: resolvedScale.options,
                }
              : undefined
          }
          timeZoneLabel={props.timeZoneLabel}
          today={props.today}
          views={props.views}
          window={props.window}
        />
      ) : null}
      {props.planning ? (
        <PlanningChrome
          optimize={
            props.onRequestSolve && props.planning.activeMode === "plan"
              ? {
                  disabled: false,
                  label: strings.optimizePeriod,
                  onClick: props.onRequestSolve,
                  progress: solveProgress,
                }
              : undefined
          }
          planning={props.planning}
        />
      ) : null}
      {!props.planning && currentPeriod && periodDay ? (
        <div className="chrona-sched__period-bar" data-testid="period-bar">
          {props.onAnchorChange ? (
            <button
              aria-label={strings.periodPrevious}
              className="chrona-sched__toolbar-button chrona-sched__toolbar-arrow"
              onClick={() => stepToPeriod(-1)}
              type="button"
            >
              &#8249;
            </button>
          ) : null}
          <span className="chrona-sched__toolbar-label chrona-sched__period-chip">
            {formatPeriodDate(currentPeriod.start)}
            {" – "}
            {formatPeriodDate(new Date(currentPeriod.end.getTime() - 1))}
            {" · "}
            {formatString(strings.periodOf, {
              day: String(periodDay.day),
              days: String(periodDay.days),
            })}
          </span>
          {props.onAnchorChange ? (
            <button
              aria-label={strings.periodNext}
              className="chrona-sched__toolbar-button chrona-sched__toolbar-arrow"
              onClick={() => stepToPeriod(1)}
              type="button"
            >
              &#8250;
            </button>
          ) : null}
        </div>
      ) : null}
      {props.dataNotice ? (
        <div
          className="chrona-sched__horizon-notice"
          data-testid="data-notice"
          role="status"
        >
          <span>{props.dataNotice}</span>
        </div>
      ) : null}
      {props.resumeRun ? (
        <div
          className="chrona-sched__horizon-notice chrona-sched__resume-notice"
          data-testid="resume-notice"
          role="status"
        >
          <span>
            {props.resumeRun.kind === "running"
              ? strings.resumeRunning
              : props.resumeRun.kind === "changed"
                ? strings.resumeChanged
                : strings.resumeFinished}
          </span>
          <span className="chrona-sched__resume-actions">
            {props.resumeRun.onReview ? (
              <button
                className="chrona-sched__toolbar-primary chrona-sched__resume-review"
                data-testid="resume-review"
                onClick={props.resumeRun.onReview}
                type="button"
              >
                {props.resumeRun.kind === "running"
                  ? strings.resumeFollow
                  : strings.resumeReview}
              </button>
            ) : null}
            <button
              className="chrona-sched__toolbar-button"
              data-testid="resume-discard"
              onClick={props.resumeRun.onDiscard}
              type="button"
            >
              {strings.resumeDiscard}
            </button>
          </span>
        </div>
      ) : null}
      {props.entitlement?.kind === "lapsed" ? (
        <div
          className="chrona-sched__horizon-notice chrona-sched__horizon-notice--warning"
          data-testid="entitlement-notice"
          role="status"
        >
          <span>{strings.entitlementLapsed}</span>
          {props.entitlement.planUrl ? (
            <span className="chrona-sched__resume-actions">
              <a
                className="chrona-sched__toolbar-button chrona-sched__entitlement-action"
                data-testid="entitlement-plan-link"
                href={props.entitlement.planUrl}
                rel="noreferrer"
                target="_blank"
              >
                {strings.entitlementPlanUsage}
              </a>
            </span>
          ) : null}
        </div>
      ) : null}
      {props.onRequestSolve || props.solveState || props.entitlement ? (
        <div className="chrona-sched__solve-bar">
          {props.onRequestSolve && !props.planning ? (
            solveProgress ? (
              <SolveProgressIndicator progress={solveProgress} />
            ) : (
              <button
                className="chrona-sched__toolbar-primary chrona-sched__solve-button"
                onClick={props.onRequestSolve}
                type="button"
              >
                {strings.solve}
              </button>
            )
          ) : null}
          {/* A 402 renders as the calm quota notice below when a free
              allowance is shown; without one (paid tiers) the server's
              own message is the honest line. */}
          {props.solveState?.status === "failed" &&
          !(props.solveState.reason === "quota" && props.solveQuota) ? (
            <span className="chrona-sched__solve-error" role="alert">
              {formatString(strings.solveFailed, {
                message: props.solveState.message ?? "",
              })}
            </span>
          ) : null}
          {props.solveCapabilities && props.solveCapabilities.length > 0 ? (
            <span
              className="chrona-sched__solve-capabilities"
              data-testid="solve-capabilities"
            >
              {formatString(strings.solveCapabilitiesLine, {
                list: formatCapabilityList(strings, props.solveCapabilities),
              })}
            </span>
          ) : null}
          {/* F19/F22 deliverable 3 (Q6-A): quota is ATTENTION, never
              error - the solve button stays enabled, the wall is a
              door. The counter shows while solves remain; the calm
              notice replaces it at zero or on a server 402. */}
          {props.solveQuota &&
          (props.solveQuota.remainingSolves <= 0 ||
            props.solveState?.reason === "quota") ? (
            <span
              className="chrona-sched__solve-quota-notice"
              data-testid="solve-quota-notice"
              role="status"
            >
              {strings.solveQuotaExhausted}
              {props.solveQuota.onUpgrade ? (
                <button
                  className="chrona-sched__solve-quota-upgrade"
                  data-testid="solve-quota-upgrade"
                  onClick={props.solveQuota.onUpgrade}
                  type="button"
                >
                  {strings.solveQuotaUpgrade}
                </button>
              ) : null}
            </span>
          ) : props.solveQuota ? (
            <span
              className="chrona-sched__solve-quota"
              data-testid="solve-quota-count"
            >
              {formatString(strings.solveQuotaRemaining, {
                limit: props.solveQuota.dailySolveLimit,
                remaining: props.solveQuota.remainingSolves,
              })}
            </span>
          ) : null}
          {/* F27 stage 2: never modal, never blocking. The ladder: lapsed
              is the warning bar above; paused and grace are warning
              chips (paused with Retry); a count at the ceiling is a
              warning chip; the metric is quiet metadata and a link. */}
          {props.entitlement?.kind === "paused" ? (
            <>
              <span
                className="chrona-sched__progress-chip chrona-sched__progress-chip--late"
                data-testid="entitlement-chip"
                role="status"
              >
                {formatString(strings.entitlementPaused, {
                  since: props.entitlement.pausedSince
                    ? formatDayTimeLabel(props.entitlement.pausedSince, dateNamesFrom(strings))
                    : "",
                })}
              </span>
              {props.entitlement.onRetry ? (
                <button
                  className="chrona-sched__solve-quota-upgrade"
                  data-testid="entitlement-retry"
                  onClick={props.entitlement.onRetry}
                  type="button"
                >
                  {strings.entitlementRetry}
                </button>
              ) : null}
            </>
          ) : props.entitlement?.kind === "grace" ? (
            <span
              className="chrona-sched__progress-chip chrona-sched__progress-chip--late"
              data-testid="entitlement-chip"
              role="status"
            >
              {formatString(strings.entitlementGrace, {
                date: props.entitlement.graceUntil
                  ? formatDateLabel(props.entitlement.graceUntil, dateNamesFrom(strings))
                  : "",
              })}
            </span>
          ) : null}
          {props.entitlement &&
          props.entitlement.kind !== "lapsed" &&
          props.entitlement.resourcesScheduled !== undefined ? (
            props.entitlement.aboveCeiling && props.entitlement.resourcesIncluded !== undefined ? (
              <span
                className="chrona-sched__progress-chip chrona-sched__progress-chip--late"
                data-testid="entitlement-metrics"
                role="status"
              >
                {formatString(strings.entitlementResourcesAbovePlan, {
                  included: props.entitlement.resourcesIncluded,
                  scheduled: props.entitlement.resourcesScheduled,
                })}
              </span>
            ) : (
              <span className="chrona-sched__solve-quota" data-testid="entitlement-metrics">
                {props.entitlement.resourcesIncluded !== undefined
                  ? formatString(strings.entitlementResources, {
                      included: props.entitlement.resourcesIncluded,
                      scheduled: props.entitlement.resourcesScheduled,
                    })
                  : formatString(strings.entitlementResourcesNoCeiling, {
                      scheduled: props.entitlement.resourcesScheduled,
                    })}
              </span>
            )
          ) : null}
          {props.entitlement?.planUrl ?? planUsageUrl(props.solveQuota?.portalUrl) ? (
            <a
              className="chrona-sched__account-link"
              data-testid="plan-usage-link"
              href={props.entitlement?.planUrl ?? planUsageUrl(props.solveQuota?.portalUrl)}
              rel="noreferrer"
              target="_blank"
            >
              {strings.entitlementPlanUsage}
            </a>
          ) : null}
        </div>
      ) : null}
      {proposalChanges ? (
        <div
          className="chrona-sched__proposal-bar"
          data-testid="proposal-bar"
          role="region"
        >
          <span className="chrona-sched__proposal-count">
            {proposalChanges.length === 0
              ? strings.proposalEmpty
              : proposalChanges.length === 1
                ? strings.proposalChangeOne
                : formatString(strings.proposalChanges, {
                    count: String(proposalChanges.length),
                  })}
          </span>
          {proposalMust ? (
            <span
              className={
                proposalMust === "broken"
                  ? "chrona-sched__proposal-note--block"
                  : undefined
              }
              data-testid="proposal-must"
            >
              {proposalMust === "broken"
                ? strings.proposalMustBroken
                : strings.proposalMustKept}
            </span>
          ) : null}
          {proposalOpenCount > 0 ? (
            <span
              className="chrona-sched__proposal-note--warn"
              data-testid="proposal-open"
            >
              {proposalOpenCount === 1
                ? strings.proposalOpenOne
                : formatString(strings.proposalOpenMany, {
                    count: String(proposalOpenCount),
                  })}
            </span>
          ) : null}
          {proposalNoteCounts.warn > 0 ? (
            <span className="chrona-sched__proposal-note--warn">
              {formatString(strings.proposalNotes, {
                count: String(proposalNoteCounts.warn),
              })}
            </span>
          ) : null}
          {proposalNoteCounts.block > 0 ? (
            <span className="chrona-sched__proposal-note--block">
              {formatString(strings.proposalBlocked, {
                count: String(proposalNoteCounts.block),
              })}
            </span>
          ) : null}
          {droppedChangeIds.size > 0 ? (
            <span
              className="chrona-sched__proposal-note--dropped"
              data-testid="proposal-dropped"
            >
              {formatString(strings.proposalDropped, {
                count: String(droppedChangeIds.size),
              })}
            </span>
          ) : null}
          {proposalChanges.length > 0 ? (
            <span
              aria-label={strings.proposalPanelTitle}
              className="chrona-sched__mode-pill"
              role="tablist"
            >
              <button
                aria-selected={reviewView === "current"}
                className="chrona-sched__mode-tab"
                data-testid="review-current"
                onClick={() => setReviewView("current")}
                role="tab"
                type="button"
              >
                {strings.proposalShowCurrent}
              </button>
              <button
                aria-selected={reviewView === "proposed"}
                className="chrona-sched__mode-tab"
                data-testid="review-proposed"
                onClick={() => setReviewView("proposed")}
                role="tab"
                type="button"
              >
                {strings.proposalShowProposed}
              </button>
            </span>
          ) : null}
          <span className="chrona-sched__proposal-hint">
            {strings.proposalReviewHint}
          </span>
          {props.onPublishProposal ? (
            <button
              className="chrona-sched__toolbar-primary chrona-sched__proposal-apply"
              data-testid="proposal-apply"
              disabled={applicableChanges.length === 0}
              onClick={() => props.onPublishProposal?.(applicableChanges)}
              type="button"
            >
              {strings.proposalApply}
            </button>
          ) : null}
          {props.onDiscardProposal ? (
            <button
              className="chrona-sched__toolbar-button chrona-sched__proposal-discard"
              data-testid="proposal-discard"
              onClick={props.onDiscardProposal}
              type="button"
            >
              {strings.proposalDiscard}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="chrona-sched__layout">
        {renderView()}
        {proposalChanges && proposalChanges.length > 0 ? (
          <ProposalPanel
            entries={proposalChanges.map((change, index) => ({
              change,
              dropped: droppedChangeIds.has(change.current.id),
              verdict: proposalVerdicts?.[index],
            }))}
            onFocus={(change) => {
              props.onAnchorChange?.(change.proposed.start);
              setScrollRequest((previous) => ({
                date: change.proposed.start,
                nonce: (previous?.nonce ?? 0) + 1,
              }));
              props.onSelectionChange?.([change.current.id]);
            }}
            onToggleDrop={toggleDropped}
            resourceNameById={resourceNameById}
          />
        ) : null}
        {showPanel && boardUnscheduled ? (
          <UnscheduledPanel
            events={
              props.undatedEvents && props.undatedEvents.length > 0
                ? [...boardUnscheduled, ...props.undatedEvents]
                : boardUnscheduled
            }
            filter={props.unscheduledFilter}
            onFilterChange={props.onUnscheduledFilterChange}
            onItemClick={(event) => {
              // Clicking an open shift brings its date into view: the
              // anchor moves the window, the scroll request positions
              // the canvas at the item's start. An undated row has no date to show.
              if (event.undated) {
                props.onEventClick?.(event);
                return;
              }
              props.onAnchorChange?.(event.start);
              setScrollRequest((previous) => ({
                date: event.start,
                nonce: (previous?.nonce ?? 0) + 1,
              }));
              props.onEventClick?.(event);
            }}
            onClose={
              props.onUnscheduledPanelVisibleChange
                ? () => props.onUnscheduledPanelVisibleChange?.(false)
                : undefined
            }
            groupSet={(props.groupBy ?? groupSetOptions.slice(0, 1))[0]}
            onWidthChange={props.onUnscheduledPanelWidthChange}
            tagColors={props.tagColors}
            width={props.unscheduledPanelWidth}
            window={props.window}
          />
        ) : null}
        {panelAllowed &&
        !showPanel &&
        props.unscheduledEvents !== undefined &&
        props.onUnscheduledPanelVisibleChange ? (
          <button
            aria-expanded={false}
            className="chrona-sched__panel-reopen"
            data-testid="panel-reopen"
            onClick={() => props.onUnscheduledPanelVisibleChange?.(true)}
            type="button"
          >
            {formatString(strings.unscheduledToggle, {
              count: props.unscheduledEvents.length,
            })}
          </button>
        ) : null}
      </div>
      {props.showLegend !== false ? (
        <SchedulerLegend
          decorations={props.view === "timeline" ? props.decorations : undefined}
          events={allEvents}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          items={buildMenuItems(menu.event)}
          onClose={() => {
            setMenu(undefined);
            setLoadedMenuItems(undefined);
          }}
          x={menu.x}
          y={menu.y}
        />
      ) : null}
      {hover && !menu && !dialogEvent ? (
        <EventHoverCard
          anchor={hover.anchor}
          bounds={hover.bounds}
          event={hover.event}
          resource={resourcesById.get(hover.event.resourceId)}
        />
      ) : null}
      {dialogEvent ? (
        <EventDialog
          availableTags={props.availableTags}
          tagMode={props.tagMode}
          isPreferredResource={props.isPreferredResource}
          onRequiredTagsChange={props.onRequiredTagsChange}
          editable={canEdit}
          event={dialogEvent}
          onClose={() => setDialogEvent(undefined)}
          onDeleteEvent={
            props.onDeleteEvent
              ? (event) => {
                  setDialogEvent(undefined);
                  requestDelete([event]);
                }
              : undefined
          }
          onEventChange={props.onEventChange}
          onTogglePin={props.onTogglePin}
          resources={props.resources}
          tagColors={props.tagColors}
          validateChange={props.validateChange}
        />
      ) : null}
      {pendingDelete ? (
        <div
          className="chrona-sched__dialog-backdrop"
          onClick={() => setPendingDelete(undefined)}
        >
          <div
            aria-label={strings.deleteConfirmTitle}
            className="chrona-sched__dialog chrona-sched__confirm-dialog"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            role="alertdialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {strings.deleteConfirmTitle}
              </span>
            </div>
            <p>
              {pendingDelete.length === 1
                ? formatString(strings.deleteConfirmMessage, {
                    title: pendingDelete[0]?.title ?? "",
                  })
                : formatString(strings.deleteConfirmCount, {
                    count: pendingDelete.length,
                  })}
            </p>
            <div className="chrona-sched__dialog-actions">
              <button
                onClick={() => setPendingDelete(undefined)}
                type="button"
              >
                {strings.cancel}
              </button>
              <button
                className="chrona-sched__dialog-danger-primary"
                onClick={confirmPendingDelete}
                type="button"
              >
                {strings.deleteConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingUnschedule ? (
        <div className="chrona-sched__dialog-backdrop">
          <div
            aria-label={strings.unscheduleConfirmTitle}
            className="chrona-sched__confirm-dialog"
            role="alertdialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {strings.unscheduleConfirmTitle}
              </span>
            </div>
            <p>
              {formatString(strings.unscheduleConfirmMessage, {
                title: pendingUnschedule.title,
              })}
            </p>
            <div className="chrona-sched__dialog-actions">
              <button
                onClick={() => setPendingUnschedule(undefined)}
                type="button"
              >
                {strings.cancel}
              </button>
              <button
                className="chrona-sched__dialog-primary"
                data-testid="confirm-unschedule"
                onClick={() => {
                  props.onUnscheduleEvent?.(pendingUnschedule);
                  setPendingUnschedule(undefined);
                }}
                type="button"
              >
                {strings.unscheduleConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {generateWindow ? (
        <div
          className="chrona-sched__dialog-backdrop"
          onClick={() => setGenerateWindow(undefined)}
        >
          <div
            aria-label={strings.generateWindowTitle}
            className="chrona-sched__dialog chrona-sched__confirm-dialog"
            data-testid="generate-window-dialog"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            role="dialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {strings.generateWindowTitle}
              </span>
            </div>
            <p>{strings.generateWindowIntro}</p>
            <div className="chrona-sched__dialog-fields">
              <label className="chrona-sched__dialog-field">
                <span>{strings.generateWindowFrom}</span>
                <input
                  data-testid="generate-window-start"
                  onChange={(changeEvent) =>
                    setGenerateWindow((current) =>
                      current ? { ...current, start: changeEvent.target.value } : current,
                    )
                  }
                  type="date"
                  value={generateWindow.start}
                />
              </label>
              <label className="chrona-sched__dialog-field">
                <span>{strings.generateWindowTo}</span>
                <input
                  data-testid="generate-window-end"
                  onChange={(changeEvent) =>
                    setGenerateWindow((current) =>
                      current ? { ...current, end: changeEvent.target.value } : current,
                    )
                  }
                  type="date"
                  value={generateWindow.end}
                />
              </label>
            </div>
            <div className="chrona-sched__dialog-actions">
              <button onClick={() => setGenerateWindow(undefined)} type="button">
                {strings.cancel}
              </button>
              <button
                className="chrona-sched__dialog-primary"
                data-testid="generate-window-confirm"
                onClick={confirmGenerate}
                type="button"
              >
                {strings.generateWindowAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {conversionOpen && conversion ? (
        <ConversionDialog
          capabilities={props.solveCapabilities}
          decorations={props.decorations}
          events={props.events}
          onClose={() => setConversionOpen(false)}
          onConnect={conversion.onConnect}
          onLearnMore={conversion.onLearnMore}
          portalUrl={conversion.portalUrl}
          resources={props.resources}
          unscheduledEvents={props.unscheduledEvents}
          window={props.window}
        />
      ) : null}
      {assignFor && props.onAssignEvent ? (
        <AssignDialog
          decorations={props.decorations}
          event={assignFor}
          events={props.events}
          onAssign={(resourceId) => {
            props.onAssignEvent?.(assignFor, resourceId);
            setAssignFor(undefined);
          }}
          onClose={() => setAssignFor(undefined)}
          resources={props.resources}
          tagColors={props.tagColors}
        />
      ) : null}
      {groupAction ? (
        <GroupActionDialog
          events={groupAction.events}
          kind={groupAction.kind}
          onApply={(changes) => {
            if (changes.length > 1 && props.onEventsChange) {
              props.onEventsChange(changes);
            } else {
              for (const change of changes) {
                props.onEventChange?.(change);
              }
            }
          }}
          onClose={() => setGroupAction(undefined)}
          resources={props.resources}
          validateChange={props.validateChange}
        />
      ) : null}
      {draftDialogEvent ? (
        <EventDialog
          availableTags={props.availableTags}
          tagMode={props.tagMode}
          isPreferredResource={props.isPreferredResource}
          onRequiredTagsChange={props.onRequiredTagsChange}
          editable
          event={draftDialogEvent}
          mode="create"
          onClose={() => setDraftRange(undefined)}
          onSaveDraft={(draft) => {
            props.onCreateEvent?.(draft);
            setDraftRange(undefined);
          }}
          resources={props.resources}
          tagColors={props.tagColors}
          validateChange={props.validateChange}
        />
      ) : null}
    </div>
  );
}

export function SchedulerSurface(props: SchedulerSurfaceProps): JSX.Element {
  return (
    <div
      className="chrona-sched"
      style={props.theme ? themeToCssVariables(props.theme) : undefined}
    >
      <DragProvider>
        <SchedulerStringsProvider strings={props.strings}>
          <InteractionShell {...props} />
        </SchedulerStringsProvider>
      </DragProvider>
      <div aria-live="polite" className="chrona-sched__live" role="status">
        {props.announcement}
      </div>
    </div>
  );
}

import * as React from "react";
import { Button, Switch } from "@fluentui/react-components";
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  Eye20Regular,
  PanelRightExpand20Regular,
  Warning16Regular,
} from "@fluentui/react-icons";

import { AgendaView } from "./AgendaView";
import {
  ChronaRoster,
  rosterDayWidthPx,
  rosterPeopleWidthPx,
} from "./ChronaRoster";
import { ChronaTimeline, type TimelineChange } from "./ChronaTimeline";
import { ConversionDialog } from "./ConversionDialog";
import type { SolveCapability } from "./capabilities";
import { formatCapabilityList } from "./capabilityText";
import { groupSetNames } from "./groupSets";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { RowDecoration } from "./decorations";
import { dateNamesFrom, formatDateLabel, formatDayTimeLabel } from "./dateNames";
import { planUsageUrl, type EntitlementDisplay } from "./entitlement";
import { DragProvider, useDragController } from "./dragContext";
import {
  BoardExtensionProvider,
  useBoardExtension,
  type BoardExtension,
  type BoardState,
} from "./extension";
import { BoardEventDialog, type DraftEventInput } from "./EventDialog";
import { EventHoverCard, type HoverAnchorRect } from "./EventHoverCard";
import { buildRosterDays } from "./rosterLayout";
import { BoardLookProvider, DialogLayer, type BoardLook } from "./dialogLayer";
import { FullScreenProvider, useFullScreen, useFullScreenRoot } from "./fullScreen";
import {
  GroupActionDialog,
  type GroupActionKind,
} from "./GroupActionDialog";
import {
  isDeleteLocked,
  isPinned,
  showsPin,
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
  applyProposalChanges,
  diffProposal,
  isGhostEvent,
  mustRowMatches,
  openOnCallAfter,
  openShiftsAfter,
  previewProposal,
  proposalDoubleBookings,
  proposalMustReport,
  proposalMustRules,
  proposalScore,
  type AppliedOutcome,
  type MustRow,
  type ProposalChange,
  type ProposalDoubleBooking,
  type ProposalPreviewOptions,
  type ScheduleProposal,
  type ResumeRunDisplay,
  type SolveProgress,
  type SolveQuotaDisplay,
  type SolveState,
} from "./solve";
import { ProposalPanel, type ProposalDrillDown } from "./ProposalPanel";
import { leftOpenNotes, mustRowLabel, ProposalScorecard } from "./ProposalScorecard";
import { drillDownEntries, personFixCounts, proposalReasons } from "./proposalReasons";
import { mustBreachTotal, type ScheduleRuleMatch } from "./schedulingContract";
import { WhyNotGroup } from "./WhyNotGroup";
import { rosterVersionOf, whyNotAction, type WhyNotAction } from "./whyNot";
import { SolveProgressIndicator, useElapsedSeconds } from "./SolveProgress";
import { SchedulerLegend } from "./SchedulerLegend";
import { SchedulerToolbar } from "./SchedulerToolbar";
import { colorSchemeOf, themeToCssVariables, type SchedulerTheme } from "./theme";
import { BoardLocaleProvider } from "./boardLocale";
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
import { allowVerdict, type DragResult, type ValidateChange } from "./interactions";
import type { RulePolicy } from "./scheduleRules";
import {
  drawsOneDay,
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
   * The host's latest notice, as the app's notification bar shows it;
   * a new id is a new notice. The board shows it itself only while
   * it is full screen, where the page and its bar are hidden.
   */
  readonly notice?: {
    readonly id: number;
    readonly level: "error" | "info" | "success" | "warning";
    readonly text: string;
  };
  /**
   * Maker period grid (unit + anchor). Present = the period chip,
   * stepping, and canvas boundary marks render; absent = no period
   * concept on screen.
   */
  readonly periodConfig?: SchedulerPeriodConfig;
  /** Opens the maker's settings for this board; the host shows it only to users who can change them. */
  readonly onOpenSettings?: () => void;
  /** Undo/redo for the toolbar buttons; keyboard stays host-side. */
  readonly undoRedo?: {
    readonly canRedo: boolean;
    readonly canUndo: boolean;
    readonly onRedo: () => void;
    readonly onUndo: () => void;
  };
  /** A scenario package's toolbar items, dialogs and row content. */
  readonly extension?: BoardExtension;
  /** Active constraint tiers the host's mapping resolved (F22
   * deliverable 2). Rendered as "Optimizing with: ..." beside the
   * solve entry and drives the conversion dialog's claim. Absent =
   * the dialog computes presence-based tiers from its own data. */
  readonly solveCapabilities?: readonly SolveCapability[];
  /** Server-reported free-tier allowance; display-only (F19). Absent
   * = no quota to show (paid/unlimited or not connected). */
  readonly solveQuota?: SolveQuotaDisplay;
  /** F27: the entitlement's state beside the solve entry - a warning chip
   * for paused (with Retry) or grace, a warning bar for lapsed, and the
   * standing Plan and usage link. The usage count stays in the portal
   * (Matt 2026-10-17). Display only; the host withdraws Optimize and
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
  /**
   * Changes whose data changed after the solver ran (F31 rework): the
   * host checks when the answer lands and before Apply writes, and
   * names each reason, by the change's current event id. Apply
   * leaves them out.
   */
  readonly proposalOutOfDate?: ReadonlyMap<string, string>;
  /**
   * The maker's overlap setting, for the double booking a dropped
   * change can cause (F31 rework). Absent = "warn".
   */
  readonly proposalOverlapPolicy?: RulePolicy;
  readonly onRequestSolve?: () => void;
  /** Why Optimize cannot run here, such as a period that has passed. */
  readonly solveUnavailableReason?: string;
  /** Cancel (F41 Live solve): ends a running solve and keeps nothing. Renders Cancel while solving. */
  readonly onCancelSolve?: () => void;
  /** Stop and review (F41 Live solve): ends a running solve; the board reviews the best roster found so far. */
  readonly onStopSolve?: () => void;
  /**
   * The kept changes to write, none dropped or withheld, and what Apply
   * leaves in the period as the review counts it; the host clears the
   * proposal.
   */
  readonly onPublishProposal?: (
    changes: readonly ProposalChange[],
    outcome: AppliedOutcome,
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
  readonly decorations?: readonly RowDecoration[];
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
  /**
   * Previous and Next step here instead of by the interval: the host
   * steps by the roster period its Roster grid shows.
   */
  readonly onStep?: (direction: -1 | 1) => void;
  /**
   * The week's first day, 0 Sunday to 6 Saturday, for the month grid
   * and the date picker; the host builds its week windows with it.
   * Default Monday.
   */
  readonly weekStartsOn?: number;
  /** A confirmed create-dialog save; the host materializes the item. */
  /** A host that must wait before it saves returns whether it saved; the dialog waits. */
  readonly onCreateEvent?: (draft: DraftEventInput) => void | Promise<boolean>;
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
  /** The review's scorecard is open (default true); the host remembers the person's choice. */
  readonly scorecardVisible?: boolean;
  /** The scorecard's chevron folded or opened it. */
  readonly onScorecardVisibleChange?: (visible: boolean) => void;
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
  /**
   * The colour a lane group's shifts take while the maker colours by group: a swatch before
   * the group's name says which colour is which. Absent, or undefined for a group = no swatch.
   */
  readonly groupColor?: (group: string) => string | undefined;
  /** Resource column width in px (user preference over the maker default). */
  readonly resourceColumnWidth?: number;
  /** Unscheduled panel width in px (user preference over the maker default). */
  readonly unscheduledPanelWidth?: number;
  /**
   * Label overrides merged over the English defaults. The PCF adapter
   * feeds resx resources here in Phase F; components read via context.
   */
  readonly strings?: Partial<SchedulerStrings>;
  /**
   * The user's locale for numbers (hours, counts), as a BCP 47 tag: the
   * host reads it from the user's settings (localeForLanguage). Absent =
   * the browser's.
   */
  readonly locale?: string;
  /** Fluent token overrides applied as CSS custom properties on the root. */
  readonly theme?: Partial<SchedulerTheme>;
  /** Display-zone label chip shown in the toolbar (host converts dates). */
  readonly timeZoneLabel?: string;
  /** The zone in full, for the chip's tooltip. */
  readonly timeZoneDetail?: string;
  /**
   * Turns a board date back into the real moment it stands for (the
   * host's zone conversion). The connect dialog's exact payload uses it,
   * as a real solve request does.
   */
  readonly toInstant?: (display: Date) => Date;
  /** The site's time zone as a solve request names it. */
  readonly wireTimeZone?: string;
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
  /** The shift's element the menu opened on; focus returns to it. */
  readonly origin?: HTMLElement;
  readonly x: number;
  readonly y: number;
}

/** An open "Why not…?" question: the shift, and where focus returns when it closes. */
interface WhyNotQuestion {
  /** A new value moves focus to the picker. */
  readonly focusKey: number;
  readonly origin?: HTMLElement;
  readonly shiftId: string;
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
   * Full screen hides the page, so the board leaves it before the
   * host opens a record, its settings or an app command's dialog.
   */
  const fullScreen = useFullScreen();
  /*
   * Full screen hides the app's notification bar, so meanwhile the
   * board shows the host's notices itself (Matt 2026-09-30), as the
   * bar does: success and information clear after five seconds,
   * errors and warnings wait to be closed. Leaving full screen hands
   * them back to the bar. The notice sits at the bottom of the board:
   * at the top, the toolbar's tooltips flip below in full screen and
   * cover its close button (a Fluent tooltip stays open while hovered).
   */
  const [boardNotice, setBoardNotice] = React.useState<SchedulerSurfaceProps["notice"]>();
  const seenNoticeId = React.useRef(props.notice?.id);
  const fullScreenActive = fullScreen?.active ?? false;
  React.useEffect(() => {
    const notice = props.notice;
    if (!notice || notice.id === seenNoticeId.current) {
      return;
    }
    seenNoticeId.current = notice.id;
    if (fullScreenActive) {
      setBoardNotice(notice);
    }
  }, [fullScreenActive, props.notice]);
  React.useEffect(() => {
    if (!fullScreenActive) {
      setBoardNotice(undefined);
    }
  }, [fullScreenActive]);
  React.useEffect(() => {
    if (!boardNotice || boardNotice.level === "error" || boardNotice.level === "warning") {
      return undefined;
    }
    const timer = setTimeout(() => {
      setBoardNotice((current) => (current?.id === boardNotice.id ? undefined : current));
    }, 5000);
    return () => clearTimeout(timer);
  }, [boardNotice]);
  const leavingFullScreen = <T extends unknown[]>(
    action: (...args: T) => void,
  ): ((...args: T) => void) => (...args: T) => {
    fullScreen?.exit();
    action(...args);
  };

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
  // A person's menu, from their name: the extension's items only.
  const [personMenu, setPersonMenu] = React.useState<
    { readonly items: readonly ContextMenuItem[]; readonly x: number; readonly y: number } | undefined
  >();
  const [loadedMenuItems, setLoadedMenuItems] = React.useState<
    | { readonly eventId: string; readonly items: readonly ContextMenuItem[] }
    | undefined
  >();
  const openMenu = (event: SchedulerUiEvent, x: number, y: number, origin?: HTMLElement): void => {
    setMenu({ event, origin, x, y });
    setLoadedMenuItems(undefined);
    props.loadContextMenuItems?.(event).then(
      (items) =>
        setLoadedMenuItems({
          eventId: event.id,
          items: items.map((item) => ({ ...item, onSelect: leavingFullScreen(item.onSelect) })),
        }),
      () => undefined,
    );
  };
  const [dialogEvent, setDialogEvent] = React.useState<
    SchedulerUiEvent | undefined
  >();
  const [conversionOpen, setConversionOpen] = React.useState(false);
  const conversion = props.conversionSurface;
  // Hiding the conversion surface is a connected-instance privilege.
  const conversionVisible =
    conversion !== undefined &&
    !props.onRequestSolve &&
    !(conversion.hidden && conversion.connected);
  const [pendingUnschedule, setPendingUnschedule] = React.useState<
    readonly SchedulerUiEvent[] | undefined
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
   * The solver judged its plan as a whole (F31 rework), so the board
   * runs no rules of its own on the changes. The host names the ones
   * whose data went out of date; a drop can leave a kept change double
   * booking its person, and the maker's overlap setting decides that.
   */
  const outOfDateIds = React.useMemo(
    () => new Set<string>(props.proposalOutOfDate?.keys() ?? []),
    [props.proposalOutOfDate],
  );
  const [droppedChangeIds, setDroppedChangeIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set<string>());
  const [reviewView, setReviewView] = React.useState<"current" | "proposed">(
    "proposed",
  );
  // Roster grid: Hold to compare shows today's roster while held;
  // Changes only dims the shifts the proposal leaves alone.
  const [peek, setPeek] = React.useState(false);
  const [changesOnly, setChangesOnly] = React.useState(false);
  // Roster grid: the change list opened from its folded tab.
  const [changesOpen, setChangesOpen] = React.useState(false);
  // "Why not…?" (E2, A2): the open question, if any.
  const [whyNot, setWhyNot] = React.useState<WhyNotQuestion | undefined>();
  const proposalRunId = props.proposal?.runId;
  React.useEffect(() => {
    // A new answer starts a fresh review; a question about the last roster closes.
    setDroppedChangeIds(new Set<string>());
    setReviewView("proposed");
    setPeek(false);
    setChangesOnly(false);
    setChangesOpen(false);
    setWhyNot(undefined);
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
  const doubleBookings = React.useMemo(
    () =>
      proposalChanges
        ? proposalDoubleBookings(proposalChanges, {
            dropped: droppedChangeIds,
            outOfDate: outOfDateIds,
            policy: props.proposalOverlapPolicy ?? "warn",
          })
        : new Map<string, ProposalDoubleBooking>(),
    [droppedChangeIds, outOfDateIds, proposalChanges, props.proposalOverlapPolicy],
  );
  // What Apply leaves out besides the drops.
  const withheldChangeIds = React.useMemo(() => {
    const ids = new Set<string>(outOfDateIds);
    doubleBookings.forEach((booking, id) => {
      if (booking.kind === "block") {
        ids.add(id);
      }
    });
    return ids;
  }, [doubleBookings, outOfDateIds]);
  const applicableChanges = React.useMemo(
    () =>
      proposalChanges?.filter(
        (change) =>
          !droppedChangeIds.has(change.current.id) &&
          !withheldChangeIds.has(change.current.id),
      ) ?? [],
    [droppedChangeIds, proposalChanges, withheldChangeIds],
  );
  // F40 Three-level score: whether a Must rule breaks, as the planner's
  // drops leave the proposal.
  const proposalMust = React.useMemo(
    () =>
      props.proposal
        ? proposalMustRules(props.proposal, {
            dropped: droppedChangeIds,
            withheld: withheldChangeIds,
          })
        : undefined,
    [droppedChangeIds, props.proposal, withheldChangeIds],
  );
  /*
   * The Must report (design Pass 1 calls 2 and 6, DR2-Q1, RR3-D1), when
   * an extension supplies one: the solver's counts right after Optimize;
   * once a change is dropped or held back, the extension counts the
   * roster as Apply would leave it, at once and with no call.
   */
  const boardExtension = useBoardExtension();
  // Drop and Keep, the extension's kinds of open shift and the shifts a proposal adds or removes, for the review's figures.
  const openShiftKind = boardExtension?.openShift;
  const proposalShift = boardExtension?.proposalShift;
  const reviewOptions = React.useMemo<ProposalPreviewOptions>(
    () => ({
      dropped: droppedChangeIds,
      ...(openShiftKind ? { openKind: openShiftKind } : {}),
      ...(proposalShift ? { proposalShift } : {}),
      withheld: withheldChangeIds,
    }),
    [droppedChangeIds, openShiftKind, proposalShift, withheldChangeIds],
  );
  const review = boardExtension?.review;
  const reviewPeriod = props.proposal?.window ?? props.window;
  // Every item as it stands, and as Apply would leave it (the current roster when no proposal is open).
  const currentAll = React.useMemo(
    () => [...props.events, ...(props.unscheduledEvents ?? [])],
    [props.events, props.unscheduledEvents],
  );
  const appliedAll = React.useMemo(
    () => (proposalChanges ? applyProposalChanges(currentAll, applicableChanges) : currentAll),
    [applicableChanges, currentAll, proposalChanges],
  );
  // E4, A4: preferences met over Optimize's window, now and as Apply would leave the roster.
  const preferencesMet = boardExtension?.preferencesMet;
  const preferenceFigures = React.useMemo(
    () =>
      preferencesMet && proposalChanges
        ? {
            now: preferencesMet({ events: currentAll, resources: props.resources, window: reviewPeriod }),
            proposed: preferencesMet({ events: appliedAll, resources: props.resources, window: reviewPeriod }),
          }
        : undefined,
    [appliedAll, currentAll, preferencesMet, proposalChanges, props.resources, reviewPeriod],
  );
  // An extension's scorecard tiles (R2.17 wages), from the same two rosters.
  const scoreTiles = boardExtension?.scoreTiles;
  const extraTiles = React.useMemo(
    () =>
      scoreTiles && proposalChanges
        ? scoreTiles({
            now: { events: currentAll, resources: props.resources, window: reviewPeriod },
            proposed: { events: appliedAll, resources: props.resources, window: reviewPeriod },
          })
        : undefined,
    [appliedAll, currentAll, proposalChanges, props.resources, reviewPeriod, scoreTiles],
  );
  const mustReport = React.useMemo(() => {
    if (!review || !props.proposal || !proposalChanges) {
      return undefined;
    }
    return proposalMustReport(
      props.proposal,
      reviewOptions,
      () =>
        review.checkMust({
          events: appliedAll,
          resources: props.resources,
          window: reviewPeriod,
        }),
    );
  }, [
    appliedAll,
    proposalChanges,
    props.proposal,
    props.resources,
    review,
    reviewOptions,
    reviewPeriod,
  ]);
  const unchecked = React.useMemo(
    () =>
      review && proposalChanges
        ? review.unchecked({ resources: props.resources, window: reviewPeriod })
        : undefined,
    [proposalChanges, props.resources, review, reviewPeriod],
  );
  const ruleRows = React.useMemo(
    () =>
      review?.ruleRows && proposalChanges
        ? new Set(review.ruleRows({ resources: props.resources, window: reviewPeriod }))
        : undefined,
    [proposalChanges, props.resources, review, reviewPeriod],
  );
  // Every shift the run answered for, by id: the reasons' rest gaps and the drill-down's times.
  const proposalEventsById = React.useMemo(() => {
    const byId = new Map<string, SchedulerUiEvent>();
    for (const event of [...props.events, ...(props.unscheduledEvents ?? [])]) {
      byId.set(event.id, event);
    }
    for (const event of props.proposal?.events ?? []) {
      if (!byId.has(event.id)) {
        byId.set(event.id, event);
      }
    }
    return byId;
  }, [props.events, props.proposal, props.unscheduledEvents]);
  // The shifts Apply would leave open in the period the run solved, for Shifts filled.
  const openShifts = React.useMemo(() => {
    if (!props.proposal || !proposalChanges) {
      return [];
    }
    return openShiftsAfter(props.proposal, proposalChanges, reviewOptions, reviewPeriod);
  }, [proposalChanges, props.proposal, reviewOptions, reviewPeriod]);
  // F24 Repair mode: the on-call shifts Apply would leave open; the open-shift list says they are not counted.
  const openOnCall = React.useMemo(() => {
    if (!props.proposal || !proposalChanges) {
      return 0;
    }
    return openOnCallAfter(props.proposal, proposalChanges, reviewOptions, reviewPeriod).length;
  }, [proposalChanges, props.proposal, reviewOptions, reviewPeriod]);
  // What Apply leaves in the period, handed to the host with the changes (F53 saved counts).
  const outcomeFigures = boardExtension?.outcomeFigures;
  const appliedOutcome = React.useMemo<AppliedOutcome>(
    () => ({
      ...(outcomeFigures && proposalChanges
        ? { figures: outcomeFigures({ events: appliedAll, resources: props.resources, window: reviewPeriod }) }
        : {}),
      ...(mustReport?.proposed ? { mustBreaches: mustReport.proposed } : {}),
      openShifts: openShifts.length,
      ...(preferenceFigures
        ? { preferences: { met: preferenceFigures.proposed.met, total: preferenceFigures.proposed.total } }
        : {}),
      ...(unchecked ? { unchecked: unchecked.count } : {}),
      window: reviewPeriod,
    }),
    [appliedAll, mustReport, openShifts, outcomeFigures, preferenceFigures, proposalChanges, props.resources, reviewPeriod, unchecked],
  );
  // A breakdown row opened into the change list; a new nonce moves focus to its heading.
  const [drill, setDrill] = React.useState<{ readonly nonce: number; readonly row: MustRow } | undefined>();
  React.useEffect(() => {
    setDrill(undefined);
  }, [props.proposal?.runId]);
  // F31 rework: the summary and the scorecard, as Apply would leave the
  // roster. The period the run solved counts, not the days on screen,
  // so the figures match the change list and what Apply writes.
  const proposalFigures = React.useMemo(
    () =>
      props.proposal && proposalChanges
        ? proposalScore(
            props.proposal,
            proposalChanges,
            reviewOptions,
            props.proposal.window ?? props.window,
          )
        : undefined,
    [proposalChanges, props.proposal, props.window, reviewOptions],
  );
  // High-level only (Matt): the canvas is the detail; the bar
  // carries counts.
  const doubleBookingBlocks = [...doubleBookings.values()].some(
    (booking) => booking.kind === "block",
  );
  const preview = React.useMemo(
    () =>
      proposalChanges && reviewView === "proposed" && !peek
        ? previewProposal(
            [...props.events, ...(props.unscheduledEvents ?? [])],
            proposalChanges,
            reviewOptions,
          )
        : undefined,
    [peek, proposalChanges, props.events, props.unscheduledEvents, reviewOptions, reviewView],
  );
  const reviewing = proposalChanges !== undefined;
  /*
   * A removal the planner unticks or Apply holds back (BoardExtension.proposalShift) leaves the
   * shift as it is today. The extension's kind of it was the removal's, so the board draws it, in
   * both views, as the shift it is.
   */
  const drawnExtension = React.useMemo(() => {
    if (!boardExtension || !openShiftKind || !proposalShift || !proposalChanges) {
      return boardExtension;
    }
    const staying = new Set(
      proposalChanges
        .filter((change) => droppedChangeIds.has(change.current.id) || withheldChangeIds.has(change.current.id))
        .filter((change) => proposalShift(change.current) === "removed")
        .map((change) => change.current.id),
    );
    return staying.size === 0
      ? boardExtension
      : { ...boardExtension, openShift: (event: SchedulerUiEvent) => (staying.has(event.id) ? undefined : openShiftKind(event)) };
  }, [boardExtension, droppedChangeIds, openShiftKind, proposalChanges, proposalShift, withheldChangeIds]);

  /*
   * F31 rework, on the Roster grid: the change list stays beside the
   * grid while the whole period fits next to it. When the days need
   * its room, it folds to a tab at the right edge, and the tab opens
   * it over the board (Matt 2026-09-30, A): the days never shrink or
   * jump. The layout's width does not depend on the fold, so the
   * fold cannot flicker.
   */
  const layoutRef = React.useRef<HTMLDivElement | null>(null);
  const changesTabRef = React.useRef<HTMLButtonElement | null>(null);
  // The review's scorecard folds under its chevron; the summary line stays.
  const [scorecardOpenLocal, setScorecardOpenLocal] = React.useState(true);
  const scorecardOpen = props.scorecardVisible ?? scorecardOpenLocal;
  const scorecardId = React.useRef(
    `chrona-scorecard-${Math.random().toString(36).slice(2)}`,
  ).current;
  const toggleScorecard = (): void => {
    setScorecardOpenLocal(!scorecardOpen);
    props.onScorecardVisibleChange?.(!scorecardOpen);
  };
  const changesPanelId = React.useRef(
    `chrona-changes-${Math.random().toString(36).slice(2)}`,
  ).current;
  const rosterReview =
    props.view === "roster" &&
    proposalChanges !== undefined &&
    proposalChanges.length > 0;
  // The side panel on the Roster grid: the change list, or a "Why not…?" question on its own.
  const rosterSidePanel =
    rosterReview || (props.view === "roster" && (whyNot !== undefined || boardExtension?.sidePanel !== undefined));
  /*
   * Design R2.02 DR15: the change list and an extension's panel collapse
   * to a strip at the side, so a long roster gets the grid's width. Each
   * new panel opens expanded.
   */
  const sidePanelKind = rosterReview ? "changes" : props.view === "roster" && boardExtension?.sidePanel ? "extension" : undefined;
  const [sideCollapsed, setSideCollapsed] = React.useState(false);
  React.useEffect(() => setSideCollapsed(false), [sidePanelKind]);
  const sideStripRef = React.useRef<HTMLButtonElement | null>(null);
  const sidePanelRef = React.useRef<HTMLDivElement | null>(null);
  const sideFocus = React.useRef<"panel" | "strip" | undefined>(undefined);
  React.useEffect(() => {
    // Focus follows the toggle: the strip after Collapse, the panel's Collapse after Expand.
    if (sideFocus.current === "strip") {
      sideStripRef.current?.focus();
    } else if (sideFocus.current === "panel") {
      sidePanelRef.current?.querySelector<HTMLElement>('[data-testid="panel-collapse"]')?.focus();
    }
    sideFocus.current = undefined;
  }, [sideCollapsed]);
  const collapseSide = React.useCallback(() => {
    sideFocus.current = "strip";
    setSideCollapsed(true);
  }, []);
  const expandSide = React.useCallback(() => {
    sideFocus.current = "panel";
    setSideCollapsed(false);
  }, []);
  const sideStrip = (title: string): JSX.Element => (
    <button
      aria-label={formatString(strings.panelExpand, { title })}
      className="chrona-sched__panel-reopen chrona-sched__panel-reopen--strip"
      data-testid="side-panel-expand"
      onClick={expandSide}
      ref={sideStripRef}
      type="button"
    >
      <PanelRightExpand20Regular aria-hidden="true" className="chrona-sched__panel-reopen-icon" />
      {title}
    </button>
  );
  const [layoutWidth, setLayoutWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!rosterSidePanel || !layout) {
      return undefined;
    }
    const measure = (): void => setLayoutWidth(layout.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    return () => observer.disconnect();
  }, [rosterSidePanel]);
  const rosterDayCount = React.useMemo(
    () =>
      props.view === "roster"
        ? buildRosterDays(props.window, props.showWeekends ?? true).length
        : 0,
    [props.showWeekends, props.view, props.window],
  );
  // The panel's width (the change list's 240px, an extension's 360px) and the layout's 12px gap, as styles.css sets them.
  const sidePanelFolds =
    rosterSidePanel &&
    layoutWidth > 0 &&
    layoutWidth - (sidePanelKind === "extension" ? 360 : 240) - 12 < rosterPeopleWidthPx + rosterDayCount * rosterDayWidthPx;
  const changesFolded = rosterReview && sidePanelFolds;
  React.useEffect(() => {
    if (!changesFolded) {
      setChangesOpen(false);
    }
  }, [changesFolded]);
  React.useEffect(() => {
    if (!changesOpen) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setChangesOpen(false);
        changesTabRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [changesOpen]);
  // The current roster leaves out an added shift whose change is dropped (BoardExtension.proposalShift), as the proposed one does.
  const notAdded = React.useMemo(() => {
    if (!proposalShift || !proposalChanges) {
      return undefined;
    }
    const ids = new Set(
      proposalChanges
        .filter((change) => droppedChangeIds.has(change.current.id) || withheldChangeIds.has(change.current.id))
        .filter((change) => proposalShift(change.current) === "added")
        .map((change) => change.current.id),
    );
    return ids.size > 0 ? ids : undefined;
  }, [droppedChangeIds, proposalChanges, proposalShift, withheldChangeIds]);
  const currentEvents = React.useMemo(
    () => (notAdded ? props.events.filter((event) => !notAdded.has(event.id)) : props.events),
    [notAdded, props.events],
  );
  const currentUnscheduled = React.useMemo(
    () => (notAdded ? props.unscheduledEvents?.filter((event) => !notAdded.has(event.id)) : props.unscheduledEvents),
    [notAdded, props.unscheduledEvents],
  );
  const boardEvents = preview ? preview.scheduled : currentEvents;

  const boardUnscheduled = preview
    ? props.unscheduledEvents === undefined
      ? undefined
      : preview.unscheduled
    : currentUnscheduled;
  const canEdit = props.editable !== false && !reviewing;
  const canCreate = canEdit && Boolean(props.onCreateEvent);
  /* A running solve shows as progress with Cancel; the board stays live. */
  const solving =
    props.solveState?.status === "queued" ||
    props.solveState?.status === "running" ||
    props.solveState?.status === "stopping";
  const stopping = props.solveState?.status === "stopping";
  const solveSeconds = useElapsedSeconds(solving);
  /*
   * Design R14 (D22): a read the solve needs failed, so nothing was
   * sent. The notice says so with Try again; while the retried solve
   * reads again, Try again stays busy; once the solve is under way the
   * notice closes.
   */
  const solveStatus = props.solveState?.status;
  const readFailure =
    solveStatus === "failed" && props.solveState?.reason === "read"
      ? (props.solveState.message ?? "")
      : undefined;
  const [retryingRead, setRetryingRead] = React.useState(false);
  const [lastReadFailure, setLastReadFailure] = React.useState("");
  React.useEffect(() => {
    if (readFailure !== undefined) {
      setLastReadFailure(readFailure);
    }
  }, [readFailure]);
  React.useEffect(() => {
    if (solveStatus !== "queued") {
      setRetryingRead(false);
    }
  }, [solveStatus]);
  const readNotice =
    readFailure !== undefined
      ? { busy: false, message: readFailure }
      : retryingRead && solveStatus === "queued"
        ? { busy: true, message: lastReadFailure }
        : undefined;
  const solveProgress: SolveProgress | undefined = solving
    ? {
        label: stopping
          ? strings.solveStopping
          : props.solveState?.status === "queued"
            ? strings.solveQueued
            : strings.solveSolving,
        onCancel: props.onCancelSolve,
        onStop: props.onStopSolve,
        phases: [strings.solveQueued, strings.solveSolving, strings.solveStopping],
        seconds: solveSeconds,
        stopping,
      }
    : undefined;
  /*
   * Optimize gives way to the progress while a solve runs, so the button
   * that had focus leaves the page. When the run ends - an answer, or a
   * failed read's notice (design Pass 6: focus does not jump) - focus
   * returns to the button, unless the planner has moved it since.
   */
  const solveButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const solveHadFocus = React.useRef(false);
  React.useEffect(() => {
    if (solving || !solveHadFocus.current) {
      return;
    }
    solveHadFocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) {
      solveButtonRef.current?.focus();
    }
  }, [solving]);
  /*
   * F41 Stop and review: the planner asked to review, so when the stopped
   * run's roster opens, focus goes to its review rather than back to Solve.
   */
  const proposedTabRef = React.useRef<HTMLButtonElement | null>(null);
  // Each board names its own hint, so two boards on one page never read each other's.
  const stoppedHintId = React.useRef(`chrona-stopped-hint-${Math.random().toString(36).slice(2)}`).current;
  const stoppedRunId = props.proposal?.stopped ? props.proposal.runId : undefined;
  React.useEffect(() => {
    if (stoppedRunId) {
      proposedTabRef.current?.focus();
    }
  }, [stoppedRunId]);
  const extension = useBoardExtension();
  const boardState: BoardState = {
    anchor: props.anchor,
    canEdit,
    events: boardEvents,
    locale: props.locale,
    resources: props.resources,
    reviewing: proposalChanges !== undefined,
    sidePanel: { collapsed: sideCollapsed, expand: expandSide },
    solveProgress,
    strings,
    unscheduled: boardUnscheduled,
    view: props.view,
    window: props.window,
  };
  // An extension's header takes the place of the period bar and the Optimize entry.
  const header = extension?.header?.(boardState);
  const extensionNotice = extension?.notice?.(boardState);
  const extensionPanel = extension?.sidePanel?.(boardState, { onCollapse: collapseSide });
  const hasHeader = header !== undefined && header !== null && header !== false;
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
  // A new item: the extension's own form when it has one, else the board's dialog.
  const openDraft = React.useCallback(
    (range: DragResult): void => {
      if (extension?.createEvent) {
        extension.createEvent({
          end: range.end,
          resource: props.resources.find((resource) => resource.id === range.resourceId),
          start: range.start,
        });
        return;
      }
      setDraftRange(range);
    },
    [extension, props.resources],
  );
  const handleDraftRange = React.useCallback(
    (result: DragResult): void => {
      // No creation handler means no create affordance: a dialog whose
      // Save has nowhere to go is worse than no dialog (found live in
      // the F3 environment pass when the host omitted onCreateEvent).
      if (!canCreate) {
        return;
      }
      openDraft(result);
    },
    [canCreate, openDraft],
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

  // A person's name opens the extension's items for them, such as marking them absent.
  const openPersonMenu = (contextEvent: React.MouseEvent<HTMLDivElement>): void => {
    const cell = (contextEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-resource-id]");
    const resource = cell ? resourcesById.get(cell.dataset.resourceId ?? "") : undefined;
    const items = resource ? (boardExtension?.personMenu?.(resource) ?? []) : [];
    if (!cell || items.length === 0) {
      return;
    }
    contextEvent.preventDefault();
    clearHover();
    const keyboard = contextEvent.clientX === 0 && contextEvent.clientY === 0;
    const rect = keyboard ? cell.getBoundingClientRect() : undefined;
    const local = rect ? toLocal(rect.left, rect.bottom) : toLocal(contextEvent.clientX, contextEvent.clientY);
    setPersonMenu({ items, x: local.x, y: local.y });
  };

  const handleContextMenu = (
    contextEvent: React.MouseEvent<HTMLDivElement>,
  ): void => {
    const event = findEvent(contextEvent.target);
    if (!event) {
      openPersonMenu(contextEvent);
      return;
    }
    if (isGhostEvent(event)) {
      return;
    }
    contextEvent.preventDefault();
    clearHover();
    const origin =
      (contextEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-event-id]") ?? undefined;
    // From the keyboard (the menu key, Shift+F10) the menu opens at the
    // shift, not at a pointer that is somewhere else.
    const keyboard = contextEvent.clientX === 0 && contextEvent.clientY === 0;
    const rect = keyboard ? origin?.getBoundingClientRect() : undefined;
    const local = rect
      ? toLocal(rect.left, rect.bottom)
      : toLocal(contextEvent.clientX, contextEvent.clientY);
    openMenu(event, local.x, local.y, origin);
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
    openMenu(event, local.x, local.y, target.closest<HTMLElement>("[data-event-id]") ?? undefined);
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
    // "Why not…?" on a shift that has not started (A2, DR2 call 1).
    const whyNotItem: ContextMenuItem | undefined = askableShift(event)
      ? { id: "why-not", label: strings.menuWhyNot, onSelect: () => openWhyNot(event.id, menu?.origin) }
      : undefined;
    if (reviewing) {
      // The board's own edit first, then the record's form.
      items.push({ id: "open", label: strings.menuOpen, onSelect: () => openDialog(event) });
      if (props.onOpenRecord) {
        const openRecord = leavingFullScreen(props.onOpenRecord);
        items.push({
          id: "open-record",
          label: strings.menuOpenRecord,
          onSelect: () => openRecord(event),
        });
      }
      const change = proposalChanges?.find(
        (candidate) => candidate.current.id === event.id,
      );
      if (change && !outOfDateIds.has(change.current.id)) {
        const dropped = droppedChangeIds.has(change.current.id);
        items.push({
          id: dropped ? "keep-change" : "drop-change",
          label: dropped ? strings.proposalKeepChange : strings.proposalDropChange,
          onSelect: () => toggleDropped(change),
        });
      }
      if (whyNotItem) {
        items.push(whyNotItem);
      }
      return items;
    }
    // The board's own edit first, then the record's form.
    items.push({ id: "open", label: strings.menuOpen, onSelect: () => openDialog(event) });
    if (props.onOpenRecord) {
      const openRecord = leavingFullScreen(props.onOpenRecord);
      items.push({
        id: "open-record",
        label: strings.menuOpenRecord,
        onSelect: () => openRecord(event),
      });
    }
    if (whyNotItem) {
      items.push(whyNotItem);
    }
    // An extension's own items for the shift, such as marking its person absent.
    const extensionItems = boardExtension?.shiftMenu?.(event) ?? [];
    items.push(...extensionItems);
    // After the extension's items, the edits start a group of their own.
    const editsFrom = extensionItems.length > 0 ? items.length : undefined;
    // A pin holds an open shift too: the solver leaves it open.
    if (canEdit && props.onTogglePin) {
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
          label: showsPin(event) ? strings.menuUnpin : strings.menuPin,
          onSelect: () => setPinned([event], !showsPin(event)),
        });
      } else {
        // A mixed selection offers both directions, each acting only on
        // the members that actually change.
        const selected = props.events.filter((candidate) =>
          selectedIdSet.has(candidate.id),
        );
        const toPin = selected.filter((candidate) => !showsPin(candidate));
        const toUnpin = selected.filter((candidate) => showsPin(candidate));
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
      const moveTargets = candidates.filter((candidate) => !isPinned(candidate));
      const reassignTargets = moveTargets;
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
      // Inside a multi-selection it unschedules the set, as the other set actions do; pinned and open ones sit out.
      const groupUnschedule = selectedIdSet.has(event.id) && selectedIdSet.size > 1;
      const unscheduleTargets = groupUnschedule
        ? props.events.filter(
            (candidate) =>
              selectedIdSet.has(candidate.id) && candidate.status !== "needsCover" && !isDeleteLocked(candidate),
          )
        : [event];
      items.push({
        id: "unschedule",
        label:
          unscheduleTargets.length > 1
            ? formatString(strings.menuUnscheduleCount, { count: unscheduleTargets.length })
            : strings.menuUnschedule,
        onSelect: () => setPendingUnschedule(unscheduleTargets),
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
        // Delete stands apart from the edits before it.
        dividerBefore: true,
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
    const grouped = items.map((item, index) =>
      index === editsFrom && index > 0 && !item.dividerBefore ? { ...item, dividerBefore: true } : item,
    );
    return grouped.concat(
      props.contextMenuItems?.(event) ?? [],
      loadedMenuItems?.eventId === event.id ? loadedMenuItems.items : [],
    );
  };

  const panelAllowed =
    (props.view === "timeline" || props.view === "topDown") &&
    props.unscheduledEvents !== undefined;
  // While a proposal is reviewed with nothing left open, the empty panel gives its width to the board.
  const nothingOpen = (boardUnscheduled?.length ?? 0) + (props.undatedEvents?.length ?? 0) === 0;
  const showPanel = panelAllowed && !(reviewing && nothingOpen);

  // The extension's way out of an empty board (nobody on it), under the board's message.
  const emptyAction = extension?.empty?.(boardState);
  const renderView = (): JSX.Element => {
    if (props.view === "roster") {
      return (
        <ChronaRoster
          changesOnly={preview !== undefined && changesOnly}
          editable={canEdit}
          emptyAction={emptyAction}
          events={boardEvents}
          extension={extension?.roster?.(boardState)}
          hourFormat={props.hourFormat}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          openEvents={boardUnscheduled}
          openResourceId={props.unassignedResourceId}
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
          emptyAction={emptyAction}
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
          events={allEvents}
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
          events={allEvents}
          onEventChange={props.onEventChange}
          onEventClick={props.onEventClick}
          showWeekends={props.showWeekends}
          statusColorRules={props.statusColorRules}
          today={props.today}
          validateChange={props.validateChange}
          weekStartsOn={props.weekStartsOn}
        />
      );
    }
    if (props.view === "agenda") {
      return (
        <AgendaView
          events={allEvents}
          onEventClick={props.onEventClick}
          resources={props.resources}
          window={props.window}
        />
      );
    }
    return (
      <ChronaTimeline
        periodBoundaries={periodBoundaries}
        weekStartsOn={props.weekStartsOn}
        config={effectiveConfig}
        decorations={props.decorations}
        draftRange={draftRange}
        editable={canEdit}
        emptyAction={emptyAction}
        events={boardEvents}
        extension={extension?.timeline?.(boardState)}
        groupBy={props.groupBy}
        groupColor={props.groupColor}
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
        unscheduledEvents={boardUnscheduled}
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
    // From the toolbar no row is picked: the draft belongs to nobody yet, the host's unassigned lane,
    // else the first row when the host has none.
    const resourceId = props.unassignedResourceId ?? props.resources[0]?.id;
    if (!resourceId) {
      return;
    }
    const inView = (date: Date): boolean =>
      date.getTime() >= props.window.start.getTime() && date.getTime() < props.window.end.getTime();
    // Today at 09:00 on the board's clock when today is in view, else the window's first day.
    const day = props.today && inView(props.today) ? props.today : props.window.start;
    const start = new Date(day.getTime());
    start.setHours(9, 0, 0, 0);
    if (!inView(start)) {
      start.setTime(props.window.start.getTime());
    }
    openDraft({
      end: new Date(start.getTime() + 3_600_000),
      resourceId,
      start,
    });
  };

  /*
   * Design R10: what each change fixes or adds, from the run's analysis,
   * on the reviewed changes whatever the planner drops (A14).
   */
  const nameOfResource = React.useCallback(
    (resourceId: string): string => resourceNameById.get(resourceId) ?? resourceId,
    [resourceNameById],
  );
  const changeReasons = React.useMemo(
    () =>
      proposalChanges && review
        ? proposalReasons(proposalChanges, props.proposal?.analysis, {
            eventsById: proposalEventsById,
            hourFormat: props.hourFormat,
            locale: props.locale,
            nameOf: nameOfResource,
            strings,
            toInstant: props.toInstant,
          })
        : undefined,
    [nameOfResource, proposalChanges, proposalEventsById, props.locale, props.proposal, props.toInstant, review, strings],
  );
  const personFixes = React.useMemo(
    () => (proposalChanges && review ? personFixCounts(proposalChanges, props.proposal?.analysis) : undefined),
    [proposalChanges, props.proposal, review],
  );

  /*
   * "Why not…?" (E2, A2; design DR2 calls 1 to 4, 11, 12, DR2-Q2, Pass
   * 6): a question on a shift that has not started, from its menu or its
   * change-list entry, about the roster as it would be applied (A14). It
   * is answered at the top of the change list, or in the side panel on
   * its own when no proposal is open. Each request carries the roster's
   * version, so an answer for a roster that has changed since is never
   * shown as current (S4-2). On the current roster the answer offers an
   * assign or a swap; during review it offers nothing.
   */
  const whyNotExtension = boardExtension?.whyNot;
  const askableShift = (event: SchedulerUiEvent): boolean =>
    whyNotExtension !== undefined &&
    !isGhostEvent(event) &&
    event.undated !== true &&
    (whyNotExtension.now === undefined || event.start >= whyNotExtension.now) &&
    (!props.proposal || (event.start >= reviewPeriod.start && event.start < reviewPeriod.end));
  const whyNotShift = whyNot ? appliedAll.find((event) => event.id === whyNot.shiftId) : undefined;
  const whyNotWindow = whyNotShift
    ? props.proposal
      ? reviewPeriod
      : props.periodConfig
        ? periodContaining(props.periodConfig, whyNotShift.start)
        : props.window
    : undefined;
  const whyNotOpen = whyNot !== undefined;
  const rosterVersion = React.useMemo(
    () => (whyNotOpen ? rosterVersionOf(appliedAll) : ""),
    [appliedAll, whyNotOpen],
  );
  const rosterVersionRef = React.useRef(rosterVersion);
  rosterVersionRef.current = rosterVersion;
  const currentRosterVersion = React.useCallback(() => rosterVersionRef.current, []);
  // A shift that left the board takes its question with it.
  React.useEffect(() => {
    if (whyNot && !whyNotShift) {
      setWhyNot(undefined);
    }
  }, [whyNot, whyNotShift]);
  const openWhyNot = (shiftId: string, origin?: HTMLElement): void => {
    setWhyNot((previous) => ({ focusKey: (previous?.focusKey ?? 0) + 1, origin, shiftId }));
    // A folded change list opens over the board.
    if (changesFolded) {
      setChangesOpen(true);
    }
  };
  // Focus returns to the shift, or the change-list entry, the question came from.
  const closeWhyNot = (): void => {
    const question = whyNot;
    setWhyNot(undefined);
    if (!question) {
      return;
    }
    // After the board has drawn the edit: a moved shift is a new element.
    window.setTimeout(() => {
      const back = question.origin?.isConnected
        ? question.origin
        : wrapperRef.current?.querySelector<HTMLElement>(`[data-event-id="${question.shiftId}"]`);
      back?.focus();
    }, 0);
  };
  const actOnWhyNot = (action: Extract<WhyNotAction, { kind: "assign" | "swap" }>): void => {
    const changes = action.kind === "assign" ? [action.change] : [...action.changes];
    if (action.kind === "swap" && whyNotExtension?.writeInOrder) {
      // A swap writes its two moves in order and stops at the first that fails (RR3-F4).
      whyNotExtension.writeInOrder(changes);
    } else if (props.onEventsChange) {
      props.onEventsChange(changes);
    } else {
      for (const change of changes) {
        props.onEventChange?.(change);
      }
    }
    closeWhyNot();
  };
  const whyNotPeople = React.useMemo(
    () =>
      whyNotShift
        ? props.resources
            .filter(
              (resource) =>
                resource.id !== props.unassignedResourceId &&
                !(whyNotShift.status !== "needsCover" && resource.id === whyNotShift.resourceId),
            )
            .sort((first, second) => first.name.localeCompare(second.name))
        : [],
    [props.resources, props.unassignedResourceId, whyNotShift],
  );
  const canWrite = props.onEventsChange !== undefined || props.onEventChange !== undefined;
  const whyNotActionFor =
    whyNotShift && whyNotWindow && canEdit && canWrite
      ? (picked: SchedulerResource): WhyNotAction =>
          whyNotAction({
            checkMust: review
              ? (events) => review.checkMust({ events, resources: props.resources, window: whyNotWindow })
              : undefined,
            events: currentAll,
            hourFormat: props.hourFormat,
            locale: props.locale,
            names: dateNamesFrom(strings),
            nameOf: nameOfResource,
            picked,
            resources: props.resources,
            shift: whyNotShift,
            strings,
            toInstant: props.toInstant,
            validateChange: props.validateChange,
          })
      : undefined;
  const personMark = boardExtension?.personMark;
  const whyNotNode =
    whyNot && whyNotShift && whyNotWindow && whyNotExtension ? (
      <WhyNotGroup
        actionFor={whyNotActionFor}
        currentRosterVersion={currentRosterVersion}
        extension={whyNotExtension}
        focusKey={whyNot.focusKey}
        key={whyNot.shiftId}
        nameOf={nameOfResource}
        onAct={actOnWhyNot}
        onClose={closeWhyNot}
        people={whyNotPeople}
        personMark={
          personMark
            ? (resource) => personMark(resource, { resources: props.resources, window: whyNotWindow })
            : undefined
        }
        review={
          proposalChanges
            ? {
                isChange: applicableChanges.some((change) => change.current.id === whyNot.shiftId),
              }
            : undefined
        }
        roster={{ events: appliedAll, resources: props.resources, window: whyNotWindow }}
        rosterVersion={rosterVersion}
        shift={whyNotShift}
        toInstant={props.toInstant}
      />
    ) : null;
  // Bring shifts into view on the board and select them; the period the run solved comes first.
  const focusShifts = (ids: readonly string[]): void => {
    const shown = ids
      .map((id) => proposalEventsById.get(id))
      .filter((event): event is SchedulerUiEvent => event !== undefined);
    const inPeriod = shown.filter(
      (event) => event.start >= reviewPeriod.start && event.start < reviewPeriod.end,
    );
    const first = (inPeriod.length > 0 ? inPeriod : shown).reduce<SchedulerUiEvent | undefined>(
      (earliest, event) => (!earliest || event.start < earliest.start ? event : earliest),
      undefined,
    );
    if (first) {
      props.onAnchorChange?.(first.start);
      setScrollRequest((previous) => ({
        date: first.start,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    }
    props.onSelectionChange?.(shown.map((event) => event.id));
  };
  // Design Pass 1 call 4: a breakdown row's shifts as a group at the top of the change list.
  const drillMatches = drill && mustReport ? mustRowMatches(mustReport, drill.row) : undefined;
  const drillDown: ProposalDrillDown | undefined =
    drill && drillMatches
      ? {
          entries: drillDownEntries(drillMatches.matches, {
            ...(review?.describe
              ? {
                  // A row of the roster as it stands opens today's matches: their words come from today's roster.
                  describe: (match: ScheduleRuleMatch) =>
                    review.describe?.(
                      match,
                      { events: drillMatches.roster === "now" ? props.events : appliedAll, resources: props.resources, window: reviewPeriod },
                      dateNamesFrom(strings),
                      props.locale,
                    ),
                }
              : {}),
            eventsById: proposalEventsById,
            hourFormat: props.hourFormat,
            locale: props.locale,
            nameOf: nameOfResource,
            names: dateNamesFrom(strings),
            strings,
            toInstant: props.toInstant,
          }),
          // Today's matches open only when the proposal leaves none: the proposal fixes them.
          ...(drillMatches.roster === "now" ? { fixed: true } : {}),
          focusKey: drill.nonce,
          heading: formatString(drillMatches.roster === "now" ? strings.drillGroupFixed : strings.drillGroup, {
            count: String(drillMatches.matches.length),
            rule: mustRowLabel(strings, drill.row),
          }),
          onClose: () => setDrill(undefined),
          onFocusEntry: (entry) => focusShifts(entry.shiftIds),
        }
      : undefined;
  const openMustRow = (row: MustRow): void => {
    const opened = mustReport ? mustRowMatches(mustReport, row) : undefined;
    if (!opened) {
      return;
    }
    setDrill((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, row }));
    // A folded change list opens over the board.
    if (changesFolded) {
      setChangesOpen(true);
    }
    focusShifts([...new Set(opened.matches.flatMap((match) => match.shiftIds))]);
  };

  /*
   * The bar's Must word: from the counts when there are counts, else the
   * solver's verdict. "A clean report must mean clean" (eng D16, design
   * Pass 1 call 7): kept says who was not checked, unless nobody on the
   * board is checked (call 6: a board without agreements is not nagged).
   */
  const summaryMust: "broken" | "kept" | undefined = mustReport?.proposed
    ? mustBreachTotal(mustReport.proposed) > 0
      ? "broken"
      : "kept"
    : proposalMust;
  const summaryUnchecked =
    mustReport && unchecked && !unchecked.nobody && unchecked.count > 0 ? unchecked.count : undefined;

  // The change list's props, beside the grid or over it.
  const focusChange = (change: ProposalChange): void => {
    props.onAnchorChange?.(change.proposed.start);
    setScrollRequest((previous) => ({
      date: change.proposed.start,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
    props.onSelectionChange?.([change.current.id]);
  };
  // An extension's groups (such as a repair's covers) come first, and own their changes.
  const changeGroups = proposalChanges
    ? boardExtension?.changeGroups?.({
        changes: proposalChanges.map((change) => ({ change, dropped: droppedChangeIds.has(change.current.id) })),
        onFocus: focusChange,
        resourceNameById,
        setDropped: (changeIds, dropped) =>
          setDroppedChangeIds((previous) => {
            const next = new Set(previous);
            for (const id of changeIds) {
              if (dropped) {
                next.add(id);
              } else {
                next.delete(id);
              }
            }
            return next;
          }),
      })
    : undefined;
  const proposalPanelProps = {
    canAskWhyNot: (change: ProposalChange): boolean => askableShift(change.current),
    claimed: changeGroups?.claimed,
    countsOnly: review ? props.proposal?.analysis?.countsOnly === true : false,
    drillDown,
    entries: (proposalChanges ?? []).map((change) => {
      const booking = doubleBookings.get(change.current.id);
      return {
        change,
        dropped: droppedChangeIds.has(change.current.id),
        note: booking
          ? {
              kind: booking.kind,
              reason: formatString(strings.proposalDoubleBooks, {
                person:
                  resourceNameById.get(change.proposed.resourceId) ??
                  change.proposed.resourceId,
                title: booking.with.title,
              }),
            }
          : undefined,
        outOfDate: props.proposalOutOfDate?.get(change.current.id),
        reason: changeReasons?.get(change.current.id),
      };
    }),
    lead: changeGroups?.node,
    onFocus: focusChange,
    personFixes,
    // Keep all clears the drops; Keep none drops every change that could apply.
    onKeepAll: (keep: boolean): void => {
      setDroppedChangeIds(
        keep
          ? new Set<string>()
          : new Set(
              (proposalChanges ?? [])
                .filter((change) => !outOfDateIds.has(change.current.id))
                .map((change) => change.current.id),
            ),
      );
    },
    onToggleDrop: toggleDropped,
    onWhyNot: whyNotExtension
      ? (change: ProposalChange, origin: HTMLElement): void => openWhyNot(change.current.id, origin)
      : undefined,
    resourceNameById,
    whyNot: whyNotNode,
  };

  const toolbarAnchor = props.anchor;
  const toolbarAnchorChange = props.onAnchorChange;
  // Top-down draws one day: the toolbar steps by the day and offers no other range.
  const oneDay = drawsOneDay(props.view);
  const toolbarInterval = oneDay && props.interval ? "day" : props.interval;
  const toolbarIntervals = oneDay ? [] : props.intervals;
  const toolbarIntervalChange = props.onIntervalChange;

  const shell = (
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
          anchor={toolbarAnchor}
          undoRedo={props.undoRedo}
          settings={
            props.onOpenSettings
              ? { onOpen: leavingFullScreen(props.onOpenSettings) }
              : undefined
          }
          fullScreen={
            fullScreen
              ? { active: fullScreen.active, onToggle: fullScreen.toggle }
              : undefined
          }
          conversionOptimize={
            conversionVisible
              ? { onOpen: () => setConversionOpen(true) }
              : undefined
          }
          afterIntervals={extension?.toolbar?.afterIntervals?.(boardState)}
          daySpanDays={props.navigationStepDays}
          interval={toolbarInterval}
          intervals={toolbarIntervals}
          onAnchorChange={toolbarAnchorChange}
          // Top-down steps a day, the range it draws, whatever the host steps by.
          onStep={oneDay ? undefined : props.onStep}
          weekStartsOn={props.weekStartsOn}
          onIntervalChange={toolbarIntervalChange}
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
          timeZoneDetail={props.timeZoneDetail}
          timeZoneLabel={props.timeZoneLabel}
          today={props.today}
          window={props.window}
        />
      ) : null}
      {header}
      {!hasHeader && currentPeriod && periodDay ? (
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
      {extensionNotice}
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
      {readNotice ? (
        <div
          className="chrona-sched__horizon-notice chrona-sched__horizon-notice--warning chrona-sched__read-notice"
          data-testid="read-notice"
          role="alert"
        >
          <span className="chrona-sched__read-notice-text">
            <Warning16Regular aria-hidden="true" className="chrona-sched__read-notice-icon" />
            <span>{readNotice.message}</span>
          </span>
          {props.onRequestSolve ? (
            <Button
              appearance="secondary"
              data-testid="read-notice-retry"
              disabled={readNotice.busy}
              icon={readNotice.busy ? <span aria-hidden="true" className="chrona-sched__spinner" /> : undefined}
              onClick={() => {
                setRetryingRead(true);
                props.onRequestSolve?.();
              }}
              size="small"
            >
              {strings.tryAgain}
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.onRequestSolve || props.solveState || props.entitlement ? (
        <div className="chrona-sched__solve-bar">
          {props.onRequestSolve && !hasHeader ? (
            solveProgress ? (
              <SolveProgressIndicator progress={solveProgress} />
            ) : (
              <button
                className="chrona-sched__toolbar-primary chrona-sched__solve-button"
                disabled={props.solveUnavailableReason !== undefined}
                onClick={(clickEvent) => {
                  solveHadFocus.current = document.activeElement === clickEvent.currentTarget;
                  props.onRequestSolve?.();
                }}
                ref={solveButtonRef}
                type="button"
              >
                {strings.solve}
              </button>
            )
          ) : null}
          {props.onRequestSolve && props.solveUnavailableReason && !solveProgress ? (
            <span
              className="chrona-sched__solve-unavailable"
              data-testid="solve-unavailable"
            >
              {props.solveUnavailableReason}
            </span>
          ) : null}
          {/* A 402 renders as the calm quota notice below when a free
              allowance is shown; without one (paid tiers) the server's
              own message is the honest line. */}
          {props.solveState?.status === "failed" &&
          props.solveState.reason !== "read" &&
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
          {/* F27 stage 2: never modal, never blocking. Lapsed is the
              warning bar above; paused and grace are warning chips
              (paused with Retry); otherwise only the Plan and usage link. */}
          {props.entitlement?.kind === "paused" ? (
            <>
              <span
                className="chrona-sched__progress-chip chrona-sched__progress-chip--late"
                data-testid="entitlement-chip"
                role="status"
              >
                {formatString(strings.entitlementPaused, {
                  since: props.entitlement.pausedSince
                    ? formatDayTimeLabel(props.entitlement.pausedSince, dateNamesFrom(strings), props.hourFormat)
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
          <span
            className="chrona-sched__proposal-summary"
            data-testid="proposal-summary"
          >
            <span className="chrona-sched__proposal-count">
              {strings.proposalTitle}
            </span>
            {/* The figures show once: here only while the scorecard is folded or absent. */}
            {proposalChanges.length > 0 && proposalFigures && scorecardOpen ? null : (
              <span className="chrona-sched__proposal-figures">
                <span data-testid="proposal-changes">
                  {proposalChanges.length === 0
                    ? strings.proposalEmpty
                    : proposalFigures?.kept === 1
                      ? strings.proposalSummaryChangeOne
                      : formatString(strings.proposalSummaryChanges, {
                          count: String(proposalFigures?.kept ?? proposalChanges.length),
                        })}
                </span>
                {proposalFigures && proposalFigures.total > 0 ? (
                  <>
                    <span aria-hidden="true">{" · "}</span>
                    <span data-testid="proposal-filled">
                      {formatString(strings.proposalFilled, {
                        filled: String(proposalFigures.filledProposed),
                        total: String(proposalFigures.total),
                      })}
                    </span>
                  </>
                ) : null}
                {proposalFigures
                  ? leftOpenNotes(strings, proposalFigures).map((note) => (
                      <React.Fragment key={note}>
                        <span aria-hidden="true">{" · "}</span>
                        <span className="chrona-sched__proposal-note--warn" data-testid="proposal-left-open">
                          {note}
                        </span>
                      </React.Fragment>
                    ))
                  : null}
                {summaryMust ? (
                  <>
                    <span aria-hidden="true">{" · "}</span>
                    <span
                      className={
                        summaryMust === "broken"
                          ? "chrona-sched__proposal-note--block"
                          : undefined
                      }
                      data-testid="proposal-must"
                    >
                      {summaryMust === "broken"
                        ? strings.proposalMustBroken
                        : summaryUnchecked === undefined
                          ? strings.proposalMustKept
                          : summaryUnchecked === 1
                            ? strings.proposalMustKeptUncheckedOne
                            : formatString(strings.proposalMustKeptUnchecked, {
                                count: String(summaryUnchecked),
                              })}
                    </span>
                  </>
                ) : null}
              </span>
            )}
          </span>
          {outOfDateIds.size > 0 ? (
            <span
              className="chrona-sched__proposal-note--block"
              data-testid="proposal-out-of-date"
            >
              {outOfDateIds.size === 1
                ? strings.proposalOutOfDateOne
                : formatString(strings.proposalOutOfDate, {
                    count: String(outOfDateIds.size),
                  })}
            </span>
          ) : null}
          {doubleBookings.size > 0 ? (
            <span
              className={
                doubleBookingBlocks
                  ? "chrona-sched__proposal-note--block"
                  : "chrona-sched__proposal-note--warn"
              }
              data-testid="proposal-double-bookings"
            >
              {doubleBookings.size === 1
                ? strings.proposalDoubleBookingOne
                : formatString(strings.proposalDoubleBookingMany, {
                    count: String(doubleBookings.size),
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
                aria-describedby={props.proposal?.stopped ? stoppedHintId : undefined}
                data-testid="review-proposed"
                onClick={() => setReviewView("proposed")}
                ref={proposedTabRef}
                role="tab"
                type="button"
              >
                {strings.proposalShowProposed}
              </button>
            </span>
          ) : null}
          {props.view === "roster" && proposalChanges.length > 0 ? (
            <>
              <Button
                appearance="subtle"
                data-testid="review-hold"
                disabled={reviewView === "current"}
                icon={<Eye20Regular />}
                onBlur={() => setPeek(false)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    setPeek(true);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    setPeek(false);
                  }
                }}
                onPointerCancel={() => setPeek(false)}
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    setPeek(true);
                  }
                }}
                onPointerLeave={() => setPeek(false)}
                onPointerUp={() => setPeek(false)}
                size="small"
              >
                {strings.proposalHoldCompare}
              </Button>
              <Switch
                checked={changesOnly}
                data-testid="review-changes-only"
                disabled={reviewView === "current"}
                label={strings.proposalChangesOnly}
                onChange={(_, data) => setChangesOnly(data.checked)}
              />
            </>
          ) : null}
          {/* A stopped run's proposal is the best roster it found by then (R2.15). */}
          {/* Focus lands on Proposed after a stop; the tab names this hint, so it is read out. */}
          <span
            className="chrona-sched__proposal-hint"
            data-testid="proposal-hint"
            id={props.proposal?.stopped ? stoppedHintId : undefined}
            role={props.proposal?.stopped ? "status" : undefined}
          >
            {props.proposal?.stopped ? strings.proposalStoppedHint : strings.proposalReviewHint}
          </span>
          {props.onPublishProposal ? (
            <button
              className="chrona-sched__toolbar-primary chrona-sched__proposal-apply"
              data-testid="proposal-apply"
              disabled={applicableChanges.length === 0}
              onClick={() => props.onPublishProposal?.(applicableChanges, appliedOutcome)}
              type="button"
            >
              {/* What the planner reviews is what Apply writes: it names the count. */}
              {proposalChanges.length === 0
                ? strings.proposalApply
                : applicableChanges.length === proposalChanges.length
                  ? formatString(strings.proposalApplyAll, {
                      count: String(proposalChanges.length),
                    })
                  : formatString(strings.proposalApplySome, {
                      count: String(proposalChanges.length),
                      kept: String(applicableChanges.length),
                    })}
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
          {proposalChanges.length > 0 ? (
            <Button
              appearance="subtle"
              aria-controls={scorecardId}
              aria-expanded={scorecardOpen}
              className="chrona-sched__scorecard-toggle"
              data-testid="scorecard-toggle"
              icon={scorecardOpen ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
              iconPosition="after"
              onClick={toggleScorecard}
              size="small"
            >
              {strings.scorecardToggle}
            </Button>
          ) : null}
        </div>
      ) : null}
      {proposalChanges && proposalChanges.length > 0 && proposalFigures ? (
        <ProposalScorecard
          hidden={!scorecardOpen}
          id={scorecardId}
          must={proposalMust}
          mustReport={mustReport}
          {...(ruleRows ? { ruleRows } : {})}
          nameOf={nameOfResource}
          onFocusShift={(event) => focusShifts([event.id])}
          onOpenRow={openMustRow}
          openShifts={openShifts}
          openOnCall={openOnCall}
          peopleTotal={props.resources.length}
          preferences={preferenceFigures}
          extraTiles={extraTiles}
          score={proposalFigures}
          search={props.proposal?.search}
          unchecked={unchecked}
        />
      ) : null}
      <div className="chrona-sched__layout" ref={layoutRef}>
        {renderView()}
        {proposalChanges && changesFolded ? (
          <div className="chrona-sched__proposal-fold">
            <button
              aria-controls={changesPanelId}
              aria-expanded={changesOpen}
              className="chrona-sched__panel-reopen chrona-sched__panel-reopen--strip"
              data-testid="proposal-panel-tab"
              onClick={() => setChangesOpen((open) => !open)}
              ref={changesTabRef}
              type="button"
            >
              <PanelRightExpand20Regular aria-hidden="true" className="chrona-sched__panel-reopen-icon" />
              {formatString(strings.proposalPanelToggle, {
                count: proposalChanges.length,
              })}
            </button>
            {changesOpen ? (
              <ProposalPanel {...proposalPanelProps} id={changesPanelId} overlay />
            ) : null}
          </div>
        ) : proposalChanges && proposalChanges.length > 0 ? (
          sideCollapsed ? (
            sideStrip(formatString(strings.proposalPanelToggle, { count: proposalChanges.length }))
          ) : (
            <div className="chrona-sched__side-slot" ref={sidePanelRef}>
              <ProposalPanel {...proposalPanelProps} id={changesPanelId} onCollapse={collapseSide} />
            </div>
          )
        ) : whyNotNode ? (
          // No change list: the question has the side panel to itself, over the board when the days need the room.
          sidePanelFolds ? (
            <div className="chrona-sched__proposal-fold">
              <aside
                aria-label={strings.menuWhyNot}
                className="chrona-sched__proposal-panel chrona-sched__proposal-panel--overlay"
                data-testid="why-not-panel"
              >
                {whyNotNode}
              </aside>
            </div>
          ) : (
            <aside aria-label={strings.menuWhyNot} className="chrona-sched__proposal-panel" data-testid="why-not-panel">
              {whyNotNode}
            </aside>
          )
        ) : extensionPanel && sideCollapsed ? (
          sideStrip(extensionPanel.label)
        ) : extensionPanel ? (
          // The extension's own panel, over the board when the days need the room.
          sidePanelFolds ? (
            <div className="chrona-sched__proposal-fold" ref={sidePanelRef}>
              <aside
                aria-label={extensionPanel.label}
                className="chrona-sched__proposal-panel chrona-sched__proposal-panel--overlay chrona-sched__proposal-panel--wide"
                data-testid="extension-panel"
              >
                {extensionPanel.node}
              </aside>
            </div>
          ) : (
            <div className="chrona-sched__side-slot" ref={sidePanelRef}>
              <aside
                aria-label={extensionPanel.label}
                className="chrona-sched__proposal-panel chrona-sched__proposal-panel--wide"
                data-testid="extension-panel"
              >
                {extensionPanel.node}
              </aside>
            </div>
          )
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
            groupSet={(props.groupBy ?? groupSetOptions.slice(0, 1))[0]}
            isShort={() =>
              extension?.timeline?.(boardState)?.strip?.short?.({
                events: boardEvents,
                groupSet: (props.groupBy ?? groupSetOptions.slice(0, 1))[0],
                resources: props.resources,
                window: props.window,
              }) ?? false
            }
            onWidthChange={props.onUnscheduledPanelWidthChange}
            tagColors={props.tagColors}
            width={props.unscheduledPanelWidth}
            window={props.window}
          />
        ) : null}
      </div>
      {props.showLegend !== false ? (
        <SchedulerLegend
          decorations={props.view === "timeline" ? props.decorations : undefined}
          events={allEvents}
        />
      ) : null}
      {boardNotice ? (
        <div
          className={`chrona-sched__horizon-notice chrona-sched__board-notice chrona-sched__horizon-notice--${boardNotice.level}`}
          data-testid="board-notice"
        >
          <span>{boardNotice.text}</span>
          <button
            aria-label={strings.close}
            className="chrona-sched__horizon-notice-close"
            onClick={() => setBoardNotice(undefined)}
            type="button"
          >
            &#10005;
          </button>
        </div>
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
      {personMenu ? (
        <ContextMenu items={personMenu.items} onClose={() => setPersonMenu(undefined)} x={personMenu.x} y={personMenu.y} />
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
        <BoardEventDialog
          availableTags={props.availableTags}
          tagMode={props.tagMode}
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
        // An alert dialog: a click outside leaves it open, as in Fluent.
        <DialogLayer onEscape={() => setPendingDelete(undefined)}>
          <div
            aria-label={
              pendingDelete.length === 1
                ? strings.deleteConfirmTitle
                : formatString(strings.deleteConfirmCount, { count: pendingDelete.length })
            }
            aria-modal="true"
            className="chrona-sched__dialog chrona-sched__confirm-dialog"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            role="alertdialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {/* A set is counted in the title, the body and the button alike. */}
                {pendingDelete.length === 1
                  ? strings.deleteConfirmTitle
                  : formatString(strings.deleteConfirmCount, { count: pendingDelete.length })}
              </span>
            </div>
            <p>
              {pendingDelete.length === 1
                ? formatString(strings.deleteConfirmMessage, {
                    title: pendingDelete[0]?.title ?? "",
                  })
                : strings.deleteConfirmUndone}
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
                {pendingDelete.length === 1
                  ? strings.deleteConfirmAction
                  : formatString(strings.menuDeleteCount, { count: pendingDelete.length })}
              </button>
            </div>
          </div>
        </DialogLayer>
      ) : null}
      {pendingUnschedule && pendingUnschedule.length > 0 ? (
        <DialogLayer onEscape={() => setPendingUnschedule(undefined)}>
          <div
            aria-label={
              pendingUnschedule.length > 1
                ? formatString(strings.unscheduleConfirmCountTitle, { count: pendingUnschedule.length })
                : strings.unscheduleConfirmTitle
            }
            aria-modal="true"
            className="chrona-sched__dialog chrona-sched__confirm-dialog"
            role="alertdialog"
          >
            <div className="chrona-sched__dialog-header">
              <span className="chrona-sched__dialog-title">
                {/* A set is counted in the title and the button, as Delete is; the body says what happens. */}
                {pendingUnschedule.length > 1
                  ? formatString(strings.unscheduleConfirmCountTitle, { count: pendingUnschedule.length })
                  : strings.unscheduleConfirmTitle}
              </span>
            </div>
            <p>
              {pendingUnschedule.length > 1
                ? strings.unscheduleConfirmCount
                : formatString(strings.unscheduleConfirmMessage, {
                    title: pendingUnschedule[0]?.title ?? "",
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
                  const [single] = pendingUnschedule;
                  if (pendingUnschedule.length === 1 && single) {
                    props.onUnscheduleEvent?.(single);
                  } else if (props.unassignedResourceId && props.onEventsChange) {
                    // The set goes to nobody in one change, one undo step: the host writes each as Unschedule does.
                    const nobody = props.unassignedResourceId;
                    props.onEventsChange(
                      pendingUnschedule.map((event) => ({
                        event,
                        result: { end: event.end, resourceId: nobody, start: event.start },
                        verdict: allowVerdict,
                      })),
                    );
                  } else {
                    for (const event of pendingUnschedule) {
                      props.onUnscheduleEvent?.(event);
                    }
                  }
                  setPendingUnschedule(undefined);
                }}
                type="button"
              >
                {pendingUnschedule.length > 1
                  ? formatString(strings.menuUnscheduleCount, { count: pendingUnschedule.length })
                  : strings.unscheduleConfirmAction}
              </button>
            </div>
          </div>
        </DialogLayer>
      ) : null}
      {extension?.overlays?.(boardState)}
      {conversionOpen && conversion ? (
        <ConversionDialog
          capabilities={props.solveCapabilities}
          decorations={props.decorations}
          events={props.events}
          onClose={() => setConversionOpen(false)}
          // The click closes the dialog at once: the run's progress, or
          // the reason it could not start, shows on the board.
          onConnect={
            conversion.onConnect
              ? () => {
                  setConversionOpen(false);
                  conversion.onConnect?.();
                }
              : undefined
          }
          onLearnMore={conversion.onLearnMore}
          portalUrl={conversion.portalUrl}
          resources={props.resources}
          timeZone={props.wireTimeZone}
          toInstant={props.toInstant}
          unscheduledEvents={props.unscheduledEvents}
          window={props.window}
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
        <BoardEventDialog
          availableTags={props.availableTags}
          tagMode={props.tagMode}
          onRequiredTagsChange={props.onRequiredTagsChange}
          editable
          event={draftDialogEvent}
          mode="create"
          onClose={() => setDraftRange(undefined)}
          onSaveDraft={(draft) => props.onCreateEvent?.(draft)}
          resources={props.resources}
          tagColors={props.tagColors}
          validateChange={props.validateChange}
        />
      ) : null}
    </div>
  );
  return <BoardExtensionProvider extension={drawnExtension}>{shell}</BoardExtensionProvider>;
}

export function SchedulerSurface(props: SchedulerSurfaceProps): JSX.Element {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const portalsRef = React.useRef<HTMLDivElement | null>(null);
  const fullScreen = useFullScreenRoot(rootRef, portalsRef);
  const { locale, theme } = props;
  // The board's look, which its dialogs carry over the window (dialogLayer.tsx).
  const look = React.useMemo<BoardLook>(
    () => ({
      lang: locale,
      root: rootRef,
      style: theme ? { ...themeToCssVariables(theme), colorScheme: colorSchemeOf(theme.background) } : undefined,
    }),
    [locale, theme],
  );
  return (
    <div
      className="chrona-sched"
      // The user's language on the control, so the browser hyphenates its words as that language does.
      lang={props.locale}
      ref={rootRef}
      style={look.style}
    >
      <FullScreenProvider value={fullScreen}>
        <BoardLookProvider value={look}>
          <DragProvider>
            <SchedulerStringsProvider
              strings={props.extension?.strings ? { ...props.strings, ...props.extension.strings } : props.strings}
            >
              <BoardLocaleProvider hourFormat={props.hourFormat} locale={props.locale}>
                <BoardExtensionProvider extension={props.extension}>
                  <InteractionShell {...props} />
                </BoardExtensionProvider>
              </BoardLocaleProvider>
            </SchedulerStringsProvider>
          </DragProvider>
        </BoardLookProvider>
      </FullScreenProvider>
      <div aria-live="polite" className="chrona-sched__live" role="status">
        {props.announcement}
      </div>
      <div className="chrona-sched__portals" ref={portalsRef} />
    </div>
  );
}

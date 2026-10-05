export {
  ChronaRoster,
  type ChronaRosterProps,
  type RosterStatColumn,
} from "./ChronaRoster";
export {
  ChronaTimeline,
  type ChronaTimelineProps,
  type TimelineChange,
} from "./ChronaTimeline";
export { DragProvider, useDragController } from "./dragContext";
export {
  aggregateVerdict,
  allowVerdict,
  beginAssignSession,
  beginCreateSession,
  beginMoveSession,
  beginResizeSession,
  computeDragResult,
  dragResultChangesEvent,
  type ChangeVerdict,
  type ChangeVerdictKind,
  type RuleResult,
  type DragResult,
  type DragSession,
  type ValidateChange,
} from "./interactions";
export {
  canRedo,
  canUndo,
  emptyUndoRedo,
  popRedo,
  popUndo,
  pushEntry,
  type UndoRedoState,
} from "./undoRedo";
export {
  UnscheduledPanel,
  type UnscheduledFilter,
  type UnscheduledPanelProps,
} from "./UnscheduledPanel";
export { AgendaView, type AgendaViewProps } from "./AgendaView";
export { MonthView, type MonthViewProps } from "./MonthView";
export {
  DayColumnsView,
  TopDownView,
  type DayColumnsViewProps,
  type TopDownViewProps,
} from "./VerticalViews";
export {
  buildMonthMatrix,
  eventsForDay,
  groupEventsByDay,
  type AgendaDayGroup,
  type MonthCell,
} from "./monthLayout";
export {
  SchedulerSurface,
  type SchedulerSurfaceProps,
} from "./SchedulerSurface";
export { SolveProgressIndicator, useElapsedSeconds } from "./SolveProgress";
export {
  BoardExtensionProvider,
  useBoardExtension,
  type BoardExtension,
  type BoardState,
  type FitExtension,
  type ResourceFit,
  type RosterExtension,
  type RosterGroup,
  type RosterGroupInput,
  type TimelineExtension,
  type TimelineStripInput,
} from "./extension";
export {
  buildLegendEntries,
  buildNonWorkingDecorations,
  decorationsForResource,
  type LegendEntry,
  type RowDecoration,
  type RowDecorationKind,
  type WorkingWindow,
} from "./decorations";
export { SchedulerLegend, type SchedulerLegendProps } from "./SchedulerLegend";
export { SchedulerToolbar, type SchedulerToolbarProps } from "./SchedulerToolbar";
export { ContextMenu, type ContextMenuItem, type ContextMenuProps } from "./ContextMenu";
export {
  EventDialog,
  type DraftEventInput,
  type EventDialogProps,
} from "./EventDialog";
export { EventHoverCard, type EventHoverCardProps } from "./EventHoverCard";
export { assignedHours } from "./hours";
export {
  computeVisibleEntryRange,
  type VirtualEntry,
  type VirtualRange,
} from "./rowVirtualization";
export {
  fluentDarkTheme,
  fluentLightTheme,
  themeToCssVariables,
  type SchedulerTheme,
} from "./theme";
export {
  defaultViewConfig,
  formatWindowLabel,
  isWeekend,
  resolveEventColor,
  resolveVerticalHourRange,
  resolveWindowForScale,
  startOfWeek,
  stepAnchor,
  weekStartFrom,
  type HourFormat,
  type SchedulerRepresentation,
  type SchedulerTimeScale,
  type IntervalZoom,
  zoomForInterval,
  type SchedulerViewConfig,
  type StatusColorRule,
} from "./viewConfig";
export {
  buildRosterDays,
  layoutOpenRow,
  layoutRoster,
  showsOnDay,
  type RosterDay,
} from "./rosterLayout";
export {
  chipCode,
  chipStartTime,
  formatHours,
} from "./compactChip";
export {
  buildTimeTicks,
  buildTimeTicksEvery,
  dateToOffset,
  fitPxPerHour,
  formatDayLabel,
  formatDayLabelToFit,
  formatHourLabel,
  HORIZONTAL_RESOLUTION_LIMITS,
  MAX_PX_PER_HOUR,
  MIN_PX_PER_HOUR,
  offsetToDate,
  resolveTimeResolution,
  snapDate,
  stepZoom,
  TIME_RESOLUTION_LADDER,
  VERTICAL_RESOLUTION_LIMITS,
  windowWidth,
  type TimeResolution,
} from "./timeAxis";
export {
  eventIntersectsWindow,
  layoutTimeline,
  layoutTimelineRow,
} from "./timelineLayout";
export {
  SchedulerStringsProvider,
  defaultSchedulerStrings,
  flagReasonText,
  formatString,
  resolveStrings,
  useSchedulerStrings,
  type SchedulerStrings,
} from "./strings";
export {
  buildResourceGroups,
  groupCollapseKey,
  type ResourceGroup,
  type ResourceSubgroup,
} from "./resourceGrouping";
export {
  createPreferenceStore,
  type PreferenceStore,
  type SchedulerPreferencesV1,
} from "./preferences";
export {
  buildEventsByResource,
  defaultRuleReasonStrings,
  defaultRulesConfig,
  evaluateScheduleRules,
  findBreakViolation,
  scheduleRuleOrder,
  type BreakViolation,
  type RuleEvaluationInput,
  type RulePolicy,
  type RuleReasonStrings,
  type ScheduleRule,
  type ScheduleRuleContext,
  type SchedulerRulesConfig,
} from "./scheduleRules";
export {
  dayOfPeriod,
  periodBoundariesInRange,
  periodContaining,
  rosterPeriodWindow,
  stepPeriod,
  type PeriodUnit,
  type RosterPeriod,
  type SchedulerPeriodConfig,
} from "./periods";
export {
  applyProposalChanges,
  diffProposal,
  ghostIdOf,
  idleSolveState,
  isGhostEvent,
  openShiftCount,
  previewProposal,
  proposalDoubleBookings,
  proposalMustRules,
  proposalScore,
  type ProposalChange,
  type ProposalDoubleBooking,
  type ProposalDoubleBookingOptions,
  type ProposalPreview,
  type ProposalPreviewOptions,
  type ProposalScore,
  type ScheduleProposal,
  type SolveProgress,
  type ResumeRunDisplay,
  type SolveQuotaDisplay,
  type SolveRunStatus,
  type SolveState,
} from "./solve";
export {
  normalizeRecordId,
  outOfDateChanges,
  type FreshnessData,
  type FreshnessInput,
  type FreshnessStrings,
} from "./freshness";
export {
  redactProblem,
  redactProblemForTenant,
  type RedactedProblem,
  type ResourceKeyScheme,
  type ResourcePlaceholderKey,
  unredactSolution,
} from "./redaction";
export {
  canonicalizeProblem,
  clampSolverSeconds,
  followRun,
  hashProblem,
  markRunReviewed,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveQuotaExceededError,
  SolveSessionExpiredError,
  type FollowRunOptions,
  type SolveRunOptions,
  type SolveSession,
  type SolveSessionLatestRun,
  type SolveSessionRunStatus,
} from "./solveClient";
export {
  activeCapabilities,
  computeCapabilityTiers,
  SOLVE_CAPABILITIES,
  type CapabilityInput,
  type CapabilityTier,
  type SolveCapability,
} from "./capabilities";
export {
  problemFromSchedule,
  type ProblemFromScheduleInput,
  type ResourceContractType,
  type ScheduleContractResource,
  type ScheduleContractShift,
  type ScheduleContractUnavailability,
  type ScheduleProblemV2,
  type ScheduleRunStatus,
  type ScheduleSolutionV2,
  type SolveSearch,
} from "./schedulingContract";
export {
  buildSolveRequest,
  proposalFromSolution,
  solutionFromPoll,
  type ChronaSolveRequest,
  type ProposalFromSolutionOptions,
  type SolvePollResponse,
  type SolveRequestOptions,
  type SolveResultV2,
  type SolveSubmitResponse,
} from "./solveTransport";
export {
  tagPillStyle,
  type TagColorMap,
  type TagPillStyle,
} from "./tagColors";
export {
  browserTimeZone,
  clockMinutesBetween,
  defaultDisplayTimeZone,
  formatFixedOffsetZone,
  formatTimeZoneCity,
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  isValidTimeZoneId,
  normalizeTimeZoneId,
  parseDateOnly,
  resolveDisplayTimeZone,
  toDisplayZone,
  toOffsetZone,
  wallClockMs,
  zoneOffsetMinutes,
  type DisplayTimeZoneResolution,
  type OffsetMinutesAt,
} from "./timeZone";
export {
  isDeleteLocked,
  isDragLocked,
  isPinned,
  showsPin,
  withPin,
} from "./locks";
export {
  clampResizeEnd,
  clampResizeStart,
  coverageMinutes,
  gapFractions,
  gapsForChange,
  normalizeGaps,
  spanMinutes,
  workSpans,
  workedMinutes,
  type GapFraction,
  type TimeSpan,
} from "./spans";
export {
  fluentThemeToSchedulerTheme,
  fluentTokenNames,
  type FluentV9Tokens,
} from "./hostTheme";
export {
  dateNamesFrom,
  englishDateNames,
  formatDateLabel,
  formatDayTimeLabel,
  monthLong,
  monthShort,
  weekdayShort,
  type DateNames,
} from "./dateNames";
export {
  CAPABILITY_CONFIG_GENERATORS,
  CAPABILITY_RECOMMEND,
  CAPABILITY_SOLVE,
  CAPABILITY_WORKER_CHANGE_VALIDATION,
  createEntitlementCache,
  deriveEntitlementStatus,
  ENTITLEMENT_PAUSE_AFTER_MS,
  entitlementAllows,
  entitlementDueForRefresh,
  EntitlementExpiredError,
  markEntitlementFailure,
  planUsageUrl,
  EntitlementUnreachableError,
  parseEntitlementSession,
  refreshEntitlement,
  scenarioCapability,
  toEntitlementDisplay,
  type EntitlementCache,
  type EntitlementDisplay,
  type EntitlementDisplayOptions,
  type EntitlementPaymentState,
  type EntitlementSession,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type EntitlementStatusKind,
  type RefreshEntitlementOptions,
} from "./entitlement";
export * from "./types";
export {
  buildPlainFixture,
  demoRulesConfig,
  type FixtureSchedule,
} from "./fixtures";
export {
  fixtureViews,
  useFixtureScheduleHost,
  type FixtureHostOptions,
  type FixtureHostResult,
  type FixtureView,
} from "./fixtureHost";

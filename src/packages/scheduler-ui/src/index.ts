export { ChronaRoster, type ChronaRosterProps } from "./ChronaRoster";
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
export { UnscheduledPanel, type UnscheduledPanelProps } from "./UnscheduledPanel";
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
export {
  bucketCoverage,
  computeCoverage,
  coverageTitle,
  type CoverageBucket,
  type CoverageCurveDetail,
  type CoverageSlice,
  type CoverageState,
  type DemandRow,
} from "./coverage";
export {
  availabilityBandsToDecorations,
  englishBandLabels,
  type BandLabels,
  buildLegendEntries,
  buildNonWorkingDecorations,
  decorationsForResource,
  type LegendEntry,
  type RowDecoration,
  type RowDecorationKind,
  type WorkingWindow,
} from "./decorations";
export { SchedulerLegend, type SchedulerLegendProps } from "./SchedulerLegend";
export {
  SchedulerToolbar,
  type SchedulerToolbarProps,
} from "./SchedulerToolbar";
export { ContextMenu, type ContextMenuItem, type ContextMenuProps } from "./ContextMenu";
export {
  EventDialog,
  type DraftEventInput,
  type EventDialogProps,
} from "./EventDialog";
export { EventHoverCard, type EventHoverCardProps } from "./EventHoverCard";
export {
  assignedHours,
  missingRequiredTags,
  resourceMatchesEvent,
} from "./skills";
export {
  buildFixtureSchedule,
  buildLargeFixture,
  buildLevel0Fixture,
  buildLevel1Fixture,
  buildLevel2Fixture,
  buildSolvableFixture,
  type FixtureSchedule,
} from "./fixtures";
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
  stepAnchor,
  type HourFormat,
  type SchedulerRepresentation,
  type SchedulerTimeScale,
  type IntervalZoom,
  zoomForInterval,
  type SchedulerViewConfig,
  type StatusColorRule,
} from "./viewConfig";
export { buildRosterDays, layoutRoster } from "./rosterLayout";
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
  evaluateResourcePreferences,
  isPreferredResource,
  type ResourcePreferenceRule,
  type ResourcePreferenceTier,
} from "./resourcePreferences";
export {
  buildEventsByResource,
  defaultRuleReasonStrings,
  defaultRulesConfig,
  evaluateScheduleRules,
  findBreakViolation,
  findUnavailableCollision,
  type BreakViolation,
  type RuleEvaluationInput,
  type RulePolicy,
  type RuleReasonStrings,
  type SchedulerRulesConfig,
} from "./scheduleRules";
export {
  dayOfPeriod,
  periodBoundariesInRange,
  periodContaining,
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
  proposalMustRules,
  type ProposalChange,
  type ProposalPreview,
  type ProposalPreviewOptions,
  type ScheduleProposal,
  type SolveProgress,
  type ResumeRunDisplay,
  type SolveQuotaDisplay,
  type SolveRunStatus,
  type SolveState,
} from "./solve";
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
  defaultDisplayTimeZone,
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  isValidTimeZoneId,
  normalizeTimeZoneId,
  resolveDisplayTimeZone,
  toDisplayZone,
  toOffsetZone,
  type DisplayTimeZoneResolution,
  type OffsetMinutesAt,
} from "./timeZone";
export {
  fixtureTagColors,
  useFixtureScheduleHost,
  type FixtureHostOptions,
  type FixtureHostResult,
} from "./fixtureHost";
export {
  isDeleteLocked,
  isDragLocked,
  isLocked,
  isResourceLocked,
  isTimeLocked,
  resolveLock,
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
  currentPeriod,
  latestPublication,
  periodKey,
  planStartPeriod,
  publishBy,
  railPeriods,
  sequentialEligibility,
  type PeriodLifecycle,
  type PeriodPublication,
  type PublishAhead,
  type RailOptions,
  type RailPeriod,
} from "./horizon";
export {
  PlanningChrome,
  type PlanningMode,
  type SchedulerPlanningProps,
} from "./PlanningChrome";
export {
  cycleWeekOf,
  isCycled,
  reconcileGeneration,
  slotOccursOn,
  type GenerationResult,
  type ReconcileGenerationOptions,
  type ShiftDemandTemplate,
  type ShiftTemplateCycle,
  type ShiftTemplateGap,
  type ShiftTemplateSlot,
} from "./generation";
export {
  applyLever,
  describeLever,
  resolveOccurrenceUnits,
  resolveSlotCounts,
  resolveWindowUnits,
  type DemandData,
  type DemandDistribution,
  type DemandDriver,
  type DemandDriverValue,
  type DemandLever,
  type DemandRounding,
  type DemandWindowKind,
} from "./demandLevers";
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

/**
 * Every user-facing label the components render. The host supplies a
 * partial override (the PCF adapter will feed resx resources in Phase
 * F); anything omitted falls back to English. Templates use {name}
 * placeholders resolved by formatString.
 */
import type { EventFlag } from "./types";

export interface SchedulerStrings {
  readonly agendaEmpty: string;
  readonly apply: string;
  readonly assignedTo: string;
  /** The create dialog's assignee when no resource lane exists yet. */
  readonly unassigned: string;
  readonly bandBusyElsewhere: string;
  readonly bandPreferred: string;
  readonly bandUnavailable: string;
  readonly bandUnpreferred: string;
  readonly cancel: string;
  readonly close: string;
  readonly delete: string;
  readonly changesSinceMany: string;
  readonly changesSinceNone: string;
  readonly changesSinceOne: string;
  readonly coverage: string;
  readonly currentRosterLabel: string;
  readonly deleteConfirmAction: string;
  readonly deleteConfirmCount: string;
  readonly deleteConfirmMessage: string;
  readonly deleteConfirmTitle: string;
  readonly dialogFinishAfterStart: string;
  readonly directionEarlier: string;
  readonly directionLater: string;
  readonly dialogNameRequired: string;
  readonly dialogBestOptions: string;
  readonly dialogNotAllowed: string;
  readonly dialogOtherOptions: string;
  readonly draftItem: string;
  readonly duration: string;
  readonly emptyResources: string;
  /** F27: entitlement states beside the solve entry (display only). */
  readonly entitlementGrace: string;
  readonly entitlementLapsed: string;
  readonly entitlementPaused: string;
  readonly entitlementPlanUsage: string;
  readonly entitlementResources: string;
  readonly entitlementResourcesAbovePlan: string;
  readonly entitlementResourcesNoCeiling: string;
  readonly entitlementRetry: string;
  readonly finish: string;
  readonly flagCauseAssigned: string;
  readonly flagCauseEdited: string;
  readonly flagCausePinned: string;
  readonly flagReason: string;
  readonly goToDate: string;
  readonly horizonFull: string;
  readonly horizonHeader: string;
  readonly interval: string;
  readonly intervalDay: string;
  readonly itemsCount: string;
  readonly intervalDaySpan: string;
  readonly intervalMonth: string;
  readonly intervalWeek: string;
  readonly legendBusyElsewhere: string;
  readonly legendCustom: string;
  readonly legendHoliday: string;
  readonly legendNeedsCover: string;
  readonly legendNonWorking: string;
  readonly legendPreferred: string;
  readonly legendUnavailable: string;
  readonly legendUnpreferred: string;
  readonly menuDeleteCount: string;
  readonly menuDuplicate: string;
  readonly menuOpen: string;
  readonly menuOpenRecord: string;
  readonly menuPin: string;
  readonly menuPinCount: string;
  readonly menuUnpin: string;
  readonly menuUnpinCount: string;
  readonly menuMoveTo: string;
  readonly menuMoveToCount: string;
  readonly menuReassign: string;
  readonly menuReassignCount: string;
  readonly groupByLabel: string;
  readonly groupByNone: string;
  readonly ungrouped: string;
  readonly hideUnscheduledPanel: string;
  readonly unscheduledToggle: string;
  readonly conversionOptimize: string;
  readonly conversionTitle: string;
  readonly conversionPitchProblem: string;
  readonly conversionPitchMechanism: string;
  readonly conversionInfoLead: string;
  readonly conversionInfoBody: string;
  readonly conversionClaimBase: string;
  readonly conversionClaimRespected: string;
  readonly capabilityAssignment: string;
  readonly capabilityLocks: string;
  readonly capabilityRoles: string;
  readonly capabilityAvailability: string;
  readonly capabilityHours: string;
  readonly capabilityCost: string;
  readonly listAnd: string;
  readonly solveCapabilitiesLine: string;
  readonly generate: string;
  readonly generateWindowTitle: string;
  readonly generateWindowIntro: string;
  readonly generateWindowFrom: string;
  readonly generateWindowTo: string;
  readonly generateWindowAction: string;
  readonly conversionCountsSuffix: string;
  readonly conversionCoverageGaps: string;
  readonly conversionSampleTitle: string;
  readonly conversionSampleBefore: string;
  readonly conversionSampleAfter: string;
  readonly conversionSampleCounts: string;
  readonly conversionAxisLabels: string;
  readonly conversionSentTitle: string;
  readonly conversionSentWork: string;
  readonly conversionSentPeople: string;
  readonly conversionSentNothingElse: string;
  readonly conversionInspect: string;
  readonly conversionPayloadNote: string;
  readonly conversionLockLine: string;
  readonly conversionAllClear: string;
  readonly conversionNotNow: string;
  readonly conversionConnect: string;
  readonly conversionLearnMore: string;
  readonly menuAssign: string;
  readonly menuUnschedule: string;
  readonly unscheduleConfirmTitle: string;
  readonly unscheduleConfirmMessage: string;
  readonly unscheduleConfirmAction: string;
  readonly unscheduledLaneLabel: string;
  readonly assignTitle: string;
  readonly assignBestOptions: string;
  readonly assignNotAvailable: string;
  readonly assignShowEveryone: string;
  readonly assignSearchPlaceholder: string;
  readonly assignHoursLeft: string;
  readonly assignReasonMissingSkill: string;
  readonly assignReasonUnavailable: string;
  readonly assignReasonBusy: string;
  readonly assignReasonHours: string;
  readonly assignEmpty: string;
  readonly assignAction: string;
  readonly monthMore: string;
  /** Pipe-separated month and weekday names, January first / Sunday first. */
  readonly monthsLong: string;
  readonly monthsShort: string;
  readonly moveAmount: string;
  readonly moveDialogTitle: string;
  readonly moveDirection: string;
  readonly moveUnit: string;
  readonly name: string;
  readonly needsCover: string;
  readonly newEvent: string;
  readonly next: string;
  readonly optionMissingSkills: string;
  readonly optionSkillMismatch: string;
  readonly noticeBlocked: string;
  readonly noticeWarning: string;
  readonly pinnedNotice: string;
  readonly previous: string;
  readonly reassignDialogTitle: string;
  readonly modeOperate: string;
  readonly modePlan: string;
  readonly optimizePeriod: string;
  readonly periodNext: string;
  readonly periodOf: string;
  readonly planningPeriodLabel: string;
  readonly publishAction: string;
  readonly publishBlockedSequential: string;
  readonly publishConfirmMessage: string;
  readonly publishConfirmTitle: string;
  readonly publishByLine: string;
  readonly publishOverdueDay: string;
  readonly publishOverdueDays: string;
  readonly publishedLine: string;
  readonly railAddRoster: string;
  readonly railLabel: string;
  readonly railScrollBack: string;
  readonly railScrollForward: string;
  readonly redo: string;
  readonly rosterActions: string;
  readonly rosterCardLabel: string;
  readonly rosterDeleteConfirmMessage: string;
  readonly rosterDeleteConfirmTitle: string;
  readonly rosterDeleted: string;
  readonly rosterGenerate: string;
  readonly rosterProgressFull: string;
  readonly rosterProgressNotStarted: string;
  readonly rosterPercentScheduled: string;
  readonly scopeNotice: string;
  readonly statusDraft: string;
  readonly statusLocked: string;
  readonly statusPublished: string;
  readonly periodPrevious: string;
  readonly proposalApply: string;
  readonly proposalAppliedMany: string;
  readonly proposalAppliedOne: string;
  readonly proposalBlocked: string;
  readonly proposalChanges: string;
  readonly proposalNotes: string;
  readonly proposalDiscard: string;
  readonly proposalEmpty: string;
  readonly proposalChangeOne: string;
  readonly proposalDropped: string;
  readonly proposalDropChange: string;
  readonly proposalKeepChange: string;
  readonly proposalReviewHint: string;
  readonly proposalShowCurrent: string;
  readonly proposalShowProposed: string;
  readonly proposalPanelTitle: string;
  readonly proposalGroupAssigned: string;
  readonly proposalGroupMoved: string;
  readonly proposalGroupBlocked: string;
  readonly proposalGroupUnassigned: string;
  readonly proposalMustBroken: string;
  readonly proposalMustKept: string;
  readonly proposalOpenMany: string;
  readonly proposalOpenOne: string;
  readonly proposalWas: string;
  readonly solveQueued: string;
  readonly solveElapsed: string;
  readonly requiredSkills: string;
  readonly resizeResources: string;
  readonly resizeUnscheduled: string;
  readonly resourceHeader: string;
  readonly save: string;
  readonly savedViews: string;
  readonly start: string;
  readonly solve: string;
  readonly solveFailed: string;
  readonly solveQuotaRemaining: string;
  readonly solveQuotaExhausted: string;
  /** F26 stage 3: resume-or-discard prompt and the portal link. */
  readonly resumeFinished: string;
  readonly resumeRunning: string;
  readonly resumeChanged: string;
  readonly resumeReview: string;
  readonly resumeFollow: string;
  readonly resumeDiscard: string;
  readonly openChronaAccount: string;
  readonly solveQuotaUpgrade: string;
  readonly solveSolving: string;
  readonly timeScale: string;
  readonly timeScaleLeast: string;
  readonly timeScaleMinutes: string;
  readonly timeScaleMost: string;
  readonly timeScaleShort: string;
  readonly timeZoneChip: string;
  readonly timelineLabel: string;
  readonly today: string;
  readonly undo: string;
  readonly unpublishAction: string;
  readonly unpublishBlockedSequential: string;
  readonly unpublishConfirmMessage: string;
  readonly unpublishConfirmTitle: string;
  readonly unitDays: string;
  readonly unitHours: string;
  readonly unitWeeks: string;
  readonly unscheduledAll: string;
  readonly unscheduledEmpty: string;
  readonly unscheduledEmptyInView: string;
  readonly unscheduledFilterLabel: string;
  readonly unscheduledInView: string;
  readonly unscheduledTitle: string;
  readonly weekdaysShort: string;
  readonly nextMonth: string;
  readonly previousMonth: string;
  readonly schedulerSettings: string;
  readonly weekdaysLong: string;
  readonly noDate: string;
}

export const defaultSchedulerStrings: SchedulerStrings = {
  agendaEmpty: "Nothing scheduled in this window.",
  apply: "Apply",
  assignedTo: "Assigned to",
  unassigned: "Unassigned",
  bandBusyElsewhere: "Busy elsewhere",
  bandPreferred: "Preferred",
  bandUnavailable: "Unavailable",
  bandUnpreferred: "Unpreferred",
  cancel: "Cancel",
  close: "Close",
  delete: "Delete",
  deleteConfirmAction: "Delete",
  deleteConfirmCount: "Delete {count} items? This cannot be undone.",
  deleteConfirmMessage: "Delete {title}? This cannot be undone.",
  deleteConfirmTitle: "Confirm delete",
  dialogFinishAfterStart: "Finish must be after start.",
  changesSinceMany: "{count} changes since",
  changesSinceNone: "No changes since",
  changesSinceOne: "{count} change since",
  coverage: "Coverage",
  currentRosterLabel: "Current roster",
  directionEarlier: "Earlier",
  directionLater: "Later",
  dialogNameRequired: "Name is required.",
  dialogBestOptions: "Best options",
  dialogNotAllowed: "This change is not allowed.",
  dialogOtherOptions: "Other",
  draftItem: "New item",
  duration: "Duration",
  emptyResources:
    "No resources to display. Check the view's resource configuration.",
  entitlementGrace: "Payment past due, grace until {date}",
  entitlementLapsed: "Chrona subscription lapsed. Optimize and Generate are paused until billing is resolved.",
  entitlementPaused: "Optimizer paused since {since}. Chrona is unreachable; scheduling works as normal.",
  entitlementPlanUsage: "Plan and usage",
  entitlementResources: "{scheduled} of {included} resources scheduled this period",
  entitlementResourcesAbovePlan: "{scheduled} of {included} resources scheduled, above plan",
  entitlementResourcesNoCeiling: "{scheduled} resources scheduled this period",
  entitlementRetry: "Retry",
  finish: "Finish",
  flagCauseAssigned: "assigned",
  flagCauseEdited: "edited",
  flagCausePinned: "pinned",
  flagReason:
    "No longer required by demand: {required} needed, {existing} exist. Kept because it is {cause}.",
  goToDate: "Go to date",
  horizonFull: "No more rosters can be added to this planning horizon.",
  horizonHeader: "Planning horizon {range} ({days} days)",
  interval: "Interval",
  intervalDay: "Day",
  itemsCount: "{count} items",
  intervalDaySpan: "Span",
  intervalMonth: "Month",
  intervalWeek: "Week",
  legendBusyElsewhere: "Busy elsewhere",
  legendCustom: "Highlighted",
  legendHoliday: "Holiday",
  legendNeedsCover: "Needs cover",
  legendNonWorking: "Non-working time",
  legendPreferred: "Preferred hours",
  legendUnavailable: "Unavailable",
  legendUnpreferred: "Unpreferred hours",
  menuDeleteCount: "Delete {count} items",
  menuDuplicate: "Duplicate",
  menuOpen: "Open",
  menuOpenRecord: "Open record",
  menuPin: "Pin",
  menuPinCount: "Pin {count} items",
  menuUnpin: "Unpin",
  menuUnpinCount: "Unpin {count} items",
  menuMoveTo: "Move to...",
  menuMoveToCount: "Move {count} items to...",
  menuReassign: "Reassign to...",
  menuReassignCount: "Reassign {count} items to...",
  groupByLabel: "Group rows",
  groupByNone: "No grouping",
  ungrouped: "Ungrouped",
  hideUnscheduledPanel: "Hide the unscheduled panel",
  unscheduledToggle: "Unscheduled ({count})",
  conversionOptimize: "Optimize",
  conversionTitle: "The whole board, solved at once",
  conversionPitchProblem: "Scheduling one item at a time misses the interactions.",
  conversionPitchMechanism:
    "Chrona considers the whole schedule at once - skills, availability, hours, cost and conflicts.",
  conversionInfoLead: "Optional. Free to try.",
  conversionInfoBody:
    "Connecting Chrona doesn't change how this scheduler works.",
  conversionClaimBase: "Open work filled. Conflicts resolved.",
  conversionClaimRespected: "{list} respected.",
  capabilityAssignment: "assignment",
  capabilityLocks: "locks",
  capabilityRoles: "roles",
  capabilityAvailability: "availability",
  capabilityHours: "hours",
  capabilityCost: "cost",
  listAnd: "and",
  solveCapabilitiesLine: "Optimizing with: {list}",
  generate: "Generate",
  generateWindowTitle: "Generate from templates",
  generateWindowIntro:
    "Expands the work item templates into open items for this window. Re-running reconciles: untouched surplus is removed, edited or assigned items are kept and flagged.",
  generateWindowFrom: "From",
  generateWindowTo: "To",
  generateWindowAction: "Generate",
  conversionCountsSuffix: " \u2014 counted locally, nothing sent.",
  conversionCoverageGaps: "{gaps} coverage gaps",
  conversionSampleTitle: "A sample run",
  conversionSampleBefore: "Before",
  conversionSampleAfter: "After: the optimized result",
  conversionSampleCounts: "{open} open items \u00b7 {conflicts} conflicts",
  conversionAxisLabels: "Mon 8 AM|Mon 12 PM|Mon 4 PM|Tue 8 AM",
  conversionSentTitle: "What a real run would use",
  conversionSentWork:
    "Work items \u2014 times, requirements, current assignee as an ID",
  conversionSentPeople:
    "People \u2014 resource IDs, skills, availability windows, hours and cost rates",
  conversionSentNothingElse:
    "Nothing else \u2014 no names, no notes, no contact details, no unrelated records",
  conversionInspect: "Inspect the exact payload",
  conversionPayloadNote: "This exact JSON. Nothing is sent until you connect.",
  conversionLockLine:
    "Free. No credit card. Nothing is sent until you connect. A sample run never changes your schedule.",
  conversionAllClear:
    "Nothing is flagged in the current data \u2014 counted locally, nothing sent.",
  conversionNotNow: "Not now",
  conversionConnect: "Try a free sample run",
  conversionLearnMore: "Learn more",
  menuAssign: "Assign staff\u2026",
  menuUnschedule: "Unschedule",
  unscheduleConfirmTitle: "Unschedule shift",
  unscheduleConfirmMessage:
    "Unschedule {title}? The shift keeps its time and returns to Unscheduled for reassignment.",
  unscheduleConfirmAction: "Unschedule",
  unscheduledLaneLabel: "Unscheduled \u00b7 {count}",
  assignTitle: "Assign staff",
  assignBestOptions: "Best options",
  assignNotAvailable: "Not available",
  assignShowEveryone: "Show everyone ({count})",
  assignSearchPlaceholder: "Search staff",
  assignHoursLeft: "{left}h left of {capacity}h",
  assignReasonMissingSkill: "Missing skill: {tag}",
  assignReasonUnavailable: "Unavailable {range}",
  assignReasonBusy: "Already working {range}",
  assignReasonHours: "Would exceed {capacity}h",
  assignEmpty: "No matching staff.",
  assignAction: "Assign {name}",
  monthMore: "+{count} more",
  monthsLong: "January|February|March|April|May|June|July|August|September|October|November|December",
  monthsShort: "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec",
  moveAmount: "Amount",
  moveDialogTitle: "Move to",
  moveDirection: "Direction",
  moveUnit: "Unit",
  name: "Name",
  needsCover: "Needs cover",
  newEvent: "New event",
  next: "Next",
  optionMissingSkills: "missing {skills}",
  optionSkillMismatch: "{count}/{total} skill mismatch",
  noticeBlocked: "Blocked: {reason}",
  noticeWarning: "Note: {reason}",
  pinnedNotice: "Pinned - unpin to make changes.",
  previous: "Previous",
  reassignDialogTitle: "Reassign to",
  modeOperate: "Operate",
  modePlan: "Plan",
  optimizePeriod: "Optimize this roster",
  periodNext: "Next period",
  periodOf: "day {day} of {days}",
  planningPeriodLabel: "Planning period",
  publishAction: "Publish",
  publishBlockedSequential: "Publish the preceding roster first.",
  publishConfirmMessage:
    "Publish {range}? The roster becomes visible to staff, and later changes are tracked against this publication.",
  publishConfirmTitle: "Publish roster",
  publishByLine: "Publish by {date}",
  publishOverdueDay: "Overdue by {days} day",
  publishOverdueDays: "Overdue by {days} days",
  publishedLine: "Published {date}",
  railAddRoster: "Add roster",
  railLabel: "Scheduling horizon",
  railScrollBack: "Scroll back",
  railScrollForward: "Scroll forward",
  redo: "Redo",
  rosterActions: "Roster actions",
  rosterCardLabel: "Roster {range}",
  rosterDeleteConfirmMessage:
    "Delete {range}? Its open generated shifts are removed; assigned shifts stay on the schedule.",
  rosterDeleteConfirmTitle: "Delete roster",
  rosterDeleted: "Deleted roster {range}: {count} open shifts removed",
  rosterGenerate: "Generate shifts",
  rosterProgressFull: "Fully scheduled",
  rosterProgressNotStarted: "Not started",
  rosterPercentScheduled: "{percent}% scheduled",
  scopeNotice: "Nothing outside this roster changes.",
  statusDraft: "Draft",
  statusLocked: "Locked",
  statusPublished: "Published",
  periodPrevious: "Previous period",
  proposalApply: "Apply",
  proposalAppliedMany: "Applied {count} suggestions",
  proposalAppliedOne: "Applied 1 suggestion",
  proposalBlocked: "{count} blocked",
  proposalChanges: "{count} proposed changes",
  proposalNotes: "{count} notes",
  proposalDiscard: "Discard",
  proposalEmpty: "No changes proposed",
  proposalChangeOne: "1 proposed change",
  proposalDropped: "{count} dropped",
  proposalDropChange: "Drop this change",
  proposalKeepChange: "Keep this change",
  proposalReviewHint: "Reviewing a proposal. Apply or discard to edit.",
  proposalShowCurrent: "Current",
  proposalShowProposed: "Proposed",
  proposalPanelTitle: "Proposed changes",
  proposalGroupAssigned: "Assigned ({count})",
  proposalGroupMoved: "Moved ({count})",
  proposalGroupBlocked: "Blocked ({count})",
  proposalGroupUnassigned: "Unassigned ({count})",
  proposalMustBroken: "Some Must rules broken",
  proposalMustKept: "All Must rules kept",
  proposalOpenMany: "{count} shifts open",
  proposalOpenOne: "1 shift open",
  proposalWas: "was {detail}",
  solveQueued: "Queued...",
  solveElapsed: "{seconds} s",
  requiredSkills: "Required skills",
  resizeResources: "Resize the resources column",
  resizeUnscheduled: "Resize the unscheduled panel",
  resourceHeader: "Resource",
  save: "Save",
  savedViews: "Views",
  start: "Start",
  solve: "Solve",
  solveFailed: "Solve failed: {message}",
  solveQuotaRemaining: "{remaining} of {limit} free optimizations left today",
  solveQuotaExhausted:
    "Today's free optimizations are used. More tomorrow — or upgrade for unlimited.",
  solveQuotaUpgrade: "Upgrade",
  resumeFinished: "An optimization finished while you were away.",
  resumeRunning: "An optimization is running for this schedule.",
  resumeChanged:
    "An optimization finished while you were away, but the schedule has changed since. Its result no longer applies.",
  resumeReview: "Review",
  resumeFollow: "Follow",
  resumeDiscard: "Discard",
  openChronaAccount: "Open Chrona account",
  solveSolving: "Optimizing...",
  timeScale: "Time scale",
  timeScaleLeast: "{count} minutes - least space for details",
  timeScaleMinutes: "{count} minutes",
  timeScaleMost: "{count} minutes - most space for details",
  timeScaleShort: "{count} min",
  timeZoneChip: "Displayed time zone",
  timelineLabel: "Resource timeline",
  today: "Today",
  undo: "Undo",
  unpublishAction: "Unpublish",
  unpublishBlockedSequential: "Unpublish the following roster first.",
  unpublishConfirmMessage:
    "Unpublish {range}? The roster returns to draft; its publication history is kept for auditing.",
  unpublishConfirmTitle: "Unpublish roster",
  unitDays: "Days",
  unitHours: "Hours",
  unitWeeks: "Weeks",
  unscheduledAll: "All",
  unscheduledEmpty: "Everything covered.",
  unscheduledEmptyInView: "Nothing in this window.",
  unscheduledFilterLabel: "Filter unscheduled items",
  unscheduledInView: "In view",
  unscheduledTitle: "Unscheduled",
  weekdaysShort: "Sun|Mon|Tue|Wed|Thu|Fri|Sat",
  nextMonth: "Next month",
  previousMonth: "Previous month",
  schedulerSettings: "Scheduler settings",
  weekdaysLong: "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday",
  noDate: "No date",
};

/** Fills {name} placeholders; unknown placeholders are left intact. */
export function formatString(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** Pure merge used by the provider; exported for spec coverage. */
export function resolveStrings(
  overrides?: Partial<SchedulerStrings>,
): SchedulerStrings {
  return overrides
    ? { ...defaultSchedulerStrings, ...overrides }
    : defaultSchedulerStrings;
}

/** One localized sentence: why this shift is flagged and why it was kept. */
export function flagReasonText(
  strings: SchedulerStrings,
  flag: EventFlag,
): string {
  const cause =
    flag.cause === "assigned"
      ? strings.flagCauseAssigned
      : flag.cause === "pinned"
        ? strings.flagCausePinned
        : strings.flagCauseEdited;
  return formatString(strings.flagReason, {
    cause,
    existing: String(flag.existing),
    required: String(flag.required),
  });
}

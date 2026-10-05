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
  readonly cancel: string;
  readonly close: string;
  readonly delete: string;
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
  readonly noticeBlocked: string;
  readonly noticeWarning: string;
  readonly pinnedNotice: string;
  readonly previous: string;
  readonly reassignDialogTitle: string;
  readonly periodNext: string;
  readonly periodOf: string;
  readonly redo: string;
  /** The Roster grid's row of shifts nobody works. */
  readonly rosterOpenShifts: string;
  readonly periodPrevious: string;
  readonly proposalApply: string;
  readonly proposalAppliedMany: string;
  readonly proposalAppliedOne: string;
  readonly proposalDiscard: string;
  readonly proposalEmpty: string;
  readonly proposalDropped: string;
  readonly proposalDropChange: string;
  readonly proposalKeepChange: string;
  readonly proposalKeepAll: string;
  readonly proposalKeepNone: string;
  readonly proposalPerPerson: string;
  readonly proposalPersonShifts: string;
  readonly proposalPersonShiftOne: string;
  readonly proposalHeldBack: string;
  readonly proposalHeldBackHint: string;
  readonly proposalApplyAll: string;
  readonly proposalApplySome: string;
  readonly proposalReviewHint: string;
  readonly proposalShowCurrent: string;
  readonly proposalShowProposed: string;
  /** Roster grid review: shows today's roster while held. */
  readonly proposalHoldCompare: string;
  /** Roster grid review: dims the shifts the proposal leaves alone. */
  readonly proposalChangesOnly: string;
  readonly proposalPanelTitle: string;
  /** Roster grid: the folded change list's tab. */
  readonly proposalPanelToggle: string;
  readonly proposalGroupAssigned: string;
  readonly proposalGroupMoved: string;
  readonly proposalGroupUnassigned: string;
  readonly proposalMustBroken: string;
  readonly proposalMustKept: string;
  readonly proposalWas: string;
  readonly proposalTitle: string;
  readonly proposalSummaryChangeOne: string;
  readonly proposalSummaryChanges: string;
  readonly proposalFilled: string;
  readonly scorecardLabel: string;
  readonly scoreFilled: string;
  readonly scoreMustBroken: string;
  readonly scoreNone: string;
  readonly scoreSome: string;
  readonly scoreNotChecked: string;
  readonly scoreChanges: string;
  readonly scorePeople: string;
  readonly scoreVsNow: string;
  readonly scoreNoChange: string;
  readonly scoreOfPeople: string;
  readonly scorecardToggle: string;
  readonly scoreSearch: string;
  readonly scoreSearchNote: string;
  readonly scoreSearchNoteOne: string;
  readonly scoreSearchUnit: string;
  readonly proposalCheckFoundMany: string;
  readonly proposalCheckFoundOne: string;
  readonly proposalDoubleBookingMany: string;
  readonly proposalDoubleBookingOne: string;
  readonly proposalDoubleBooks: string;
  readonly proposalGroupOutOfDate: string;
  readonly proposalOutOfDate: string;
  readonly proposalReasonChanged: string;
  readonly proposalReasonNewShift: string;
  readonly proposalReasonPersonChanged: string;
  readonly proposalReasonStarted: string;
  readonly proposalReasonUnavailable: string;
  readonly solvePeriodPassed: string;
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
  /** The toolbar's full-screen button, and its name while full screen. */
  readonly fullScreen: string;
  readonly fullScreenExit: string;
  readonly weekdaysLong: string;
  readonly noDate: string;
}

export const defaultSchedulerStrings: SchedulerStrings = {
  agendaEmpty: "Nothing scheduled in this window.",
  apply: "Apply",
  assignedTo: "Assigned to",
  unassigned: "Unassigned",
  cancel: "Cancel",
  close: "Close",
  delete: "Delete",
  deleteConfirmAction: "Delete",
  deleteConfirmCount: "Delete {count} items? This cannot be undone.",
  deleteConfirmMessage: "Delete {title}? This cannot be undone.",
  deleteConfirmTitle: "Confirm delete",
  dialogFinishAfterStart: "Finish must be after start.",
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
  noticeBlocked: "Blocked: {reason}",
  noticeWarning: "Note: {reason}",
  pinnedNotice: "Pinned - unpin to make changes.",
  previous: "Previous",
  reassignDialogTitle: "Reassign to",
  periodNext: "Next period",
  periodOf: "day {day} of {days}",
  redo: "Redo",
  rosterOpenShifts: "Open shifts",
  periodPrevious: "Previous period",
  proposalApply: "Apply",
  proposalAppliedMany: "Applied {count} suggestions",
  proposalAppliedOne: "Applied 1 suggestion",
  proposalDiscard: "Discard",
  proposalEmpty: "No changes proposed",
  proposalDropped: "{count} dropped",
  proposalDropChange: "Drop this change",
  proposalKeepChange: "Keep this change",
  proposalKeepAll: "Keep all",
  proposalKeepNone: "Keep none",
  proposalPerPerson: "{count} changes, summarised per person.",
  proposalPersonShifts: "{count} shifts · {hours} h",
  proposalPersonShiftOne: "1 shift · {hours} h",
  proposalHeldBack: "Held back ({count})",
  proposalHeldBackHint: "Each would double-book someone, so Apply leaves it out.",
  proposalApplyAll: "Apply all {count}",
  proposalApplySome: "Apply {kept} of {count}",
  proposalReviewHint: "Reviewing a proposal. Apply or discard to edit.",
  proposalShowCurrent: "Current",
  proposalShowProposed: "Proposed",
  proposalHoldCompare: "Hold to compare",
  proposalChangesOnly: "Changes only",
  proposalPanelTitle: "Proposed changes",
  proposalPanelToggle: "Proposed changes ({count})",
  proposalGroupAssigned: "Assigned ({count})",
  proposalGroupMoved: "Moved ({count})",
  proposalGroupUnassigned: "Unassigned ({count})",
  proposalMustBroken: "Some Must rules broken",
  proposalMustKept: "All Must rules kept",
  proposalWas: "was {detail}",
  proposalTitle: "Proposed roster",
  proposalSummaryChangeOne: "1 change",
  proposalSummaryChanges: "{count} changes",
  proposalFilled: "{filled} of {total} shifts filled",
  scorecardLabel: "Against today's roster",
  scoreFilled: "Shifts filled",
  scoreMustBroken: "Must rules broken",
  scoreNone: "None",
  scoreSome: "Some",
  scoreNotChecked: "Not checked",
  scoreChanges: "Changes",
  scorePeople: "People affected",
  scoreVsNow: "{delta} vs now",
  scoreNoChange: "No change",
  scoreOfPeople: "of {count} people",
  scorecardToggle: "Scorecard",
  scoreSearch: "Rosters checked",
  scoreSearchNote: "{better} improvements · {seconds} s",
  scoreSearchNoteOne: "1 improvement · {seconds} s",
  scoreSearchUnit: "versions",
  proposalCheckFoundMany: "{count} changes went out of date. Check them, then apply again.",
  proposalCheckFoundOne: "1 change went out of date. Check it, then apply again.",
  proposalDoubleBookingMany: "{count} double bookings",
  proposalDoubleBookingOne: "1 double booking",
  proposalDoubleBooks: "Double-books {person} with {title}",
  proposalGroupOutOfDate: "Out of date ({count})",
  proposalOutOfDate: "{count} out of date",
  proposalReasonChanged: "Changed after the plan was made",
  proposalReasonNewShift: "{person} now has another shift at this time",
  proposalReasonPersonChanged: "{person}'s details changed after the plan was made",
  proposalReasonStarted: "Already started",
  proposalReasonUnavailable: "{person} is now unavailable at this time",
  solvePeriodPassed: "This period has passed",
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
  fullScreen: "Full screen",
  fullScreenExit: "Exit full screen",
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

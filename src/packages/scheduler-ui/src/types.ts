export type SchedulerViewKind =
  | "agenda"
  | "day"
  | "month"
  | "roster"
  | "timeline"
  | "topDown"
  | "week";

export interface TimeWindow {
  readonly end: Date;
  readonly start: Date;
}

export interface SchedulerResource {
  /**
   * The agreement the person works under (SchedulerAgreement.id): its
   * rules in force on a date limit their rest and days in a row.
   * Absent = no agreement, so neither limit is checked for them.
   */
  readonly agreementId?: string;
  /** Weekly capacity in hours; shown as "assigned/capacity" when present. */
  readonly capacityHours?: number;
  /** Employer cost per hour in cents; activates the cost tier
   * (F22 deliverable 2) and travels on the wire (F23: ruled kept). */
  readonly costCentsPerHour?: number;
  /**
   * Generic mapped attributes (skills, location, capacity, ...). The host
   * adapter decides meaning; components only display, group, and filter.
   */
  readonly fields?: readonly SchedulerEventField[];
  /**
   * Classification map: grouping-set name -> value ("Teams" ->
   * "Kitchen", "Locations" -> "Upstairs"). The board groups rows by
   * any set; people without a value in the active set land in the
   * Ungrouped bucket. chr_groupset/chr_group in Dataverse.
   */
  readonly groups?: Readonly<Record<string, string>>;
  readonly id: string;
  readonly name: string;
  /** Short badge labels (e.g. skill tags) rendered on the resource row. */
  readonly tags?: readonly string[];
  /**
   * A note per held tag the resource is not fully backed for (an assigned
   * role whose skills are not all present): the pill shows the warning
   * stroke and the note as its tooltip.
   */
  readonly tagNotes?: Readonly<Record<string, string>>;
}

/**
 * Calendar 365-style mapped display field. The hosting adapter (PCF) maps
 * customer Dataverse columns into these; the components never assume a
 * fixed domain shape beyond id/resource/start/end/title.
 */
export interface SchedulerEventField {
  /** A stable name a host can find the field by; the label is localized. */
  readonly key?: string;
  readonly label: string;
  readonly value: string;
}

export type SchedulerEventStatus = "assigned" | "needsCover";

/**
 * A rostered non-working gap inside a shift: a meal break, a smoko, or
 * the long gap that makes a shift a split. Only gaps the customer
 * actually rosters exist here - an unrostered smoko is absent by
 * design, not missing (Docs/domain_model.md section 4).
 */
export interface ShiftGap {
  readonly end: Date;
  /** "Meal break", "Tea" - shown on hover. */
  readonly label?: string;
  /** Paid gaps count as worked time; every gap still counts as cover. */
  readonly paid?: boolean;
  readonly start: Date;
}

/**
 * One part of a split shift (F48 Split shifts): a split is planned as one
 * and stored as two shifts that share this id. "required" makes one person
 * for both parts a must; "preferred" makes it a preference.
 */
export interface ShiftSplit {
  readonly id: string;
  readonly samePerson: "preferred" | "required";
}

export interface SchedulerUiEvent {
  /**
   * Short code for the Roster grid's compact chip (the Code binding),
   * such as "AM" or "ND". Absent = the title's initials.
   */
  readonly code?: string;
  readonly color?: string;
  readonly end: Date;
  readonly fields?: readonly SchedulerEventField[];
  /** See EventFlag: surplus marker owned by generation runs. */
  readonly flag?: EventFlag;
  /**
   * Rostered non-working gaps inside this shift. `start`/`end` remain the
   * ENVELOPE (first start to last end), which is also the span-of-hours
   * measure, so layout and drag maths are unaffected by gaps.
   */
  readonly gaps?: readonly ShiftGap[];
  /**
   * Organizational bucket (department, team, ...), mapped data like
   * everything else. Groups the unscheduled panel; cross-group drop
   * policy stays a host rule via validateChange.
   */
  readonly groups?: Readonly<Record<string, string>>;
  readonly id: string;
  /**
   * Set by the surface's proposal preview only, never by a host:
   * "proposed" marks a change under review at its proposed place;
   * "ghost" is the faded, non-interactive copy of a moved item at
   * its current place.
   */
  readonly review?: "ghost" | "proposed";
  /**
   * The pin: it holds the shift's time and date and its person, if it
   * has one, and the solver leaves the shift alone (Timefold
   * `@PlanningPin`). Read it through `src/locks.ts`, never off this
   * field directly - one rule interpreted two ways is the defect class
   * described in Docs/domain_model.md section 12.
   */
  readonly pinned?: boolean;
  /**
   * Provenance of a generated shift (domain model 6.4): the
   * reconciliation identity (template, date, slot). Hand-created
   * shifts have none and are invisible to generation.
   */
  readonly origin?: GeneratedShiftOrigin;
  /**
   * Generic requirement tags (skills, certifications, ...). Matched against
   * `SchedulerResource.tags` for mismatch highlighting; the host decides
   * whether a mismatch warns or blocks via validateChange.
   */
  readonly requiredTags?: readonly string[];
  readonly resourceId: string;
  /** Set on each part of a split shift (F48 Split shifts). */
  readonly split?: ShiftSplit;
  readonly start: Date;
  readonly status: SchedulerEventStatus;
  readonly title: string;
  /**
   * A row with no start or end yet. It waits in the unscheduled list
   * only - never on the board, in rules, counts or an optimization -
   * and `start`/`end` are placeholders one duration apart, so a drop
   * starts it on the snapped slot and keeps its length.
   */
  readonly undated?: boolean;
}

/** Why a flagged generated shift could not be removed. */
export type EventFlagCause = "assigned" | "edited" | "pinned";

/**
 * Generation's surplus marker (domain model 6.4): demand no longer
 * requires this shift and reconciliation was not allowed to remove
 * it. Owned by reconciliation - set and cleared only by generation
 * runs, so it survives storage between sessions.
 */
export interface EventFlag {
  readonly cause: EventFlagCause;
  /** Shifts existing at this origin when flagged. */
  readonly existing: number;
  /** Shifts the template requires at this origin. */
  readonly required: number;
}

/** Generated-shift origin identity (domain model 6.4). */
export interface GeneratedShiftOrigin {
  /** Local occurrence day, "YYYY-MM-DD". */
  readonly dateKey: string;
  /**
   * What generation created (ISO instants), so "unedited" stays
   * decidable after the slot or day leaves the template - section
   * 6.4 demands both removing untouched no-longer-required shifts
   * and never touching edited ones, which requires remembering the
   * created values.
   */
  readonly generated: {
    readonly end: string;
    readonly start: string;
    readonly tags: readonly string[];
    readonly title: string;
  };
  readonly slotId: string;
  readonly templateId: string;
}

export type AvailabilityBandKind =
  | "busyElsewhere"
  | "preferred"
  | "unavailable"
  | "unpreferred";

/** The working-time limits an agreement rule sets. */
export type AgreementRuleKind = "daysInARow" | "minimumRest";

/**
 * One dated rule of an agreement, as the maker entered it. The host
 * converts units at its boundary, as it does dates and times: a rest
 * entered in hours arrives here in minutes (hours x 60).
 */
export interface SchedulerAgreementRule {
  /**
   * The rule's last day, inclusive: "YYYY-MM-DD" on the site's clock.
   * Absent = no end.
   */
  readonly end?: string;
  readonly kind: AgreementRuleKind;
  /** Off rules stay with the agreement and never apply. */
  readonly on: boolean;
  /**
   * The rule's first day: "YYYY-MM-DD" on the site's clock. Absent =
   * always.
   */
  readonly start?: string;
  /**
   * minimumRest: whole minutes from the end of one shift to the start
   * of the next. daysInARow: the most whole days a person may work in
   * a row. A value of 0 or less sets no limit.
   */
  readonly value: number;
}

/**
 * A named set of working-time rules people work under. Two rules of
 * one kind in force on one date both hold, so the stricter wins; the
 * rule in force when the later work starts applies.
 */
export interface SchedulerAgreement {
  readonly id: string;
  readonly rules: readonly SchedulerAgreementRule[];
}

/** Host-supplied per-resource availability span rendered as a row background. */
export interface AvailabilityBand {
  readonly end: Date;
  readonly kind: AvailabilityBandKind;
  /**
   * Source label shown on the band ("Ward B roster"). Reserved for
   * `busyElsewhere` cross-view commitments (domain model section 3):
   * read-only spans projected from another roster or any mapped
   * commitment table.
   */
  readonly label?: string;
  readonly resourceId: string;
  readonly start: Date;
}

export interface TimelineConfig {
  /**
   * Week and month open fitted to the board (ruled 2026-09-26): while
   * true the timeline sizes its zoom so the window fills the visible
   * width, and `pxPerHour` waits until the planner zooms.
   */
  readonly fitToWidth?: boolean;
  readonly pxPerHour: number;
  readonly rowHeight: number;
  readonly snapMinutes: number;
}

export const defaultTimelineConfig: TimelineConfig = {
  pxPerHour: 60,
  rowHeight: 56,
  snapMinutes: 15,
};

import * as React from "react";

import type { ContextMenuItem } from "./ContextMenu";
import type { DateNames } from "./dateNames";
import type { TimelineChange } from "./interactions";
import type { RosterDay } from "./rosterLayout";
import type { MustBreachCounts, ScheduleCandidate, ScheduleRuleMatch } from "./schedulingContract";
import type { MustRow, ProposalChange, SolveProgress } from "./solve";
import type { CandidateAnswer, RosterVersion } from "./solveClient";
import type { SchedulerStrings } from "./stringResources";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  SchedulerViewKind,
  TimeWindow,
} from "./types";

/** What the board tells an extension's slots on each render. */
export interface BoardState {
  /** The navigation anchor; absent when the board has no toolbar. */
  readonly anchor?: Date;
  /** Editing is on: the board is editable and no proposal is open. */
  readonly canEdit: boolean;
  /** The events on the board; the proposal's while one is previewed. */
  readonly events: readonly SchedulerUiEvent[];
  readonly resources: readonly SchedulerResource[];
  /** A proposal is open: its change list holds the side panel. */
  readonly reviewing?: boolean;
  /** The side panel's collapse (design R2.02 DR15): whether it is a strip now, and opening it again. */
  readonly sidePanel?: { readonly collapsed: boolean; readonly expand: () => void };
  /** A running solve's progress, as the board shows it; absent when none runs. */
  readonly solveProgress?: SolveProgress;
  /** The board's strings, resolved. */
  readonly strings: SchedulerStrings;
  /** The open shifts on the board; the proposal's while one is previewed. Absent when the host has none to show. */
  readonly unscheduled?: readonly SchedulerUiEvent[];
  readonly view: SchedulerViewKind;
  readonly window: TimeWindow;
}

type Slot = (board: BoardState) => React.ReactNode;

/** A new item the board hands its host: from New event, or a range drawn on the grid. */
export interface CreateRequest {
  readonly end: Date;
  /** The row it was drawn on; absent on the unassigned row. */
  readonly resource?: SchedulerResource;
  readonly start: Date;
}

/** A column right of the Roster grid's last day: its short label and full name. */
export interface RosterStatColumn {
  /** "end": the column reads as amounts, so its header and figures sit right. Absent = centred. */
  readonly align?: "end";
  readonly id: string;
  readonly label: string;
  readonly title: string;
}

/** A person ranked for a set of items: how many they lack something for, and what. */
export interface ResourceFit {
  readonly misfits: number;
  readonly missing: readonly string[];
  readonly resource: SchedulerResource;
}

/**
 * How well a person fits an item, as an extension judges it. The board
 * marks a misfit and shows the reason; whether it warns or blocks stays
 * the host's rule.
 */
export interface FitExtension {
  /** The assign picker's reason a person cannot take the item, given what they lack for it. */
  readonly assignReason: (
    missing: readonly string[],
    resource?: SchedulerResource,
    event?: SchedulerUiEvent,
  ) => string;
  /** What the person lacks for the item; empty when they fit. */
  readonly missing: (
    resource: SchedulerResource | undefined,
    event: SchedulerUiEvent,
  ) => readonly string[];
  /** People for the reassign picker: the ones who fit first, in order. */
  readonly rank: (
    resources: readonly SchedulerResource[],
    events: readonly SchedulerUiEvent[],
  ) => readonly ResourceFit[];
  /** The reassign picker's note on a person who lacks something for some of `total` items. */
  readonly rankNote: (fit: ResourceFit, total: number) => string;
}

/** What the timeline hands an extension for one strip. */
export interface TimelineStripInput {
  readonly events: readonly SchedulerUiEvent[];
  /** The top-level group the strip heads; absent for the strip above ungrouped rows. */
  readonly group?: string;
  /** The grouping set the rows are grouped by. */
  readonly groupSet?: string;
  readonly pxPerHour: number;
  readonly resources: readonly SchedulerResource[];
  readonly window: TimeWindow;
}

/** The timeline's extension points. */
export interface TimelineExtension {
  /**
   * A strip in each top-level group's header, or one row above the
   * people when the rows are not grouped.
   */
  readonly strip?: {
    /** The label of the row above ungrouped rows. */
    readonly label: string;
    /** The strip's content on the canvas. */
    readonly render: (input: TimelineStripInput) => React.ReactNode;
    /**
     * Whether the strip falls short anywhere in the window, across every
     * group. The empty side panel then says nothing is open, not that
     * everything is covered.
     */
    readonly short?: (input: Omit<TimelineStripInput, "group" | "pxPerHour">) => boolean;
  };
}

/** A group of people in the Roster grid, as an extension forms it. */
export interface RosterGroup {
  /** Stable across renders; a dragged shift lights up its group's open row by it. */
  readonly id: string;
  readonly heading: string;
  /** The group's open shifts, in its own open row. */
  readonly open: readonly SchedulerUiEvent[];
  readonly resources: readonly SchedulerResource[];
  /** The group's last row: its label and one cell per day. */
  readonly footer?: {
    readonly cells: readonly React.ReactNode[];
    readonly label: string;
  };
}

/** What the Roster grid hands an extension to form its groups. */
export interface RosterGroupInput {
  readonly days: readonly RosterDay[];
  /** The shifts on the grid, review ghosts left out. */
  readonly events: readonly SchedulerUiEvent[];
  readonly openEvents: readonly SchedulerUiEvent[];
  readonly resources: readonly SchedulerResource[];
}

/** The Roster grid's extension points. */
export interface RosterExtension {
  /** Columns right of the last day, a day wide each; on a period wider than the board they stay at its right edge. */
  readonly columns?: readonly RosterStatColumn[];
  /** A person's values in the shown columns, by column id. */
  readonly columnValues?: (
    resource: SchedulerResource,
    columnIds: readonly string[],
  ) => Readonly<Record<string, React.ReactNode>>;
  /** The id of the group whose open row takes a dragged shift. */
  readonly groupOf?: (event: SchedulerUiEvent) => string;
  /** Groups the people: each group has a heading row, its own open row and its footer. */
  readonly groups?: (input: RosterGroupInput) => readonly RosterGroup[];
  /** Under a person's name. */
  readonly personDetail?: (resource: SchedulerResource) => React.ReactNode;
  /**
   * A last row that stays at the bottom of the grid: a label under the
   * names, a note across the days, and a figure under each column that
   * has one. Absent = none.
   */
  readonly totals?: {
    readonly label: string;
    readonly note?: React.ReactNode;
    readonly values: (columnIds: readonly string[]) => Readonly<Record<string, React.ReactNode>>;
  };
}

/** A tile an extension adds to the review's scorecard, after the board's own. */
export interface ScorecardTile {
  /** Stable; the tile's test id is "score-{id}". */
  readonly id: string;
  readonly icon?: React.ReactElement;
  readonly label: string;
  /**
   * The change from now, worded as the board's other tiles word it:
   * "+A$120 vs now", or "No change" when delta is 0. text is the
   * signed amount. lowerIsBetter gives the note its tone; absent = none.
   */
  readonly change?: { readonly delta: number; readonly lowerIsBetter?: boolean; readonly text: string };
  /** Under the value when there is no change to show. */
  readonly note?: string;
  /** A second line in the warning tone, such as who the figure leaves out. */
  readonly attention?: string;
  /** The label's tip. */
  readonly title?: string;
  /** The figure as Apply would leave the roster. */
  readonly value: string;
}

/** A roster and its people, as the review hands it to an extension. */
export interface ReviewRoster {
  /** The roster as Apply would leave it: every shift at its kept place. */
  readonly events: readonly SchedulerUiEvent[];
  readonly resources: readonly SchedulerResource[];
  /** The period the run solved. */
  readonly window: TimeWindow;
}

/** One roster's Must rows, counted on the board, with the matches behind them. */
export interface BoardMustCheck {
  readonly matches: readonly ScheduleRuleMatch[];
  readonly mustBreaches: MustBreachCounts;
}

/** The people a Must report leaves unchecked. */
export interface UncheckedPeople {
  /** People on the board whose limits are not checked. */
  readonly count: number;
  /** Nobody on the board is checked, so the board does not use the limits. */
  readonly nobody: boolean;
}

/**
 * The review's Must report, as an extension supplies it. With it the
 * scorecard counts each Must row and opens to the shifts behind it;
 * without it the board says only whether the solver kept the Must
 * rules.
 */
export interface ReviewExtension {
  /**
   * Counts every Must row on a roster at once, with no call: after the
   * planner holds back a change, it stands in for the solver's counts.
   */
  readonly checkMust: (roster: ReviewRoster) => BoardMustCheck;
  /**
   * A drill-down line's words for a match, such as an agreement period
   * and how far it is off (R2.18 Decision 6); undefined = the board's.
   */
  readonly describe?: (match: ScheduleRuleMatch, roster: ReviewRoster, names: DateNames) => string | undefined;
  /** The agreement rows the roster's rules name, shown at 0 too. Absent = only rows with a count. */
  readonly ruleRows?: readonly MustRow[];
  /** Who the report does not check in a period, and whether anyone is. */
  readonly unchecked: (roster: Omit<ReviewRoster, "events">) => UncheckedPeople;
}

/** What the board asks an extension for "Why not…?". */
export interface WhyNotRequest {
  /** The person and the shift, in the board's ids. */
  readonly candidate: ScheduleCandidate;
  /** The roster's version now; read when the answer arrives (S4-2). */
  readonly currentRosterVersion: () => RosterVersion;
  /** The roster as it would be applied: the current one plus the kept changes. */
  readonly events: readonly SchedulerUiEvent[];
  readonly resources: readonly SchedulerResource[];
  /** The version of the roster `events` is. */
  readonly rosterVersion: RosterVersion;
  /** Fires when the planner closes the question or asks another. */
  readonly signal: AbortSignal;
  /** The open proposal's period, else the roster period holding the shift. */
  readonly window: TimeWindow;
}

/** The answer, or why there is none: it never throws. */
export type WhyNotAnswer = CandidateAnswer;

/**
 * "Why not…?" (E2, A2): the planner picks a person for a shift and the
 * extension asks the solver what that would add and remove. The board
 * shows the answer in the change list, verdict first, and on the
 * current roster offers an assign or a swap its own Must checks pass.
 */
export interface WhyNotExtension {
  readonly ask: (request: WhyNotRequest) => Promise<WhyNotAnswer>;
  /**
   * A Must match the move adds, in the extension's words (such as the
   * agreement's limit); undefined = the board's own words.
   */
  readonly describe?: (match: ScheduleRuleMatch, roster: ReviewRoster) => string | undefined;
  /** Shifts that started before this are history: no question about them. Absent = none. */
  readonly now?: Date;
  /** Whether a person's rest and day limits go unchecked in the period. */
  readonly unchecked?: (resource: SchedulerResource, roster: Omit<ReviewRoster, "events">) => boolean;
  /**
   * Writes a swap's two moves as one undo step, one after the other, and
   * stops at the first that fails, saying so (design RR3-F4): a half-done
   * swap is never silent. Absent = the board's onEventsChange.
   */
  readonly writeInOrder?: (changes: readonly TimelineChange[]) => void;
}

/** A preferred or unpreferred band a roster does not keep. */
export interface PreferenceMiss {
  readonly end: Date;
  readonly kind: "preferred" | "unpreferred";
  readonly resourceId: string;
  readonly start: Date;
}

/** How many of the rostered people's preferences a roster keeps, and which it does not (E4, A4). */
export interface PreferencesMet {
  readonly met: number;
  readonly total: number;
  /** Earliest first. */
  readonly unmet: readonly PreferenceMiss[];
}

/** What the board gives an extension to group changes with. */
export interface ChangeGroupsInput {
  /** The proposal's changes, with which ones the planner dropped. */
  readonly changes: readonly { readonly change: ProposalChange; readonly dropped: boolean }[];
  /** Bring a change into view on the board and select it. */
  readonly onFocus: (change: ProposalChange) => void;
  readonly resourceNameById: ReadonlyMap<string, string>;
  /** Keep or drop these changes together. */
  readonly setDropped: (changeIds: readonly string[], dropped: boolean) => void;
}

/** Groups an extension shows first in the change list, and the changes they own. */
export interface ChangeGroups {
  /** The changes the groups show: the board's own groups leave them out. */
  readonly claimed: ReadonlySet<string>;
  readonly node: React.ReactNode;
}

/**
 * A scenario package adds its own content to the board through these
 * slots. Without an extension the board renders none of it.
 */
/** What the board gives a side panel of an extension's own. */
export interface SidePanelControls {
  /** Collapse the panel to its strip at the side; the strip opens it again. */
  readonly onCollapse: () => void;
}

export interface BoardExtension {
  /**
   * Groups at the top of the change list, before the board's own, such
   * as the covers a repair makes. Absent, or undefined for a proposal =
   * the board's groups only.
   */
  readonly changeGroups?: (input: ChangeGroupsInput) => ChangeGroups | undefined;
  /**
   * The host's own form for a new item, opened instead of the board's
   * dialog. Absent = the board's dialog.
   */
  readonly createEvent?: (request: CreateRequest) => void;
  /** How people fit items. Absent = everyone fits everything. */
  readonly fit?: FitExtension;
  /**
   * A mark after a person's name on their row, such as a glyph with its
   * reason; `roster` is the people and the period the view shows.
   */
  readonly personMark?: (
    resource: SchedulerResource,
    roster: Omit<ReviewRoster, "events">,
  ) => React.ReactNode;
  /**
   * Preferences met on a roster (E4, A4): the review's tile counts
   * Optimize's window now and as Apply would leave it. Absent = no tile.
   */
  readonly preferencesMet?: (roster: ReviewRoster) => PreferencesMet;
  /** The extension's own counts for the period as Apply leaves it, saved with the board's (F53 saved counts). */
  readonly outcomeFigures?: (roster: ReviewRoster) => Readonly<Record<string, number>>;
  /** The review's Must report. Absent = the solver's verdict only. */
  readonly review?: ReviewExtension;
  /** The extension's words for some of the board's, where its product names a thing its own way. */
  readonly strings?: Partial<SchedulerStrings>;
  /**
   * Tiles after the board's own on the review's scorecard, from the
   * roster now and as Apply would leave it, over Optimize's window.
   * Absent = none.
   */
  readonly scoreTiles?: (rosters: { readonly now: ReviewRoster; readonly proposed: ReviewRoster }) => readonly ScorecardTile[];
  /** "Why not…?" on a shift and on a change. Absent = no question. */
  readonly whyNot?: WhyNotExtension;
  /** The extension's own items in a shift's menu, after the board's. Absent = none. */
  readonly shiftMenu?: (event: SchedulerUiEvent) => readonly ContextMenuItem[];
  /** A person's menu, opened from their name. Absent, or no items for the person = no menu. */
  readonly personMenu?: (resource: SchedulerResource) => readonly ContextMenuItem[];
  /**
   * Under the toolbar. When it renders, it takes the place of the
   * board's period bar and of its Optimize entry.
   */
  readonly header?: Slot;
  /** Dialogs and other layers, rendered after the board's own. */
  readonly overlays?: Slot;
  /** A notice of the extension's own at the top of the board, under the period bar. */
  readonly notice?: Slot;
  /** The Roster grid's columns, groups and person details. */
  readonly roster?: (board: BoardState) => RosterExtension | undefined;
  /**
   * A panel of the extension's own in the side panel's place, while no
   * review or question has it. Absent, or undefined = none. The panel
   * puts the board's Collapse in its header (design R2.02 DR15).
   */
  readonly sidePanel?: (
    board: BoardState,
    panel: SidePanelControls,
  ) => { readonly label: string; readonly node: React.ReactNode } | undefined;
  /** The timeline's strips. */
  readonly timeline?: (board: BoardState) => TimelineExtension | undefined;
  readonly toolbar?: {
    /** After the day, week and month switcher. */
    readonly afterIntervals?: Slot;
    /** Before the day, week and month switcher. */
    readonly beforeIntervals?: Slot;
    /** The toolbar's first item. */
    readonly start?: Slot;
  };
}

const BoardExtensionContext = React.createContext<BoardExtension | undefined>(
  undefined,
);

export function BoardExtensionProvider(props: {
  readonly children?: React.ReactNode;
  readonly extension?: BoardExtension;
}): JSX.Element {
  return (
    <BoardExtensionContext.Provider value={props.extension}>
      {props.children}
    </BoardExtensionContext.Provider>
  );
}

export function useBoardExtension(): BoardExtension | undefined {
  return React.useContext(BoardExtensionContext);
}

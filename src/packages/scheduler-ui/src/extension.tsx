import * as React from "react";

import type { RosterDay } from "./rosterLayout";
import type { SolveProgress } from "./solve";
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
  /** A running solve's progress, as the board shows it; absent when none runs. */
  readonly solveProgress?: SolveProgress;
  /** The board's strings, resolved. */
  readonly strings: SchedulerStrings;
  readonly view: SchedulerViewKind;
  readonly window: TimeWindow;
}

type Slot = (board: BoardState) => React.ReactNode;

/** A column right of the Roster grid's last day: its short label and full name. */
export interface RosterStatColumn {
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
  /** The assign picker's reason a person cannot take the item. */
  readonly assignReason: (missing: readonly string[]) => string;
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
  /** Columns right of the last day, a day wide each, shown while the room allows. */
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
}

/**
 * A scenario package adds its own content to the board through these
 * slots. Without an extension the board renders none of it.
 */
export interface BoardExtension {
  /** How people fit items. Absent = everyone fits everything. */
  readonly fit?: FitExtension;
  /**
   * Under the toolbar. When it renders, it takes the place of the
   * board's period bar and of its Optimize entry.
   */
  readonly header?: Slot;
  /** Dialogs and other layers, rendered after the board's own. */
  readonly overlays?: Slot;
  /** The Roster grid's columns, groups and person details. */
  readonly roster?: (board: BoardState) => RosterExtension | undefined;
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

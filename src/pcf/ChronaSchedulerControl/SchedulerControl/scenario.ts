/**
 * A scenario package's part of the control. The Chrona Workforce
 * Scheduler control passes one; this control passes none and runs as
 * the generic scheduler. A scenario is fixed for a control's lifetime,
 * so the host calls its hooks on every render or never.
 */
import type {
  AvailabilityBand,
  BoardExtension,
  DraftEventInput,
  PreferenceStore,
  RowDecoration,
  ScheduleRule,
  SchedulerPeriodConfig,
  SchedulerUiEvent,
  TagColorMap,
  TimeWindow,
} from "@chrona/scheduler-ui";

import type { ChronaProduct, HostConfig } from "./configLoader";
import type { IInputs } from "./generated/ManifestTypes";
import type { NoticeLevel } from "./hostNotifications";
import type { TimeRange } from "./solveReads";

type Entity = ComponentFramework.WebApi.Entity;
type WebApi = ComponentFramework.Context<unknown>["webAPI"];

/** What every scenario's loaded rows carry for the board's own people. */
export interface ScenarioConfig {
  /** Notes on a person's tags, by resource id in lower case. */
  readonly resourceNotes?: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** A person's tags, by resource id in lower case. */
  readonly resourceTags?: ReadonlyMap<string, readonly string[]>;
}

/** What the host hands the scenario early in each render. */
export interface ScenarioDataInput<TConfig extends ScenarioConfig> {
  /** The scenario's rows; absent until the settings load. */
  readonly config: TConfig | undefined;
  readonly context: ComponentFramework.Context<IInputs>;
  /** A stored instant on the board. */
  readonly toDisplay: (stored: Date) => Date;
}

/** The scenario's data for the board, the rules and the solve. */
export interface ScenarioData {
  /** Unavailable spans on the board, for the rules and the solve. */
  readonly bands: readonly AvailabilityBand[];
  /** Tag choices for the create and edit dialogs. */
  readonly availableTags?: readonly string[];
  /** Which optimizer inputs the scenario's rows supply. */
  readonly capabilities: { readonly availability: boolean; readonly roles: boolean };
  /** Spans drawn on people's rows. */
  readonly decorations: readonly RowDecoration[];
  /** Tags an item carries now, when they differ from its loaded row. */
  readonly eventTags?: (eventId: string) => readonly string[] | undefined;
  /** Rules evaluated with the board's own. */
  readonly extraRules: readonly ScheduleRule[];
  readonly tagColors?: TagColorMap;
  readonly tagMode?: "multiple" | "single";
}

/** What the host hands the scenario late in each render. */
export interface ScenarioBoardInput<TConfig extends ScenarioConfig, TData extends ScenarioData> {
  readonly config: TConfig | undefined;
  readonly context: ComponentFramework.Context<IInputs>;
  /** What the scenario's useData returned this render. */
  readonly data: TData;
  /** The free calendar settings. */
  readonly hostConfig: HostConfig<TConfig>;
  /** The note appended when a change stays on this board only. */
  readonly localOnlyNote: string;
  readonly notify: (level: NoticeLevel, text: string) => void;
  /** Writes the bound row; reports `note` when it lands. */
  readonly patchRecord: (recordId: string, payload: Record<string, unknown>, note: string) => void;
  readonly periodConfig?: SchedulerPeriodConfig;
  /** Whether the entitlement allows the scenario's own features. */
  readonly scenarioAllowed: boolean;
  /** Board items with a person, on the board's clock. */
  readonly scheduled: readonly SchedulerUiEvent[];
  /** Changes the board's items in place (no undo entry). */
  readonly setEvents: (update: (previous: readonly SchedulerUiEvent[]) => readonly SchedulerUiEvent[]) => void;
  readonly store: PreferenceStore;
  /** A board instant as stored. */
  readonly toStored: (display: Date) => Date;
  /** Open board items, on the board's clock. */
  readonly unscheduled: readonly SchedulerUiEvent[];
  readonly window: TimeWindow;
  readonly workItems: ComponentFramework.PropertyTypes.DataSet;
}

/** The scenario's board extension and its writes. */
export interface ScenarioBoard {
  /** Fields a new item's row gets beyond the board's own. */
  readonly createPayload?: (draft: DraftEventInput) => Record<string, unknown>;
  readonly extension?: BoardExtension;
  readonly onRequiredTagsChange?: (event: SchedulerUiEvent, tags: readonly string[]) => void;
}

export interface ControlScenario<
  TConfig extends ScenarioConfig = ScenarioConfig,
  TData extends ScenarioData = ScenarioData,
> {
  /** The product a calendar this control creates names. */
  readonly product: ChronaProduct;
  /** Loads the scenario's rows with the board's settings; never throws. */
  loadConfig(webApi: WebApi, calendar: Entity | undefined): Promise<TConfig>;
  /** Reads the scenario's unavailable spans for a solve's freshness check. */
  readBands?(
    webApi: ComponentFramework.WebApi,
    range: TimeRange,
  ): Promise<readonly AvailabilityBand[] | undefined>;
  useBoard(input: ScenarioBoardInput<TConfig, TData>): ScenarioBoard;
  useData(input: ScenarioDataInput<TConfig>): TData;
}

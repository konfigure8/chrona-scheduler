/**
 * Pure mapping between the bound dataset and the package's host types.
 * No React, no side effects: the hook feeds the dataset in and gets
 * events/resources plus write-payload builders out. Values are handled
 * defensively because the same API surface returns different shapes
 * per host: real Dataverse hands lookups as EntityReference and dates
 * as Date, while the test harness's CSV simulation hands plain
 * strings.
 *
 * Resources are DERIVED from work-item lookups here - the zero-config
 * fallback of the decided binding model (resources are reference data
 * loaded via WebAPI from the mapping config; deriving keeps the
 * control rendering before any chr_ config exists). People with no
 * assignments appear once the config-driven load lands (F3).
 */
import type {
  GeneratedShiftOrigin,
  SchedulerEventField,
  SchedulerResource,
  SchedulerUiEvent,
  SchedulerRepresentation,
  SchedulerTimeScale,
} from "@chrona/scheduler-ui";

type DataSet = ComponentFramework.PropertyTypes.DataSet;

/** Sentinel resourceId for needs-cover rows (never rendered as a row). */
export const UNASSIGNED_RESOURCE_ID = "chrona-unassigned";

const NEEDS_COVER_WORDS = new Set([
  "needs cover",
  "needscover",
  "open",
  "unassigned",
  "unscheduled",
]);

function readString(record: DataSet["records"][string], alias: string): string {
  const formatted = record.getFormattedValue(alias);
  if (formatted) {
    return formatted;
  }
  const raw = record.getValue(alias);
  return typeof raw === "string" ? raw : "";
}

/** Record reader that follows the alias-or-convention resolution. */
function reader(
  dataset: DataSet,
): (alias: string) => string {
  return (alias: string) => resolveColumn(dataset, alias) ?? alias;
}

function readDate(
  record: DataSet["records"][string],
  alias: string,
): Date | undefined {
  const raw = record.getValue(alias);
  if (raw instanceof Date) {
    return raw;
  }
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof raw === "number") {
    return new Date(raw);
  }
  return undefined;
}

function readBoolean(
  record: DataSet["records"][string],
  alias: string,
): boolean {
  const raw = record.getValue(alias);
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number") {
    return raw !== 0;
  }
  if (typeof raw === "string") {
    return ["1", "true", "yes"].includes(raw.trim().toLowerCase());
  }
  return false;
}

interface LookupValue {
  readonly entityType?: string;
  readonly id?: string;
  readonly name?: string;
}

/** Lookup columns arrive as EntityReference in Dataverse, string in CSV. */
function readLookup(
  record: DataSet["records"][string],
  alias: string,
): LookupValue {
  const raw = record.getValue(alias) as unknown;
  if (raw && typeof raw === "object") {
    const reference = raw as ComponentFramework.EntityReference & {
      readonly etn?: string;
    };
    const id =
      typeof reference.id === "object" && reference.id
        ? reference.id.guid
        : (reference.id as unknown as string | undefined);
    return {
      entityType: reference.etn ?? undefined,
      id,
      name: reference.name ?? undefined,
    };
  }
  if (typeof raw === "string" && raw.length > 0) {
    return { id: raw, name: raw };
  }
  return {};
}

/**
 * Greenfield convention: when a property-set alias is unmapped, the
 * matching chr_shift column name resolves it. Binding the shipped
 * chr_shift table therefore needs zero mapping configuration; custom
 * tables map property-sets in the designer as usual.
 */
const CONVENTION_COLUMNS: Record<string, string> = {
  bundleId: "chr_bundleid",
  end: "chr_end",
  group: "chr_group",
  pinned: "chr_pinned",
  provenance: "chr_provenance",
  publishState: "chr_shiftpublishstate",
  resource: "chr_resource",
  role: "chr_role",
  start: "chr_start",
  status: "chr_shiftstatus",
  subgroup: "chr_subgroup",
  title: "chr_name",
  windowEnd: "chr_windowend",
  windowStart: "chr_windowstart",
};

/**
 * The dataset key a property-set alias reads through: the alias when
 * mapped, else the convention column when the dataset carries it.
 */
export function resolveColumn(
  dataset: DataSet,
  alias: string,
): string | undefined {
  if (dataset.columns.some((column) => column.alias === alias)) {
    return alias;
  }
  const convention = CONVENTION_COLUMNS[alias];
  if (
    convention &&
    dataset.columns.some((column) => column.name === convention)
  ) {
    return convention;
  }
  return undefined;
}

/**
 * Pinned choice values on the shipped chr_shift lifecycle columns
 * (Docs/pcf_config_schema.md). A choice column is read and written by
 * value, so a user's translated labels never reach the matcher; a text
 * column keeps the word matching above.
 */
export const STATUS_CHOICE = { assigned: 1, open: 2 } as const;

/**
 * A status value read back through the Web API says "open" the way
 * the view's mapper reads it: the pinned choice value, or a word.
 */
export function isOpenStatusValue(value: unknown): boolean {
  if (typeof value === "number") {
    return value === STATUS_CHOICE.open;
  }
  return typeof value === "string" && NEEDS_COVER_WORDS.has(value.trim().toLowerCase());
}

/**
 * A choice value as a dataset hands it back. Power Apps returns it as
 * text ("1"), found in the proof environment 2026-09-30; the test
 * harness and the Web API use numbers. Both read the same.
 */
export function choiceNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return undefined;
}

/** The bound column's data type behind a property-set alias. */
export function columnDataType(
  dataset: DataSet,
  alias: string,
): string | undefined {
  const key = resolveColumn(dataset, alias);
  if (key === undefined) {
    return undefined;
  }
  const column =
    key === alias
      ? dataset.columns.find((candidate) => candidate.alias === alias)
      : dataset.columns.find((candidate) => candidate.name === key);
  return column?.dataType;
}

/** True when the alias is bound to a choice column. */
export function isChoiceColumn(dataset: DataSet, alias: string): boolean {
  return columnDataType(dataset, alias) === "OptionSet";
}

/** True when a column with this property-set alias is available. */
export function hasColumn(dataset: DataSet, alias: string): boolean {
  return resolveColumn(dataset, alias) !== undefined;
}

/** Logical column name behind a property-set alias, for write payloads. */
export function columnLogicalName(
  dataset: DataSet,
  alias: string,
): string | undefined {
  const key = resolveColumn(dataset, alias);
  if (key === undefined) {
    return undefined;
  }
  if (key === alias) {
    return dataset.columns.find((column) => column.alias === alias)?.name;
  }
  return key;
}

/** The origin JSON column: slot, date key and the created snapshot. */
export function parseOrigin(
  templateId: string | undefined,
  originJson: string,
): GeneratedShiftOrigin | undefined {
  if (!templateId || !originJson.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(originJson) as Partial<GeneratedShiftOrigin>;
    if (
      typeof parsed.dateKey !== "string" ||
      typeof parsed.slotId !== "string" ||
      !parsed.generated ||
      typeof parsed.generated.start !== "string" ||
      typeof parsed.generated.end !== "string" ||
      typeof parsed.generated.title !== "string"
    ) {
      return undefined;
    }
    return {
      dateKey: parsed.dateKey,
      generated: {
        end: parsed.generated.end,
        start: parsed.generated.start,
        tags: Array.isArray(parsed.generated.tags) ? parsed.generated.tags : [],
        title: parsed.generated.title,
      },
      slotId: parsed.slotId,
      templateId,
    };
  } catch {
    return undefined;
  }
}

/** The origin JSON written on create (template id travels as the lookup). */
export function serializeOrigin(origin: GeneratedShiftOrigin): string {
  return JSON.stringify({
    dateKey: origin.dateKey,
    generated: origin.generated,
    slotId: origin.slotId,
  });
}

/**
 * The host serves a view one page at a time, 25 rows by default. The
 * scheduler needs the whole view, so the control asks for the largest
 * page the platform serves and keeps loading pages until none remain
 * or the row cap is reached; past the cap it says so.
 */
export const DATASET_PAGE_SIZE = 5000;
export const DATASET_ROW_CAP = 20000;

export interface PagingStep {
  /** Ask the dataset for its next page now. */
  readonly loadNextPage: boolean;
  /** Rows remain beyond the cap; the control shows a notice. */
  readonly capReached: boolean;
}

export function pagingStep(state: {
  readonly loading: boolean;
  readonly hasNextPage: boolean;
  readonly loadedRows: number;
}): PagingStep {
  const roomLeft = state.loadedRows < DATASET_ROW_CAP;
  return {
    loadNextPage: !state.loading && state.hasNextPage && roomLeft,
    capReached: state.hasNextPage && !roomLeft,
  };
}

/** A record command as the platform hands it back; the method is absent from the platform typings. */
export interface PlatformRecordCommand {
  readonly commandId?: string;
  readonly commandButtonId?: string;
  readonly label?: string;
  readonly canExecute?: boolean;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly execute?: () => unknown;
}

export interface PlatformMenuItem {
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

/**
 * Microsoft's own commands that belong to the view, not to a record, or
 * that the board already offers: the platform hands back the whole grid
 * command bar for a record, so a record menu keeps only what acts on
 * the record. A maker's own commands carry other prefixes and always
 * pass.
 */
const PLATFORM_VIEW_LEVEL =
  /NewRecord|\.New\b|Refresh|Visualize|PowerBI|Excel|Xlsx|Word|Export|Import|Template|Delete|\.Edit\b|Model|OpenRecordItem|ReadOnlyGrid|ShowChart|Chart|SendShortcutView|SendShortcutSelected\b(?!\.)|ReportMenu/i;
/** Microsoft's own command ids start with one of these; a maker's do not. */
const PLATFORM_PREFIXES = ["Mscrm.", "AIBuilder."];

/**
 * The app's own record commands as context-menu items: visible,
 * executable, labelled, one per label. The platform's Open Record is
 * left out because Open record is on the menu already (F28).
 */
export function mapRecordCommands(result: unknown): readonly PlatformMenuItem[] {
  const wrapped = result as { readonly commands?: unknown } | null | undefined;
  const list: unknown[] = Array.isArray(result)
    ? result
    : Array.isArray(wrapped?.commands)
      ? wrapped.commands
      : [];
  const items: PlatformMenuItem[] = [];
  for (const raw of list) {
    const command = raw as PlatformRecordCommand | null | undefined;
    if (!command || typeof command.execute !== "function" || !command.label) {
      continue;
    }
    if (command.visible === false || command.canExecute === false) {
      continue;
    }
    const buttonId = command.commandButtonId ?? "";
    const ids = `${command.commandId ?? ""} ${buttonId}`;
    const platformOwned = PLATFORM_PREFIXES.some(
      (prefix) => buttonId.startsWith(prefix) || (command.commandId ?? "").startsWith(prefix),
    );
    if (platformOwned && (ids.includes("AIBuilder.") || PLATFORM_VIEW_LEVEL.test(ids))) {
      continue;
    }
    if (items.some((item) => item.label === command.label)) {
      continue;
    }
    const execute = command.execute;
    items.push({
      disabled: command.disabled === true,
      id: `platform:${command.commandId ?? buttonId ?? command.label}`,
      label: command.label,
      onSelect: () => {
        void execute();
      },
    });
  }
  return items;
}

/** Asks the platform for a record's commands where the method exists (model-driven apps); elsewhere, none. */
export async function retrieveRecordCommands(
  dataset: DataSet | undefined,
  recordId: string,
): Promise<readonly PlatformMenuItem[]> {
  const method = (
    dataset as { retrieveRecordCommand?: (ids: string[]) => Promise<unknown> } | undefined
  )?.retrieveRecordCommand;
  if (typeof method !== "function") {
    return [];
  }
  try {
    return mapRecordCommands(await method.call(dataset, [recordId]));
  } catch {
    return [];
  }
}

export interface MappedData {
  readonly events: readonly SchedulerUiEvent[];
  /** Distinct assignees seen in the lookups, as schedule rows. */
  readonly resources: readonly SchedulerResource[];
  /** Logical name of the lookup's target entity, when the host says. */
  readonly resourceEntityType?: string;
  /** Whether the Resource property-set is bound at all (lanes need it). */
  readonly resourceMapped: boolean;
  /** Rows skipped for missing/invalid required values. */
  readonly skipped: number;
}

/** An undated row's placeholder start; only its length matters until a drop dates it. */
const UNDATED_ANCHOR = new Date(0);
/** How long an undated row lasts on the board without a Duration binding. */
export const DEFAULT_UNDATED_MINUTES = 60;

/** The Duration binding in whole minutes, or one hour when it is unbound or empty. */
function undatedMinutes(record: DataSet["records"][string], alias: string, bound: boolean): number {
  if (!bound) {
    return DEFAULT_UNDATED_MINUTES;
  }
  const raw = record.getValue(alias);
  const minutes = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : DEFAULT_UNDATED_MINUTES;
}

/** The hover card's labels for a row's own fields, localized by the host. */
export interface FieldLabels {
  readonly bundle: string;
  readonly provenance: string;
  readonly publishState: string;
  readonly status: string;
}

const DEFAULT_FIELD_LABELS: FieldLabels = {
  bundle: "Bundle",
  provenance: "Provenance",
  publishState: "Publish state",
  status: "Status",
};

export function mapWorkItems(
  dataset: DataSet | undefined,
  labels: FieldLabels = DEFAULT_FIELD_LABELS,
): MappedData {
  const events: SchedulerUiEvent[] = [];
  const resourcesById = new Map<string, SchedulerResource>();
  let resourceEntityType: string | undefined;
  let skipped = 0;
  if (!dataset || dataset.loading) {
    return { events, resources: [], resourceMapped: false, skipped };
  }
  const resourceMapped = hasColumn(dataset, "resource");
  const statusMapped = hasColumn(dataset, "status");
  const durationMapped = hasColumn(dataset, "duration");
  const key = reader(dataset);
  for (const recordId of dataset.sortedRecordIds) {
    const record = dataset.records[recordId];
    if (!record) {
      continue;
    }
    const readStart = readDate(record, key("start"));
    const readEnd = readDate(record, key("end"));
    const title = readString(record, key("title")) || recordId;
    // A row with no dates at all waits in the unscheduled list until a drop dates it.
    const undated = !readStart && !readEnd;
    if (!undated && (!readStart || !readEnd || readEnd <= readStart)) {
      skipped += 1;
      continue;
    }
    const start = readStart ?? UNDATED_ANCHOR;
    const end =
      readEnd ??
      new Date(UNDATED_ANCHOR.getTime() + undatedMinutes(record, key("duration"), durationMapped) * 60_000);
    const lookup = readLookup(record, key("resource"));
    const resourceId = lookup.id;
    if (resourceId && !resourcesById.has(resourceId)) {
      resourcesById.set(resourceId, {
        id: resourceId,
        name: lookup.name ?? resourceId,
      });
    }
    if (!resourceEntityType && lookup.entityType) {
      resourceEntityType = lookup.entityType;
    }
    const statusText = statusMapped
      ? readString(record, key("status")).trim().toLowerCase()
      : "";
    // A choice status is read by its pinned value; a text status by word.
    const statusOpen = statusMapped
      ? isChoiceColumn(dataset, "status")
        ? choiceNumber(record.getValue(key("status"))) === STATUS_CHOICE.open
        : NEEDS_COVER_WORDS.has(statusText)
      : false;
    // Without a Resource binding nobody is expected in a lane: a row is
    // scheduled by its times alone (ruled 2026-09-14).
    const missingAssignee = resourceMapped && !resourceId;
    const needsCover = statusOpen || missingAssignee;
    const fields: SchedulerEventField[] = [];
    if (statusMapped && statusText) {
      fields.push({ key: "status", label: labels.status, value: readString(record, key("status")) });
    }
    const publishState = readString(record, key("publishState"));
    if (publishState) {
      fields.push({ key: "publishState", label: labels.publishState, value: publishState });
    }
    const provenance = readString(record, key("provenance"));
    if (provenance) {
      fields.push({ key: "provenance", label: labels.provenance, value: provenance });
    }
    const bundleId = readString(record, key("bundleId"));
    if (bundleId) {
      fields.push({ key: "bundle", label: labels.bundle, value: bundleId });
    }
    const groupValue = readString(record, key("group"));
    const subgroupValue = readString(record, key("subgroup"));
    // The row's role is its one requirement tag (the roster is written in roles).
    const role = readLookup(record, key("role"));
    // F25 (Q2-A): generated-item provenance persists as the template
    // lookup + an origin JSON column; reconcile reads it back here.
    const origin = parseOrigin(
      readLookup(record, key("template")).id,
      readString(record, key("origin")),
    );
    // The Code binding: the Roster grid's compact chip shows it (F31 rework).
    const code = readString(record, key("code")).trim();
    events.push({
      ...(code ? { code } : {}),
      end,
      fields: fields.length > 0 ? fields : undefined,
      groups:
        groupValue || subgroupValue
          ? {
              ...(groupValue ? { Team: groupValue } : {}),
              ...(subgroupValue ? { Subteam: subgroupValue } : {}),
            }
          : undefined,
      id: recordId,
      ...(origin ? { origin } : {}),
      pinned: readBoolean(record, key("pinned")) || undefined,
      requiredTags: role.name ? [role.name] : undefined,
      resourceId:
        !undated && !needsCover && resourceId ? resourceId : UNASSIGNED_RESOURCE_ID,
      start,
      status: undated || needsCover ? "needsCover" : "assigned",
      title,
      ...(undated ? { undated: true } : {}),
    });
  }
  return {
    events,
    resourceEntityType,
    resourceMapped,
    resources: [...resourcesById.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    skipped,
  };
}

/**
 * In-place write payload for a move/resize/assign (the decided row-edit
 * semantics; cancel-and-supersede can replace this builder without
 * touching the package). Lookup rebinding needs the target entity-set
 * name from metadata; when unavailable the caller keeps the edit local.
 * Provenance stamps "manual" whenever the column is mapped - the
 * minimum-disruption feed (section 13.5).
 */
/** Stamped into the mapped provenance column on every write the control makes. */
export type WriteProvenance = string;

export const PROVENANCE_MAX_LENGTH = 200;

/**
 * Who made the change, readable in any view: "manual by Matt Luthi" for a
 * person's edit, "solver by Matt Luthi (run <id>)" for a solve that
 * person applied. Dataverse's modifiedby carries the account as well;
 * this column carries the story.
 */
export function buildProvenance(input: {
  readonly kind: "manual" | "solver";
  readonly runId?: string;
  readonly userName?: string;
}): WriteProvenance {
  const name = input.userName?.trim();
  const who = name ? ` by ${name}` : "";
  const run = input.kind === "solver" && input.runId?.trim() ? ` (run ${input.runId.trim()})` : "";
  return `${input.kind}${who}${run}`.slice(0, PROVENANCE_MAX_LENGTH);
}

/**
 * The lookup's navigation property for @odata.bind is its SchemaName,
 * read from the table definition through the Web API the app's
 * session authorises; the client metadata API does not expose it.
 * Undefined when the definition cannot be read.
 */
export async function lookupSchemaName(
  clientUrl: string | undefined,
  entityLogicalName: string,
  attributeLogicalName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  if (!clientUrl) {
    return undefined;
  }
  const base = clientUrl.replace(/\/+$/, "");
  const url =
    `${base}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
    `/Attributes(LogicalName='${attributeLogicalName}')?$select=SchemaName`;
  const response = await fetchImpl(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as { SchemaName?: unknown };
  return typeof body.SchemaName === "string" && body.SchemaName !== ""
    ? body.SchemaName
    : undefined;
}

/**
 * The table a single-table lookup points to, read from its definition.
 * The board also learns it from any row that has a person; a table
 * with no assignment yet has no such row, and without the table the
 * first assignment cannot bind its person. Undefined when the
 * definition cannot be read or names more than one table.
 */
export async function lookupTarget(
  clientUrl: string | undefined,
  entityLogicalName: string,
  attributeLogicalName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  if (!clientUrl) {
    return undefined;
  }
  const base = clientUrl.replace(/\/+$/, "");
  const url =
    `${base}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
    `/Attributes(LogicalName='${attributeLogicalName}')` +
    "/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets";
  const response = await fetchImpl(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as { Targets?: unknown };
  const targets = Array.isArray(body.Targets)
    ? body.Targets.filter(
        (target): target is string => typeof target === "string" && target !== "",
      )
    : [];
  return targets.length === 1 ? targets[0] : undefined;
}

/**
 * Whether a change gives a row a person it did not have. Its save
 * binds the person's table, so it waits until the board knows it.
 */
export function givesPerson(
  previousResourceId: string | undefined,
  nextResourceId: string,
): boolean {
  return nextResourceId !== UNASSIGNED_RESOURCE_ID && nextResourceId !== previousResourceId;
}

export function buildUpdatePayload(options: {
  readonly dataset: DataSet;
  readonly end: Date;
  /** The row's resource BEFORE the change; bind only when it moved. */
  readonly previousResourceId?: string;
  readonly resourceEntitySetName?: string;
  /** Navigation property (SchemaName casing) for @odata.bind. */
  readonly resourceNavProperty?: string;
  readonly resourceRecordId?: string;
  readonly start: Date;
  /** Current status text, for the assign transition when mapped. */
  readonly statusText?: string;
  /** The row's status as the board sees it; wins over the text when given. */
  readonly statusNeedsCover?: boolean;
  readonly title?: string;
  /** Who made the change: a person (default) or the solver (F26). */
  provenance?: WriteProvenance;
}): Record<string, unknown> | undefined {
  const startName = columnLogicalName(options.dataset, "start");
  const endName = columnLogicalName(options.dataset, "end");
  if (!startName || !endName) {
    return undefined;
  }
  const payload: Record<string, unknown> = {
    [endName]: options.end.toISOString(),
    [startName]: options.start.toISOString(),
  };
  const titleName = columnLogicalName(options.dataset, "title");
  if (options.title !== undefined && titleName) {
    payload[titleName] = options.title;
  }
  const resourceChanged =
    options.resourceRecordId !== undefined &&
    options.resourceRecordId !== options.previousResourceId;
  if (
    resourceChanged &&
    options.resourceNavProperty &&
    options.resourceRecordId &&
    options.resourceEntitySetName
  ) {
    // The bind key is the NAVIGATION property - SchemaName casing from
    // metadata, never the logical name (OData rejects the latter).
    payload[`${options.resourceNavProperty}@odata.bind`] =
      `/${options.resourceEntitySetName}(${options.resourceRecordId})`;
    // Assigning an open row also transitions a mapped status out of its
    // needs-cover state: the pinned value on a choice, the word on text.
    const statusName = columnLogicalName(options.dataset, "status");
    const wasOpen =
      options.statusNeedsCover ??
      (options.statusText !== undefined &&
        NEEDS_COVER_WORDS.has(options.statusText.trim().toLowerCase()));
    if (statusName && wasOpen) {
      payload[statusName] = isChoiceColumn(options.dataset, "status")
        ? STATUS_CHOICE.assigned
        : "Assigned";
    }
  }
  const provenanceName = columnLogicalName(options.dataset, "provenance");
  if (provenanceName) {
    payload[provenanceName] = options.provenance ?? "manual";
  }
  return payload;
}

/** Unschedule payload: clear the lookup, flip a mapped text status. */
export function buildUnschedulePayload(
  dataset: DataSet,
  resourceNavProperty: string | undefined,
  provenance: WriteProvenance = "manual",
): Record<string, unknown> | undefined {
  if (!resourceNavProperty) {
    return undefined;
  }
  const payload: Record<string, unknown> = {
    [`${resourceNavProperty}@odata.bind`]: null,
  };
  const statusName = columnLogicalName(dataset, "status");
  if (statusName) {
    payload[statusName] = isChoiceColumn(dataset, "status")
      ? STATUS_CHOICE.open
      : "Open";
  }
  const provenanceName = columnLogicalName(dataset, "provenance");
  if (provenanceName) {
    payload[provenanceName] = provenance;
  }
  return payload;
}

/**
 * Pin and Unpin write the pinned column, the only lock (Matt
 * 2026-10-04: a pin holds the time and the person; nothing in between).
 */
export function buildLockPayload(
  dataset: DataSet,
  locked: boolean,
): Record<string, unknown> | undefined {
  const pinnedName = columnLogicalName(dataset, "pinned");
  return pinnedName ? { [pinnedName]: locked } : undefined;
}

/**
 * The representation a bound view opens in. Lane layouts need a Resource
 * binding; without one the calendar layouts follow the interval (ruled
 * 2026-09-14): day, week, month. New event still works there
 * through the host's unassigned id.
 */
/** The maker's "Color by" for a view: what tints the rows on the board. */
export type ColorBy = "group" | "role" | "status";

/** chr_colorby pinned values: 1 None, 2 Role, 3 Group, 4 Status. */
const COLOR_BY_CHOICE: Readonly<Record<number, ColorBy>> = {
  2: "role",
  3: "group",
  4: "status",
};

export function colorByFromChoice(value: unknown): ColorBy | undefined {
  return typeof value === "number" ? COLOR_BY_CHOICE[value] : undefined;
}

/**
 * Fluent 2's sixteen shared colours at their primary shade (the same
 * list the colour picker offers), for a stable colour per lane group.
 */
export const GROUP_PALETTE: readonly string[] = [
  "#d13438", "#da3b01", "#eaa300", "#c19c00", "#986f0b", "#13a10e", "#107c10", "#0b6a0b",
  "#038387", "#0078d4", "#0027b4", "#4f6bed", "#7160e8", "#5c2e91", "#b146c2", "#bf0077",
];

/** The same group name always gets the same palette colour. */
export function groupColor(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return GROUP_PALETTE[hash % GROUP_PALETTE.length] ?? "#0078d4";
}

/** The pills' wash: the colour at 35% over the board's background, so text stays readable. */
export function colorWash(color: string): string {
  return `color-mix(in srgb, ${color} 35%, var(--csui-bg))`;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The colour a row shows for the maker's "Color by": its role's colour,
 * its lane group's palette colour, or the warning wash when it needs
 * cover; undefined leaves the board's neutral bar.
 */
export function eventColorFor(
  event: {
    readonly groups?: Readonly<Record<string, string>>;
    readonly requiredTags?: readonly string[];
    readonly status?: "assigned" | "needsCover";
  },
  colorBy: ColorBy | undefined,
  tagColors: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (colorBy === "role") {
    const role = event.requiredTags?.[0];
    const color = role ? tagColors?.[role] : undefined;
    return color && HEX_COLOR.test(color.trim()) ? colorWash(color.trim()) : undefined;
  }
  if (colorBy === "group") {
    const group = event.groups?.Team;
    return group ? colorWash(groupColor(group)) : undefined;
  }
  if (colorBy === "status") {
    return event.status === "needsCover" ? colorWash("var(--csui-warn)") : undefined;
  }
  return undefined;
}

/** The maker's layout for a view, from the Scheduler view row's Layout choice. */
export type MakerLayout = "agenda" | "roster" | "timeline" | "topDown";

/** chr_layout pinned values: 1 Timeline, 2 Roster grid, 3 Top-down, 4 Agenda. */
const LAYOUT_CHOICE: Readonly<Record<number, MakerLayout>> = {
  1: "timeline",
  2: "roster",
  3: "topDown",
  4: "agenda",
};

export function layoutFromChoice(value: unknown): MakerLayout | undefined {
  return typeof value === "number" ? LAYOUT_CHOICE[value] : undefined;
}

/**
 * The board's representation: the maker's layout when the view row
 * names one other than the timeline; otherwise the timeline with lanes
 * when a resource is bound, else the day, week or month calendar the
 * interval implies.
 */
export function representationFor(
  resourceMapped: boolean,
  interval: SchedulerTimeScale,
  layout?: MakerLayout,
): SchedulerRepresentation {
  if (layout !== undefined && layout !== "timeline") {
    return layout;
  }
  if (resourceMapped) {
    return "timeline";
  }
  if (interval === "day") {
    return "day";
  }
  if (interval === "month") {
    return "month";
  }
  return "week";
}

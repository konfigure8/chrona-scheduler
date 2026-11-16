/**
 * F3 config loader: everything behind calendarConfigId, per
 * Docs/pcf_config_schema.md. Pure mappers turn raw WebAPI entities into
 * the package's host types. A row that is not there leaves that
 * capability at its zero-config default; a read that fails is logged
 * and named in the config (readFailed), never read as no row
 * (AGENTS.md 0.1). The adapter owns paging
 * (every read follows nextLink to completion) - the accepted cost of
 * the WebAPI-not-a-second-dataset decision.
 *
 * Choice columns are read by their PINNED option values (labels
 * localize; values are contract - see the schema doc).
 */
import type { RulePolicy, SchedulerResource } from "@chrona/scheduler-ui";

type Entity = ComponentFramework.WebApi.Entity;
type WebApi = ComponentFramework.Context<unknown>["webAPI"];

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** chr_chronaschedulercalendar row, mapped. */
export interface ResourceMapping {
  readonly capacityColumn?: string;
  /** Employer cost per hour (cents) - activates the cost tier. */
  readonly costColumn?: string;
  readonly filter?: string;
  readonly groupColumn?: string;
  readonly nameColumn: string;
  readonly subgroupColumn?: string;
  readonly table: string;
  readonly timezoneColumn?: string;
}

export type { RulePolicy } from "@chrona/scheduler-ui";

/** Per-rule maker policy from the calendar row; defaults applied. */
export interface RulePolicies {
  readonly overlap: RulePolicy;
  readonly workingHours: RulePolicy;
}

export const defaultRulePolicies: RulePolicies = {
  overlap: "warn",
  workingHours: "off",
};

/** chr_ policy choice values: off=1 / warn=2 / block=3 (pinned). */
export const POLICY_BY_VALUE: Record<number, RulePolicy> = {
  1: "off",
  2: "warn",
  3: "block",
};

export function mapCalendarPolicies(
  entity: Entity | undefined,
): RulePolicies {
  if (!entity) {
    return defaultRulePolicies;
  }
  const read = (column: string, fallback: RulePolicy): RulePolicy =>
    POLICY_BY_VALUE[num(entity, column) ?? -1] ?? fallback;
  return {
    overlap: read("chr_overlappolicy", defaultRulePolicies.overlap),
    workingHours: read(
      "chr_workinghourspolicy",
      defaultRulePolicies.workingHours,
    ),
  };
}

export interface HostConfig {
  /** F26: the resolved calendar row id - the scheduler identity every
   * solve session and F19 meter keys on. Absent = no calendar row. */
  readonly calendarId?: string;
  /** F39: the calendar row's name (chr_name); every solve carries it for
   * Plan and billing's breakdown by calendar. */
  readonly calendarName?: string;
  /** F26: maker's default solve length (chr_defaultsolverseconds);
   * the server clamps it to the tier. */
  readonly defaultSolverSeconds?: number;
  /** F38: the product the calendar names (chr_product) - every solve and
   * session carries it. Plain calendars are the free scheduler's. */
  readonly product: ChronaProduct;
  /** The site's time zone (chr_timezone, an IANA name): the board shows
   * every time in it and the solver counts days and paid hours in it.
   * Absent = each viewer's own Power Apps zone. */
  readonly timeZone?: string;
  /** The calendar row's resource mapping, kept so the capability
   * tiers can report "mapped" separately from "active" (F22
   * deliverable 2, Q2-A). */
  readonly resourceMapping?: ResourceMapping;
  readonly resources?: readonly SchedulerResource[];
  /** resourceId -> IANA zone (per-resource timezone, section 7). */
  readonly resourceTimeZones: ReadonlyMap<string, string>;
  readonly policies: RulePolicies;
  /**
   * A read that failed (AGENTS.md 0.1), its cause logged: "calendar", the scheduler's own row, so nothing behind it
   * was read and the board knows no scheduler, zone or settings; "resources", its people, so it knows nobody. Absent
   * when every read answered, a row that is not there included.
   */
  readonly readFailed?: "calendar" | "resources";
}

/** F38: the products a calendar can name, by its chr_product choice value. */
export type ChronaProduct = "scheduler" | "workforce-scheduling";

export const PRODUCT_CHOICE = { scheduler: 1, workforce: 2 } as const;

export function productFromChoice(value: number | undefined): ChronaProduct {
  return value === PRODUCT_CHOICE.workforce ? "workforce-scheduling" : "scheduler";
}

/**
 * F39: the name for a calendar the control creates - its table's name, or, when a calendar
 * already has that name, the next free number after it ("Tasks 2"). Dataverse compares names
 * without case, so this does too. The maker can rename it on the calendar's form.
 */
export function nextCalendarName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  let number = 2;
  while (taken.has(`${base} ${number}`.toLowerCase())) {
    number += 1;
  }
  return `${base} ${number}`;
}

/** F39: the query for calendars whose name starts with a base name. */
export function calendarsNamedLikeQuery(base: string): string {
  return `?$select=chr_name&$filter=startswith(chr_name,'${escapeODataLiteral(base)}')`;
}

/**
 * The board's sentence for a read that failed (HostConfig.readFailed): its error notice, its data notice and a run
 * click's answer. Undefined when every read answered.
 */
export function hostReadFailure(
  config: Pick<HostConfig, "readFailed">,
  messages: { readonly msgCalendarUnread: string; readonly msgResourcesUnread: string },
): string | undefined {
  return config.readFailed === "calendar"
    ? messages.msgCalendarUnread
    : config.readFailed === "resources"
      ? messages.msgResourcesUnread
      : undefined;
}

/**
 * Whether the board is read-only: while the scheduler's row or its resources could not be read (Matt 2026-11-16,
 * "Yes, both boards"), no new item, no item edit and no drag; the data notice says why.
 */
export function hostEditsLocked(config: Pick<HostConfig, "readFailed">): boolean {
  return config.readFailed !== undefined;
}

export const emptyHostConfig: HostConfig = {
  policies: defaultRulePolicies,
  product: "scheduler",
  resourceTimeZones: new Map(),
};

export function text(entity: Entity, column: string): string | undefined {
  const value = entity[column] as unknown;
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export function num(entity: Entity, column: string): number | undefined {
  const value = entity[column] as unknown;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function instant(entity: Entity, column: string): Date | undefined {
  const value = entity[column] as unknown;
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function mapCalendarRow(entity: Entity): ResourceMapping | undefined {
  const table = text(entity, "chr_resourcetable");
  const nameColumn = text(entity, "chr_resourcenamecolumn");
  if (!table || !nameColumn) {
    return undefined;
  }
  return {
    capacityColumn: text(entity, "chr_resourcecapacitycolumn"),
    costColumn: text(entity, "chr_resourcecostcolumn"),
    filter: text(entity, "chr_resourcefilter"),
    groupColumn: text(entity, "chr_resourcegroupcolumn"),
    nameColumn,
    subgroupColumn: text(entity, "chr_resourcesubgroupcolumn"),
    table,
    timezoneColumn: text(entity, "chr_resourcetimezonecolumn"),
  };
}

export function mapResourceRows(
  entities: readonly Entity[],
  mapping: ResourceMapping,
  idColumn: string,
  tagsByResource: ReadonlyMap<string, readonly string[]>,
  notesByResource: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  > = new Map(),
): {
  readonly resources: readonly SchedulerResource[];
  readonly timeZones: ReadonlyMap<string, string>;
} {
  const resources: SchedulerResource[] = [];
  const timeZones = new Map<string, string>();
  for (const entity of entities) {
    const id = text(entity, idColumn);
    if (!id) {
      continue;
    }
    const zone = mapping.timezoneColumn
      ? text(entity, mapping.timezoneColumn)
      : undefined;
    if (zone) {
      timeZones.set(id, zone);
    }
    const tags = tagsByResource.get(id.toLowerCase());
    resources.push({
      capacityHours: mapping.capacityColumn
        ? num(entity, mapping.capacityColumn)
        : undefined,
      costCentsPerHour: mapping.costColumn
        ? num(entity, mapping.costColumn)
        : undefined,
      groups: ((): Readonly<Record<string, string>> | undefined => {
        const team = mapping.groupColumn
          ? text(entity, mapping.groupColumn)
          : undefined;
        const subteam = mapping.subgroupColumn
          ? text(entity, mapping.subgroupColumn)
          : undefined;
        if (!team && !subteam) {
          return undefined;
        }
        return {
          ...(team ? { Team: team } : {}),
          ...(subteam ? { Subteam: subteam } : {}),
        };
      })(),
      id,
      name: text(entity, mapping.nameColumn) ?? id,
      tagNotes: notesByResource.get(id.toLowerCase()),
      tags: tags && tags.length > 0 ? tags : undefined,
    });
  }
  resources.sort((a, b) => a.name.localeCompare(b.name));
  return { resources, timeZones };
}

export function readBool(entity: Entity, column: string): boolean | undefined {
  const value = entity[column] as unknown;
  return typeof value === "boolean" ? value : undefined;
}

/** Follows nextLink to completion; the adapter owns paging. */
export async function retrieveAll(
  webApi: WebApi,
  entityType: string,
  options: string,
): Promise<readonly Entity[]> {
  const collected: Entity[] = [];
  let query: string | undefined = options;
  while (query !== undefined) {
    const response = await webApi.retrieveMultipleRecords(
      entityType,
      query,
      5000,
    );
    collected.push(...response.entities);
    const nextLink = (response as { nextLink?: string }).nextLink;
    query = nextLink
      ? nextLink.substring(nextLink.indexOf("?"))
      : undefined;
  }
  return collected;
}

function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** A read's answer: what it read, or the read failed. Never a failure read as no rows (AGENTS.md 0.1). */
export type ReadOutcome<T> = { readonly kind: "read"; readonly value: T } | { readonly error: unknown; readonly kind: "failed" };

async function outcomeOf<T>(run: () => Promise<T>): Promise<ReadOutcome<T>> {
  try {
    return { kind: "read", value: await run() };
  } catch (error) {
    return { error, kind: "failed" };
  }
}

/**
 * The calendar row by its id or its name. Both are a query, so a row that is not there is an empty answer
 * (undefined) and only a refused or failed read is "failed".
 */
function resolveCalendarRow(
  webApi: WebApi,
  calendarConfigId: string,
): Promise<ReadOutcome<Entity | undefined>> {
  const filter = GUID_PATTERN.test(calendarConfigId)
    ? `chr_chronaschedulercalendarid eq ${calendarConfigId}`
    : `chr_name eq '${escapeODataLiteral(calendarConfigId)}'`;
  return outcomeOf(async () => {
    const found = await webApi.retrieveMultipleRecords(
      "chr_chronaschedulercalendar",
      `?$filter=${filter}&$top=1`,
    );
    return found.entities[0];
  });
}

/**
 * Loads the full config surface: the calendar row and its people. Never
 * throws: a row that is not there leaves its capability at its
 * zero-config default, and a read that fails is logged and named
 * (readFailed). A calendar row that could not be read loads nothing
 * behind it.
 */
export async function loadHostConfig(
  webApi: WebApi | undefined,
  calendarConfigId: string,
): Promise<HostConfig> {
  if (!webApi?.retrieveMultipleRecords) {
    return emptyHostConfig;
  }
  const trimmed = calendarConfigId.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "demo") {
    return emptyHostConfig;
  }

  const calendarRead = await resolveCalendarRow(webApi, trimmed);
  if (calendarRead.kind === "failed") {
    console.error("[chrona] the scheduler's settings could not be read", calendarRead.error);
    // Nobody is known either: never the people the shifts name.
    return { ...emptyHostConfig, readFailed: "calendar", resources: [] };
  }
  const calendarEntity = calendarRead.value;
  const mapping = calendarEntity ? mapCalendarRow(calendarEntity) : undefined;
  const policies = mapCalendarPolicies(calendarEntity);
  const calendarId = calendarEntity
    ? text(calendarEntity, "chr_chronaschedulercalendarid")
    : undefined;

  const idColumn = mapping ? `${mapping.table}id` : undefined;
  const resourcesRead: ReadOutcome<readonly Entity[]> =
    mapping && idColumn
      ? await outcomeOf<readonly Entity[]>(() => {
          const columns = [
            idColumn,
            mapping.nameColumn,
            mapping.groupColumn,
            mapping.subgroupColumn,
            mapping.timezoneColumn,
            mapping.capacityColumn,
            mapping.costColumn,
          ].filter((column): column is string => Boolean(column));
          const filter = mapping.filter ? `&$filter=${mapping.filter}` : "";
          return retrieveAll(webApi, mapping.table, `?$select=${columns.join(",")}${filter}`);
        })
      : { kind: "read", value: [] };
  if (resourcesRead.kind === "failed") {
    console.error("[chrona] the scheduler's people could not be read", resourcesRead.error);
  }
  const resourceRows = resourcesRead.kind === "read" ? resourcesRead.value : [];

  let resources: readonly SchedulerResource[] | undefined;
  let timeZones: ReadonlyMap<string, string> = new Map();
  if (mapping && idColumn && resourceRows.length > 0) {
    const mapped = mapResourceRows(
      resourceRows,
      mapping,
      idColumn,
      new Map(),
    );
    resources = mapped.resources;
    timeZones = mapped.timeZones;
  }

  return {
    calendarId,
    calendarName: calendarEntity ? text(calendarEntity, "chr_name") : undefined,
    defaultSolverSeconds: calendarEntity
      ? num(calendarEntity, "chr_defaultsolverseconds")
      : undefined,
    policies,
    product: productFromChoice(calendarEntity ? num(calendarEntity, "chr_product") : undefined),
    ...(resourcesRead.kind === "failed" ? { readFailed: "resources" as const } : {}),
    resourceMapping: mapping,
    // People that could not be read are nobody the board knows, never the people its shifts name.
    resources: resourcesRead.kind === "failed" ? [] : resources,
    resourceTimeZones: timeZones,
    timeZone: calendarEntity ? text(calendarEntity, "chr_timezone") : undefined,
  };
}

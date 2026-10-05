/**
 * F3 config loader: everything behind calendarConfigId, per
 * Docs/pcf_config_schema.md. Pure mappers turn raw WebAPI entities into
 * the package's host types; the orchestrator runs the reads in
 * parallel with every read independently try/caught, so a missing
 * table, row, or privilege leaves that capability at its zero-config
 * default and never blocks the others. The adapter owns paging
 * (every read follows nextLink to completion) - the accepted cost of
 * the WebAPI-not-a-second-dataset decision.
 *
 * Choice columns are read by their PINNED option values (labels
 * localize; values are contract - see the schema doc).
 */
import type { RulePolicy, SchedulerResource } from "@chrona/scheduler-ui";

import type { ControlScenario, ScenarioConfig } from "./scenario";

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

export interface HostConfig<TConfig extends ScenarioConfig = ScenarioConfig> {
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
  /** A scenario control's own rows, loaded with these settings. */
  readonly scenario?: TConfig;
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

export const emptyHostConfig: HostConfig<never> = {
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

async function resolveCalendarRow(
  webApi: WebApi,
  calendarConfigId: string,
): Promise<Entity | undefined> {
  if (GUID_PATTERN.test(calendarConfigId)) {
    return webApi.retrieveRecord(
      "chr_chronaschedulercalendar",
      calendarConfigId,
    );
  }
  const byName = await webApi.retrieveMultipleRecords(
    "chr_chronaschedulercalendar",
    `?$filter=chr_name eq '${escapeODataLiteral(calendarConfigId)}'&$top=1`,
  );
  return byName.entities[0];
}

export async function safely<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/**
 * Loads the full config surface: the calendar row, its people and, for a
 * scenario control, the scenario's own rows in the same pass. Never
 * throws: each capability degrades independently to its zero-config
 * default.
 */
export async function loadHostConfig<TConfig extends ScenarioConfig>(
  webApi: WebApi | undefined,
  calendarConfigId: string,
  scenario?: Pick<ControlScenario<TConfig>, "loadConfig">,
): Promise<HostConfig<TConfig>> {
  if (!webApi?.retrieveMultipleRecords) {
    return emptyHostConfig;
  }
  const trimmed = calendarConfigId.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "demo") {
    return emptyHostConfig;
  }

  const calendarEntity = await safely<Entity | undefined>(undefined, () =>
    resolveCalendarRow(webApi, trimmed),
  );
  const mapping = calendarEntity ? mapCalendarRow(calendarEntity) : undefined;
  const policies = mapCalendarPolicies(calendarEntity);
  const calendarId = calendarEntity
    ? text(calendarEntity, "chr_chronaschedulercalendarid")
    : undefined;

  const idColumn = mapping ? `${mapping.table}id` : undefined;
  const [scenarioConfig, resourceRows] = await Promise.all([
    scenario ? scenario.loadConfig(webApi, calendarEntity) : Promise.resolve(undefined),
    mapping && idColumn
      ? safely<readonly Entity[]>([], () => {
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
      : Promise.resolve<readonly Entity[]>([]),
  ]);

  let resources: readonly SchedulerResource[] | undefined;
  let timeZones: ReadonlyMap<string, string> = new Map();
  if (mapping && idColumn && resourceRows.length > 0) {
    const mapped = mapResourceRows(
      resourceRows,
      mapping,
      idColumn,
      scenarioConfig?.resourceTags ?? new Map(),
      scenarioConfig?.resourceNotes,
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
    resourceMapping: mapping,
    resources,
    resourceTimeZones: timeZones,
    scenario: scenarioConfig,
    timeZone: calendarEntity ? text(calendarEntity, "chr_timezone") : undefined,
  };
}

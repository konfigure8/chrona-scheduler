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
import type {
  AvailabilityBand,
  DemandData,
  DemandDriver,
  DemandDriverValue,
  DemandLever,
  ShiftDemandTemplate,
  ShiftTemplateCycle,
  ShiftTemplateGap,
  DemandRow,
  ResourcePreferenceRule,
  RulePolicy,
  SchedulerResource,
  TagColorMap,
} from "@chrona/scheduler-ui";

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
  readonly availability: RulePolicy;
  readonly overlap: RulePolicy;
  readonly skillMismatch: RulePolicy;
  readonly workingHours: RulePolicy;
}

export const defaultRulePolicies: RulePolicies = {
  availability: "block",
  overlap: "warn",
  skillMismatch: "block",
  workingHours: "off",
};

/** chr_ policy choice values: off=1 / warn=2 / block=3 (pinned). */
const POLICY_BY_VALUE: Record<number, RulePolicy> = {
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
    availability: read(
      "chr_availabilitypolicy",
      defaultRulePolicies.availability,
    ),
    overlap: read("chr_overlappolicy", defaultRulePolicies.overlap),
    skillMismatch: read(
      "chr_skillmismatchpolicy",
      defaultRulePolicies.skillMismatch,
    ),
    workingHours: read(
      "chr_workinghourspolicy",
      defaultRulePolicies.workingHours,
    ),
  };
}

export interface HostConfig {
  readonly bands: readonly AvailabilityBand[];
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
  readonly demand: readonly DemandRow[];
  readonly preferenceRules: readonly ResourcePreferenceRule[];
  /** The calendar row's resource mapping, kept so the capability
   * tiers can report "mapped" separately from "active" (F22
   * deliverable 2, Q2-A). */
  readonly resourceMapping?: ResourceMapping;
  readonly resources?: readonly SchedulerResource[];
  /** resourceId -> IANA zone (per-resource timezone, section 7). */
  readonly resourceTimeZones: ReadonlyMap<string, string>;
  readonly policies: RulePolicies;
  /** chr_role names, the create dialog's role choice. */
  readonly roleNames: readonly string[];
  /** chr_role name -> row id, for the role lookup on create and edit. */
  readonly roleIdsByName: ReadonlyMap<string, string>;
  /** chr_role colours keyed by name, for the role pills. */
  readonly tagColors?: TagColorMap;
  /** F25: work item templates (one slot each), roles already
   * expanded into requiredTags at this boundary. */
  readonly templates: readonly ShiftDemandTemplate[];
  /** F5: drivers and planner-entered values the template levers read. */
  readonly demandDrivers?: DemandData;
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

export const emptyHostConfig: HostConfig = {
  bands: [],
  demand: [],
  policies: defaultRulePolicies,
  product: "scheduler",
  preferenceRules: [],
  resourceTimeZones: new Map(),
  roleIdsByName: new Map(),
  roleNames: [],
  templates: [],
};

function text(entity: Entity, column: string): string | undefined {
  const value = entity[column] as unknown;
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function num(entity: Entity, column: string): number | undefined {
  const value = entity[column] as unknown;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function instant(entity: Entity, column: string): Date | undefined {
  const value = entity[column] as unknown;
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** chr_kind pinned values. */
const KIND_BY_VALUE: Record<number, AvailabilityBand["kind"]> = {
  1: "unavailable",
  2: "preferred",
  3: "unpreferred",
};

/** chr_tier pinned values. */
const TIER_BY_VALUE: Record<number, ResourcePreferenceRule["tier"]> = {
  1: "preferred",
  2: "restricted",
  3: "mustChooseFrom",
};

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

export function mapSkills(entities: readonly Entity[]): {
  readonly colors: TagColorMap;
  readonly idByName: ReadonlyMap<string, string>;
  readonly nameById: ReadonlyMap<string, string>;
  readonly names: readonly string[];
} {
  const colors: Record<string, string> = {};
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const names: string[] = [];
  for (const entity of entities) {
    const id = text(entity, "chr_skillid");
    const name = text(entity, "chr_name");
    if (!id || !name) {
      continue;
    }
    nameById.set(id.toLowerCase(), name);
    idByName.set(name, id);
    names.push(name);
    const color = text(entity, "chr_color");
    if (color) {
      colors[name] = color;
    }
  }
  names.sort();
  return { colors, idByName, nameById, names };
}

export function mapResourceSkills(
  entities: readonly Entity[],
  skillNameById: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  const tags = new Map<string, string[]>();
  for (const entity of entities) {
    const resourceId = text(entity, "_chr_resource_value");
    const skillId = text(entity, "_chr_skill_value");
    if (!resourceId || !skillId) {
      continue;
    }
    const name = skillNameById.get(skillId.toLowerCase());
    if (!name) {
      continue;
    }
    const key = resourceId.toLowerCase();
    const bucket = tags.get(key);
    if (bucket) {
      if (!bucket.includes(name)) {
        bucket.push(name);
      }
    } else {
      tags.set(key, [name]);
    }
  }
  for (const bucket of tags.values()) {
    bucket.sort();
  }
  return tags;
}

/**
 * resourceId -> the roles a person is assigned (chr_resourcerole rows) and,
 * per role, a note when the person lacks a skill the role needs.
 */
export function mapResourceRoles(
  entities: readonly Entity[],
  roles: ReadonlyMap<string, ResolvedRole>,
  skillsByResource: ReadonlyMap<string, readonly string[]>,
  describeMissing: (skills: readonly string[]) => string,
): {
  readonly notes: ReadonlyMap<string, Readonly<Record<string, string>>>;
  readonly tags: ReadonlyMap<string, readonly string[]>;
} {
  const tags = new Map<string, string[]>();
  const notes = new Map<string, Record<string, string>>();
  for (const entity of entities) {
    const resourceId = text(entity, "_chr_resource_value")?.toLowerCase();
    const roleId = text(entity, "_chr_role_value")?.toLowerCase();
    const role = roleId ? roles.get(roleId) : undefined;
    if (!resourceId || !role) {
      continue;
    }
    const bucket = tags.get(resourceId);
    if (bucket) {
      if (!bucket.includes(role.name)) {
        bucket.push(role.name);
      }
    } else {
      tags.set(resourceId, [role.name]);
    }
    const held = new Set(skillsByResource.get(resourceId) ?? []);
    const missing = role.skills.filter((skill) => !held.has(skill));
    if (missing.length > 0) {
      notes.set(resourceId, {
        ...(notes.get(resourceId) ?? {}),
        [role.name]: describeMissing(missing),
      });
    }
  }
  for (const bucket of tags.values()) {
    bucket.sort();
  }
  return { notes, tags };
}

/** The role catalogue: names, ids and pill colours. */
export function mapRoleCatalog(entities: readonly Entity[]): {
  readonly colors: TagColorMap;
  readonly idByName: ReadonlyMap<string, string>;
  readonly nameById: ReadonlyMap<string, string>;
  readonly names: readonly string[];
} {
  const colors: Record<string, string> = {};
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const entity of entities) {
    const id = text(entity, "chr_roleid");
    const name = text(entity, "chr_name");
    if (!id || !name) {
      continue;
    }
    nameById.set(id.toLowerCase(), name);
    idByName.set(name, id);
    const color = text(entity, "chr_color");
    if (color) {
      colors[name] = color;
    }
  }
  return { colors, idByName, nameById, names: [...idByName.keys()].sort() };
}

export function mapAvailabilityTypes(
  entities: readonly Entity[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const entity of entities) {
    const id = text(entity, "chr_availabilitytypeid");
    const name = text(entity, "chr_name");
    if (id && name) {
      names.set(id.toLowerCase(), name);
    }
  }
  return names;
}

export function mapAvailability(
  entities: readonly Entity[],
  typeNamesById: ReadonlyMap<string, string>,
): readonly AvailabilityBand[] {
  const bands: AvailabilityBand[] = [];
  for (const entity of entities) {
    const resourceId = text(entity, "_chr_resource_value");
    const start = instant(entity, "chr_start");
    const end = instant(entity, "chr_end");
    const kind = KIND_BY_VALUE[num(entity, "chr_kind") ?? -1];
    if (!resourceId || !start || !end || end <= start || !kind) {
      continue;
    }
    const typeId = text(entity, "_chr_type_value");
    bands.push({
      end,
      kind,
      label:
        (typeId ? typeNamesById.get(typeId.toLowerCase()) : undefined) ??
        text(entity, "chr_label"),
      resourceId,
      start,
    });
  }
  return bands;
}

export function mapDemand(
  entities: readonly Entity[],
  roleNameById: ReadonlyMap<string, string> = new Map(),
): readonly DemandRow[] {
  const rows: DemandRow[] = [];
  for (const entity of entities) {
    const start = instant(entity, "chr_start");
    const end = instant(entity, "chr_end");
    const minHeadcount = num(entity, "chr_minheadcount");
    if (!start || !end || end <= start || minHeadcount === undefined) {
      continue;
    }
    const roleId = text(entity, "_chr_role_value")?.toLowerCase();
    const roleName = roleId ? roleNameById.get(roleId) : undefined;
    const tags = roleName ? [roleName] : undefined;
    rows.push({
      end,
      group: text(entity, "chr_group"),
      maxHeadcount: num(entity, "chr_maxheadcount"),
      minHeadcount,
      start,
      tags: tags && tags.length > 0 ? [...tags] : undefined,
    });
  }
  return rows;
}

export function mapPreferences(
  entities: readonly Entity[],
): readonly ResourcePreferenceRule[] {
  const rules: ResourcePreferenceRule[] = [];
  for (const entity of entities) {
    const resourceId = text(entity, "_chr_resource_value");
    const tier = TIER_BY_VALUE[num(entity, "chr_tier") ?? -1];
    if (!resourceId || !tier) {
      continue;
    }
    rules.push({
      effectiveFrom: instant(entity, "chr_effectivefrom"),
      effectiveTo: instant(entity, "chr_effectiveto"),
      label: text(entity, "chr_label"),
      resourceIds: [resourceId],
      tier,
      workItemId: text(entity, "_chr_workitem_value"),
    });
  }
  return rules;
}

/** Follows nextLink to completion; the adapter owns paging. */
/** A role resolved at the boundary: its name and required skills. */
export interface ResolvedRole {
  readonly name: string;
  readonly skills: readonly string[];
}

/**
 * F25 (ruled 2026-09-01): chr_role is a NAMED SET OF REQUIRED SKILLS;
 * it resolves to skill tags at this boundary and the package keeps
 * speaking tags (domain model section 2).
 */
export function mapRoles(
  roleRows: readonly Entity[],
  roleSkillRows: readonly Entity[],
  skillNameById: ReadonlyMap<string, string>,
): ReadonlyMap<string, ResolvedRole> {
  const skillsByRole = new Map<string, string[]>();
  for (const row of roleSkillRows) {
    const roleId = text(row, "_chr_role_value")?.toLowerCase();
    const skillId = text(row, "_chr_skill_value")?.toLowerCase();
    const skillName = skillId ? skillNameById.get(skillId) : undefined;
    if (!roleId || !skillName) {
      continue;
    }
    const bucket = skillsByRole.get(roleId);
    if (bucket) {
      if (!bucket.includes(skillName)) {
        bucket.push(skillName);
      }
    } else {
      skillsByRole.set(roleId, [skillName]);
    }
  }
  const roles = new Map<string, ResolvedRole>();
  for (const row of roleRows) {
    const id = text(row, "chr_roleid")?.toLowerCase();
    if (!id) {
      continue;
    }
    roles.set(id, {
      name: text(row, "chr_name") ?? id,
      skills: [...(skillsByRole.get(id) ?? [])].sort(),
    });
  }
  return roles;
}

interface TemplateGapRow {
  readonly duration: number;
  readonly label?: string;
  readonly offset: number;
  readonly paid?: boolean;
}

/**
 * F25 template rows -> package slots (one row = one slot). The role
 * skills plus the template's extra skills become requiredTags; gap
 * rows (kind 2) become the slot's shape; chr_minimum is the fixed
 * count (the F5 lever, when it arrives, treats it as the floor).
 */
export function mapTemplates(
  templateRows: readonly Entity[],
  spanRows: readonly Entity[],
  roles: ReadonlyMap<string, ResolvedRole>,
): readonly ShiftDemandTemplate[] {
  const gapsByTemplate = new Map<string, TemplateGapRow[]>();
  for (const row of spanRows) {
    const templateId = text(row, "_chr_workitemtemplate_value")?.toLowerCase();
    const kind = num(row, "chr_kind");
    const offset = num(row, "chr_offsetminutes");
    const duration = num(row, "chr_durationminutes");
    if (!templateId || kind !== 2 || offset === undefined || duration === undefined) {
      continue;
    }
    const gap: TemplateGapRow = {
      duration,
      offset,
      ...(text(row, "chr_label") !== undefined ? { label: text(row, "chr_label") } : {}),
      ...(readBool(row, "chr_paid") !== undefined ? { paid: readBool(row, "chr_paid") } : {}),
    };
    gapsByTemplate.set(templateId, [...(gapsByTemplate.get(templateId) ?? []), gap]);
  }

  const templates: ShiftDemandTemplate[] = [];
  for (const row of templateRows) {
    const id = text(row, "chr_workitemtemplateid")?.toLowerCase();
    // Start and End are choices whose values are minutes since midnight; End past 1440 is the next day.
    const start = num(row, "chr_starttime");
    const end = num(row, "chr_endtime");
    if (!id || start === undefined || end === undefined || end <= start) {
      continue;
    }
    if (readBool(row, "chr_active") === false) {
      continue;
    }
    const roleId = text(row, "_chr_role_value")?.toLowerCase();
    const role = roleId ? roles.get(roleId) : undefined;
    // The roster is written in roles: the template's role is the requirement.
    const requiredTags = role ? [role.name] : [];
    // chr_days is a multi-select choice, ISO numbered (1 Monday .. 7
    // Sunday); the slot keeps the package's 0 Sunday .. 6 Saturday.
    const daysOfWeek = [
      ...new Set(
        (text(row, "chr_days") ?? "")
          .split(",")
          .map((part) => Number.parseInt(part.trim(), 10))
          .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
          .map((day) => day % 7),
      ),
    ].sort((a, b) => a - b);
    // Group and Subgroup name the lane, the same two levels the
    // calendar's group columns give resources and work items.
    const group = text(row, "chr_group");
    const subgroup = text(row, "chr_subgroup");
    const groups: Readonly<Record<string, string>> | undefined =
      group || subgroup
        ? {
            ...(group ? { Team: group } : {}),
            ...(subgroup ? { Subteam: subgroup } : {}),
          }
        : undefined;
    const gaps: ShiftTemplateGap[] = (gapsByTemplate.get(id) ?? [])
      .map((gap) => ({
        endMinutes: start + gap.offset + gap.duration,
        ...(gap.label !== undefined ? { label: gap.label } : {}),
        ...(gap.paid !== undefined ? { paid: gap.paid } : {}),
        startMinutes: start + gap.offset,
      }))
      .filter((gap) => gap.startMinutes >= start && gap.endMinutes <= end);
    const lever = mapLever(row);
    const cycle = mapCycle(row);
    templates.push({
      slots: [
        {
          count: Math.max(0, Math.trunc(num(row, "chr_minimum") ?? 1)),
          ...(cycle ? { cycle } : {}),
          daysOfWeek,
          endMinutes: end,
          ...(gaps.length > 0 ? { gaps } : {}),
          ...(lever ? { lever } : {}),
          groups,
          requiredTags: requiredTags.length > 0 ? requiredTags : undefined,
          slotId: id,
          startMinutes: start,
          title: text(row, "chr_titlepattern") ?? text(row, "chr_name") ?? id,
        },
      ],
      templateId: id,
    });
  }
  templates.sort((a, b) => a.templateId.localeCompare(b.templateId));
  return templates;
}

/**
 * F1: a cycle length above one week makes the row a rotating slot;
 * chr_cycleweek is clamped into the cycle so a stale week can never
 * silence a row.
 */
export function mapCycle(row: Entity): ShiftTemplateCycle | undefined {
  const weeks = Math.trunc(num(row, "chr_cyclelength") ?? 1);
  if (weeks <= 1) {
    return undefined;
  }
  const week = Math.trunc(num(row, "chr_cycleweek") ?? 1);
  return { week: Math.min(weeks, Math.max(1, week)), weeks };
}

/**
 * F5: a template row with a driver becomes a lever. chr_ratiocount is
 * M, chr_perunits is N, chr_minimum the floor, chr_maximum the cap;
 * the choice values are the pinned ones from the schema doc.
 */
export function mapLever(row: Entity): DemandLever | undefined {
  const driverId = text(row, "_chr_demanddriver_value")?.toLowerCase();
  if (!driverId) {
    return undefined;
  }
  const distribution = num(row, "chr_distribution");
  const rounding = num(row, "chr_rounding");
  const maximum = num(row, "chr_maximum");
  const serviceName = text(row, "chr_servicename");
  return {
    distribution: distribution === 2 ? "acrossWindow" : "perOccurrence",
    driverId,
    ...(maximum !== undefined && maximum > 0 ? { maximum: Math.trunc(maximum) } : {}),
    minimum: Math.max(0, Math.trunc(num(row, "chr_minimum") ?? 0)),
    perUnits: Math.max(1, Math.trunc(num(row, "chr_perunits") ?? 1)),
    ratioCount: Math.max(1, Math.trunc(num(row, "chr_ratiocount") ?? 1)),
    rounding: rounding === 2 ? "nearest" : rounding === 3 ? "floor" : "ceiling",
    ...(serviceName ? { serviceName } : {}),
  };
}

/** F5: driver rows and their planner-entered values; window starts are date-only. */
export function mapDemandDrivers(
  driverRows: readonly Entity[],
  valueRows: readonly Entity[],
): DemandData | undefined {
  const drivers: DemandDriver[] = [];
  for (const row of driverRows) {
    const driverId = text(row, "chr_demanddriverid")?.toLowerCase();
    if (!driverId) {
      continue;
    }
    const kind = num(row, "chr_windowkind");
    const unitLabel = text(row, "chr_unitlabel");
    drivers.push({
      driverId,
      name: text(row, "chr_name") ?? driverId,
      ...(unitLabel ? { unitLabel } : {}),
      windowKind: kind === 2 ? "namedService" : kind === 3 ? "week" : kind === 4 ? "custom" : "day",
    });
  }
  if (drivers.length === 0) {
    return undefined;
  }
  const values: DemandDriverValue[] = [];
  for (const row of valueRows) {
    const driverId = text(row, "_chr_demanddriver_value")?.toLowerCase();
    const windowStart = text(row, "chr_windowstart")?.slice(0, 10);
    const value = num(row, "chr_value");
    if (!driverId || !windowStart || value === undefined) {
      continue;
    }
    const serviceName = text(row, "chr_servicename");
    values.push({ driverId, ...(serviceName ? { serviceName } : {}), value, windowStart });
  }
  return { drivers, values };
}

function readBool(entity: Entity, column: string): boolean | undefined {
  const value = entity[column] as unknown;
  return typeof value === "boolean" ? value : undefined;
}

async function retrieveAll(
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

async function safely<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/*
 * The Workforce scenario tables (skills, availability, demand, roles,
 * templates, drivers) ship in a later package; the free bundle has none
 * of them. One probe per page session decides whether to ask for them
 * at all, instead of a failing request per table on every load.
 */
let workforceTablesPresent: boolean | undefined;

function isTableAbsent(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  return /Resource not found|does not exist|Could not find/i.test(message);
}

export async function workforceInstalled(webApi: WebApi): Promise<boolean> {
  if (workforceTablesPresent !== undefined) {
    return workforceTablesPresent;
  }
  try {
    await webApi.retrieveMultipleRecords("chr_skill", "?$select=chr_skillid&$top=1", 1);
    workforceTablesPresent = true;
  } catch (error) {
    // Only an absent table means absent; a privilege error means present but restricted.
    workforceTablesPresent = !isTableAbsent(error);
  }
  return workforceTablesPresent;
}

/** Tests: forget the probe result. */
export function resetWorkforceProbe(): void {
  workforceTablesPresent = undefined;
}

/**
 * Loads the full config surface. Never throws: each capability
 * degrades independently to its zero-config default.
 */
export async function loadHostConfig(
  webApi: WebApi | undefined,
  calendarConfigId: string,
  describeMissing: (skills: readonly string[]) => string = (skills) =>
    `Missing ${skills.join(", ")}`,
): Promise<HostConfig> {
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
  // F25 multi-scheduler scoping (ruled 2026-09-03): templates belong to
  // exactly one calendar; without a resolved calendar row there are none.
  const calendarId = calendarEntity
    ? text(calendarEntity, "chr_chronaschedulercalendarid")
    : undefined;
  const scenario = await workforceInstalled(webApi);
  const scenarioRows = (
    run: () => Promise<readonly Entity[]>,
  ): Promise<readonly Entity[]> =>
    scenario ? safely<readonly Entity[]>([], run) : Promise.resolve([]);

  const [
    skillRows,
    junctionRows,
    resourceRoleRows,
    typeRows,
    availabilityRows,
    demandRows,
    preferenceRows,
    roleRows,
    roleSkillRows,
    templateRows,
    templateSpanRows,
    driverRows,
    driverValueRows,
  ] =
    await Promise.all([
      scenarioRows(() =>
        retrieveAll(webApi, "chr_skill", "?$select=chr_skillid,chr_name,chr_color"),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_resourceskill",
          "?$select=_chr_resource_value,_chr_skill_value",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_resourcerole",
          "?$select=_chr_resource_value,_chr_role_value",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_availabilitytype",
          "?$select=chr_availabilitytypeid,chr_name,chr_color",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_availability",
          "?$select=_chr_resource_value,chr_start,chr_end,chr_kind,chr_label,_chr_type_value",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_demand",
          "?$select=chr_demandid,chr_start,chr_end,chr_minheadcount,chr_maxheadcount,chr_group,_chr_role_value",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_resourcepreference",
          "?$select=_chr_workitem_value,_chr_resource_value,chr_tier,chr_effectivefrom,chr_effectiveto,chr_label",
        ),
      ),
      // F25 roles and templates; F5 lever columns, drivers, and values.
      scenarioRows(() =>
        retrieveAll(webApi, "chr_role", "?$select=chr_roleid,chr_name,chr_color"),
      ),
      scenarioRows(() =>
        retrieveAll(webApi, "chr_roleskill", "?$select=_chr_role_value,_chr_skill_value"),
      ),
      scenarioRows(() =>
        calendarId
          ? retrieveAll(
              webApi,
              "chr_workitemtemplate",
              `?$select=chr_workitemtemplateid,chr_name,chr_titlepattern,_chr_role_value,chr_days,chr_starttime,chr_endtime,chr_minimum,chr_active,chr_group,chr_subgroup,_chr_demanddriver_value,chr_ratiocount,chr_perunits,chr_maximum,chr_distribution,chr_rounding,chr_servicename,chr_cyclelength,chr_cycleweek&$filter=_chr_calendar_value eq ${calendarId}`,
            )
          : Promise.resolve([]),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_workitemtemplatespan",
          "?$select=_chr_workitemtemplate_value,chr_kind,chr_offsetminutes,chr_durationminutes,chr_label,chr_paid",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_demanddriver",
          "?$select=chr_demanddriverid,chr_name,chr_unitlabel,chr_windowkind",
        ),
      ),
      scenarioRows(() =>
        retrieveAll(
          webApi,
          "chr_demanddrivervalue",
          "?$select=_chr_demanddriver_value,chr_windowstart,chr_servicename,chr_value",
        ),
      ),
    ]);

  const skills = mapSkills(skillRows);
  const skillsByResource = mapResourceSkills(junctionRows, skills.nameById);
  const roles = mapRoles(roleRows, roleSkillRows, skills.nameById);
  const catalog = mapRoleCatalog(roleRows);
  const resourceRoles = mapResourceRoles(
    resourceRoleRows,
    roles,
    skillsByResource,
    describeMissing,
  );
  const templates = mapTemplates(templateRows, templateSpanRows, roles);

  let resources: readonly SchedulerResource[] | undefined;
  let timeZones: ReadonlyMap<string, string> = new Map();
  if (mapping) {
    const idColumn = `${mapping.table}id`;
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
    const rows = await safely<readonly Entity[]>([], () =>
      retrieveAll(
        webApi,
        mapping.table,
        `?$select=${columns.join(",")}${filter}`,
      ),
    );
    if (rows.length > 0) {
      const mapped = mapResourceRows(
        rows,
        mapping,
        idColumn,
        resourceRoles.tags,
        resourceRoles.notes,
      );
      resources = mapped.resources;
      timeZones = mapped.timeZones;
    }
  }

  return {
    bands: mapAvailability(availabilityRows, mapAvailabilityTypes(typeRows)),
    demand: mapDemand(demandRows, catalog.nameById),
    policies,
    preferenceRules: mapPreferences(preferenceRows),
    resourceMapping: mapping,
    resources,
    resourceTimeZones: timeZones,
    roleIdsByName: catalog.idByName,
    roleNames: catalog.names,
    tagColors:
      Object.keys(catalog.colors).length > 0 ? catalog.colors : undefined,
    calendarId,
    calendarName: calendarEntity ? text(calendarEntity, "chr_name") : undefined,
    defaultSolverSeconds: calendarEntity
      ? num(calendarEntity, "chr_defaultsolverseconds")
      : undefined,
    product: productFromChoice(calendarEntity ? num(calendarEntity, "chr_product") : undefined),
    templates,
    demandDrivers: mapDemandDrivers(driverRows, driverValueRows),
  };
}

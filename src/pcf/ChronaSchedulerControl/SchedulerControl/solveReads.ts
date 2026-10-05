/**
 * Web API reads for the review (F31 rework). The freshness check reads
 * the same things when a solve starts and again when its answer lands
 * or Apply runs, and compares: the rows of the work-item table in the
 * solve's range, a scenario control's unavailable spans in it, and the
 * people's record versions. Each read degrades on its own to undefined
 * (a table the user cannot read), and the check then skips that part
 * rather than guess.
 */
import { retrieveAll } from "./configLoader";
import { isOpenStatusValue } from "./dataverseData";

type WebApi = ComponentFramework.WebApi;
type Entity = ComponentFramework.WebApi.Entity;

/** The work-item table and the columns its bindings name. */
export interface ShiftTableSpec {
  readonly endColumn: string;
  readonly entity: string;
  readonly idColumn: string;
  /** The person lookup's logical name, when the Resource binding is set. */
  readonly resourceColumn?: string;
  readonly startColumn: string;
  /** The status column's logical name, when the Status binding is set. */
  readonly statusColumn?: string;
}

/** A row as the view's mapper would read it: who works it, or nobody. */
export interface ShiftRow {
  readonly end: Date;
  readonly id: string;
  /** Undefined when nobody works it: no person, or an open status. */
  readonly resourceId?: string;
  readonly start: Date;
}

/** Stored instants, as Dataverse keeps them. */
export interface TimeRange {
  readonly end: Date;
  readonly start: Date;
}

/** An OData date-time literal: seconds precision, UTC. */
export function odataInstant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The rows that overlap a range, with what the check compares. */
export function shiftRowsQuery(spec: ShiftTableSpec, range: TimeRange): string {
  const columns = [
    spec.idColumn,
    spec.startColumn,
    spec.endColumn,
    ...(spec.resourceColumn ? [`_${spec.resourceColumn}_value`] : []),
    ...(spec.statusColumn ? [spec.statusColumn] : []),
  ];
  return (
    `?$select=${columns.join(",")}` +
    `&$filter=${spec.startColumn} lt ${odataInstant(range.end)}` +
    ` and ${spec.endColumn} gt ${odataInstant(range.start)}`
  );
}

const instantOf = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Rows read back; a row without both times is left out, as the board leaves it out. */
export function mapShiftRows(
  entities: readonly Entity[],
  spec: ShiftTableSpec,
): readonly ShiftRow[] {
  const rows: ShiftRow[] = [];
  for (const entity of entities) {
    const record = entity as Record<string, unknown>;
    const id = record[spec.idColumn];
    const start = instantOf(record[spec.startColumn]);
    const end = instantOf(record[spec.endColumn]);
    if (typeof id !== "string" || !start || !end || end <= start) {
      continue;
    }
    const person = spec.resourceColumn ? record[`_${spec.resourceColumn}_value`] : undefined;
    const open = spec.statusColumn ? isOpenStatusValue(record[spec.statusColumn]) : false;
    rows.push({
      end,
      id,
      resourceId: !open && typeof person === "string" && person !== "" ? person : undefined,
      start,
    });
  }
  return rows;
}

export async function readShiftRows(
  webApi: WebApi,
  spec: ShiftTableSpec,
  range: TimeRange,
): Promise<readonly ShiftRow[] | undefined> {
  try {
    return mapShiftRows(await retrieveAll(webApi, spec.entity, shiftRowsQuery(spec, range)), spec);
  } catch {
    return undefined;
  }
}

/** Record versions for some people, in chunks a URL can carry. */
export function personVersionQueries(
  idColumn: string,
  ids: readonly string[],
  chunk = 40,
): readonly string[] {
  const queries: string[] = [];
  for (let index = 0; index < ids.length; index += chunk) {
    const values = ids
      .slice(index, index + chunk)
      .map((id) => `'${id.replace(/[{}']/g, "")}'`)
      .join(",");
    queries.push(
      `?$select=${idColumn},modifiedon` +
        `&$filter=Microsoft.Dynamics.CRM.In(PropertyName='${idColumn}',PropertyValues=[${values}])`,
    );
  }
  return queries;
}

export async function readPersonVersions(
  webApi: WebApi,
  entity: string,
  idColumn: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string> | undefined> {
  try {
    const versions = new Map<string, string>();
    for (const query of personVersionQueries(idColumn, ids)) {
      for (const row of await retrieveAll(webApi, entity, query)) {
        const record = row as Record<string, unknown>;
        const id = record[idColumn];
        const version = record.modifiedon;
        if (typeof id === "string" && typeof version === "string") {
          versions.set(id, version);
        }
      }
    }
    return versions;
  } catch {
    return undefined;
  }
}

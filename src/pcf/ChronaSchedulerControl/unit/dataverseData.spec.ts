import * as assert from "node:assert/strict";
import {
  DATASET_ROW_CAP,
  PROVENANCE_MAX_LENGTH,
  buildLockPayload,
  buildProvenance,
  buildUnschedulePayload,
  buildUpdatePayload,
  lockWriteValue,
  lookupSchemaName,
  mapRecordCommands,
  mapWorkItems,
  pagingStep,
  colorByFromChoice,
  colorWash,
  eventColorFor,
  GROUP_PALETTE,
  groupColor,
  layoutFromChoice,
  representationFor,
} from "../SchedulerControl/dataverseData";

/*
 * Every write the control makes stamps the mapped provenance column: a
 * person's edit is "manual", a solver-applied change is "solver" (F26).
 */
type DataSet = ComponentFramework.PropertyTypes.DataSet;

function datasetWith(columns: ReadonlyArray<{ alias: string; name: string; dataType?: string }>): DataSet {
  return {
    columns: columns.map((column) => ({ ...column, dataType: column.dataType ?? "SingleLine.Text", displayName: column.alias, order: 0, visualSizeFactor: 1 })),
  } as unknown as DataSet;
}

const dataset = datasetWith([
  { alias: "start", name: "chr_start" },
  { alias: "end", name: "chr_end" },
  { alias: "provenance", name: "chr_provenance" },
]);
const start = new Date("2026-09-07T00:00:00.000Z");
const end = new Date("2026-09-07T08:00:00.000Z");

assert.equal(buildProvenance({ kind: "manual", userName: "Matt Luthi" }), "manual by Matt Luthi");
assert.equal(buildProvenance({ kind: "solver", runId: "run-123", userName: " Matt Luthi " }), "solver by Matt Luthi (run run-123)");
assert.equal(buildProvenance({ kind: "solver", runId: "run-123" }), "solver (run run-123)");
assert.equal(buildProvenance({ kind: "manual" }), "manual");
assert.equal(buildProvenance({ kind: "manual", userName: "x".repeat(400) }).length, PROVENANCE_MAX_LENGTH);

const manual = buildUpdatePayload({ dataset, end, provenance: buildProvenance({ kind: "manual", userName: "Matt Luthi" }), start });
assert.equal(manual?.chr_provenance, "manual by Matt Luthi");
assert.equal(buildUpdatePayload({ dataset, end, start })?.chr_provenance, "manual");

const solver = buildUpdatePayload({ dataset, end, provenance: buildProvenance({ kind: "solver", runId: "run-123", userName: "Matt Luthi" }), start });
assert.equal(solver?.chr_provenance, "solver by Matt Luthi (run run-123)");
assert.equal(solver?.chr_start, start.toISOString());

assert.equal(buildUnschedulePayload(dataset, "chr_Resource")?.chr_provenance, "manual");
assert.equal(buildUnschedulePayload(dataset, "chr_Resource", "manual by Matt Luthi")?.chr_provenance, "manual by Matt Luthi");

const unmapped = datasetWith([
  { alias: "start", name: "chr_start" },
  { alias: "end", name: "chr_end" },
]);
assert.equal("chr_provenance" in (buildUpdatePayload({ dataset: unmapped, end, provenance: "solver by Matt Luthi (run run-123)", start }) ?? {}), false);

console.log("dataverseData provenance spec passed");

/*
 * Decision 2 (2026-09-14): lanes need a Resource binding. Without one the
 * calendar layouts follow the interval, and the mapper says whether the
 * binding exists even when the view has no rows yet.
 */
assert.equal(representationFor(true, "week"), "timeline");
assert.equal(representationFor(true, "day"), "timeline");
assert.equal(representationFor(false, "week"), "week");
assert.equal(representationFor(false, "daySpan"), "week");
assert.equal(representationFor(false, "day"), "day");
assert.equal(representationFor(false, "month"), "month");
// The maker's layout wins over the interval rule; the timeline choice keeps it.
assert.equal(representationFor(true, "week", "roster"), "roster");
assert.equal(representationFor(false, "day", "topDown"), "topDown");
assert.equal(representationFor(true, "month", "agenda"), "agenda");
assert.equal(representationFor(true, "week", "timeline"), "timeline");
assert.equal(representationFor(false, "day", "timeline"), "day");
assert.equal(layoutFromChoice(2), "roster");
assert.equal(layoutFromChoice(4), "agenda");
assert.equal(layoutFromChoice(9), undefined);
assert.equal(layoutFromChoice(null), undefined);
// Color by: the role's colour, a stable palette colour per group, the warning wash for cover.
assert.equal(colorByFromChoice(2), "role");
assert.equal(colorByFromChoice(4), "status");
assert.equal(colorByFromChoice(1), undefined);
assert.equal(colorByFromChoice("x"), undefined);
assert.equal(groupColor("Kitchen"), groupColor(" kitchen "), "the same group name maps to one colour");
assert.ok(GROUP_PALETTE.includes(groupColor("Front of house")));
assert.equal(colorWash("#7a3db8"), "color-mix(in srgb, #7a3db8 35%, var(--csui-bg))");
const roleColors = { "Bar closer": "#7a3db8" };
assert.equal(eventColorFor({ requiredTags: ["Bar closer"] }, "role", roleColors), colorWash("#7a3db8"));
assert.equal(eventColorFor({ requiredTags: ["Floor"] }, "role", roleColors), undefined, "a role without a colour stays neutral");
assert.equal(eventColorFor({ requiredTags: ["Bar closer"] }, undefined, roleColors), undefined, "no setting, no colour");
assert.equal(eventColorFor({ groups: { Team: "Kitchen" } }, "group", roleColors), colorWash(groupColor("Kitchen")));
assert.equal(eventColorFor({}, "group", roleColors), undefined);
assert.equal(eventColorFor({ status: "needsCover" }, "status", roleColors), colorWash("var(--csui-warn)"));
assert.equal(eventColorFor({ status: "assigned" }, "status", roleColors), undefined);

function emptyDataset(columns: ReadonlyArray<{ alias: string; name: string }>): DataSet {
  return { ...(datasetWith(columns) as object), loading: false, records: {}, sortedRecordIds: [] } as unknown as DataSet;
}
assert.equal(mapWorkItems(emptyDataset([{ alias: "start", name: "chr_start" }, { alias: "end", name: "chr_end" }])).resourceMapped, false);
assert.equal(mapWorkItems(emptyDataset([{ alias: "start", name: "chr_start" }, { alias: "end", name: "chr_end" }, { alias: "resource", name: "chr_assignedto" }])).resourceMapped, true);
assert.equal(mapWorkItems(undefined).resourceMapped, false);
console.log("representation rule tests passed");

/*
 * Choice lifecycle columns (forms quality batch, 2026-09-18): the shipped
 * chr_shift status and lock are read by their pinned values and written
 * as values; a text binding keeps the words.
 */
const choiceColumns = [
  { alias: "start", name: "chr_start" },
  { alias: "end", name: "chr_end" },
  { alias: "resource", name: "chr_resource" },
  { alias: "status", name: "chr_shiftstatus", dataType: "OptionSet" },
  { alias: "lockType", name: "chr_shiftlock", dataType: "OptionSet" },
  { alias: "role", name: "chr_role", dataType: "Lookup.Simple" },
  { alias: "subgroup", name: "chr_subgroup" },
];
const choices = datasetWith(choiceColumns);
const words = datasetWith(choiceColumns.map((column) => ({ alias: column.alias, name: column.name })));
assert.deepEqual(buildLockPayload(choices, true), { chr_shiftlock: 3 });
assert.deepEqual(buildLockPayload(choices, false), { chr_shiftlock: null });
assert.deepEqual(buildLockPayload(words, true), { chr_shiftlock: "both" });
assert.deepEqual(buildLockPayload(words, false), { chr_shiftlock: "" });
assert.equal(lockWriteValue(choices, "time"), 1);
assert.equal(lockWriteValue(words, "time"), "time");
const assign = { end, resourceEntitySetName: "chr_employees", resourceNavProperty: "chr_Resource", resourceRecordId: "r-1", start };
assert.equal(buildUpdatePayload({ ...assign, dataset: choices, statusNeedsCover: true })?.chr_shiftstatus, 1);
assert.equal("chr_shiftstatus" in (buildUpdatePayload({ ...assign, dataset: choices, statusNeedsCover: false }) ?? {}), false);
assert.equal(buildUpdatePayload({ ...assign, dataset: words, statusText: "Needs cover" })?.chr_shiftstatus, "Assigned");
assert.equal(buildUnschedulePayload(choices, "chr_Resource")?.chr_shiftstatus, 2);
assert.equal(buildUnschedulePayload(words, "chr_Resource")?.chr_shiftstatus, "Open");

function recordWith(values: Record<string, unknown>, formatted: Record<string, string> = {}): DataSet["records"][string] {
  return {
    getFormattedValue: (name: string) => formatted[name] ?? "",
    getNamedReference: () => ({ id: { guid: "e-1" }, name: "e-1" }),
    getRecordId: () => "e-1",
    getValue: (name: string) => values[name],
  } as unknown as DataSet["records"][string];
}
const rowStart = new Date("2026-09-07T08:00:00.000Z");
const rowEnd = new Date("2026-09-07T16:00:00.000Z");
const person = { etn: "chr_employee", id: { guid: "p-1" }, name: "Alex" };
const choiceRows = {
  ...(choices as object),
  loading: false,
  records: {
    "e-1": recordWith({ end: rowEnd, lockType: 3, resource: person, role: { etn: "chr_role", id: { guid: "role-1" }, name: "Bar closer" }, start: rowStart, status: 2, subgroup: "Upstairs" }, { lockType: "Beides", status: "Offen" }),
    "e-2": recordWith({ end: rowEnd, lockType: 1, resource: person, start: rowStart, status: 1 }, { lockType: "Zeit", status: "Zugewiesen" }),
  },
  sortedRecordIds: ["e-1", "e-2"],
} as unknown as DataSet;
const mappedChoices = mapWorkItems(choiceRows);
assert.equal(mappedChoices.events[0]?.status, "needsCover");
assert.equal(mappedChoices.events[0]?.lock, "both");
assert.equal(mappedChoices.events[1]?.status, "assigned");
assert.equal(mappedChoices.events[1]?.lock, "time");
assert.equal(mappedChoices.events[0]?.fields?.find((field) => field.label === "Status")?.value, "Offen");
assert.deepEqual(mappedChoices.events[0]?.requiredTags, ["Bar closer"]);
assert.deepEqual(mappedChoices.events[0]?.groups, { Subteam: "Upstairs" });
assert.equal(mappedChoices.events[1]?.requiredTags, undefined);
console.log("choice lifecycle tests passed");

/*
 * Undated rows (ruled 2026-09-26): a row with neither start nor end waits
 * in the unscheduled list, one Duration long (one hour when unbound); a
 * row with only one of the two stays a skipped, broken row.
 */
{
  const undatedRows = (columns: ReadonlyArray<{ alias: string; name: string; dataType?: string }>, values: Record<string, unknown>): DataSet =>
    ({
      ...(datasetWith(columns) as object),
      loading: false,
      records: {
        "u-1": recordWith(values),
        "u-2": recordWith({ start: rowStart, title: "Half dated" }),
      },
      sortedRecordIds: ["u-1", "u-2"],
    }) as unknown as DataSet;
  const base = [
    { alias: "start", name: "chr_start" },
    { alias: "end", name: "chr_end" },
    { alias: "resource", name: "chr_resource", dataType: "Lookup.Simple" },
  ];
  const plain = mapWorkItems(undatedRows(base, { resource: person, title: "Deep clean" }));
  assert.equal(plain.events.length, 1);
  assert.equal(plain.skipped, 1);
  const item = plain.events[0];
  assert.equal(item?.undated, true);
  assert.equal(item?.status, "needsCover");
  assert.equal(item?.resourceId, "chrona-unassigned");
  assert.equal((item?.end.getTime() ?? 0) - (item?.start.getTime() ?? 0), 60 * 60_000);
  const timed = mapWorkItems(
    undatedRows([...base, { alias: "duration", name: "chr_minutes", dataType: "Whole.Duration" }], { duration: 90 }),
  );
  assert.equal((timed.events[0]?.end.getTime() ?? 0) - (timed.events[0]?.start.getTime() ?? 0), 90 * 60_000);
  const empty = mapWorkItems(
    undatedRows([...base, { alias: "duration", name: "chr_minutes", dataType: "Whole.Duration" }], { duration: 0 }),
  );
  assert.equal((empty.events[0]?.end.getTime() ?? 0) - (empty.events[0]?.start.getTime() ?? 0), 60 * 60_000);
  assert.equal(mappedChoices.events.some((event) => event.undated), false);
}
console.log("undated row tests passed");

// Paging: keep asking for pages while rows remain and the cap is not reached; past the cap, say so.
{
  assert.deepEqual(pagingStep({ hasNextPage: true, loadedRows: 25, loading: false }), { capReached: false, loadNextPage: true });
  assert.deepEqual(pagingStep({ hasNextPage: true, loadedRows: 25, loading: true }), { capReached: false, loadNextPage: false });
  assert.deepEqual(pagingStep({ hasNextPage: false, loadedRows: 25, loading: false }), { capReached: false, loadNextPage: false });
  assert.deepEqual(pagingStep({ hasNextPage: true, loadedRows: DATASET_ROW_CAP, loading: false }), { capReached: true, loadNextPage: false });
  assert.deepEqual(pagingStep({ hasNextPage: false, loadedRows: DATASET_ROW_CAP + 5, loading: false }), { capReached: false, loadNextPage: false });
}

// F28: the app's record commands become menu items; hidden, blocked, unlabelled and Open Record stay out.
{
  const ran: string[] = [];
  const commands = [
    { commandId: "assign", commandButtonId: "Mscrm.HomepageGrid.chr_shift.Assign", label: "Assign", execute: () => ran.push("assign") },
    { commandId: "new", commandButtonId: "Mscrm.HomepageGrid.chr_shift.NewRecord", label: "New", execute: () => ran.push("new") },
    { commandId: "refresh", commandButtonId: "Mscrm.Modern.refreshCommand", label: "Refresh", execute: () => ran.push("refresh") },
    { commandId: "pdelete", commandButtonId: "Mscrm.HomepageGrid.chr_shift.Delete", label: "Delete", execute: () => ran.push("pdelete") },
    { commandId: "maker", commandButtonId: "new_ExportShifts", label: "Export shifts", execute: () => ran.push("maker") },
    { commandId: "Mscrm.HomepageGrid.MainTab.QuickPowerBI.Command", commandButtonId: "Mscrm.HomepageGrid.chr_shift.QuickPowerBI", label: "Visualize this view", execute: () => ran.push("pbi") },
    { commandId: "Mscrm.SendShortcutView", commandButtonId: "Mscrm.HomepageGrid.chr_shift.SendShortcutView", label: "Of Current View", execute: () => ran.push("linkview") },
    { commandId: "Mscrm.SendShortcutSelected", commandButtonId: "Mscrm.HomepageGrid.chr_shift.SendShortcutSelected.Flyout", label: "Of Selected Items", execute: () => ran.push("linksel") },
    { commandId: "Mscrm.SendShortcutSelected.AlwaysEnabled", commandButtonId: "Mscrm.HomepageGrid.chr_shift.SendShortcut", label: "Email a Link", execute: () => ran.push("email") },
    { commandId: "AIBuilder.Command.CreateModel", commandButtonId: "AIBuilder.HomepageGrid.CreateModel", label: "Create model", execute: () => ran.push("ai") },
    { commandId: "Mscrm.ExportToExcel.AllStaticXlsx", commandButtonId: "Mscrm.HomepageGrid.chr_shift.AllStaticXlsx", label: "Static Worksheet", execute: () => ran.push("xlsx") },
    { commandId: "Mscrm.ReportMenu.Grid", commandButtonId: "Mscrm.HomepageGrid.chr_shift.ReportMenu", label: "Run Report", execute: () => ran.push("report") },
    { commandId: "again", commandButtonId: "new_ExportShiftsAgain", label: "Export shifts", execute: () => ran.push("again") },
    { commandId: "hidden", label: "Hidden", visible: false, execute: () => ran.push("hidden") },
    { commandId: "blocked", label: "Blocked", canExecute: false, execute: () => ran.push("blocked") },
    { commandId: "open", commandButtonId: "Mscrm.OpenRecordItem", label: "Open", execute: () => ran.push("open") },
    { commandId: "nolabel", execute: () => ran.push("nolabel") },
    { commandId: "noexec", label: "No execute" },
    { commandId: "off", label: "Off", disabled: true, execute: () => ran.push("off") },
  ];
  const items = mapRecordCommands(commands);
  assert.deepEqual(items.map((i) => [i.id, i.label, i.disabled]), [["platform:assign", "Assign", false], ["platform:maker", "Export shifts", false], ["platform:Mscrm.SendShortcutSelected.AlwaysEnabled", "Email a Link", false], ["platform:off", "Off", true]]);
  items[0]!.onSelect();
  assert.deepEqual(ran, ["assign"]);
  assert.equal(mapRecordCommands({ commands }).length, 4, "a wrapped result is read the same way");
  assert.deepEqual(mapRecordCommands(undefined), []);
  assert.deepEqual(mapRecordCommands("nonsense"), []);
}

// The navigation property from the table definition: SchemaName casing, or undefined when unreadable.
void (async () => {
  const calls: string[] = [];
  const fakeFetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ SchemaName: "chr_Employee" }), { status: 200 });
  }) as typeof fetch;
  const name = await lookupSchemaName("https://org.crm.dynamics.com/", "chr_shift", "chr_employee", fakeFetch);
  assert.equal(name, "chr_Employee");
  assert.equal(
    calls[0],
    "https://org.crm.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='chr_shift')/Attributes(LogicalName='chr_employee')?$select=SchemaName",
  );
  const refused = (async () => new Response("{}", { status: 403 })) as typeof fetch;
  assert.equal(await lookupSchemaName("https://org.crm.dynamics.com", "chr_shift", "chr_employee", refused), undefined);
  assert.equal(await lookupSchemaName(undefined, "chr_shift", "chr_employee", fakeFetch), undefined);
  console.log("lookup schema name tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

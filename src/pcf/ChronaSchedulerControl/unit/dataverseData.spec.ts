import * as assert from "node:assert/strict";
import {
  DATASET_ROW_CAP,
  PROVENANCE_MAX_LENGTH,
  buildLockPayload,
  buildProvenance,
  buildUnschedulePayload,
  buildUpdatePayload,
  choiceNumber,
  givesPerson,
  lookupSchemaName,
  lookupTarget,
  mapRecordCommands,
  retrieveRecordCommands,
  shiftMenuFromRow,
  shiftMenuHandlers,
  boardCreates,
  createHandler,
  showCreateFromRow,
  VIEW_ROW_COLUMNS,
  mapWorkItems,
  pagingStep,
  colorByFromChoice,
  colorWash,
  eventColorFor,
  GROUP_PALETTE,
  groupColor,
  layoutFromChoice,
  workingEndHour,
  representationFor,
  UNASSIGNED_RESOURCE_ID,
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
// An end not after the start runs past midnight; "next day" choices already do.
assert.equal(workingEndHour(540, 1020), 17);
assert.equal(workingEndHour(540, 300), 29);
assert.equal(workingEndHour(540, 540), 33);
assert.equal(workingEndHour(1080, 1740), 29);
assert.equal(workingEndHour(undefined, 300), 5);
assert.equal(workingEndHour(540, undefined), undefined);
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
 * chr_shift status is read by its pinned values and written as values; a
 * text binding keeps the words.
 */
const choiceColumns = [
  { alias: "start", name: "chr_start" },
  { alias: "end", name: "chr_end" },
  { alias: "resource", name: "chr_resource" },
  { alias: "status", name: "chr_shiftstatus", dataType: "OptionSet" },
  { alias: "role", name: "chr_role", dataType: "Lookup.Simple" },
  { alias: "subgroup", name: "chr_subgroup" },
];
const choices = datasetWith(choiceColumns);
const words = datasetWith(choiceColumns.map((column) => ({ alias: column.alias, name: column.name })));
// Pin and Unpin write the pinned column, the only lock; without it there is nothing to write.
assert.equal(buildLockPayload(choices, true), undefined);
const shipped = datasetWith([...choiceColumns, { alias: "pinned", name: "chr_pinned", dataType: "TwoOptions" }]);
assert.deepEqual(buildLockPayload(shipped, true), { chr_pinned: true });
assert.deepEqual(buildLockPayload(shipped, false), { chr_pinned: false });
assert.deepEqual(buildLockPayload(datasetWith([{ alias: "pinned", name: "chr_pinned" }]), false), { chr_pinned: false });
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
    "e-1": recordWith({ end: rowEnd, resource: person, role: { etn: "chr_role", id: { guid: "role-1" }, name: "Bar closer" }, start: rowStart, status: 2, subgroup: "Upstairs" }, { status: "Offen" }),
    "e-2": recordWith({ end: rowEnd, resource: person, start: rowStart, status: 1 }, { status: "Zugewiesen" }),
  },
  sortedRecordIds: ["e-1", "e-2"],
} as unknown as DataSet;
const mappedChoices = mapWorkItems(choiceRows);
assert.equal(mappedChoices.events[0]?.status, "needsCover");
assert.equal(mappedChoices.events[1]?.status, "assigned");
assert.equal(mappedChoices.events[0]?.fields?.find((field) => field.label === "Status")?.value, "Offen");
assert.deepEqual(mappedChoices.events[0]?.requiredTags, ["Bar closer"]);
assert.deepEqual(mappedChoices.events[0]?.groups, { Subteam: "Upstairs" });
assert.equal(mappedChoices.events[1]?.requiredTags, undefined);
console.log("choice lifecycle tests passed");

/*
 * Power Apps hands dataset choice values back as text ("2", "3"), as the
 * proof environment showed 2026-09-30. They read the same as numbers,
 * so the Status choice reaches the board and the solver.
 */
const textChoiceRows = {
  ...(choices as object),
  loading: false,
  records: {
    "e-1": recordWith({ end: rowEnd, resource: person, start: rowStart, status: "2" }),
    "e-2": recordWith({ end: rowEnd, resource: person, start: rowStart, status: "1" }),
  },
  sortedRecordIds: ["e-1", "e-2"],
} as unknown as DataSet;
const mappedText = mapWorkItems(textChoiceRows);
assert.equal(mappedText.events[0]?.status, "needsCover");
assert.equal(mappedText.events[1]?.status, "assigned");
assert.equal(choiceNumber(" 2 "), 2);
assert.equal(choiceNumber("Open"), undefined);
assert.equal(choiceNumber(null), undefined);
console.log("choice values as text tests passed");

/*
 * The hover card's labels come from the host, so they follow the user's
 * language; writes find the status by its stable key, not its label.
 */
const frenchLabels = { bundle: "Lot", provenance: "Origine", publishState: "Publication", status: "Statut" };
const statusField = mapWorkItems(choiceRows, frenchLabels).events[0]?.fields?.find((field) => field.key === "status");
assert.equal(statusField?.label, "Statut");
assert.equal(statusField?.value, "Offen");
assert.equal(mapWorkItems(choiceRows).events[0]?.fields?.find((field) => field.key === "status")?.label, "Status");
console.log("localized field label tests passed");

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

// F31 rework, batch 2: the Code binding reaches the event trimmed; a blank or unbound code stays absent.
{
  const coded = {
    ...(datasetWith([
      { alias: "start", name: "chr_start" },
      { alias: "end", name: "chr_end" },
      { alias: "resource", name: "chr_resource", dataType: "Lookup.Simple" },
      { alias: "code", name: "chr_code" },
    ]) as object),
    loading: false,
    records: {
      "c-1": recordWith({ code: " ND ", end: rowEnd, resource: person, start: rowStart, title: "Night duty" }),
      "c-2": recordWith({ code: "  ", end: rowEnd, resource: person, start: rowStart, title: "Day duty" }),
    },
    sortedRecordIds: ["c-1", "c-2"],
  } as unknown as DataSet;
  const mapped = mapWorkItems(coded);
  assert.equal(mapped.events.length, 2);
  assert.equal(mapped.events[0]?.code, "ND");
  assert.equal("code" in (mapped.events[1] ?? {}), false);
  assert.equal("code" in (mappedChoices.events[0] ?? {}), false, "no Code binding, no code");
}
console.log("code binding tests passed");

// AGENTS.md 0.1: a record with no name keeps an empty title; its record id is never its label.
{
  const RECORD_ID = "e5d4560b-93dc-f111-84e8-000d3ae0d839";
  const nameless = {
    ...(datasetWith([
      { alias: "start", name: "chr_start" },
      { alias: "end", name: "chr_end" },
      { alias: "title", name: "chr_name" },
    ]) as object),
    loading: false,
    records: { [RECORD_ID]: recordWith({ end: rowEnd, start: rowStart }) },
    sortedRecordIds: [RECORD_ID],
  } as unknown as DataSet;
  const mapped = mapWorkItems(nameless);
  assert.equal(mapped.events.length, 1);
  assert.equal(mapped.events[0]?.id, RECORD_ID);
  assert.equal(mapped.events[0]?.title, "", "a nameless record is not labelled with its id");
}
console.log("nameless record tests passed");
// AGENTS.md 0.1: a resource whose lookup carries no name has an empty name, never its id.
{
  const nameless = {
    ...(datasetWith([
      { alias: "start", name: "chr_start" },
      { alias: "end", name: "chr_end" },
      { alias: "resource", name: "chr_resource", dataType: "Lookup.Simple" },
    ]) as object),
    loading: false,
    records: { "r-1": recordWith({ end: rowEnd, resource: { etn: "chr_employee", id: { guid: "p-9" } }, start: rowStart, title: "Early" }) },
    sortedRecordIds: ["r-1"],
  } as unknown as DataSet;
  const mapped = mapWorkItems(nameless);
  assert.equal(mapped.resources[0]?.id, "p-9");
  assert.equal(mapped.resources[0]?.name, "", "a nameless resource is not labelled with its id");
}
console.log("nameless resource tests passed");

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
  assert.deepEqual(mapRecordCommands([]), [], "an empty list is no commands");
  // An answer that is not a list of commands is unreadable: a failure, never "no commands" (AGENTS.md 0.1).
  for (const unreadable of [undefined, null, "nonsense", 3, {}, { commands: "nonsense" }]) {
    assert.throws(() => mapRecordCommands(unreadable), /not a list of commands/, `unreadable: ${JSON.stringify(unreadable)}`);
  }
}

// A save waits for the person's table only when the change gives the row a person.
assert.equal(givesPerson(undefined, "p-1"), true);
assert.equal(givesPerson("p-1", "p-2"), true);
assert.equal(givesPerson("p-1", "p-1"), false);
assert.equal(givesPerson("p-1", UNASSIGNED_RESOURCE_ID), false);
console.log("gives person tests passed");

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

// The lookup's one table, for the first assignment on a table where no row has a person yet.
void (async () => {
  const calls: string[] = [];
  const answer = (targets: unknown) =>
    (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ Targets: targets }), { status: 200 });
    }) as typeof fetch;
  assert.equal(await lookupTarget("https://org.crm.dynamics.com/", "chr_shift", "chr_resource", answer(["chr_employee"])), "chr_employee");
  assert.equal(
    calls[0],
    "https://org.crm.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='chr_shift')/Attributes(LogicalName='chr_resource')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets",
  );
  // A lookup to several tables cannot name one; neither can a refused or empty read.
  assert.equal(await lookupTarget("https://org.crm.dynamics.com", "chr_shift", "chr_resource", answer(["account", "contact"])), undefined);
  assert.equal(await lookupTarget("https://org.crm.dynamics.com", "chr_shift", "chr_resource", answer(undefined)), undefined);
  const refused = (async () => new Response("{}", { status: 403 })) as typeof fetch;
  assert.equal(await lookupTarget("https://org.crm.dynamics.com", "chr_shift", "chr_resource", refused), undefined);
  assert.equal(await lookupTarget(undefined, "chr_shift", "chr_resource", answer(["chr_employee"])), undefined);
  console.log("lookup target tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

// B141: the view row's shift menu switches. A row from before them reads no value and keeps both items, as Show
// weekends does; a switch set to No leaves its handler out, so the board draws no item for it.
{
  const handlers = { loadContextMenuItems: "commands", onOpenRecord: "form" };
  assert.deepEqual(shiftMenuFromRow({ chr_showweekends: false }), { showAppCommands: undefined, showOpenForm: undefined }, "a row from before the upgrade has no value");
  assert.deepEqual(shiftMenuFromRow({ chr_showappcommands: null, chr_showopenform: null }), { showAppCommands: undefined, showOpenForm: undefined }, "an empty cell has no value");
  assert.deepEqual(shiftMenuHandlers(shiftMenuFromRow({}), handlers), handlers, "no value shows both items");
  assert.deepEqual(shiftMenuHandlers({}, handlers), handlers, "a board without a view row shows both items");
  assert.deepEqual(shiftMenuHandlers(shiftMenuFromRow({ chr_showappcommands: true, chr_showopenform: true }), handlers), handlers);
  assert.deepEqual(shiftMenuHandlers(shiftMenuFromRow({ chr_showappcommands: true, chr_showopenform: false }), handlers), { loadContextMenuItems: "commands" }, "Open record off");
  assert.deepEqual(shiftMenuHandlers(shiftMenuFromRow({ chr_showappcommands: false, chr_showopenform: true }), handlers), { onOpenRecord: "form" }, "the app's commands off");
  assert.deepEqual(shiftMenuHandlers(shiftMenuFromRow({ chr_showappcommands: false, chr_showopenform: false }), handlers), {}, "both off");
  console.log("shift menu switch tests passed");
}

// Create new bookings on the board (chr_showcreate, Matt 2026-11-16): the view row read asks for it; off, or not
// known because the row is unread or its read failed, the host passes no create handler, so the board offers no New
// event, no click on an empty slot and no drag to create. No row, or no value, keeps them: the column defaults to Yes.
{
  assert.ok((VIEW_ROW_COLUMNS as readonly string[]).includes("chr_showcreate"), "the view row read asks for the switch");
  assert.equal(showCreateFromRow({ chr_showcreate: false }), false);
  assert.equal(showCreateFromRow({ chr_showcreate: true }), true);
  assert.equal(showCreateFromRow({ chr_showcreate: null }), undefined, "an empty cell has no value");
  assert.equal(showCreateFromRow({ chr_showweekends: false }), undefined, "a row without the column has no value");
  assert.equal(boardCreates({ answered: true, failed: false, showCreate: false }), false, "off: no create");
  assert.equal(boardCreates({ answered: true, failed: false, showCreate: true }), true, "on: create");
  assert.equal(boardCreates({ answered: true, failed: false }), true, "no row or no value: the column's default, Yes");
  assert.equal(boardCreates({ answered: false, failed: false, showCreate: true }), false, "unread yet: not known, no create");
  assert.equal(boardCreates({ answered: true, failed: true }), false, "a failed read: not known, no create, never the default");
  assert.equal(boardCreates({ answered: true, failed: true, showCreate: true }), false, "a failed re-read does not keep an old Yes");
  const create = (): void => undefined;
  assert.deepEqual(createHandler(false, create), {}, "off: no onCreateEvent at all");
  assert.equal(Object.prototype.hasOwnProperty.call(createHandler(false, create), "onCreateEvent"), false);
  assert.deepEqual(createHandler(true, create), { onCreateEvent: create }, "on: the host's handler");
  console.log("create switch tests passed");
}

// B141: a platform without the record-command method has no commands to show; a call that fails shows one disabled
// item that says so, never an empty list that looks like no commands (AGENTS.md 0.1).
void (async () => {
  const failed = "Couldn't load the app's commands.";
  assert.deepEqual(await retrieveRecordCommands(undefined, "s-1", failed), [], "no dataset: no commands");
  assert.deepEqual(await retrieveRecordCommands({} as never, "s-1", failed), [], "no method: no commands");
  const asked: unknown[] = [];
  const answering = { retrieveRecordCommand: (ids: string[]) => { asked.push(ids); return Promise.resolve([{ commandId: "assign", label: "Assign", execute: () => undefined }]); } };
  assert.deepEqual((await retrieveRecordCommands(answering as never, "s-1", failed)).map((i) => [i.id, i.label, i.disabled]), [["platform:assign", "Assign", false]]);
  assert.deepEqual(asked, [["s-1"]]);
  const errors: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    for (const dataset of [
      { retrieveRecordCommand: () => Promise.reject(new Error("command bar unavailable")) },
      { retrieveRecordCommand: () => { throw new Error("command bar unavailable"); } },
      // An answer of an unreadable shape is a failed read too.
      { retrieveRecordCommand: () => Promise.resolve(undefined) },
      { retrieveRecordCommand: () => Promise.resolve("nonsense") },
    ]) {
      const items = await retrieveRecordCommands(dataset as never, "s-1", failed);
      assert.deepEqual(items.map((i) => [i.id, i.label, i.disabled]), [["platform:failed", failed, true]], "a failed read says so");
      items[0]!.onSelect();
    }
  } finally {
    console.error = consoleError;
  }
  const logged = errors.filter((args) => String(args[0]).includes("the app's commands"));
  assert.equal(logged.length, 4, "the cause is logged");
  assert.ok(String(logged[0]![1]).includes("command bar unavailable"));
  assert.ok(String(logged[3]![1]).includes("not a list of commands"));
  console.log("record command read tests passed");
})().catch((error) => { console.error(error); process.exit(1); });

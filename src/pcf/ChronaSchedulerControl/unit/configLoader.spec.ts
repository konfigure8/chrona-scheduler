import * as assert from "node:assert/strict";

import {
  defaultRulePolicies,
  mapAvailability,
  mapAvailabilityTypes,
  mapCalendarPolicies,
  mapCalendarRow,
  mapDemand,
  mapPreferences,
  mapResourceRows,
  mapResourceRoles,
  mapResourceSkills,
  mapRoleCatalog,
  mapRoles,
  mapSkills,
  mapCycle,
  mapDemandDrivers,
  mapLever,
  mapTemplates,
  loadHostConfig,
  calendarsNamedLikeQuery,
  nextCalendarName,
  productFromChoice,
  PRODUCT_CHOICE,
  resetWorkforceProbe,
} from "../SchedulerControl/configLoader";

// F38: the calendar names its product; a plain calendar is the free scheduler's.
assert.equal(productFromChoice(PRODUCT_CHOICE.workforce), "workforce-scheduling");
assert.equal(productFromChoice(PRODUCT_CHOICE.scheduler), "scheduler");
assert.equal(productFromChoice(undefined), "scheduler");

// F39: a calendar the control creates takes its table's name, numbered when that name is taken.
assert.equal(nextCalendarName("Tasks", []), "Tasks");
assert.equal(nextCalendarName("Tasks", ["Task list", "Tasks board"]), "Tasks");
assert.equal(nextCalendarName("Tasks", ["tasks"]), "Tasks 2");
assert.equal(nextCalendarName("Tasks", ["Tasks", "Tasks 2", "Tasks 4"]), "Tasks 3");
assert.equal(calendarsNamedLikeQuery("O'Brien jobs"), "?$select=chr_name&$filter=startswith(chr_name,'O''Brien jobs')");

// Calendar row: table + name column required; the rest optional.
{
  const mapping = mapCalendarRow({
    chr_resourcegroupcolumn: "dept",
    chr_resourcenamecolumn: "fullname",
    chr_resourcetable: "contact",
    chr_resourcetimezonecolumn: " tz ",
  });
  assert.ok(mapping);
  assert.equal(mapping.table, "contact");
  assert.equal(mapping.nameColumn, "fullname");
  assert.equal(mapping.groupColumn, "dept");
  assert.equal(mapping.timezoneColumn, "tz");
  assert.equal(mapCalendarRow({ chr_resourcetable: "contact" }), undefined);
}

// Skills: colors keyed by name; junctions join by skill id, dedupe, sort.
{
  const skills = mapSkills([
    { chr_color: "#107c10", chr_name: "Kitchen", chr_skillid: "S-1" },
    { chr_name: "Floor", chr_skillid: "S-2" },
  ]);
  assert.deepEqual(skills.colors, { Kitchen: "#107c10" });
  const tags = mapResourceSkills(
    [
      { _chr_skill_value: "s-1", _chr_resource_value: "R-1" },
      { _chr_skill_value: "S-2", _chr_resource_value: "r-1" },
      { _chr_skill_value: "S-2", _chr_resource_value: "R-1" },
      { _chr_skill_value: "missing", _chr_resource_value: "R-2" },
    ],
    skills.nameById,
  );
  assert.deepEqual(tags.get("r-1"), ["Floor", "Kitchen"]);
  assert.equal(tags.get("r-2"), undefined);
}

// Roles a person holds: tags are the role names; a role whose skills the
// person lacks carries a note naming the gap.
{
  const skills = mapSkills([
    { chr_name: "Bar", chr_skillid: "S-B" },
    { chr_name: "First Aid", chr_skillid: "S-F" },
  ]);
  const roles = mapRoles(
    [{ chr_name: "Bar closer", chr_roleid: "R-1" }, { chr_name: "Floor", chr_roleid: "R-2" }],
    [{ _chr_role_value: "R-1", _chr_skill_value: "S-B" }, { _chr_role_value: "R-1", _chr_skill_value: "S-F" }],
    skills.nameById,
  );
  const held = mapResourceRoles(
    [
      { _chr_resource_value: "P-1", _chr_role_value: "R-1" },
      { _chr_resource_value: "P-1", _chr_role_value: "R-2" },
      { _chr_resource_value: "P-2", _chr_role_value: "R-1" },
      { _chr_resource_value: "P-3", _chr_role_value: "missing" },
    ],
    roles,
    new Map([["p-1", ["Bar"]], ["p-2", ["Bar", "First Aid"]]]),
    (missing) => `Missing ${missing.join(", ")}`,
  );
  assert.deepEqual(held.tags.get("p-1"), ["Bar closer", "Floor"]);
  assert.deepEqual(held.notes.get("p-1"), { "Bar closer": "Missing First Aid" });
  assert.equal(held.notes.get("p-2"), undefined);
  assert.equal(held.tags.has("p-3"), false);
  const catalog = mapRoleCatalog([
    { chr_color: "#7a3db8", chr_name: "Bar closer", chr_roleid: "R-1" },
    { chr_name: "Floor", chr_roleid: "R-2" },
  ]);
  assert.deepEqual(catalog.names, ["Bar closer", "Floor"]);
  assert.deepEqual(catalog.colors, { "Bar closer": "#7a3db8" });
  assert.equal(catalog.nameById.get("r-2"), "Floor");
}

// Resource rows: mapped columns, timezone map, tags attach, sorted.
{
  const mapped = mapResourceRows(
    [
      {
        contactid: "B",
        dept: "Kitchen",
        fullname: "Zoe",
        tz: "Australia/Brisbane",
      },
      { contactid: "A", fullname: "Alex" },
      { fullname: "No id row" },
    ],
    {
      groupColumn: "dept",
      nameColumn: "fullname",
      table: "contact",
      timezoneColumn: "tz",
    },
    "contactid",
    new Map([["b", ["Kitchen"]]]),
  );
  assert.deepEqual(
    mapped.resources.map((resource) => resource.name),
    ["Alex", "Zoe"],
  );
  assert.equal(mapped.resources[1]?.groups?.["Team"], "Kitchen");
  assert.deepEqual(mapped.resources[1]?.tags, ["Kitchen"]);
  assert.equal(mapped.timeZones.get("B"), "Australia/Brisbane");
}

// Availability: pinned kind values, type name wins over free label.
{
  const types = mapAvailabilityTypes([
    { chr_availabilitytypeid: "T-1", chr_name: "Annual leave" },
  ]);
  const bands = mapAvailability(
    [
      {
        _chr_type_value: "t-1",
        chr_end: "2026-08-18T00:00:00Z",
        chr_kind: 1,
        chr_label: "ignored",
        _chr_resource_value: "R-1",
        chr_start: "2026-08-17T00:00:00Z",
      },
      {
        chr_end: "2026-08-18T12:00:00Z",
        chr_kind: 2,
        chr_label: "Prefers mornings",
        _chr_resource_value: "R-1",
        chr_start: "2026-08-18T08:00:00Z",
      },
      // Unknown kind value: skipped, never guessed.
      {
        chr_end: "2026-08-19T00:00:00Z",
        chr_kind: 99,
        _chr_resource_value: "R-1",
        chr_start: "2026-08-18T00:00:00Z",
      },
    ],
    types,
  );
  assert.equal(bands.length, 2);
  assert.equal(bands[0]?.kind, "unavailable");
  assert.equal(bands[0]?.label, "Annual leave");
  assert.equal(bands[1]?.kind, "preferred");
  assert.equal(bands[1]?.label, "Prefers mornings");
}

// Demand: the band's role is its tag, invalid rows skipped.
{
  const rows = mapDemand(
    [
      {
        _chr_role_value: "R-K",
        chr_end: "2026-08-17T14:00:00Z",
        chr_group: "Kitchen",
        chr_maxheadcount: 3,
        chr_minheadcount: 2,
        chr_start: "2026-08-17T06:00:00Z",
      },
      { chr_minheadcount: 1, chr_start: "bad" },
    ],
    new Map([["r-k", "Kitchen hand"]]),
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.tags, ["Kitchen hand"]);
  assert.equal(rows[0]?.maxHeadcount, 3);
}

// Preferences: pinned tier values, optional scoping and dating.
{
  const rules = mapPreferences([
    {
      chr_label: "Banned from Northside",
      _chr_resource_value: "R-1",
      chr_tier: 2,
    },
    {
      chr_effectivefrom: "2026-08-01T00:00:00Z",
      _chr_resource_value: "R-2",
      chr_tier: 3,
      _chr_workitem_value: "W-1",
    },
    { _chr_resource_value: "R-3", chr_tier: 42 },
  ]);
  assert.equal(rules.length, 2);
  assert.equal(rules[0]?.tier, "restricted");
  assert.equal(rules[0]?.label, "Banned from Northside");
  assert.equal(rules[0]?.workItemId, undefined);
  assert.equal(rules[1]?.tier, "mustChooseFrom");
  assert.equal(rules[1]?.workItemId, "W-1");
}

console.log("configLoader tests passed");

// Convention fallback: unmapped aliases resolve to chr_shift columns.
import { columnLogicalName, resolveColumn } from "../SchedulerControl/dataverseData";

{
  const dataset = {
    columns: [
      { alias: "title", name: "chr_customtitle" },
      { name: "chr_start" },
      { name: "chr_end" },
    ],
  } as never;
  assert.equal(resolveColumn(dataset, "title"), "title");
  assert.equal(columnLogicalName(dataset, "title"), "chr_customtitle");
  assert.equal(resolveColumn(dataset, "start"), "chr_start");
  assert.equal(columnLogicalName(dataset, "start"), "chr_start");
  assert.equal(resolveColumn(dataset, "resource"), undefined);
  console.log("convention fallback tests passed");
}

// Rule policies: pinned values, per-rule defaults when absent.
{
  assert.deepEqual(mapCalendarPolicies(undefined), defaultRulePolicies);
  const policies = mapCalendarPolicies({
    chr_overlappolicy: 3,
    chr_workinghourspolicy: 2,
  });
  assert.equal(policies.overlap, "block");
  assert.equal(policies.workingHours, "warn");
  assert.equal(policies.skillMismatch, "block");
  // Availability defaults to block when the column is absent.
  assert.equal(policies.availability, "block");
  assert.equal(mapCalendarPolicies({ chr_skillmismatchpolicy: 1 }).skillMismatch, "off");
  assert.equal(
    mapCalendarPolicies({ chr_availabilitypolicy: 2 }).availability,
    "warn",
  );
  console.log("policy mapping tests passed");
}

// Skills expose names and name->id for junction writes.
{
  const skills = mapSkills([
    { chr_name: "Kitchen", chr_skillid: "S-1" },
    { chr_color: "#0f6cbd", chr_name: "Floor", chr_skillid: "S-2" },
  ]);
  assert.deepEqual(skills.names, ["Floor", "Kitchen"]);
  assert.equal(skills.idByName.get("Kitchen"), "S-1");
  console.log("skill surface tests passed");
}

// F25: roles resolve to skill tags at the boundary; templates map one
// row -> one slot with role + extra skills merged, gaps stamped from
// kind-2 span rows, minimum as the count, inactive rows skipped.
{
  const skills = mapSkills([
    { chr_name: "Bar service", chr_skillid: "S-BAR" },
    { chr_name: "RSA", chr_skillid: "S-RSA" },
    { chr_name: "First Aid", chr_skillid: "S-FA" },
  ]);
  const roles = mapRoles(
    [{ chr_name: "Bar closer", chr_roleid: "R-1" }],
    [
      { _chr_role_value: "R-1", _chr_skill_value: "S-BAR" },
      { _chr_role_value: "R-1", _chr_skill_value: "S-RSA" },
      { _chr_role_value: "R-1", _chr_skill_value: "S-RSA" },
      { _chr_role_value: "R-missing", _chr_skill_value: "S-FA" },
    ],
    skills.nameById,
  );
  assert.deepEqual(roles.get("r-1"), { name: "Bar closer", skills: ["Bar service", "RSA"] });
  assert.equal(roles.has("r-missing"), false);

  const templates = mapTemplates(
    [
      {
        _chr_role_value: "R-1",
        chr_active: true,
        chr_days: "7,1, 2,3,9",
        chr_endtime: 23 * 60,
        chr_group: "Bar",
        chr_subgroup: "Upstairs",
        chr_minimum: 2,
        chr_name: "Bar close",
        chr_starttime: 17 * 60,
        chr_titlepattern: "Bar close",
        chr_workitemtemplateid: "T-1",
      },
      {
        chr_active: false,
        chr_endtime: 12 * 60,
        chr_starttime: 8 * 60,
        chr_workitemtemplateid: "T-off",
      },
      {
        chr_endtime: 8 * 60,
        chr_starttime: 12 * 60,
        chr_workitemtemplateid: "T-backwards",
      },
    ],
    [
      { _chr_workitemtemplate_value: "T-1", chr_durationminutes: 30, chr_kind: 2, chr_label: "Meal break", chr_offsetminutes: 180, chr_paid: false },
      { _chr_workitemtemplate_value: "T-1", chr_durationminutes: 60, chr_kind: 1, chr_offsetminutes: 0 },
      { _chr_workitemtemplate_value: "T-1", chr_durationminutes: 600, chr_kind: 2, chr_offsetminutes: 300 },
    ],
    roles,
  );
  assert.equal(templates.length, 1);

  // F5: a driver on the row turns the lever columns into a lever; the
  // pinned choice values map to the package's names.
  assert.equal(mapLever({ chr_workitemtemplateid: "T-1", chr_minimum: 2 }), undefined);
  assert.deepEqual(
    mapLever({
      _chr_demanddriver_value: "D-GUESTS",
      chr_distribution: 2,
      chr_maximum: 6,
      chr_minimum: 2,
      chr_perunits: 10,
      chr_ratiocount: 1,
      chr_rounding: 3,
      chr_servicename: "Dinner",
    }),
    { distribution: "acrossWindow", driverId: "d-guests", maximum: 6, minimum: 2, perUnits: 10, ratioCount: 1, rounding: "floor", serviceName: "Dinner" },
  );
  assert.deepEqual(
    mapLever({ _chr_demanddriver_value: "D-1", chr_maximum: 0, chr_perunits: 0 }),
    { distribution: "perOccurrence", driverId: "d-1", minimum: 0, perUnits: 1, ratioCount: 1, rounding: "ceiling" },
  );
  const levered = mapTemplates(
    [{ _chr_demanddriver_value: "D-GUESTS", chr_active: true, chr_days: "1", chr_endtime: 15 * 60, chr_minimum: 2, chr_perunits: 10, chr_starttime: 11 * 60, chr_workitemtemplateid: "T-L" }],
    [],
    roles,
  );
  assert.equal(levered[0]?.slots[0]?.lever?.driverId, "d-guests");
  assert.equal(levered[0]?.slots[0]?.count, 2);

  // F1: a cycle length above one makes the row a rotating slot; the
  // week is clamped into the cycle, and a length of one is weekly.
  assert.equal(mapCycle({ chr_workitemtemplateid: "T-1" }), undefined);
  assert.equal(mapCycle({ chr_cyclelength: 1, chr_cycleweek: 3 }), undefined);
  assert.deepEqual(mapCycle({ chr_cyclelength: 4, chr_cycleweek: 2 }), { week: 2, weeks: 4 });
  assert.deepEqual(mapCycle({ chr_cyclelength: 2 }), { week: 1, weeks: 2 });
  assert.deepEqual(mapCycle({ chr_cyclelength: 2, chr_cycleweek: 7 }), { week: 2, weeks: 2 });
  assert.deepEqual(mapCycle({ chr_cyclelength: 3, chr_cycleweek: 0 }), { week: 1, weeks: 3 });
  const rotating = mapTemplates(
    [{ chr_active: true, chr_cyclelength: 2, chr_cycleweek: 2, chr_days: "3", chr_endtime: 17 * 60, chr_minimum: 1, chr_starttime: 14 * 60, chr_workitemtemplateid: "T-R" }],
    [],
    roles,
  );
  assert.deepEqual(rotating[0]?.slots[0]?.cycle, { week: 2, weeks: 2 });
  assert.equal(levered[0]?.slots[0]?.cycle, undefined);

  const demand = mapDemandDrivers(
    [
      { chr_demanddriverid: "D-GUESTS", chr_name: "Guests", chr_unitlabel: "guests", chr_windowkind: 1 },
      { chr_demanddriverid: "D-COVERS", chr_name: "Covers", chr_windowkind: 2 },
      { chr_name: "no id" },
    ],
    [
      { _chr_demanddriver_value: "D-GUESTS", chr_value: 35, chr_windowstart: "2026-09-07" },
      { _chr_demanddriver_value: "D-COVERS", chr_servicename: "Dinner", chr_value: 120, chr_windowstart: "2026-09-11T00:00:00Z" },
      { _chr_demanddriver_value: "D-GUESTS", chr_windowstart: "2026-09-08" },
    ],
  );
  assert.equal(demand?.drivers.length, 2);
  assert.equal(demand?.drivers[0]?.windowKind, "day");
  assert.equal(demand?.drivers[1]?.windowKind, "namedService");
  assert.deepEqual(demand?.values, [
    { driverId: "d-guests", value: 35, windowStart: "2026-09-07" },
    { driverId: "d-covers", serviceName: "Dinner", value: 120, windowStart: "2026-09-11" },
  ]);
  assert.equal(mapDemandDrivers([], []), undefined);
  const slot = templates[0]?.slots[0];
  assert.ok(slot);
  assert.equal(templates[0]?.templateId, "t-1");
  assert.equal(slot.count, 2);
  assert.deepEqual(slot.daysOfWeek, [0, 1, 2, 3]);
  assert.deepEqual(slot.requiredTags, ["Bar closer"]);
  assert.deepEqual(slot.groups, { Subteam: "Upstairs", Team: "Bar" });
  assert.equal(slot.title, "Bar close");
  // One gap survives: the kind-1 span is the envelope, the oversized
  // gap falls outside it.
  assert.deepEqual(slot.gaps, [
    { endMinutes: 17 * 60 + 210, label: "Meal break", paid: false, startMinutes: 17 * 60 + 180 },
  ]);
}

console.log("configLoader tests passed");

// The free bundle has no Workforce tables: one probe, then no request per scenario table.
{
  const calendar = { chr_chronaschedulercalendarid: "C-1", chr_name: "Bookings", chr_resourcetable: "systemuser", chr_resourcenamecolumn: "fullname" };
  const fakeWebApi = (skillsPresent: boolean, calls: string[]) =>
    ({
      retrieveMultipleRecords: async (entity: string) => {
        calls.push(entity);
        if (entity === "chr_chronaschedulercalendar") return { entities: [calendar] };
        if (entity === "chr_skill" && !skillsPresent) throw new Error("Resource not found for the segment 'chr_skills'.");
        return { entities: [] };
      },
    }) as unknown as ComponentFramework.Context<unknown>["webAPI"];
  (async () => {
    resetWorkforceProbe();
    const withoutCalls: string[] = [];
    const loaded = await loadHostConfig(fakeWebApi(false, withoutCalls), "C-1");
    assert.equal(loaded.calendarName, "Bookings", "F39: every solve carries the calendar's name");
    assert.deepEqual(withoutCalls.filter((e) => e !== "chr_chronaschedulercalendar" && e !== "systemuser"), ["chr_skill"]);
    const againCalls: string[] = [];
    await loadHostConfig(fakeWebApi(false, againCalls), "C-1");
    assert.deepEqual(againCalls.filter((e) => e !== "chr_chronaschedulercalendar" && e !== "systemuser"), [], "probe result is remembered");
    resetWorkforceProbe();
    const withCalls: string[] = [];
    await loadHostConfig(fakeWebApi(true, withCalls), "C-1");
    assert.ok(withCalls.includes("chr_resourcerole") && withCalls.includes("chr_demand"), "scenario tables load when present");
    resetWorkforceProbe();
  })().catch((error) => { console.error(error); process.exit(1); });
}

import * as assert from "node:assert/strict";

import {
  calendarsNamedLikeQuery,
  defaultRulePolicies,
  loadHostConfig,
  mapCalendarPolicies,
  mapCalendarRow,
  mapResourceRows,
  nextCalendarName,
  PRODUCT_CHOICE,
  productFromChoice,
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
  // Each defaults when its column is absent.
  assert.equal(mapCalendarPolicies({ chr_overlappolicy: 1 }).workingHours, "off");
  console.log("policy mapping tests passed");
}

console.log("configLoader tests passed");

// The generic scheduler reads only its own settings; a scenario loads in the same pass.
{
  const calendar = { chr_chronaschedulercalendarid: "C-1", chr_name: "Bookings", chr_resourcetable: "systemuser", chr_resourcenamecolumn: "fullname", chr_timezone: " Australia/Perth " };
  const fakeWebApi = (calls: string[]) =>
    ({
      retrieveMultipleRecords: async (entity: string) => {
        calls.push(entity);
        if (entity === "chr_chronaschedulercalendar") return { entities: [calendar] };
        if (entity === "systemuser") return { entities: [{ systemuserid: "U-1", fullname: "Ada" }] };
        return { entities: [] };
      },
    }) as unknown as ComponentFramework.Context<unknown>["webAPI"];
  (async () => {
    const calls: string[] = [];
    const loaded = await loadHostConfig(fakeWebApi(calls), "C-1");
    assert.equal(loaded.calendarName, "Bookings", "F39: every solve carries the calendar's name");
    assert.equal(loaded.timeZone, "Australia/Perth", "the board shows the calendar's time zone (ruled 2026-10-02)");
    assert.equal(loaded.scenario, undefined);
    assert.deepEqual(calls, ["chr_chronaschedulercalendar", "systemuser"], "no scenario table is read");
    const scenarioCalendars: unknown[] = [];
    const tagged = await loadHostConfig(fakeWebApi([]), "C-1", {
      loadConfig: async (_webApi, entity) => {
        scenarioCalendars.push(entity);
        return { resourceTags: new Map([["u-1", ["Barista"]]]) };
      },
    });
    assert.equal(scenarioCalendars.length, 1, "the scenario loads once, with the calendar row");
    assert.deepEqual(tagged.resources?.[0]?.tags, ["Barista"], "the scenario's tags reach the board's people");
    assert.ok(tagged.scenario?.resourceTags, "the scenario's rows ride on the host config");
    console.log("loader scenario tests passed");
  })().catch((error) => { console.error(error); process.exit(1); });
}

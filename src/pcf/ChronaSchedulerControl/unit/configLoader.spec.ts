import * as assert from "node:assert/strict";

import {
  calendarsNamedLikeQuery,
  defaultRulePolicies,
  hostEditsLocked,
  hostReadFailure,
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

// The scheduler reads only its own settings.
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
    assert.deepEqual(calls, ["chr_chronaschedulercalendar", "systemuser"], "no other table is read");
    console.log("loader tests passed");
  })().catch((error) => { console.error(error); process.exit(1); });
}

/*
 * AGENTS.md 0.1: a settings read that fails is never "no row". The scheduler's row refused: the cause is logged, the
 * config names the failure and nothing behind the row is read. Its people refused: logged, named, and nobody, never
 * the people the shifts name. A row that is not there, or a scheduler with no people, stays as it was.
 */
{
  const CALENDAR = "6a1c1f0e-5d0b-4f55-9a43-0b6f2a1d7c11";
  const refused = new Error("0x80040220 Principal user is missing prvReadchr_chronaschedulercalendar privilege");
  const logged: unknown[][] = [];
  const realError = console.error;
  const webApiWith = (answer: (entity: string) => Promise<{ entities: Record<string, unknown>[] }>, calls: string[]) =>
    ({
      retrieveMultipleRecords: async (entity: string, options: string) => {
        calls.push(`${entity}${options}`);
        return answer(entity);
      },
    }) as unknown as ComponentFramework.Context<unknown>["webAPI"];
  const messages = { msgCalendarUnread: "Scheduler unread.", msgResourcesUnread: "Resources unread." };
  (async () => {
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      for (const id of [CALENDAR, "Bookings"]) {
        const calls: string[] = [];
        const config = await loadHostConfig(webApiWith(async () => { throw refused; }, calls), id);
        assert.equal(config.readFailed, "calendar", `${id}: a refused read of the scheduler's row is named`);
        assert.equal(config.calendarId, undefined);
        assert.deepEqual(config.resources, [], `${id}: nobody known, never the people the shifts name`);
        assert.equal(calls.length, 1, `${id}: nothing behind the row is read`);
        assert.equal(hostReadFailure(config, messages), "Scheduler unread.");
      }
      assert.equal(logged.length, 2, "each failure's cause is logged");
      assert.equal(logged[0]?.[1], refused);
      // By its id the row is a query too: no row is an empty answer, the zero-config board, never a failure.
      const calls: string[] = [];
      const none = await loadHostConfig(webApiWith(async () => ({ entities: [] }), calls), CALENDAR);
      assert.equal(none.readFailed, undefined, "a row that is not there is not a failed read");
      assert.equal(none.calendarId, undefined);
      assert.equal(none.resources, undefined, "no row: the board's own people, as before");
      assert.equal(calls[0], `chr_chronaschedulercalendar?$filter=chr_chronaschedulercalendarid eq ${CALENDAR}&$top=1`);
      assert.equal(hostReadFailure(none, messages), undefined);
      // The people refused: named, logged, and nobody.
      const row = { chr_chronaschedulercalendarid: CALENDAR, chr_name: "Bookings", chr_resourcenamecolumn: "fullname", chr_resourcetable: "systemuser" };
      const peopleRefused = await loadHostConfig(
        webApiWith(async (entity) => {
          if (entity === "chr_chronaschedulercalendar") return { entities: [row] };
          throw refused;
        }, []),
        CALENDAR,
      );
      assert.equal(peopleRefused.readFailed, "resources");
      assert.equal(peopleRefused.calendarId, CALENDAR, "the scheduler itself was read");
      assert.deepEqual(peopleRefused.resources, [], "nobody, never the people the shifts name");
      assert.equal(hostReadFailure(peopleRefused, messages), "Resources unread.");
      assert.equal(logged.length, 3);
      // A scheduler whose people read answers with nobody stays as it was: the board's own people.
      const noPeople = await loadHostConfig(
        webApiWith(async (entity) => ({ entities: entity === "chr_chronaschedulercalendar" ? [row] : [] }), []),
        CALENDAR,
      );
      assert.equal(noPeople.readFailed, undefined);
      assert.equal(noPeople.resources, undefined);
    } finally {
      console.error = realError;
    }
    console.log("failed settings read tests passed");
  })().catch((error) => { console.error(error); process.exit(1); });
}

// Matt 2026-11-16 "Yes, both boards": while the scheduler's row or its resources could not be read, the board is read-only.
{
  assert.equal(hostEditsLocked({ readFailed: "resources" }), true, "resources unread: no new item, no item edit, no drag");
  assert.equal(hostEditsLocked({ readFailed: "calendar" }), true);
  assert.equal(hostEditsLocked({}), false, "every read answered: the board edits as before");
  console.log("read-only on a failed read tests passed");
}

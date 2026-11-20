import * as assert from "node:assert/strict";

import {
  connectOffered,
  connectWrites,
  newSchedulerZone,
  openRecordInDialog,
  readRowsVersion,
  readViewRow,
  recheckPrivilege,
  SIDE_DIALOG_WIDTH_PX,
  watchWhileOpen,
} from "../SchedulerControl/settingsDialog";

/*
 * The settings gear: the view row's form opens in the model-driven
 * app's side dialog, and the board follows each Save while it is open.
 */

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function opensTheSideDialogWithItsObject(): Promise<void> {
  const calls: { pageInput: unknown; options: unknown }[] = [];
  // A platform method that needs its object, as the real one may.
  class Navigation {
    private readonly calls = calls;
    navigateTo(pageInput: object, options: object): Promise<unknown> {
      this.calls.push({ options, pageInput });
      return Promise.resolve(undefined);
    }
  }
  (globalThis as { Xrm?: unknown }).Xrm = { Navigation: new Navigation() };
  try {
    await openRecordInDialog("chr_chronaschedulerview", "row-1", () => {
      throw new Error("openForm must not run when the dialog API exists");
    });
  } finally {
    delete (globalThis as { Xrm?: unknown }).Xrm;
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.pageInput, {
    entityId: "row-1",
    entityName: "chr_chronaschedulerview",
    pageType: "entityrecord",
  });
  assert.deepEqual(calls[0]?.options, {
    position: 2,
    target: 2,
    width: { unit: "px", value: SIDE_DIALOG_WIDTH_PX },
  });
}

async function fallsBackToTheFormWithoutTheDialogApi(): Promise<void> {
  const opened: unknown[] = [];
  await openRecordInDialog("chr_chronaschedulerview", "row-2", (options) => {
    opened.push(options);
    return Promise.resolve(undefined);
  });
  assert.deepEqual(opened, [{ entityId: "row-2", entityName: "chr_chronaschedulerview" }]);
}

async function readsModifiedStampsAsOneVersion(): Promise<void> {
  const webApi = {
    retrieveRecord: (entity: string, id: string): Promise<ComponentFramework.WebApi.Entity> =>
      Promise.resolve({ modifiedon: `${entity}:${id}` }),
  } as unknown as Pick<ComponentFramework.WebApi, "retrieveRecord">;
  const version = await readRowsVersion(webApi, [
    { entity: "chr_chronaschedulerview", id: "v-1" },
    { entity: "chr_chronaschedulercalendar", id: undefined },
  ]);
  assert.equal(version, "chr_chronaschedulerview:v-1|");
}

async function followsEachSaveWhileOpen(): Promise<void> {
  const versions = ["a", "a", "b", "b", "c"];
  let reads = 0;
  let changes = 0;
  const stop = watchWhileOpen(
    () => {
      const version = versions[Math.min(reads, versions.length - 1)] ?? "c";
      reads += 1;
      return Promise.resolve(version);
    },
    () => {
      changes += 1;
    },
    5,
  );
  await pause(200);
  stop();
  // The first read is the baseline; "a" to "b" and "b" to "c" are two Saves.
  assert.equal(changes, 2);
  const after = reads;
  await pause(30);
  assert.equal(reads, after, "no reads after stop");
}

async function aFailedReadWaitsForTheNext(): Promise<void> {
  let reads = 0;
  let changes = 0;
  const stop = watchWhileOpen(
    () => {
      reads += 1;
      if (reads === 2) {
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve(reads < 3 ? "a" : "b");
    },
    () => {
      changes += 1;
    },
    5,
  );
  await pause(150);
  stop();
  assert.equal(changes, 1);
}

async function showsTheGearOnceTheMetadataLoads(): Promise<void> {
  let loaded = false;
  let checks = 0;
  let allowed = 0;
  recheckPrivilege(
    () => {
      checks += 1;
      return loaded;
    },
    () => {
      loaded = true;
      return Promise.resolve({});
    },
    () => {
      allowed += 1;
    },
    5,
    50,
  );
  await pause(60);
  assert.equal(allowed, 1, "yes once the metadata is in");
  assert.equal(checks, 1, "no re-check after the yes");
}

async function aSlowLoadIsCaughtByTheReCheck(): Promise<void> {
  let checks = 0;
  let allowed = 0;
  const stop = recheckPrivilege(
    () => {
      checks += 1;
      return checks >= 3;
    },
    () => Promise.reject(new Error("metadata not there")),
    () => {
      allowed += 1;
    },
    5,
    50,
  );
  await pause(80);
  stop();
  assert.equal(allowed, 1);
  assert.equal(checks, 3);
}

async function stopsAfterTheLastTry(): Promise<void> {
  let checks = 0;
  recheckPrivilege(
    () => {
      checks += 1;
      return false;
    },
    () => undefined,
    () => {
      throw new Error("no privilege: the gear stays hidden");
    },
    5,
    4,
  );
  await pause(80);
  // One check after the metadata call, then one per try.
  assert.equal(checks, 5);
}

async function nothingAfterStop(): Promise<void> {
  let allowed = 0;
  const stop = recheckPrivilege(
    () => true,
    () => new Promise(() => undefined),
    () => {
      allowed += 1;
    },
    5,
    50,
  );
  stop();
  await pause(40);
  assert.equal(allowed, 0);
}

/*
 * The view row's read: only an answer with no row is a board with no settings (the zero-config path). A refused
 * or failed read, rejected or thrown, is a failure the board shows, never "no row" (AGENTS.md 0.1).
 */
async function aFailedViewRowReadIsNotNoRow(): Promise<void> {
  const asked: string[] = [];
  const answering = (entities: unknown[]) => ({
    retrieveMultipleRecords: (table: string, options?: string) => {
      asked.push(`${table}${options ?? ""}`);
      return Promise.resolve({ entities, nextLink: "" } as unknown as ComponentFramework.WebApi.RetrieveMultipleResponse);
    },
  });
  const found = await readViewRow(answering([{ chr_chronaschedulerviewid: "v-1" }]), "view-1", ["chr_chronaschedulerviewid", "chr_layout"]);
  assert.deepEqual(found, { kind: "row", row: { chr_chronaschedulerviewid: "v-1" } });
  assert.equal(asked[0], "chr_chronaschedulerview?$select=chr_chronaschedulerviewid,chr_layout&$filter=chr_viewid eq 'view-1'&$top=1");
  assert.deepEqual(await readViewRow(answering([]), "view-1", ["chr_layout"]), { kind: "none" }, "no row for the view");
  const refused = new Error("Principal user is missing prvReadchr_chronaschedulerview privilege");
  for (const webApi of [
    { retrieveMultipleRecords: () => Promise.reject(refused) },
    { retrieveMultipleRecords: () => { throw refused; } },
  ]) {
    assert.deepEqual(await readViewRow(webApi as never, "view-1", ["chr_layout"]), { error: refused, kind: "failed" }, "a failed read is a failure");
  }
  const unreadable = await readViewRow({ retrieveMultipleRecords: () => Promise.resolve(undefined) } as never, "view-1", ["chr_layout"]);
  assert.equal(unreadable.kind, "failed", "an answer without its rows is a failure");
}

/*
 * A board without a bound calendar finds its scheduler through the view row. After a failed read of that row it
 * offers no Connect, and Connect's writes are refused before any write: no second scheduler, and the view row is
 * never re-linked away from the scheduler it has (AGENTS.md 0.1).
 */
async function aFailedViewRowReadBlocksConnect(): Promise<void> {
  const refusal = "Couldn't read this view's settings. Reload the page to try again.";
  const writes: string[] = [];
  // Connect's writes as the host makes them: a new scheduler, then this view's row pointed at it.
  const connect = async (): Promise<string> => {
    writes.push("create chr_chronaschedulercalendar");
    writes.push("update chr_chronaschedulerview");
    return "new-calendar";
  };
  const failed = await readViewRow({ retrieveMultipleRecords: () => Promise.reject(new Error("Network error")) } as never, "view-1", ["chr_layout"]);
  const gate = { boundCalendarId: "", viewRowFailed: failed.kind === "failed" };
  assert.equal(connectOffered(gate), false, "no Connect after a failed read");
  await assert.rejects(connectWrites(gate, refusal, connect), { message: refusal });
  assert.deepEqual(writes, [], "nothing written: no scheduler made, no view row re-linked");
  // A real "no row" keeps Connect, and a bound calendar does not need the view row.
  assert.equal(connectOffered({ boundCalendarId: "", viewRowFailed: false }), true);
  assert.equal(connectOffered({ boundCalendarId: "cal-1", viewRowFailed: true }), true);
  assert.equal(await connectWrites({ boundCalendarId: "", viewRowFailed: false }, refusal, connect), "new-calendar");
  assert.deepEqual(writes, ["create chr_chronaschedulercalendar", "update chr_chronaschedulerview"]);
  // The scheduler's own row could not be read: it may exist, so no Connect and no writes, bound or not.
  const calendarUnread = { boundCalendarId: "cal-1", calendarUnread: true, viewRowFailed: false };
  assert.equal(connectOffered(calendarUnread), false);
  assert.equal(connectOffered({ ...calendarUnread, boundCalendarId: "" }), false);
  await assert.rejects(connectWrites(calendarUnread, "Scheduler unread.", connect), { message: "Scheduler unread." });
  assert.equal(writes.length, 2, "nothing more written");
}

/** A scheduler Connect creates always has a zone: the browser's at the Power Apps offset, else none and no create. */
function aNewSchedulerTakesTheMakersZoneOrNone(): void {
  const offsets: Record<string, number> = { "Australia/Brisbane": 600, "America/Los_Angeles": -480 };
  const offsetOf = (zone: string): number => offsets[zone] ?? Number.NaN;
  assert.equal(newSchedulerZone("Australia/Brisbane", offsetOf, 600), "Australia/Brisbane");
  // The browser in Brisbane, Power Apps set to Pacific time: no zone to give, so Connect creates nothing.
  assert.equal(newSchedulerZone("Australia/Brisbane", offsetOf, -480), undefined);
  // A browser that names no zone: none either.
  assert.equal(newSchedulerZone(undefined, offsetOf, 600), undefined);
  assert.equal(newSchedulerZone("", offsetOf, 600), undefined);
}

void (async (): Promise<void> => {
  aNewSchedulerTakesTheMakersZoneOrNone();
  await opensTheSideDialogWithItsObject();
  await aFailedViewRowReadIsNotNoRow();
  await aFailedViewRowReadBlocksConnect();
  await fallsBackToTheFormWithoutTheDialogApi();
  await readsModifiedStampsAsOneVersion();
  await followsEachSaveWhileOpen();
  await aFailedReadWaitsForTheNext();
  await showsTheGearOnceTheMetadataLoads();
  await aSlowLoadIsCaughtByTheReCheck();
  await stopsAfterTheLastTry();
  await nothingAfterStop();
  console.log("settings dialog tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

import * as assert from "node:assert/strict";

import {
  openRecordInDialog,
  readRowsVersion,
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

void (async (): Promise<void> => {
  await opensTheSideDialogWithItsObject();
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

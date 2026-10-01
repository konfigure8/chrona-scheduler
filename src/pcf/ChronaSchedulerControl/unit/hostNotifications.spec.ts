import * as assert from "node:assert/strict";

import { createAppNotifier } from "../SchedulerControl/hostNotifications";

/*
 * Host messages reach the model-driven app's notification bar: the
 * right level, one Chrona notice at a time, success and information
 * clearing themselves, and nothing without the app API.
 */

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A notification bar that needs its object, as the platform's may. */
class FakeApp {
  readonly shown: { id: string; level: number; message: string; type: number }[] = [];
  readonly cleared: string[] = [];
  private next = 0;

  addGlobalNotification(notification: object): Promise<string> {
    const { level, message, type } = notification as { level: number; message: string; type: number };
    this.next += 1;
    const id = `n-${this.next}`;
    this.shown.push({ id, level, message, type });
    return Promise.resolve(id);
  }

  clearGlobalNotification(id: string): Promise<void> {
    this.cleared.push(id);
    return Promise.resolve();
  }
}

async function mapsLevelsToTheMessageBar(): Promise<void> {
  const app = new FakeApp();
  const notifier = createAppNotifier(() => app, 10_000);
  assert.equal(await notifier.show("error", "Could not connect"), true);
  assert.equal(await notifier.show("warning", "Saved on this screen only"), true);
  assert.equal(await notifier.show("success", "Applied 3 suggestions"), true);
  assert.equal(await notifier.show("info", "Undid the move"), true);
  assert.deepEqual(app.shown.map((item) => item.level), [2, 3, 1, 4]);
  assert.ok(app.shown.every((item) => item.type === 2));
  notifier.dispose();
  await pause(5);
}

async function showsOneNoticeAtATime(): Promise<void> {
  const app = new FakeApp();
  const notifier = createAppNotifier(() => app, 10_000);
  // Quick messages still replace each other in order.
  await Promise.all([notifier.show("error", "first"), notifier.show("error", "second")]);
  assert.deepEqual(app.shown.map((item) => item.message), ["first", "second"]);
  assert.deepEqual(app.cleared, ["n-1"]);
  notifier.dispose();
  await pause(5);
  assert.deepEqual(app.cleared, ["n-1", "n-2"], "dispose clears the last notice");
}

async function successClearsItselfButErrorsWait(): Promise<void> {
  const app = new FakeApp();
  const notifier = createAppNotifier(() => app, 20);
  await notifier.show("success", "Generated 4 shifts");
  await pause(60);
  assert.deepEqual(app.cleared, ["n-1"], "success clears itself");
  await notifier.show("error", "Could not save");
  await pause(60);
  assert.deepEqual(app.cleared, ["n-1"], "an error waits for the person");
  notifier.dispose();
  await pause(5);
}

async function staysQuietWithoutTheAppApi(): Promise<void> {
  const notifier = createAppNotifier(() => undefined);
  assert.equal(await notifier.show("error", "Could not connect"), false);
  notifier.dispose();
}

void (async (): Promise<void> => {
  await mapsLevelsToTheMessageBar();
  await showsOneNoticeAtATime();
  await successClearsItselfButErrorsWait();
  await staysQuietWithoutTheAppApi();
  console.log("host notification tests passed");
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

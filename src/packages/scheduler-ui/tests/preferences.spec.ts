import { createPreferenceStore } from "../src/preferences";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function fakeStorage(initial?: Record<string, string>): {
  readonly data: Map<string, string>;
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
} {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function roundTripsPreferences(): void {
  const storage = fakeStorage();
  const store = createPreferenceStore("scope", storage);
  assertEqual(store.load(), undefined);

  store.save({ slotMinutes: 15 });
  assertEqual(store.load()?.slotMinutes, 15);

  // A later partial save merges instead of clobbering.
  store.save({ pxPerHour: 120 });
  assertEqual(store.load()?.slotMinutes, 15);
  assertEqual(store.load()?.pxPerHour, 120);

  // Each interval keeps its own zoom; nonsense entries drop on load.
  store.save({ zoomByInterval: { month: 2.4, week: 14 } });
  assertEqual(store.load()?.zoomByInterval?.["week"], 14);
  assertEqual(store.load()?.zoomByInterval?.["month"], 2.4);
  storage.setItem("scope", JSON.stringify({ v: 1, zoomByInterval: { day: "wide", week: -3, month: 3 } }));
  assertEqual(JSON.stringify(store.load()?.zoomByInterval), JSON.stringify({ month: 3 }));
  store.save({ pxPerHour: 120, slotMinutes: 15 });

  // Layout widths and the panel scope ride the same blob.
  store.save({ resourceColumnWidth: 248, unscheduledPanelWidth: 320 });
  store.save({ unscheduledInViewOnly: true });
  store.save({ activeViewId: "kitchen-adl" });
  assertEqual(store.load()?.activeViewId, "kitchen-adl");
  assertEqual(store.load()?.resourceColumnWidth, 248);
  assertEqual(store.load()?.unscheduledPanelWidth, 320);
  assertEqual(store.load()?.unscheduledInViewOnly, true);
  assertEqual(store.load()?.slotMinutes, 15);
}

function ignoresCorruptAndForeignPayloads(): void {
  const corrupt = createPreferenceStore(
    "scope",
    fakeStorage({ scope: "{not json" }),
  );
  assertEqual(corrupt.load(), undefined);

  const wrongVersion = createPreferenceStore(
    "scope",
    fakeStorage({ scope: JSON.stringify({ slotMinutes: 5, v: 99 }) }),
  );
  assertEqual(wrongVersion.load(), undefined);

  const wrongTypes = createPreferenceStore(
    "scope",
    fakeStorage({ scope: JSON.stringify({ slotMinutes: "five", v: 1 }) }),
  );
  assertEqual(wrongTypes.load()?.slotMinutes, undefined);
}

function preservesUnknownKeysAcrossSaves(): void {
  const storage = fakeStorage({
    scope: JSON.stringify({ futurePref: "keep-me", slotMinutes: 10, v: 1 }),
  });
  const store = createPreferenceStore("scope", storage);
  store.save({ slotMinutes: 30 });
  const raw = JSON.parse(storage.data.get("scope") ?? "{}") as Record<
    string,
    unknown
  >;
  assertEqual(raw["futurePref"], "keep-me");
  assertEqual(raw["slotMinutes"], 30);
  assertEqual(raw["v"], 1);
}

function inertWithoutStorage(): void {
  const store = createPreferenceStore("scope", undefined);
  store.save({ slotMinutes: 15 });
  assertEqual(store.load(), undefined);
}

roundTripsPreferences();
ignoresCorruptAndForeignPayloads();
preservesUnknownKeysAcrossSaves();
inertWithoutStorage();

console.log("preferences tests passed");

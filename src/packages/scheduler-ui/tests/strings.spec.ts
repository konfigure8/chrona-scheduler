import {
  defaultSchedulerStrings,
  formatString,
  resolveStrings,
} from "../src/stringResources";
import { schedulerLanguages } from "../harness/languages";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function fillsPlaceholders(): void {
  assertEqual(formatString("Delete {count} items", { count: 3 }), "Delete 3 items");
  assertEqual(formatString("+{count} more", { count: 12 }), "+12 more");
  assertEqual(formatString("Hello {name}", { name: "Matt" }), "Hello Matt");
  // Unknown placeholders survive so a bad override degrades visibly,
  // not silently.
  assertEqual(formatString("Hi {missing}", {}), "Hi {missing}");
  assertEqual(formatString("No placeholders", { count: 1 }), "No placeholders");
}

function mergesOverridesOverDefaults(): void {
  const merged = resolveStrings({ today: "Heute" });
  assertEqual(merged.today, "Heute");
  assertEqual(merged.cancel, defaultSchedulerStrings.cancel);
  // No overrides returns the default object untouched.
  assertEqual(resolveStrings(), defaultSchedulerStrings);
}

function defaultsCoverEveryKeyWithText(): void {
  for (const [key, value] of Object.entries(defaultSchedulerStrings)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Default string missing for ${key}`);
    }
  }
}

fillsPlaceholders();
mergesOverridesOverDefaults();
defaultsCoverEveryKeyWithText();

for (const [locale, { strings }] of Object.entries(schedulerLanguages)) {
  assertEqual(Object.keys(strings).sort().join(','), Object.keys(defaultSchedulerStrings).sort().join(','));
  const placeholders = (value: string): string => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
  for (const key of Object.keys(defaultSchedulerStrings) as Array<keyof typeof defaultSchedulerStrings>) {
    if (!strings[key].trim()) throw new Error(`${locale}:${key} is empty`);
    assertEqual(placeholders(strings[key]), placeholders(defaultSchedulerStrings[key]));
  }
  assertEqual(strings.monthsLong.split('|').length, 12);
  assertEqual(strings.monthsShort.split('|').length, 12);
  assertEqual(strings.weekdaysShort.split('|').length, 7);
  assertEqual(strings.conversionAxisLabels.split('|').length, 4);
  for (const key of ['today', 'apply', 'save', 'cancel', 'delete', 'intervalDay', 'intervalWeek', 'intervalMonth', 'generate'] as const) {
    if (strings[key].length > 16) throw new Error(`${locale}:${key} exceeds the compact label budget`);
  }
}

console.log("strings tests passed");

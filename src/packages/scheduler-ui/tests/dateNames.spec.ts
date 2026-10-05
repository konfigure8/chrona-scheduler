/**
 * Date labels and legend/band labels come from the string bundle
 * (ruled 2026-09-06), so a German bundle renders German weekday and
 * month names in the design's fixed "Mon 17 Aug" shape, and a broken
 * list falls back to English rather than blanks.
 */
import { dateNamesFrom, englishDateNames, formatDateLabel, formatDayLabel, formatDayTimeLabel, monthLong } from "../src/dateNames";
import { buildLegendEntries, type RowDecoration } from "../src/decorations";
import { defaultSchedulerStrings } from "../src/stringResources";
import { buildTimeTicks } from "../src/timeAxis";
import { formatWindowLabel } from "../src/viewConfig";
import { germanStrings } from "../harness/germanStrings";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const monday = new Date(2026, 7, 17, 8, 5); // Mon 17 Aug 2026
const english = dateNamesFrom(defaultSchedulerStrings);
const german = dateNamesFrom(germanStrings);

assertEqual(formatDayLabel(monday), "Mon 17 Aug", "default names are English");
assertEqual(formatDayLabel(monday, english), "Mon 17 Aug", "bundle English");
assertEqual(formatDayLabel(monday, german), "Mo 17 Aug", "German weekday");
assertEqual(formatDayLabel(new Date(2026, 2, 3), german), "Di 3 Mär", "German month with umlaut");
assertEqual(formatDateLabel(monday, german), "17 Aug", "date only");
assertEqual(formatDayTimeLabel(monday, german), "Mo 17 Aug 08:05", "day and time");
assertEqual(monthLong(new Date(2026, 9, 1), german), "Oktober", "long month");
assertEqual(english.weekdaysShort.length, 7, "seven weekdays");
assertEqual(german.monthsLong.length, 12, "twelve months");

// A malformed list falls back to English instead of rendering blanks.
const broken = dateNamesFrom({ ...defaultSchedulerStrings, monthsShort: "Jan|Feb", weekdaysShort: "So||Di|Mi|Do|Fr|Sa" });
assertEqual(formatDayLabel(monday, broken), "Mon 17 Aug", "fallback on malformed lists");
assertEqual(englishDateNames.monthsShort[11], "Dec", "English table intact");

// The window label and the timeline ticks read the same names.
const week = { end: new Date(2026, 7, 24), start: new Date(2026, 7, 17) };
assertEqual(formatWindowLabel(week, "week", german), "Mo 17 Aug - So 23 Aug 2026", "German window label");
assertEqual(formatWindowLabel({ end: new Date(2026, 8, 1), start: new Date(2026, 7, 1) }, "month", german), "August 2026", "German month label");
const ticks = buildTimeTicks(week, 40, 24, "24", german);
assertEqual(ticks[0]?.label, "Mo 17 Aug", "German tick label");
assertEqual(buildTimeTicks(week, 40, 24)[1]?.label, "Tue 18 Aug", "English tick label by default");

// Legend labels come from the bundle too.
const bands: readonly RowDecoration[] = [
  { end: new Date(2026, 7, 17, 12), kind: "unavailable", label: germanStrings.legendUnavailable, resourceId: "r1", start: new Date(2026, 7, 17, 8) },
];
const legend = buildLegendEntries(bands, false, { unavailable: germanStrings.legendUnavailable }, germanStrings.legendNeedsCover);
assertEqual(legend[0]?.label, "Nicht verfügbar", "German legend label");
assertEqual(buildLegendEntries(bands, true)[1]?.label, "Needs cover", "English legend fallback");

console.log("dateNames tests passed");

import {
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  normalizeTimeZoneId,
  resolveDisplayTimeZone,
  toDisplayZone,
  toOffsetZone,
} from "../src/timeZone";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

/** Runner-independent: display dates read the target zone's wall clock. */
function convertsInstantsToZoneWallClock(): void {
  // 2026-08-17T23:00Z in Brisbane (+10, no DST) is 09:00 next day.
  const instant = new Date(Date.UTC(2026, 7, 17, 23, 0));
  const brisbane = toDisplayZone(instant, "Australia/Brisbane");
  assertEqual(brisbane.getDate(), 18);
  assertEqual(brisbane.getHours(), 9);
  assertEqual(brisbane.getMinutes(), 0);

  const utc = toDisplayZone(instant, "Etc/UTC");
  assertEqual(utc.getDate(), 17);
  assertEqual(utc.getHours(), 23);

  // August New York runs on daylight time (-4).
  const newYork = toDisplayZone(instant, "America/New_York");
  assertEqual(newYork.getDate(), 17);
  assertEqual(newYork.getHours(), 19);

  // January New York runs on standard time (-5).
  const winter = toDisplayZone(
    new Date(Date.UTC(2026, 0, 15, 12, 0)),
    "America/New_York",
  );
  assertEqual(winter.getHours(), 7);

  // Half-hour zone: Adelaide winter is +9:30.
  const adelaide = toDisplayZone(instant, "Australia/Adelaide");
  assertEqual(adelaide.getHours(), 8);
  assertEqual(adelaide.getMinutes(), 30);
}

function roundTripsThroughDisplayDates(): void {
  const zones = [
    "Etc/UTC",
    "Australia/Brisbane",
    "Australia/Adelaide",
    "America/New_York",
    "Pacific/Auckland",
  ];
  /*
   * All instants chosen to be UNAMBIGUOUS in every tested zone: a wall
   * time inside a fall-back's repeated hour maps to two instants, and
   * no wall-clock representation can round-trip both - the same caveat
   * every calendar product carries.
   */
  const instants = [
    new Date(Date.UTC(2026, 7, 17, 23, 0)),
    // Either side of the 2026-03-08 US spring-forward.
    new Date(Date.UTC(2026, 2, 8, 6, 30)),
    new Date(Date.UTC(2026, 2, 8, 7, 30)),
    // Either side of the 2026-04-05 AU/NZ fall-backs, outside every
    // repeated hour.
    new Date(Date.UTC(2026, 3, 4, 12, 30)),
    new Date(Date.UTC(2026, 3, 4, 17, 30)),
  ];
  for (const zone of zones) {
    for (const instant of instants) {
      const roundTripped = fromDisplayZone(toDisplayZone(instant, zone), zone);
      if (roundTripped.getTime() !== instant.getTime()) {
        throw new Error(
          `Round trip drifted in ${zone} for ${instant.toISOString()}: ${roundTripped.toISOString()}`,
        );
      }
    }
  }
}

function resolvesOneZoneWithHonestFallbacks(): void {
  const unanimous = resolveDisplayTimeZone([
    { timeZoneId: "Australia/Brisbane" },
    { timeZoneId: "Australia/Brisbane" },
    {},
  ]);
  assertEqual(unanimous.timeZoneId, "Australia/Brisbane");
  assertEqual(unanimous.source, "event");
  assertEqual(unanimous.label, "Australia/Brisbane");

  const mixed = resolveDisplayTimeZone([
    { timeZoneId: "Australia/Brisbane" },
    { timeZoneId: "America/New_York" },
  ]);
  assertEqual(mixed.timeZoneId, "Etc/UTC");
  assertEqual(mixed.source, "mixed");
  assertEqual(mixed.label, "Mixed time zones; UTC");

  const absent = resolveDisplayTimeZone([{}, { timeZoneId: "not-a-zone" }]);
  assertEqual(absent.timeZoneId, "Etc/UTC");
  assertEqual(absent.source, "default");
}

function normalizesIdsAndLabels(): void {
  assertEqual(normalizeTimeZoneId(" UTC "), "Etc/UTC");
  assertEqual(normalizeTimeZoneId("Australia/Brisbane"), "Australia/Brisbane");
  assertEqual(normalizeTimeZoneId("Mars/Olympus_Mons"), undefined);
  assertEqual(normalizeTimeZoneId(""), undefined);
  assertEqual(normalizeTimeZoneId(undefined), undefined);
  assertEqual(formatTimeZoneLabel("Etc/UTC"), "UTC");
  assertEqual(formatTimeZoneLabel("America/New_York"), "America/New York");
}

/** A host's user zone arrives as an offset function; +10 makes 23:00Z the next day's 09:00. */
function convertsWithHostOffsets(): void {
  const instant = new Date(Date.UTC(2026, 7, 17, 23, 0));
  const brisbane = toOffsetZone(instant, () => 600);
  assertEqual(brisbane.getDate(), 18);
  assertEqual(brisbane.getHours(), 9);
  assertEqual(fromOffsetZone(brisbane, () => 600).getTime(), instant.getTime());

  // Daylight time: the offset depends on the instant, and the inverse re-reads it.
  const seasonal = (at: Date): number => (at.getUTCMonth() >= 3 && at.getUTCMonth() <= 9 ? 660 : 600);
  const winter = new Date(Date.UTC(2026, 0, 10, 12, 0));
  const summer = new Date(Date.UTC(2026, 6, 10, 12, 0));
  assertEqual(toOffsetZone(winter, seasonal).getHours(), 22);
  assertEqual(toOffsetZone(summer, seasonal).getHours(), 23);
  assertEqual(fromOffsetZone(toOffsetZone(summer, seasonal), seasonal).getTime(), summer.getTime());

  assertEqual(formatUtcOffsetLabel(600), "UTC+10:00");
  assertEqual(formatUtcOffsetLabel(-330), "UTC-05:30");
  assertEqual(formatUtcOffsetLabel(0), "UTC");
}

convertsInstantsToZoneWallClock();
roundTripsThroughDisplayDates();
resolvesOneZoneWithHonestFallbacks();
normalizesIdsAndLabels();
convertsWithHostOffsets();

console.log("timeZone tests passed");

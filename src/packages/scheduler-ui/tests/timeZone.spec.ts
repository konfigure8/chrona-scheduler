import {
  clockMinutesBetween,
  formatFixedOffsetZone,
  formatTimeZoneCity,
  formatTimeZoneLabel,
  formatUtcOffsetLabel,
  fromDisplayZone,
  fromOffsetZone,
  normalizeTimeZoneId,
  parseDateOnly,
  resolveDisplayTimeZone,
  toDisplayZone,
  toOffsetZone,
  zoneOffsetMinutes,
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

/**
 * The site's clock (ruled 2026-10-02): the city on the toolbar, the
 * zone's offset at an instant, clock time across daylight saving (Fair
 * Work pays by the clock), and a Date Only value as its own day.
 */
function countsByTheSitesClock(): void {
  assertEqual(formatTimeZoneCity("Australia/Perth"), "Perth");
  assertEqual(formatTimeZoneCity("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assertEqual(formatTimeZoneCity("Europe/Zurich"), "Zurich");
  assertEqual(formatTimeZoneCity("Etc/UTC"), "UTC");

  // Brisbane keeps +10 all year; Sydney moves to +11 on Sunday 4 October 2026.
  const saturday = new Date(Date.UTC(2026, 9, 3, 12, 0));
  const sunday = new Date(Date.UTC(2026, 9, 4, 12, 0));
  assertEqual(zoneOffsetMinutes(saturday, "Australia/Brisbane"), 600);
  assertEqual(zoneOffsetMinutes(sunday, "Australia/Brisbane"), 600);
  assertEqual(zoneOffsetMinutes(saturday, "Australia/Sydney"), 600);
  assertEqual(zoneOffsetMinutes(sunday, "Australia/Sydney"), 660);
  assertEqual(zoneOffsetMinutes(sunday, "Australia/Perth"), 480);

  assertEqual(formatFixedOffsetZone(600), "+10:00");
  assertEqual(formatFixedOffsetZone(-210), "-03:30");
  assertEqual(formatFixedOffsetZone(0), "+00:00");

  // Saturday 22:00 to Sunday 06:00 in Sydney as the clocks go forward:
  // 7 hours pass, 8 by the clock.
  const springStart = new Date(Date.UTC(2026, 9, 3, 12, 0));
  const springEnd = new Date(Date.UTC(2026, 9, 3, 19, 0));
  assertEqual((springEnd.getTime() - springStart.getTime()) / 60_000, 420);
  assertEqual(
    clockMinutesBetween(
      toDisplayZone(springStart, "Australia/Sydney"),
      toDisplayZone(springEnd, "Australia/Sydney"),
    ),
    480,
  );
  // In April the clocks go back: 9 hours pass, 8 by the clock.
  const autumnStart = new Date(Date.UTC(2027, 3, 3, 11, 0));
  const autumnEnd = new Date(Date.UTC(2027, 3, 3, 20, 0));
  assertEqual((autumnEnd.getTime() - autumnStart.getTime()) / 60_000, 540);
  assertEqual(
    clockMinutesBetween(
      toDisplayZone(autumnStart, "Australia/Sydney"),
      toDisplayZone(autumnEnd, "Australia/Sydney"),
    ),
    480,
  );
  // Brisbane has no change: the clock and the hours that pass agree.
  assertEqual(
    clockMinutesBetween(
      toDisplayZone(springStart, "Australia/Brisbane"),
      toDisplayZone(springEnd, "Australia/Brisbane"),
    ),
    420,
  );

  // A Date Only value is its own day, wherever the runner is.
  const day = parseDateOnly("2026-10-05");
  assertEqual(day?.getFullYear(), 2026);
  assertEqual(day?.getMonth(), 9);
  assertEqual(day?.getDate(), 5);
  assertEqual(day?.getHours(), 0);
  assertEqual(parseDateOnly("2026-10-05T00:00:00Z")?.getDate(), 5);
  assertEqual(parseDateOnly("not a date"), undefined);
}

convertsInstantsToZoneWallClock();
roundTripsThroughDisplayDates();
resolvesOneZoneWithHonestFallbacks();
normalizesIdsAndLabels();
convertsWithHostOffsets();
countsByTheSitesClock();

console.log("timeZone tests passed");

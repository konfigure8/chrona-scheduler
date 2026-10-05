/**
 * Freshness (F31 rework): the solver judged its plan as a whole
 * against the data it was sent, so the board only checks that the data
 * is still current. A change is out of date when its own shift changed
 * or went away, when it has started, when its person now has another
 * shift or is unavailable at that time, or when the person's own
 * record changed. Pure: hosts pass what the solver was sent and what
 * they read now, both in display time.
 */
import type { ProposalChange } from "./solve";
import { formatString, type SchedulerStrings } from "./stringResources";
import type { AvailabilityBand, SchedulerUiEvent } from "./types";

export interface FreshnessData {
  readonly bands: readonly AvailabilityBand[];
  readonly events: readonly SchedulerUiEvent[];
  /** Each person's record version (for example its modifiedon), by resource id. */
  readonly personVersions?: ReadonlyMap<string, string>;
}

export type FreshnessStrings = Pick<
  SchedulerStrings,
  | "proposalReasonChanged"
  | "proposalReasonNewShift"
  | "proposalReasonPersonChanged"
  | "proposalReasonStarted"
  | "proposalReasonUnavailable"
>;

export interface FreshnessInput {
  /** What the host reads now. */
  readonly after: FreshnessData;
  /** The moment of the check. */
  readonly at: Date;
  /** What the solver was sent. */
  readonly before: FreshnessData;
  readonly changes: readonly ProposalChange[];
  readonly resourceName: (resourceId: string) => string;
  readonly strings: FreshnessStrings;
}

/** Hosts read ids from different APIs: compare them without braces or case. */
export function normalizeRecordId(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

/** Who works the shift, or "" when nobody does. */
const personOf = (event: SchedulerUiEvent): string =>
  event.status === "needsCover" ? "" : normalizeRecordId(event.resourceId);

const overlaps = (
  a: { readonly end: Date; readonly start: Date },
  b: { readonly end: Date; readonly start: Date },
): boolean => a.start < b.end && a.end > b.start;

const sameShift = (a: SchedulerUiEvent, b: SchedulerUiEvent): boolean =>
  a.start.getTime() === b.start.getTime() &&
  a.end.getTime() === b.end.getTime() &&
  personOf(a) === personOf(b);

const bandKey = (band: AvailabilityBand): string =>
  `${normalizeRecordId(band.resourceId)}|${band.kind}|${band.start.getTime()}|${band.end.getTime()}`;

const versionsByPerson = (
  versions: ReadonlyMap<string, string> | undefined,
): ReadonlyMap<string, string> | undefined =>
  versions
    ? new Map([...versions].map(([id, version]) => [normalizeRecordId(id), version]))
    : undefined;

/** The out-of-date changes and why, by each change's current event id. */
export function outOfDateChanges(input: FreshnessInput): ReadonlyMap<string, string> {
  const { after, at, before, strings } = input;
  const beforeById = new Map(
    before.events.map((event) => [normalizeRecordId(event.id), event]),
  );
  const afterById = new Map(
    after.events.map((event) => [normalizeRecordId(event.id), event]),
  );
  const afterByPerson = new Map<string, SchedulerUiEvent[]>();
  for (const event of after.events) {
    const person = personOf(event);
    if (person) {
      const list = afterByPerson.get(person) ?? [];
      list.push(event);
      afterByPerson.set(person, list);
    }
  }
  const bandsBefore = new Set(before.bands.map(bandKey));
  const versionsBefore = versionsByPerson(before.personVersions);
  const versionsAfter = versionsByPerson(after.personVersions);

  const reasonFor = (change: ProposalChange): string | undefined => {
    const id = normalizeRecordId(change.current.id);
    const sent = beforeById.get(id) ?? change.current;
    const now = afterById.get(id);
    if (!now || !sameShift(sent, now)) {
      return strings.proposalReasonChanged;
    }
    if (change.current.start < at) {
      return strings.proposalReasonStarted;
    }
    const person = personOf(change.proposed);
    if (!person) {
      return undefined;
    }
    const name = input.resourceName(change.proposed.resourceId);
    const newShift = (afterByPerson.get(person) ?? []).some((event) => {
      if (normalizeRecordId(event.id) === id || !overlaps(event, change.proposed)) {
        return false;
      }
      // Unchanged since the solver saw it: the plan already handles it.
      const seen = beforeById.get(normalizeRecordId(event.id));
      return !seen || !sameShift(seen, event);
    });
    if (newShift) {
      return formatString(strings.proposalReasonNewShift, { person: name });
    }
    const unavailable = after.bands.some(
      (band) =>
        band.kind === "unavailable" &&
        normalizeRecordId(band.resourceId) === person &&
        overlaps(band, change.proposed) &&
        !bandsBefore.has(bandKey(band)),
    );
    if (unavailable) {
      return formatString(strings.proposalReasonUnavailable, { person: name });
    }
    if (versionsBefore && versionsAfter) {
      const was = versionsBefore.get(person);
      if (was !== undefined && versionsAfter.get(person) !== was) {
        return formatString(strings.proposalReasonPersonChanged, { person: name });
      }
    }
    return undefined;
  };

  const found = new Map<string, string>();
  for (const change of input.changes) {
    const reason = reasonFor(change);
    if (reason) {
      found.set(change.current.id, reason);
    }
  }
  return found;
}

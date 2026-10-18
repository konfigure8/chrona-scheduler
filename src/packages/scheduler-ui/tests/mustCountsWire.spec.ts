import * as assert from "node:assert/strict";

import { mustBreachTotal } from "../src/schedulingContract";
import { readSolveAnalysis } from "../src/solveTransport";

/*
 * R2.18 Decision 6: the API names Maximum hours, Days off, Weekly rest
 * and Average hours as rows of their own. An API from before them sends
 * maximum hours under "other" and the other agreement breaches as other
 * Must rules; the board reads both whole, and the total is the same.
 */

const side = (mustBreaches: Record<string, unknown>): Record<string, unknown> => ({ mustBreaches, openShifts: 0 });

function theAgreementRowsReadAsTheirOwn(): void {
  const counts = {
    averageHours: 4,
    daysInARow: 0,
    daysOff: 2,
    maximumHours: 1,
    onLeaveOrUnavailable: 0,
    other: { overlap: 0, splitParts: 0 },
    restBetweenShifts: 0,
    site: 0,
    skills: 0,
    weeklyRest: 3,
  };
  const analysis = readSolveAnalysis({ countsOnly: true, current: side(counts), proposed: side(counts) });
  assert.ok(analysis);
  const read = analysis.proposed.mustBreaches;
  assert.deepEqual([read.maximumHours, read.daysOff, read.weeklyRest, read.averageHours, read.other.unlisted], [1, 2, 3, 4, 0]);
  assert.equal(mustBreachTotal(read), 10);
}

function anEarlierApiStaysWhole(): void {
  // Maximum hours under "other" (with average hours folded in), days off and weekly rest as other rules.
  const counts = {
    daysInARow: 0,
    onLeaveOrUnavailable: 0,
    other: { daysOff: 2, maximumHours: 5, overlap: 0, splitParts: 0, weeklyRest: 3 },
    restBetweenShifts: 0,
    site: 0,
    skills: 0,
  };
  const analysis = readSolveAnalysis({ countsOnly: true, current: side(counts), proposed: side(counts) });
  assert.ok(analysis);
  const read = analysis.proposed.mustBreaches;
  assert.deepEqual([read.maximumHours, read.daysOff, read.weeklyRest, read.averageHours, read.other.unlisted], [5, 0, 0, 0, 5]);
  assert.equal(mustBreachTotal(read), 10);
  // A count that is not a count drops the analysis whole.
  assert.equal(readSolveAnalysis({ current: side({ ...counts, daysOff: -1 }), proposed: side(counts) }), undefined);
}

// Nights (night rules design): the five Nights rules arrive as one row; an API from before them sends none.
function theNightsRowReads(): void {
  const counts = {
    daysInARow: 0,
    nights: 5,
    onLeaveOrUnavailable: 0,
    other: { overlap: 0, splitParts: 0 },
    restBetweenShifts: 1,
    site: 0,
    skills: 0,
  };
  const analysis = readSolveAnalysis({ countsOnly: true, current: side(counts), proposed: side(counts) });
  assert.ok(analysis);
  assert.equal(analysis.proposed.mustBreaches.nights, 5);
  assert.equal(mustBreachTotal(analysis.proposed.mustBreaches), 6);
  const { nights: _nights, ...before } = counts;
  const earlier = readSolveAnalysis({ countsOnly: true, current: side(before), proposed: side(before) });
  assert.equal(earlier?.proposed.mustBreaches.nights, 0);
  assert.equal(readSolveAnalysis({ current: side({ ...counts, nights: -1 }), proposed: side(counts) }), undefined);
  // Each Nights match names its rule; a kind the board does not know, or on another row, is left off.
  const matches = [
    { kind: "nightShiftsInARow", resourceId: "p-1", rule: "nights", shiftIds: ["n1", "n2"] },
    { kind: "somethingNew", resourceId: "p-1", rule: "nights", shiftIds: ["n3"] },
    { kind: "nightShifts", resourceId: "p-1", rule: "restBetweenShifts", shiftIds: ["n3", "d1"] },
  ];
  const justified = readSolveAnalysis({ current: { ...side(counts), matches }, proposed: { ...side(counts), matches } });
  assert.deepEqual(justified?.proposed.matches?.map((match) => match.kind ?? null), ["nightShiftsInARow", null, null]);
}

theAgreementRowsReadAsTheirOwn();
anEarlierApiStaysWhole();
theNightsRowReads();
console.log("must counts wire tests passed");

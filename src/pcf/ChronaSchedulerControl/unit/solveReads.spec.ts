import * as assert from "node:assert/strict";

import {
  mapShiftRows,
  odataInstant,
  personVersionQueries,
  shiftRowsQuery,
  type ShiftTableSpec,
} from "../SchedulerControl/solveReads";

/*
 * F31 rework: the freshness check reads the work-item table the way the
 * view's mapper does, so a row reads the same from both.
 */

const spec: ShiftTableSpec = {
  endColumn: "ccp_end",
  entity: "ccp_task",
  idColumn: "ccp_taskid",
  resourceColumn: "ccp_person",
  startColumn: "ccp_start",
  statusColumn: "ccp_status",
};

function queriesTheRangeWithTheBoundColumns(): void {
  const query = shiftRowsQuery(spec, {
    end: new Date("2026-10-05T00:00:00.000Z"),
    start: new Date("2026-09-27T14:00:00.000Z"),
  });
  assert.equal(
    query,
    "?$select=ccp_taskid,ccp_start,ccp_end,_ccp_person_value,ccp_status" +
      "&$filter=ccp_start lt 2026-10-05T00:00:00Z and ccp_end gt 2026-09-27T14:00:00Z",
  );
  assert.equal(odataInstant(new Date("2026-09-29T01:02:03.456Z")), "2026-09-29T01:02:03Z");
}

function readsRowsAsTheViewDoes(): void {
  const rows = mapShiftRows(
    [
      { _ccp_person_value: "p-1", ccp_end: "2026-10-01T03:00:00Z", ccp_start: "2026-09-30T23:00:00Z", ccp_status: "Assigned", ccp_taskid: "t-1" },
      // An open status means nobody works it, whoever the lookup names.
      { _ccp_person_value: "p-2", ccp_end: "2026-10-01T05:00:00Z", ccp_start: "2026-10-01T01:00:00Z", ccp_status: "Open", ccp_taskid: "t-2" },
      { _ccp_person_value: "p-3", ccp_end: "2026-10-01T05:00:00Z", ccp_start: "2026-10-01T01:00:00Z", ccp_status: 2, ccp_taskid: "t-3" },
      { ccp_end: "2026-10-01T06:00:00Z", ccp_start: "2026-10-01T00:00:00Z", ccp_taskid: "t-4" },
      // No times, or an end before the start: the board leaves it out too.
      { ccp_start: "2026-10-01T00:00:00Z", ccp_taskid: "t-5" },
      { ccp_end: "2026-10-01T00:00:00Z", ccp_start: "2026-10-01T02:00:00Z", ccp_taskid: "t-6" },
    ],
    spec,
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.resourceId ?? null]),
    [["t-1", "p-1"], ["t-2", null], ["t-3", null], ["t-4", null]],
  );
  assert.equal(rows[0]?.start.toISOString(), "2026-09-30T23:00:00.000Z");
}

function asksForVersionsInChunks(): void {
  const ids = Array.from({ length: 5 }, (_, index) => `{ID-${index}}`);
  const queries = personVersionQueries("ccp_personid", ids, 2);
  assert.equal(queries.length, 3);
  assert.equal(
    queries[0],
    "?$select=ccp_personid,modifiedon&$filter=Microsoft.Dynamics.CRM.In(PropertyName='ccp_personid',PropertyValues=['ID-0','ID-1'])",
  );
  assert.equal(personVersionQueries("x", []).length, 0);
}

queriesTheRangeWithTheBoundColumns();
readsRowsAsTheViewDoes();
asksForVersionsInChunks();
console.log("solve reads tests passed");

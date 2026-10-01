/**
 * Planning-horizon math (PLAN doctrine 2026-08-24): current period,
 * publish-by, the horizon rail, and the ratified plan-start rule -
 * "Plan normally starts with the next period. If the current period
 * has never been published, Plan starts with the current period so
 * it can be completed and published late. Plan never reaches into
 * an already-ended period."
 */
import {
  currentPeriod,
  horizonWindow,
  latestPublication,
  nextAddablePeriod,
  periodKey,
  planStartPeriod,
  publishBy,
  railPeriods,
  sequentialEligibility,
  type PeriodLifecycle,
} from "../src/horizon";
import type { SchedulerPeriodConfig } from "../src/periods";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const config: SchedulerPeriodConfig = {
  anchor: new Date(2026, 7, 17),
  unit: "fortnight",
};
const today = new Date(2026, 7, 17, 9);
const publishAhead = { days: 3, hour: 17 };

const published: PeriodLifecycle = {
  publications: [{ at: new Date(2026, 7, 14), changesSince: 0 }],
  status: "published",
};

// Current period and publish-by derivation.
{
  const current = currentPeriod(config, today);
  assertEqual(periodKey(current), "2026-08-17", "current period");
  assertEqual(current.end.getTime(), new Date(2026, 7, 31).getTime(), "end");
  const deadline = publishBy(current, publishAhead);
  assertEqual(
    deadline.getTime(),
    new Date(2026, 7, 14, 17).getTime(),
    "publish-by = start - days at time",
  );
}

// Never-published current period: the narrow exception - Plan starts
// on it, and its card is selectable with a deadline.
{
  const options = {
    config,
    lifecycleByKey: new Map<string, PeriodLifecycle>(),
    planAheadPeriods: 3,
    publishAhead,
    today,
  };
  const rail = railPeriods(options);
  assertEqual(rail.length, 4, "current + plan-ahead periods, nothing beyond");
  assertEqual(periodKey(rail[0]!.period), "2026-08-17", "rail starts current");
  assertEqual(rail[0]!.readOnly, false, "unpublished current is plannable");
  assertEqual(
    rail[0]!.publishBy?.getTime(),
    new Date(2026, 7, 14, 17).getTime(),
    "deadline shown",
  );
  assertEqual(periodKey(rail[1]!.period), "2026-08-31", "horizon steps");
  assertEqual(
    periodKey(planStartPeriod(options)),
    "2026-08-17",
    "plan starts current under the exception",
  );
}

// Published current period: read-only orientation card, deadline
// cleared, Plan starts with the next period.
{
  const options = {
    config,
    lifecycleByKey: new Map<string, PeriodLifecycle>([
      ["2026-08-17", published],
    ]),
    planAheadPeriods: 3,
    publishAhead,
    today,
  };
  const rail = railPeriods(options);
  assertEqual(rail[0]!.readOnly, true, "published current is orientation");
  assertEqual(rail[0]!.publishBy, undefined, "met deadline cleared");
  assertEqual(
    latestPublication(rail[0]!.lifecycle)?.changesSince,
    0,
    "publication carried",
  );
  assertEqual(
    periodKey(planStartPeriod(options)),
    "2026-08-31",
    "plan starts next period",
  );
  // Plan never reaches into an already-ended period: the rail never
  // contains anything before the current period.
  for (const card of rail) {
    if (card.period.end.getTime() <= today.getTime()) {
      throw new Error("rail contains an ended period");
    }
  }
}

// A published horizon period keeps its publication and loses the
// deadline; drafts around it keep theirs.
{
  const rail = railPeriods({
    config,
    lifecycleByKey: new Map<string, PeriodLifecycle>([
      ["2026-09-14", published],
    ]),
    planAheadPeriods: 3,
    publishAhead,
    today,
  });
  const publishedCard = rail.find(
    (card) => periodKey(card.period) === "2026-09-14",
  );
  assertEqual(publishedCard?.publishBy, undefined, "published: no deadline");
  assertEqual(publishedCard?.readOnly, false, "still plannable (deltas)");
  const draftCard = rail.find(
    (card) => periodKey(card.period) === "2026-08-31",
  );
  assertEqual(
    draftCard?.publishBy?.getTime(),
    new Date(2026, 7, 28, 17).getTime(),
    "draft keeps its deadline",
  );
}

// Created rosters: horizon periods appear only once created; the
// "+" affordance appends the next adjacent one until the horizon is
// full.
{
  const base = {
    config,
    lifecycleByKey: new Map<string, PeriodLifecycle>(),
    planAheadPeriods: 3,
    publishAhead,
    today,
  };
  const none = railPeriods({ ...base, createdKeys: new Set<string>() });
  assertEqual(none.length, 1, "only the current period exists uncreated");
  const next = nextAddablePeriod({ ...base, createdKeys: new Set<string>() });
  assertEqual(periodKey(next!), "2026-08-31", "first addable is adjacent");
  const two = new Set(["2026-08-31", "2026-09-14"]);
  assertEqual(
    railPeriods({ ...base, createdKeys: two }).length,
    3,
    "created periods show",
  );
  assertEqual(
    periodKey(nextAddablePeriod({ ...base, createdKeys: two })!),
    "2026-09-28",
    "next addable steps past created",
  );
  const full = new Set(["2026-08-31", "2026-09-14", "2026-09-28"]);
  assertEqual(
    nextAddablePeriod({ ...base, createdKeys: full }),
    undefined,
    "horizon full: nothing addable",
  );
  const window = horizonWindow(config, today, 3);
  assertEqual(periodKey(window), "2026-08-17", "horizon starts at current");
  assertEqual(
    window.end.getTime(),
    new Date(2026, 9, 12).getTime(),
    "horizon ends on a period boundary",
  );
}

// Sequential publish/unpublish: the published prefix never gets
// holes - publish needs the predecessor published, unpublish needs
// the successor back in draft.
{
  const rail = railPeriods({
    config,
    lifecycleByKey: new Map<string, PeriodLifecycle>([
      ["2026-08-17", published],
      ["2026-08-31", published],
    ]),
    planAheadPeriods: 3,
    publishAhead,
    today,
  });
  const eligibility = sequentialEligibility(rail);
  const at = (key: string) => eligibility.get(key)!;
  assertEqual(at("2026-08-17").canPublish, false, "already published");
  assertEqual(
    at("2026-08-17").canUnpublish,
    false,
    "successor still published",
  );
  assertEqual(at("2026-08-31").canUnpublish, true, "last published unwinds");
  assertEqual(at("2026-09-14").canPublish, true, "next in the chain");
  assertEqual(at("2026-09-28").canPublish, false, "beyond the chain");
  assertEqual(at("2026-09-28").canUnpublish, false, "draft cannot unpublish");
}

console.log("horizon tests passed");

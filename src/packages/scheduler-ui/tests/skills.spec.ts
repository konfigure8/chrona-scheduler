import {
  assignedHours,
  missingRequiredTags,
  rankResourcesByEligibility,
  resourceMatchesEvent,
} from "../src/skills";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";

const barista: SchedulerResource = {
  id: "r-1",
  name: "Alex",
  tags: ["Bar", "Floor"],
};

function buildEvent(
  overrides: Partial<SchedulerUiEvent> & { readonly id: string },
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17, 14, 0),
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 6, 0),
    status: "assigned",
    title: overrides.id,
    ...overrides,
  };
}

function reportsMissingTags(): void {
  assertEqual(missingRequiredTags(barista, ["Bar"]).length, 0);
  assertEqual(missingRequiredTags(barista, ["Kitchen"]).join(","), "Kitchen");
  assertEqual(
    missingRequiredTags(barista, ["Kitchen", "Floor", "First Aid"]).join(","),
    "Kitchen,First Aid",
  );
  assertEqual(missingRequiredTags(barista, undefined).length, 0);
  assertEqual(missingRequiredTags(barista, []).length, 0);
  assertEqual(missingRequiredTags(undefined, ["Bar"]).join(","), "Bar");
}

function matchesEvents(): void {
  assertEqual(
    resourceMatchesEvent(barista, buildEvent({ id: "a", requiredTags: ["Bar"] })),
    true,
  );
  assertEqual(
    resourceMatchesEvent(
      barista,
      buildEvent({ id: "b", requiredTags: ["Kitchen"] }),
    ),
    false,
  );
  assertEqual(resourceMatchesEvent(barista, buildEvent({ id: "c" })), true);
}

function sumsAssignedHoursClippedToWindow(): void {
  const window = {
    end: new Date(2026, 7, 18, 0, 0),
    start: new Date(2026, 7, 17, 0, 0),
  };
  const events = [
    buildEvent({ id: "in" }), // 06:00-14:00 = 8h
    buildEvent({
      end: new Date(2026, 7, 18, 6, 0),
      id: "overnight",
      start: new Date(2026, 7, 17, 22, 0),
    }), // clipped to 2h
    buildEvent({ id: "open", status: "needsCover" }), // excluded
    buildEvent({ id: "other", resourceId: "r-2" }), // other resource
  ];
  assertEqual(assignedHours(events, "r-1", window), 10);
  assertEqual(assignedHours(events, "r-2", window), 8);
  assertEqual(assignedHours(events, "r-3", window), 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function ranksEligibleResourcesFirstWithAnnotations(): void {
  const events = [
    buildEvent({ id: "a", requiredTags: ["Kitchen"] }),
    buildEvent({ id: "b", requiredTags: ["Bar"] }),
  ];
  const ranked = rankResourcesByEligibility(
    [
      { id: "floor-only", name: "Floor", tags: ["Floor"] },
      { id: "both", name: "Both", tags: ["Kitchen", "Bar"] },
      { id: "kitchen-only", name: "Kitchen", tags: ["Kitchen"] },
    ],
    events,
  );
  // Fully eligible first; the rest keep their relative order.
  assertEqual(ranked[0]?.resource.id, "both");
  assertEqual(ranked[0]?.mismatchCount, 0);
  assertEqual(ranked[1]?.resource.id, "floor-only");
  assertEqual(ranked[1]?.mismatchCount, 2);
  assertEqual(ranked[1]?.missing.join(","), "Kitchen,Bar");
  assertEqual(ranked[2]?.resource.id, "kitchen-only");
  assertEqual(ranked[2]?.mismatchCount, 1);
  assertEqual(ranked[2]?.missing.join(","), "Bar");
}

reportsMissingTags();
ranksEligibleResourcesFirstWithAnnotations();
matchesEvents();
sumsAssignedHoursClippedToWindow();

console.log("skills tests passed");

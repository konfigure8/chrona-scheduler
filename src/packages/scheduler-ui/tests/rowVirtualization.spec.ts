import {
  computeVisibleEntryRange,
  type VirtualEntry,
} from "../src/rowVirtualization";

function buildEntries(count: number, height: number): readonly VirtualEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    height,
    top: index * height,
  }));
}

function windowsAroundTheScrollPosition(): void {
  const entries = buildEntries(2000, 44);
  const range = computeVisibleEntryRange(entries, 44_000, 600, 400);

  assertEqual(range.startIndex, Math.floor((44_000 - 400) / 44));
  assertEqual(range.endIndex > range.startIndex, true);
  const rendered = range.endIndex - range.startIndex;
  assertEqual(rendered < 40, true);
  assertEqual(range.topSpacer, entries[range.startIndex]?.top);

  const total = 2000 * 44;
  const last = entries[range.endIndex - 1];
  assertEqual(
    range.bottomSpacer,
    total - ((last?.top ?? 0) + (last?.height ?? 0)),
  );
}

function rendersEverythingWhenItFits(): void {
  const entries = buildEntries(10, 44);
  const range = computeVisibleEntryRange(entries, 0, 600, 400);
  assertEqual(range.startIndex, 0);
  assertEqual(range.endIndex, 10);
  assertEqual(range.topSpacer, 0);
  assertEqual(range.bottomSpacer, 0);
}

function handlesVariableHeightsAndEdges(): void {
  const entries: VirtualEntry[] = [
    { height: 28, top: 0 },
    { height: 88, top: 28 },
    { height: 44, top: 116 },
    { height: 132, top: 160 },
    { height: 44, top: 292 },
  ];
  const atTop = computeVisibleEntryRange(entries, 0, 100, 0);
  assertEqual(atTop.startIndex, 0);
  assertEqual(atTop.endIndex, 2);

  // Entry 2 spans 116-160, so it is still partially visible at scroll 150.
  const middle = computeVisibleEntryRange(entries, 150, 100, 0);
  assertEqual(middle.startIndex, 2);
  assertEqual(middle.topSpacer, 116);

  const empty = computeVisibleEntryRange([], 100, 600);
  assertEqual(empty.endIndex, 0);
  assertEqual(empty.bottomSpacer, 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

windowsAroundTheScrollPosition();
rendersEverythingWhenItFits();
handlesVariableHeightsAndEdges();

console.log("rowVirtualization tests passed");

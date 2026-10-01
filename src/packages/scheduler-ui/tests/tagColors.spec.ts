import { tagPillStyle } from "../src/tagColors";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function buildsFluentTintPairs(): void {
  const colors = { Bar: "#5c2e91", Floor: "#0f6cbd" };
  const bar = tagPillStyle("Bar", colors);
  // The Fluent tint pattern: Background2 is the hue mixed 35% into
  // the page background, Foreground2 the hue mixed 55% toward the
  // text color, and the border matches the wash (borderless look).
  assertEqual(bar?.background, "color-mix(in srgb, #5c2e91 35%, var(--csui-bg))");
  assertEqual(bar?.borderColor, bar?.background);
  assertEqual(bar?.color, "color-mix(in srgb, #5c2e91 55%, var(--csui-text))");
  // Three-digit hex is accepted as-is.
  const short = tagPillStyle("Bar", { Bar: "#00f" });
  assertEqual(short?.background, "color-mix(in srgb, #00f 35%, var(--csui-bg))");
}

function degradesToNeutralPill(): void {
  const colors = { Bar: "#5c2e91" };
  // Unconfigured tags and unparseable colors keep the neutral pill.
  assertEqual(tagPillStyle("Kitchen", colors), undefined);
  assertEqual(tagPillStyle("Bar", { Bar: "purple" }), undefined);
  assertEqual(tagPillStyle("Bar", { Bar: "" }), undefined);
  assertEqual(tagPillStyle("Bar", { Bar: "#12345" }), undefined);
  assertEqual(tagPillStyle("Bar", undefined), undefined);
}

buildsFluentTintPairs();
degradesToNeutralPill();

console.log("tagColors tests passed");

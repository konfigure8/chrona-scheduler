import {
  fluentDarkTheme,
  fluentLightTheme,
  themeToCssVariables,
} from "../src/theme";

function mapsTokensToCssVariables(): void {
  const variables = themeToCssVariables({
    background: "#111111",
    brand: "#222222",
  });
  assertEqual(variables["--csui-bg"], "#111111");
  assertEqual(variables["--csui-brand"], "#222222");
  assertEqual(Object.keys(variables).length, 2);
}

function presetsCoverEveryToken(): void {
  const lightVariables = themeToCssVariables(fluentLightTheme);
  const darkVariables = themeToCssVariables(fluentDarkTheme);
  assertEqual(Object.keys(lightVariables).length, 28);
  assertEqual(Object.keys(darkVariables).length, 28);
  // Fluent's own dark neutrals: Background1 is the canvas, Background2
  // sits under it. hostTheme.spec asserts both presets against the
  // real @fluentui/react-theme package.
  assertEqual(darkVariables["--csui-bg"], "#292929");
  assertEqual(darkVariables["--csui-text"], "#ffffff");
  // Warning triple (generation flags), Fluent v9 status warning values.
  assertEqual(lightVariables["--csui-warn"], "#bc4b09");
  assertEqual(darkVariables["--csui-warn"], "#faa06b");
  // Success triple (period status chips), Fluent v9 status success.
  assertEqual(lightVariables["--csui-success"], "#0e700e");
  assertEqual(darkVariables["--csui-success"], "#54b054");
  assertEqual(
    Object.keys(lightVariables).sort().join(","),
    Object.keys(darkVariables).sort().join(","),
  );
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

mapsTokensToCssVariables();
presetsCoverEveryToken();

console.log("theme tests passed");

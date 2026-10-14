import {
  colorSchemeOf,
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
  assertEqual(Object.keys(lightVariables).length, 35);
  assertEqual(Object.keys(darkVariables).length, 35);
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
  // RAG triple (the Workforce hours bar): Fluent v9 status Background3,
  // the same in both modes.
  for (const variables of [lightVariables, darkVariables]) {
    assertEqual(variables["--csui-rag-red"], "#c50f1f");
    assertEqual(variables["--csui-rag-amber"], "#f7630c");
    assertEqual(variables["--csui-rag-green"], "#107c10");
  }
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

// Native fields and pickers follow a dark host: the scheme comes from the background.
function readsTheSchemeFromTheBackground(): void {
  assertEqual(colorSchemeOf(fluentDarkTheme.background), "dark");
  assertEqual(colorSchemeOf(fluentLightTheme.background), "light");
  assertEqual(colorSchemeOf("#fff"), "light");
  assertEqual(colorSchemeOf("rgb(41, 41, 41)"), "dark");
  assertEqual(colorSchemeOf("var(--x)"), undefined);
  assertEqual(colorSchemeOf(undefined), undefined);
}

mapsTokensToCssVariables();
presetsCoverEveryToken();
readsTheSchemeFromTheBackground();

console.log("theme tests passed");

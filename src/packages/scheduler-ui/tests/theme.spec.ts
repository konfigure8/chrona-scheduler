import {
  colorSchemeOf,
  fluentDarkTheme,
  fluentLightTheme,
  readableTextOn,
  themeToCssVariables,
} from "../src/theme";
import { eventFill } from "../src/viewConfig";
import type { SchedulerUiEvent } from "../src/types";

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
  assertEqual(Object.keys(lightVariables).length, 39);
  assertEqual(Object.keys(darkVariables).length, 39);
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
  // RAG triple (the Workforce hours bar): Fluent v9 status BorderActive,
  // lighter in dark so the fill holds contrast on a dark surface.
  assertEqual(lightVariables["--csui-rag-red"], "#c50f1f");
  assertEqual(lightVariables["--csui-rag-amber"], "#f7630c");
  assertEqual(lightVariables["--csui-rag-green"], "#107c10");
  assertEqual(darkVariables["--csui-rag-red"], "#dc626d");
  assertEqual(darkVariables["--csui-rag-amber"], "#faa06b");
  assertEqual(darkVariables["--csui-rag-green"], "#54b054");
  // Text on a maker's colour: static, the same in both modes.
  for (const variables of [lightVariables, darkVariables]) {
    assertEqual(variables["--csui-text-static"], "#242424");
    assertEqual(variables["--csui-text-static-inverted"], "#ffffff");
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

// A maker's colour gets text that reads on it in any theme: dark on pale, white on deep.
function picksTextThatReadsOnAColour(): void {
  assertEqual(readableTextOn("#fde7e9"), "var(--csui-text-static)");
  assertEqual(readableTextOn("#c7e0f4"), "var(--csui-text-static)");
  assertEqual(readableTextOn("#0f6cbd"), "var(--csui-text-static-inverted)");
  assertEqual(readableTextOn("rgb(17, 94, 163)"), "var(--csui-text-static-inverted)");
  assertEqual(readableTextOn("#fde7e9cc"), "var(--csui-text-static)");
  assertEqual(readableTextOn("#0f6cbd80"), "var(--csui-text-static-inverted)");
  assertEqual(readableTextOn("var(--x)"), undefined);
  assertEqual(readableTextOn(undefined), undefined);
  const event = {
    color: "#fde7e9",
    end: new Date(2026, 9, 19, 14),
    id: "e1",
    start: new Date(2026, 9, 19, 6),
    title: "Front of house",
  } as SchedulerUiEvent;
  assertEqual(eventFill(event, undefined).background, "#fde7e9");
  assertEqual(eventFill(event, undefined).color, "var(--csui-text-static)");
  // A ghost keeps the stylesheet's fill and text.
  assertEqual(Object.keys(eventFill({ ...event, review: "ghost" }, undefined)).length, 0);
  assertEqual(Object.keys(eventFill({ ...event, color: undefined }, undefined)).length, 0);
}

mapsTokensToCssVariables();
presetsCoverEveryToken();
readsTheSchemeFromTheBackground();
picksTextThatReadsOnAColour();

console.log("theme tests passed");

/**
 * Host-theme adaptation (Power Apps modern theming). The platform
 * hands a code component its resolved Fluent v9 theme through
 * `context.fluentDesignLanguage.tokenTheme`; this asserts the mapping
 * against the REAL Fluent themes rather than transcribed hex, which
 * is the whole point of taking tokens from the host.
 *
 * @fluentui/react-theme is a devDependency used by tests and the
 * bench only - src/ never imports it, and the control gets Fluent
 * from the platform-library declaration.
 */
import {
  createLightTheme,
  webDarkTheme,
  webLightTheme,
  type BrandVariants,
} from "@fluentui/react-theme";

import {
  fluentThemeToSchedulerTheme,
  fluentTokenNames,
} from "../src/hostTheme";
import { fluentDarkTheme, fluentLightTheme } from "../src/theme";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const light = webLightTheme as unknown as Record<string, string>;
const dark = webDarkTheme as unknown as Record<string, string>;

// Every token this adapter reads exists in the real Fluent theme -
// the guard against a name that was guessed rather than checked.
{
  for (const name of fluentTokenNames) {
    if (typeof light[name] !== "string") {
      throw new Error(`Fluent light theme has no token "${name}"`);
    }
    if (typeof dark[name] !== "string") {
      throw new Error(`Fluent dark theme has no token "${name}"`);
    }
  }
}

// Light: the host's values arrive under our names.
{
  const theme = fluentThemeToSchedulerTheme(light);
  if (!theme) {
    throw new Error("light theme produced nothing");
  }
  assertEqual(theme.brand, light.colorBrandBackground, "brand");
  assertEqual(theme.background, light.colorNeutralBackground1, "background");
  assertEqual(theme.surface, light.colorNeutralBackground2, "surface");
  assertEqual(theme.stroke, light.colorNeutralStroke2, "stroke");
  assertEqual(theme.warning, light.colorStatusWarningForeground1, "warning");
  assertEqual(theme.shadow, light.shadow2, "shadow");
  assertEqual(Object.keys(theme).length, 31, "all tokens mapped");
}

// Dark: distinct values, and the neutral relationship Fluent defines
// (Background2 sits under Background1) - the hand-rolled palette had
// this pair inverted.
{
  const theme = fluentThemeToSchedulerTheme(dark);
  if (!theme) {
    throw new Error("dark theme produced nothing");
  }
  assertEqual(theme.background, dark.colorNeutralBackground1, "dark bg");
  assertEqual(theme.surface, dark.colorNeutralBackground2, "dark surface");
  assertEqual(theme.text, dark.colorNeutralForeground1, "dark text");
  if (theme.background === fluentThemeToSchedulerTheme(light)?.background) {
    throw new Error("dark and light backgrounds should differ");
  }
}

// A customer brand ramp flows through: the control follows THEIR
// brand, which a transcribed palette can never do.
{
  const teal: BrandVariants = {
    10: "#001110", 20: "#001C1B", 30: "#00302E", 40: "#003D3A",
    50: "#004A47", 60: "#005854", 70: "#006661", 80: "#00746F",
    90: "#00837D", 100: "#00928B", 110: "#12A19A", 120: "#3EB0A9",
    130: "#63BEB8", 140: "#87CCC7", 150: "#ABDAD6", 160: "#CFE8E6",
  };
  const branded = createLightTheme(teal) as unknown as Record<string, string>;
  const theme = fluentThemeToSchedulerTheme(branded);
  assertEqual(theme?.brand, branded.colorBrandBackground, "branded brand");
  if (theme?.brand === light.colorBrandBackground) {
    throw new Error("branded theme should not equal the default brand");
  }
}

// Degrade token by token: a host on a different Fluent version keeps
// what it has and leaves the rest to the stylesheet defaults.
{
  const partial = fluentThemeToSchedulerTheme({
    colorBrandBackground: "#123456",
  });
  assertEqual(partial?.brand, "#123456", "partial brand");
  assertEqual(Object.keys(partial ?? {}).length, 1, "only what exists");
  assertEqual(fluentThemeToSchedulerTheme(undefined), undefined, "no host");
  assertEqual(fluentThemeToSchedulerTheme({}), undefined, "empty host");
}

// The fallback presets ARE the Fluent web themes: asserting them
// against the real package turns transcription into something that
// cannot drift silently (the earlier hand-rolled dark palette had six
// wrong values, including an inverted background/surface pair).
{
  const lightPreset = fluentThemeToSchedulerTheme(light);
  const darkPreset = fluentThemeToSchedulerTheme(dark);
  for (const [token, value] of Object.entries(fluentLightTheme)) {
    if (token === "fontFamily" || token.startsWith("shadow")) {
      continue; // formatting differs harmlessly (quotes, spacing)
    }
    assertEqual(
      value,
      (lightPreset as Record<string, string>)[token],
      `fluentLightTheme.${token}`,
    );
  }
  for (const [token, value] of Object.entries(fluentDarkTheme)) {
    if (token === "fontFamily" || token.startsWith("shadow")) {
      continue;
    }
    assertEqual(
      value,
      (darkPreset as Record<string, string>)[token],
      `fluentDarkTheme.${token}`,
    );
  }
}

console.log("hostTheme tests passed");

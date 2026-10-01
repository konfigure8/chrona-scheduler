/**
 * Host-theme simulation for the bench.
 *
 * In a model-driven app the platform hands the control a resolved
 * Fluent v9 theme (the customer's brand ramp, their light/dark mode).
 * The Vite harness has no host, so it stands in for one using the
 * REAL Fluent themes from @fluentui/react-theme - a harness-only
 * devDependency. Nothing here reaches the shipped package: `src/`
 * never imports @fluentui, the control gets its theme from
 * `context.fluentDesignLanguage`, and the platform provides Fluent as
 * a platform-library rather than a bundled dependency.
 *
 * "None" is the standalone case: no host theme, package stylesheet
 * defaults stand - which is also what the PCF test harness gives,
 * since pcf-start ships no theme picker.
 */
import {
  createDarkTheme,
  createLightTheme,
  webDarkTheme,
  webLightTheme,
  type BrandVariants,
} from "@fluentui/react-theme";

import {
  fluentThemeToSchedulerTheme,
  type SchedulerTheme,
} from "../src";

export type HostThemeName = "branded" | "dark" | "light" | "none";

/**
 * A non-Microsoft brand ramp, so "branded" proves the control follows
 * the CUSTOMER's brand rather than any palette we hardcode. Generated
 * from a teal base in the 16-slot shape Fluent expects.
 */
const tealBrand: BrandVariants = {
  10: "#001110",
  20: "#001C1B",
  30: "#00302E",
  40: "#003D3A",
  50: "#004A47",
  60: "#005854",
  70: "#006661",
  80: "#00746F",
  90: "#00837D",
  100: "#00928B",
  110: "#12A19A",
  120: "#3EB0A9",
  130: "#63BEB8",
  140: "#87CCC7",
  150: "#ABDAD6",
  160: "#CFE8E6",
};

const brandedLight = createLightTheme(tealBrand);
void createDarkTheme;

/** The resolved Fluent theme a host would hand us, or none. */
export function hostTokenTheme(
  name: HostThemeName,
): Record<string, string> | undefined {
  if (name === "light") {
    return webLightTheme as unknown as Record<string, string>;
  }
  if (name === "dark") {
    return webDarkTheme as unknown as Record<string, string>;
  }
  if (name === "branded") {
    return brandedLight as unknown as Record<string, string>;
  }
  return undefined;
}

/** What the control does with it: adapt to the Chrona token contract. */
export function hostSchedulerTheme(
  name: HostThemeName,
): Partial<SchedulerTheme> | undefined {
  return fluentThemeToSchedulerTheme(hostTokenTheme(name));
}

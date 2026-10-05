/**
 * Host-theme adaptation (Power Apps modern theming).
 *
 * A model-driven or canvas host hands a code component the RESOLVED
 * Fluent v9 theme through `context.fluentDesignLanguage.tokenTheme` -
 * the customer's own brand ramp, in their light or dark mode, at the
 * platform's runtime Fluent version. Microsoft's guidance for
 * components that are not built out of Fluent React components (ours)
 * is to read those tokens directly and style from them:
 * learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming
 *
 * So the host is the source of color - never a palette we transcribe.
 * `fluentLightTheme` in theme.ts is only the fallback for surfaces
 * with no host (the Vite harness, and a standalone gallery install
 * where modern theming is off).
 *
 * This mapping is the ONE place Fluent token names appear. It is
 * structurally typed on purpose: the package takes no dependency on
 * @fluentui - the platform ships Fluent, the control declares it as a
 * platform-library, and nothing about it is bundled.
 */
import type { SchedulerTheme } from "./theme";

/** The shape we need from `fluentDesignLanguage.tokenTheme`. */
export interface FluentV9Tokens {
  readonly [tokenName: string]: string | undefined;
}

/**
 * Which Fluent v9 token feeds each Chrona token. Semantic intent, not
 * value matching: status colors come from the status ramp, strokes
 * from the stroke ramp, and so on.
 */
const FLUENT_TOKEN_BY_CHRONA_TOKEN: Readonly<
  Record<keyof SchedulerTheme, string>
> = {
  background: "colorNeutralBackground1",
  brand: "colorBrandBackground",
  brandBackground: "colorBrandBackground2",
  brandForeground: "colorBrandForeground1",
  brandStroke: "colorBrandStroke2",
  danger: "colorStatusDangerForeground1",
  dangerBackground: "colorStatusDangerBackground1",
  dangerStroke: "colorStatusDangerBorder1",
  fontFamily: "fontFamilyBase",
  holiday: "colorPaletteGrapeBorderActive",
  now: "colorPaletteRedForeground1",
  onBrand: "colorNeutralForegroundOnBrand",
  overlay: "colorBackgroundOverlay",
  ragAmber: "colorStatusWarningBackground3",
  ragGreen: "colorStatusSuccessBackground3",
  ragRed: "colorStatusDangerBackground3",
  shadow: "shadow2",
  shadowDialog: "shadow64",
  shadowFlyout: "shadow16",
  stroke: "colorNeutralStroke2",
  strokeStrong: "colorNeutralStroke1",
  success: "colorStatusSuccessForeground1",
  successBackground: "colorStatusSuccessBackground1",
  successStroke: "colorStatusSuccessBorder1",
  surface: "colorNeutralBackground2",
  surfaceHover: "colorNeutralBackground1Hover",
  text: "colorNeutralForeground1",
  textSoft: "colorNeutralForeground3",
  warning: "colorStatusWarningForeground1",
  warningBackground: "colorStatusWarningBackground1",
  warningStroke: "colorStatusWarningBorder1",
};

/**
 * Adapt a host Fluent v9 theme to the Chrona token contract. Absent
 * tokens are omitted rather than blanked, so a host on a different
 * Fluent version (the platform loads a higher one than the manifest
 * pins) degrades to the stylesheet defaults token by token instead of
 * rendering an unstyled control.
 */
export function fluentThemeToSchedulerTheme(
  tokens: FluentV9Tokens | undefined,
): Partial<SchedulerTheme> | undefined {
  if (!tokens) {
    return undefined;
  }
  const theme: Record<string, string> = {};
  for (const [chronaToken, fluentToken] of Object.entries(
    FLUENT_TOKEN_BY_CHRONA_TOKEN,
  )) {
    const value = tokens[fluentToken];
    if (typeof value === "string" && value.length > 0) {
      theme[chronaToken] = value;
    }
  }
  return Object.keys(theme).length > 0
    ? (theme as Partial<SchedulerTheme>)
    : undefined;
}

/** The Fluent token names this adapter reads (for tests and docs). */
export const fluentTokenNames: readonly string[] = Object.values(
  FLUENT_TOKEN_BY_CHRONA_TOKEN,
);

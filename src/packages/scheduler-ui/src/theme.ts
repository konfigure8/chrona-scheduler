/**
 * Theme adapter contract: the host (PCF) maps the platform Fluent theme to
 * these tokens; components read only the CSS custom properties, so theming
 * never touches component code.
 */
export interface SchedulerTheme {
  readonly background: string;
  /** Fluent colorNeutralBackground3: a neutral count badge's fill. */
  readonly badge: string;
  /** Fluent colorNeutralForeground2: a neutral count badge's number. */
  readonly badgeText: string;
  readonly brand: string;
  readonly brandBackground: string;
  /** Fluent colorBrandForeground1: brand-coloured text and links on neutral surfaces. */
  readonly brandForeground: string;
  readonly brandStroke: string;
  readonly danger: string;
  readonly dangerBackground: string;
  readonly dangerStroke: string;
  /** Fluent colorNeutralBackgroundDisabled: a disabled button's fill. */
  readonly disabledBackground: string;
  /** Fluent colorNeutralStrokeDisabled: a disabled button's border. */
  readonly disabledStroke: string;
  /** Fluent colorNeutralForegroundDisabled: a disabled control's text. */
  readonly disabledText: string;
  readonly fontFamily: string;
  /** Fluent colorPaletteGrapeBorderActive: holiday decorations. */
  readonly holiday: string;
  readonly now: string;
  /** Fluent colorNeutralForegroundOnBrand: text on brand/danger fills. */
  readonly onBrand: string;
  /** Fluent colorBackgroundOverlay: the dialog scrim. */
  readonly overlay: string;
  /**
   * Fluent colorStatus*BorderActive: the red, amber and green (RAG)
   * fills, such as the Workforce hours bar; lighter in dark themes, so
   * they hold contrast on a dark surface.
   */
  readonly ragAmber: string;
  readonly ragGreen: string;
  readonly ragRed: string;
  /** Fluent shadow2: faint elevation for cards and containers. */
  readonly shadow: string;
  /** Fluent colorNeutralShadowAmbient: the colour of a soft edge shadow, dark in both themes. */
  readonly shadowAmbient: string;
  /** Fluent shadow64: dialogs. */
  readonly shadowDialog: string;
  /** Fluent shadow16: menus, hover cards, and other flyouts. */
  readonly shadowFlyout: string;
  readonly stroke: string;
  readonly strokeStrong: string;
  readonly surface: string;
  readonly surfaceHover: string;
  readonly text: string;
  readonly textSoft: string;
  /** Fluent colorNeutralForeground1Static: dark text in every theme, for a pale maker colour. */
  readonly textStatic: string;
  /** Fluent colorNeutralForegroundStaticInverted: white text in every theme, for a deep maker colour. */
  readonly textStaticInverted: string;
  readonly success: string;
  readonly successBackground: string;
  readonly successStroke: string;
  readonly warning: string;
  readonly warningBackground: string;
  readonly warningStroke: string;
}

const cssVariableByToken: Record<keyof SchedulerTheme, string> = {
  background: "--csui-bg",
  badge: "--csui-badge",
  badgeText: "--csui-badge-text",
  brand: "--csui-brand",
  brandBackground: "--csui-brand-bg",
  brandForeground: "--csui-brand-fg",
  brandStroke: "--csui-brand-stroke",
  danger: "--csui-danger",
  dangerBackground: "--csui-danger-bg",
  dangerStroke: "--csui-danger-stroke",
  disabledBackground: "--csui-disabled-bg",
  disabledStroke: "--csui-disabled-stroke",
  disabledText: "--csui-disabled-text",
  fontFamily: "--csui-font",
  holiday: "--csui-holiday",
  now: "--csui-now",
  onBrand: "--csui-on-brand",
  overlay: "--csui-overlay",
  ragAmber: "--csui-rag-amber",
  ragGreen: "--csui-rag-green",
  ragRed: "--csui-rag-red",
  shadow: "--csui-shadow",
  shadowAmbient: "--csui-shadow-ambient",
  shadowDialog: "--csui-shadow-dialog",
  shadowFlyout: "--csui-shadow-flyout",
  stroke: "--csui-stroke",
  strokeStrong: "--csui-stroke-strong",
  surface: "--csui-surface",
  surfaceHover: "--csui-surface-hover",
  text: "--csui-text",
  textSoft: "--csui-text-soft",
  textStatic: "--csui-text-static",
  textStaticInverted: "--csui-text-static-inverted",
  success: "--csui-success",
  successBackground: "--csui-success-bg",
  successStroke: "--csui-success-stroke",
  warning: "--csui-warn",
  warningBackground: "--csui-warn-bg",
  warningStroke: "--csui-warn-stroke",
};

export function themeToCssVariables(
  theme: Partial<SchedulerTheme>,
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [token, value] of Object.entries(theme)) {
    const variable = cssVariableByToken[token as keyof SchedulerTheme];
    if (variable && value) {
      variables[variable] = value;
    }
  }
  return variables;
}

/**
 * The colour scheme a background implies, so native fields, pickers and
 * scrollbars follow a dark host theme. Undefined when the colour does not
 * read as hex or rgb(): the stylesheet's light default stays.
 */
export function colorSchemeOf(background: string | undefined): "dark" | "light" | undefined {
  const luminance = luminanceOf(background);
  return luminance === undefined ? undefined : luminance < 0.4 ? "dark" : "light";
}

/**
 * Text that reads on a maker's colour, in any theme: dark on a pale
 * fill, white on a deep one, from whichever gives the higher contrast.
 * Undefined when the colour does not read as hex or rgb(): the card
 * keeps its stylesheet text.
 */
export function readableTextOn(color: string | undefined): string | undefined {
  const luminance = luminanceOf(color);
  if (luminance === undefined) {
    return undefined;
  }
  // #242424 and #ffffff give equal contrast at a relative luminance of about 0.217.
  return luminance > 0.217 ? "var(--csui-text-static)" : "var(--csui-text-static-inverted)";
}

/** The WCAG relative luminance of a hex or rgb() colour, or undefined. */
function luminanceOf(color: string | undefined): number | undefined {
  const value = color?.trim() ?? "";
  let rgb: number[] | undefined;
  // #rgb, #rgba, #rrggbb or #rrggbbaa: the alpha does not change which text reads best.
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((digit) => digit + digit).join("") : hex.slice(0, 6);
    rgb = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  } else {
    const parts = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
    rgb = parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : undefined;
  }
  if (!rgb) {
    return undefined;
  }
  const [red, green, blue] = rgb.map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Matches the stylesheet defaults; useful as an explicit baseline. */
export const fluentLightTheme: SchedulerTheme = {
  background: "#ffffff",
  badge: "#f5f5f5",
  badgeText: "#424242",
  brand: "#0f6cbd",
  brandBackground: "#ebf3fc",
  brandForeground: "#0f6cbd",
  brandStroke: "#b4d6fa",
  danger: "#b10e1c",
  dangerBackground: "#fdf3f4",
  dangerStroke: "#eeacb2",
  disabledBackground: "#f0f0f0",
  disabledStroke: "#e0e0e0",
  disabledText: "#bdbdbd",
  fontFamily: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif',
  holiday: "#881798",
  now: "#bc2f32",
  onBrand: "#ffffff",
  overlay: "rgba(0, 0, 0, 0.4)",
  ragAmber: "#f7630c",
  ragGreen: "#107c10",
  ragRed: "#c50f1f",
  shadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14)",
  shadowAmbient: "rgba(0, 0, 0, 0.12)",
  shadowDialog: "0 0 8px rgba(0, 0, 0, 0.12), 0 32px 64px rgba(0, 0, 0, 0.14)",
  shadowFlyout: "0 0 2px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.14)",
  stroke: "#e0e0e0",
  strokeStrong: "#d1d1d1",
  surface: "#fafafa",
  surfaceHover: "#f5f5f5",
  text: "#242424",
  textSoft: "#616161",
  textStatic: "#242424",
  textStaticInverted: "#ffffff",
  success: "#0e700e",
  successBackground: "#f1faf1",
  successStroke: "#9fd89f",
  warning: "#bc4b09",
  warningBackground: "#fff9f5",
  warningStroke: "#fdcfb4",
};

/** The Fluent v9 web dark theme, for hosts without modern theming. */
export const fluentDarkTheme: SchedulerTheme = {
  background: "#292929",
  badge: "#141414",
  badgeText: "#d6d6d6",
  brand: "#115ea3",
  brandBackground: "#082338",
  brandForeground: "#479ef5",
  brandStroke: "#0e4775",
  danger: "#dc626d",
  dangerBackground: "#3b0509",
  dangerStroke: "#c50f1f",
  disabledBackground: "#141414",
  disabledStroke: "#424242",
  disabledText: "#5c5c5c",
  fontFamily: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif',
  holiday: "#b55fc1",
  now: "#e37d80",
  onBrand: "#ffffff",
  overlay: "rgba(0, 0, 0, 0.5)",
  ragAmber: "#faa06b",
  ragGreen: "#54b054",
  ragRed: "#dc626d",
  shadow: "0 0 2px rgba(0, 0, 0, 0.24), 0 1px 2px rgba(0, 0, 0, 0.28)",
  shadowAmbient: "rgba(0, 0, 0, 0.24)",
  shadowDialog: "0 0 8px rgba(0, 0, 0, 0.24), 0 32px 64px rgba(0, 0, 0, 0.28)",
  shadowFlyout: "0 0 2px rgba(0, 0, 0, 0.24), 0 8px 16px rgba(0, 0, 0, 0.28)",
  stroke: "#525252",
  strokeStrong: "#666666",
  success: "#54b054",
  successBackground: "#052505",
  successStroke: "#107c10",
  surface: "#1f1f1f",
  surfaceHover: "#3d3d3d",
  text: "#ffffff",
  textSoft: "#adadad",
  textStatic: "#242424",
  textStaticInverted: "#ffffff",
  warning: "#faa06b",
  warningBackground: "#4a1e04",
  warningStroke: "#f7630c",
};

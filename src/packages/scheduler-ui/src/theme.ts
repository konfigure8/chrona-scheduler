/**
 * Theme adapter contract: the host (PCF) maps the platform Fluent theme to
 * these tokens; components read only the CSS custom properties, so theming
 * never touches component code.
 */
export interface SchedulerTheme {
  readonly background: string;
  readonly brand: string;
  readonly brandBackground: string;
  /** Fluent colorBrandForeground1: brand-coloured text and links on neutral surfaces. */
  readonly brandForeground: string;
  readonly brandStroke: string;
  readonly danger: string;
  readonly dangerBackground: string;
  readonly dangerStroke: string;
  readonly fontFamily: string;
  /** Fluent colorPaletteGrapeBorderActive: holiday decorations. */
  readonly holiday: string;
  readonly now: string;
  /** Fluent colorNeutralForegroundOnBrand: text on brand/danger fills. */
  readonly onBrand: string;
  /** Fluent colorBackgroundOverlay: the dialog scrim. */
  readonly overlay: string;
  /** Fluent shadow2: faint elevation for cards and containers. */
  readonly shadow: string;
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
  readonly success: string;
  readonly successBackground: string;
  readonly successStroke: string;
  readonly warning: string;
  readonly warningBackground: string;
  readonly warningStroke: string;
}

const cssVariableByToken: Record<keyof SchedulerTheme, string> = {
  background: "--csui-bg",
  brand: "--csui-brand",
  brandBackground: "--csui-brand-bg",
  brandForeground: "--csui-brand-fg",
  brandStroke: "--csui-brand-stroke",
  danger: "--csui-danger",
  dangerBackground: "--csui-danger-bg",
  dangerStroke: "--csui-danger-stroke",
  fontFamily: "--csui-font",
  holiday: "--csui-holiday",
  now: "--csui-now",
  onBrand: "--csui-on-brand",
  overlay: "--csui-overlay",
  shadow: "--csui-shadow",
  shadowDialog: "--csui-shadow-dialog",
  shadowFlyout: "--csui-shadow-flyout",
  stroke: "--csui-stroke",
  strokeStrong: "--csui-stroke-strong",
  surface: "--csui-surface",
  surfaceHover: "--csui-surface-hover",
  text: "--csui-text",
  textSoft: "--csui-text-soft",
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

/** Matches the stylesheet defaults; useful as an explicit baseline. */
export const fluentLightTheme: SchedulerTheme = {
  background: "#ffffff",
  brand: "#0f6cbd",
  brandBackground: "#ebf3fc",
  brandForeground: "#0f6cbd",
  brandStroke: "#b4d6fa",
  danger: "#b10e1c",
  dangerBackground: "#fdf3f4",
  dangerStroke: "#eeacb2",
  fontFamily: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif',
  holiday: "#881798",
  now: "#bc2f32",
  onBrand: "#ffffff",
  overlay: "rgba(0, 0, 0, 0.4)",
  shadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14)",
  shadowDialog: "0 0 8px rgba(0, 0, 0, 0.12), 0 32px 64px rgba(0, 0, 0, 0.14)",
  shadowFlyout: "0 0 2px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.14)",
  stroke: "#e0e0e0",
  strokeStrong: "#d1d1d1",
  surface: "#fafafa",
  surfaceHover: "#f5f5f5",
  text: "#242424",
  textSoft: "#616161",
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
  brand: "#115ea3",
  brandBackground: "#082338",
  brandForeground: "#479ef5",
  brandStroke: "#0e4775",
  danger: "#dc626d",
  dangerBackground: "#3b0509",
  dangerStroke: "#c50f1f",
  fontFamily: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif',
  holiday: "#b55fc1",
  now: "#e37d80",
  onBrand: "#ffffff",
  overlay: "rgba(0, 0, 0, 0.5)",
  shadow: "0 0 2px rgba(0, 0, 0, 0.24), 0 1px 2px rgba(0, 0, 0, 0.28)",
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
  warning: "#faa06b",
  warningBackground: "#4a1e04",
  warningStroke: "#f7630c",
};

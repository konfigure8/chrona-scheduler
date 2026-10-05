/**
 * Maker-configured colors for skill/tag pills. Fluent v9 renders
 * colored tags/badges as TINT pairs, never saturated fills: a pale
 * wash of the hue behind dark same-hue text (the palette
 * Background2/Foreground2 pattern). Maker input is an arbitrary hue,
 * so the pair is derived with the same ratios the Fluent ramps use -
 * Background2 is the hue mixed ~35% into the page background,
 * Foreground2 the hue mixed ~55% toward the text color. Mixing with
 * the theme vars makes dark hosts invert the pair automatically:
 * dark wash, light text.
 */

export type TagColorMap = Readonly<Record<string, string>>;

function isHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
}

export interface TagPillStyle {
  readonly background: string;
  readonly borderColor: string;
  readonly color: string;
}

/**
 * Inline style for a configured tag pill; undefined (keep the neutral
 * outline pill) when the tag has no configured or parseable color.
 */
/** Class list for a pill: colored when configured, warning when noted. */
export function tagClassName(colored: boolean, noted: boolean): string {
  return [
    "chrona-sched__tag",
    colored ? "chrona-sched__tag--colored" : "",
    noted ? "chrona-sched__tag--warning" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function tagPillStyle(
  tag: string,
  colors: TagColorMap | undefined,
): TagPillStyle | undefined {
  const configured = colors?.[tag];
  if (!configured || !isHexColor(configured)) {
    return undefined;
  }
  const hue = configured.trim();
  const wash = `color-mix(in srgb, ${hue} 35%, var(--csui-bg))`;
  return {
    background: wash,
    // Fluent tint badges read as borderless: Border1 equals
    // Background2, so the border only holds the layout.
    borderColor: wash,
    color: `color-mix(in srgb, ${hue} 55%, var(--csui-text))`,
  };
}

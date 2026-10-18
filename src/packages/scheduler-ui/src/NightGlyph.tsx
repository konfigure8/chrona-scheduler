/**
 * Moon glyph on night shifts (night rules design, D6): Fluent's
 * weather_moon 16 Filled icon, colored by currentColor at full strength
 * so it reads on every chip. The svg <title> is the native hover
 * tooltip; the shift's own accessible label names it a night shift.
 */
export function NightGlyph({ size = 12, title }: { readonly size?: number; readonly title?: string }): JSX.Element {
  return (
    <svg aria-hidden="true" className="chrona-sched__night" fill="currentColor" height={size} viewBox="0 0 16 16" width={size}>
      {title ? <title>{title}</title> : null}
      <path d="M8 1a7 7 0 1 1-6.46 9.7A.5.5 0 0 1 2 10a6 6 0 0 0 5.53-8.3A.5.5 0 0 1 8 1" />
    </svg>
  );
}

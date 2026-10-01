/** Small pushpin glyph rendered on pinned items; colors via currentColor. */
export function PinGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="chrona-sched__pin"
      fill="currentColor"
      height="10"
      viewBox="0 0 16 16"
      width="10"
    >
      <path d="M10.2 1.2a1 1 0 0 1 1.4 0l3.2 3.2a1 1 0 0 1 0 1.4l-.9.9a1 1 0 0 1-1 .25l-2.4 2.4.3 1.8a1 1 0 0 1-.28.88l-.6.6a1 1 0 0 1-1.4 0L6.3 10.4l-3.6 3.6a.75.75 0 0 1-1.06-1.06l3.6-3.6-2.17-2.18a1 1 0 0 1 0-1.41l.6-.6a1 1 0 0 1 .88-.28l1.8.3 2.4-2.4a1 1 0 0 1 .25-1z" />
    </svg>
  );
}

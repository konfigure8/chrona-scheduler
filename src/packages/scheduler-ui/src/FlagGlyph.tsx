/**
 * Flag glyph on generation-flagged shifts (domain model 6.4). The
 * svg <title> doubles as the native hover tooltip and the
 * accessible name; the click path is the event dialog, which shows
 * the same reason as a banner.
 */
export function FlagGlyph({ title }: { readonly title?: string }): JSX.Element {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      className="chrona-sched__flag"
      fill="currentColor"
      height="10"
      role={title ? "img" : undefined}
      viewBox="0 0 16 16"
      width="10"
    >
      {title ? <title>{title}</title> : null}
      <path d="M3.75 1a.75.75 0 0 0-.75.75V15a.75.75 0 0 0 1.5 0V9.5h8.3a.6.6 0 0 0 .47-.98L11.3 6l1.97-2.52a.6.6 0 0 0-.47-.98H4.5V1.75A.75.75 0 0 0 3.75 1Z" />
    </svg>
  );
}

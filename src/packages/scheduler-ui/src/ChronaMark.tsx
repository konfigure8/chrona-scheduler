import * as React from "react";

/*
 * The Chrona brand mark (Docs/assets/design.png): a rounded "C"
 * frame holding gantt bars - the icon IS a schedule. Fixed brand
 * colors by design: this mark renders identically in every host
 * theme. Part of the PROPOSED (not ratified) branded conversion
 * dialog.
 */

export function ChronaMark(props: {
  readonly size?: number;
  /** "dark" = the brand sheet's LOGO ON DARK lockup (navy grounds). */
  readonly variant?: "dark" | "light";
}): JSX.Element {
  const size = props.size ?? 28;
  const onDark = props.variant === "dark";
  const frame = onDark ? "#4F8BFF" : "#2563EB";
  const inkBar = onDark ? "#FFFFFF" : "#0F172A";
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <path
        d="M23 3.5H11a7 7 0 0 0-7 7v11a7 7 0 0 0 7 7h12"
        stroke={frame}
        strokeLinecap="round"
        strokeWidth="4"
      />
      <rect fill={inkBar} height="3.6" rx="1.8" width="7.5" x="10" y="9.2" />
      <rect fill="#4F8BFF" height="3.6" rx="1.8" width="4.5" x="19" y="9.2" />
      <rect fill={inkBar} height="3.6" rx="1.8" width="4.5" x="10" y="14.2" />
      <rect fill="#4F8BFF" height="3.6" rx="1.8" width="6" x="16" y="14.2" />
      <rect fill={inkBar} height="3.6" rx="1.8" width="6" x="10" y="19.2" />
    </svg>
  );
}

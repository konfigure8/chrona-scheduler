import * as React from "react";

import { useSchedulerStrings } from "./strings";

/*
 * The conversion explainer's sample boards (F22, design ratified
 * 2026-09-01): fictional miniature schedules drawn in the product's
 * own visual grammar. The counting rule is literal - red bar = one
 * conflict, dashed slot = one open item - so the caption under each
 * board is a count of what the viewer can see. Brand-fixed colors by
 * design: this surface is the ratified branded exception.
 */

const AVATARS = [
  { fill: "#E0E7FF", initials: "AM", text: "#4338CA" },
  { fill: "#DCFCE7", initials: "JR", text: "#15803D" },
  { fill: "#FEF3C7", initials: "KB", text: "#B45309" },
  { fill: "#CCFBF1", initials: "TL", text: "#0F766E" },
] as const;

const ROW_Y = [36, 66, 96, 126] as const;
const AXIS_X = [56, 116, 180, 240] as const;
const GRID_X = [66, 128, 190, 252] as const;

function BoardFrame(props: {
  readonly children: React.ReactNode;
  readonly testId: string;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const axisLabels = strings.conversionAxisLabels.split("|");
  return (
    <svg
      className="chrona-sched__conversion-board"
      data-testid={props.testId}
      fill="none"
      viewBox="0 0 290 152"
    >
      {axisLabels.slice(0, 4).map((label, index) => (
        <text
          fill="#94A3B8"
          fontSize="9"
          fontWeight="600"
          key={label + String(index)}
          x={AXIS_X[index]}
          y="12"
        >
          {label}
        </text>
      ))}
      {GRID_X.map((x) => (
        <line key={x} stroke="#EDF1F5" x1={x} x2={x} y1="20" y2="144" />
      ))}
      {AVATARS.map((avatar, index) => (
        <React.Fragment key={avatar.initials}>
          <circle cx="16" cy={ROW_Y[index]} fill={avatar.fill} r="12" />
          <text
            fill={avatar.text}
            fontSize="9"
            fontWeight="700"
            textAnchor="middle"
            x="16"
            y={(ROW_Y[index] ?? 0) + 3.5}
          >
            {avatar.initials}
          </text>
        </React.Fragment>
      ))}
      {props.children}
    </svg>
  );
}

function Bar(props: {
  readonly kind: "conflict" | "open" | "solid" | "soft";
  readonly row: number;
  readonly width: number;
  readonly x: number;
}): JSX.Element {
  const y = (ROW_Y[props.row] ?? 0) - 6.5;
  if (props.kind === "open") {
    return (
      <rect
        fill="rgba(148,163,184,.10)"
        height="13"
        rx="6.5"
        stroke="#94A3B8"
        strokeDasharray="4 3.5"
        strokeWidth="1.3"
        width={props.width}
        x={props.x}
        y={y}
      />
    );
  }
  if (props.kind === "conflict") {
    return (
      <rect
        fill="#FCA5A5"
        height="13"
        rx="6.5"
        stroke="#DC2626"
        strokeWidth="1.4"
        width={props.width}
        x={props.x}
        y={y}
      />
    );
  }
  return (
    <rect
      fill={props.kind === "solid" ? "#2563EB" : "#4F8BFF"}
      height="13"
      rx="6.5"
      width={props.width}
      x={props.x}
      y={y}
    />
  );
}

/** Before: 3 conflicts (red), 2 open items (dashed), grays at rest. */
export function ConversionBoardBefore(): JSX.Element {
  return (
    <BoardFrame testId="conversion-board-before">
      <rect fill="#94A3B8" height="13" rx="6.5" width="62" x="38" y="29.5" />
      <Bar kind="conflict" row={0} width={64} x={94} />
      <rect fill="#94A3B8" height="13" rx="6.5" width="44" x="186" y="29.5" />
      <Bar kind="conflict" row={0} width={44} x={216} />
      <rect fill="#94A3B8" height="13" rx="6.5" width="64" x="62" y="59.5" />
      <rect fill="#94A3B8" height="13" rx="6.5" width="52" x="132" y="59.5" />
      <Bar kind="conflict" row={1} width={42} x={176} />
      <Bar kind="open" row={2} width={56} x={76} />
      <Bar kind="open" row={3} width={56} x={134} />
    </BoardFrame>
  );
}

/** After: the same work, separated and filled - all brand blues. */
export function ConversionBoardAfter(): JSX.Element {
  return (
    <BoardFrame testId="conversion-board-after">
      <Bar kind="solid" row={0} width={56} x={38} />
      <Bar kind="soft" row={0} width={56} x={102} />
      <Bar kind="solid" row={0} width={52} x={166} />
      <Bar kind="soft" row={1} width={64} x={62} />
      <Bar kind="solid" row={1} width={64} x={134} />
      <Bar kind="solid" row={2} width={56} x={76} />
      <Bar kind="soft" row={3} width={56} x={134} />
    </BoardFrame>
  );
}

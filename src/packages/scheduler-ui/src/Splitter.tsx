import * as React from "react";

export interface VerticalSplitterProps {
  readonly ariaLabel: string;
  readonly className?: string;
  /** Double-click restores this width (Bryntum convention). */
  readonly defaultValue: number;
  readonly max: number;
  readonly min: number;
  readonly onChange: (next: number) => void;
  readonly style?: React.CSSProperties;
  /** Converts a pointer clientX into the proposed width. */
  readonly toWidth: (clientX: number) => number;
  readonly value: number;
}

const keyboardStepPx = 16;

/**
 * Accessible column-resize handle: pointer drag with capture, arrow
 * keys for keyboard users, double-click to reset. The host applies the
 * width live and owns persistence.
 */
export function VerticalSplitter(props: VerticalSplitterProps): JSX.Element {
  const { ariaLabel, defaultValue, max, min, onChange, toWidth, value } =
    props;
  const [dragging, setDragging] = React.useState(false);

  const clamp = React.useCallback(
    (next: number): number => Math.min(max, Math.max(min, Math.round(next))),
    [max, min],
  );

  const handlePointerDown = (
    downEvent: React.PointerEvent<HTMLDivElement>,
  ): void => {
    if (downEvent.button !== 0) {
      return;
    }
    downEvent.preventDefault();
    downEvent.stopPropagation();
    downEvent.currentTarget.setPointerCapture(downEvent.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (
    moveEvent: React.PointerEvent<HTMLDivElement>,
  ): void => {
    if (!dragging) {
      return;
    }
    onChange(clamp(toWidth(moveEvent.clientX)));
  };

  const endDrag = (upEvent: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) {
      return;
    }
    setDragging(false);
    upEvent.currentTarget.releasePointerCapture(upEvent.pointerId);
  };

  const handleKeyDown = (
    keyEvent: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (keyEvent.key === "ArrowLeft" || keyEvent.key === "ArrowRight") {
      keyEvent.preventDefault();
      const direction = keyEvent.key === "ArrowRight" ? 1 : -1;
      onChange(clamp(value + direction * keyboardStepPx));
    }
    if (keyEvent.key === "Home") {
      keyEvent.preventDefault();
      onChange(clamp(defaultValue));
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={[
        "chrona-sched__splitter",
        dragging ? "chrona-sched__splitter--active" : "",
        props.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDoubleClick={() => onChange(clamp(defaultValue))}
      onKeyDown={handleKeyDown}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      role="separator"
      style={props.style}
      tabIndex={0}
    />
  );
}

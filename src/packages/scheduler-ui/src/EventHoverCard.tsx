import * as React from "react";

import { useBoardHourFormat } from "./boardLocale";
import { dateNamesFrom } from "./dateNames";
import { FlagGlyph } from "./FlagGlyph";
import { useBoardExtension } from "./extension";
import { hoverCardModel, type HoverCardEntry } from "./hoverCard";
import { NightGlyph } from "./NightGlyph";
import { PinGlyph } from "./PinGlyph";
import { ShiftMarkNote, useShiftMarks } from "./ShiftMark";
import { openKindOf } from "./solve";
import { flagReasonText } from "./stringResources";
import { useSchedulerStrings } from "./strings";

import type {
  SchedulerResource,
  SchedulerUiEvent,
} from "./types";

export interface HoverAnchorRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface EventHoverCardProps {
  /** Hovered element's rect in surface-wrapper coordinates. */
  readonly anchor: HoverAnchorRect;
  /** Surface wrapper size used to keep the card fully visible. */
  readonly bounds: { readonly height: number; readonly width: number };
  readonly event: SchedulerUiEvent;
  readonly resource: SchedulerResource | undefined;
  /** The pointer came onto the card (a mark with an action): the board keeps it open. */
  readonly onPointerEnter?: () => void;
  /** The pointer left the card: the board closes it. */
  readonly onPointerLeave?: () => void;
  /** The mark's action ran: the board closes the card first. */
  readonly onAction?: () => void;
  /** The board's time zone, as the toolbar's chip names it. Absent = the board shows none. */
  readonly timeZoneLabel?: string;
}

const beakSize = 8;
const edgePadding = 8;

/**
 * Bryntum-style hover card anchored to the hovered item with a beak
 * touching it: above when there is room, flipped below otherwise, and
 * clamped inside the surface so it can never be cut off.
 */
export function EventHoverCard(props: EventHoverCardProps): JSX.Element {
  const { anchor, bounds, event, resource } = props;
  const strings = useSchedulerStrings();
  const hourFormat = useBoardHourFormat();
  const dateNames = dateNamesFrom(strings);
  const shiftMark = useShiftMarks()(event);
  const extension = useBoardExtension();
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = React.useState<{
    readonly beakLeft: number;
    readonly below: boolean;
    readonly left: number;
    readonly top: number;
  }>();

  React.useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const anchorCenterX = anchor.left + anchor.width / 2;
    const rawLeft = anchorCenterX - cardWidth / 2;
    const left = Math.max(
      edgePadding,
      Math.min(rawLeft, bounds.width - cardWidth - edgePadding),
    );
    const below = anchor.top - cardHeight - beakSize < edgePadding;
    const top = below
      ? anchor.top + anchor.height + beakSize
      : anchor.top - cardHeight - beakSize;
    const beakLeft = Math.max(
      14,
      Math.min(anchorCenterX - left - beakSize, cardWidth - 14 - beakSize * 2),
    );
    setPlacement({ beakLeft, below, left, top });
  }, [anchor, bounds]);

  // An extension's own lines take the fields' place (BoardExtension.hoverEntries).
  const extensionEntries = extension?.hoverEntries?.(event);
  const model = hoverCardModel(event, {
    dateNames,
    ...(extensionEntries ? { extensionEntries } : {}),
    hourFormat,
    openWork: event.onCall === true || openKindOf(event, extension?.openShift) !== undefined,
    ...(resource ? { resourceName: resource.name } : {}),
    strings,
    ...(props.timeZoneLabel ? { timeZoneLabel: props.timeZoneLabel } : {}),
  });

  // A mark with an action makes the card one to point at: it takes the pointer and offers the action as a link.
  const action = shiftMark?.action;
  return (
    <div
      className={[
        "chrona-sched__hover-card",
        placement?.below ? "chrona-sched__hover-card--below" : undefined,
        action ? "chrona-sched__hover-card--action" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="event-hover-card"
      onMouseEnter={action ? props.onPointerEnter : undefined}
      onMouseLeave={action ? props.onPointerLeave : undefined}
      ref={cardRef}
      style={{
        left: placement?.left ?? anchor.left,
        top: placement?.top ?? anchor.top,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      {/* The status as a chip beside the title, never also as a row; pinned as a mark (Matt 2026-11-13). */}
      <div className="chrona-sched__hover-card-head">
        <span className="chrona-sched__hover-card-title">{model.title}</span>
        {model.status ? (
          <span
            className={`chrona-sched__hover-card-status chrona-sched__hover-card-status--${model.status.tone}`}
            data-testid="hover-card-status"
          >
            {model.status.text}
          </span>
        ) : null}
        {model.pinned ? (
          <span aria-label={strings.hoverPinned} className="chrona-sched__hover-card-pin" data-testid="hover-card-pinned" role="img">
            <PinGlyph />
          </span>
        ) : null}
      </div>
      {model.chips.length > 0 ? (
        <div className="chrona-sched__hover-card-chips" data-testid="hover-card-chips">
          {model.chips.map((chip) => (
            <span className="chrona-sched__hover-card-chip" data-kind={chip.kind} key={chip.kind}>
              {chip.kind === "night" ? <NightGlyph /> : null}
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {shiftMark ? <ShiftMarkNote className="chrona-sched__hover-card-mark" mark={shiftMark} /> : null}
      {action ? (
        <button
          className="chrona-sched__hover-card-action"
          data-testid="hover-card-action"
          onClick={() => {
            props.onAction?.();
            action.run();
          }}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
      <HoverCardRows entries={model.when} testId="hover-card-when" />
      <HoverCardRows entries={model.details} testId="hover-card-details" />
      {event.flag ? (
        <p className="chrona-sched__hover-card-note">
          <FlagGlyph />
          <span>{flagReasonText(strings, event.flag)}</span>
        </p>
      ) : null}
      <span
        aria-hidden="true"
        className="chrona-sched__hover-card-beak"
        style={{ left: placement?.beakLeft ?? 14 }}
      />
    </div>
  );
}

/** One block of the card's rows, under a rule: each row's label over its value, or over its tags. */
function HoverCardRows({ entries, testId }: { readonly entries: readonly HoverCardEntry[]; readonly testId: string }): JSX.Element {
  return (
    <dl className="chrona-sched__hover-card-grid" data-testid={testId}>
      {entries.map((entry, index) => (
        <div className={entry.wide ? "chrona-sched__hover-card-wide" : undefined} key={`${entry.label}-${index}`}>
          <dt>{entry.label}</dt>
          {entry.tags && entry.tags.length > 0 ? (
            <dd aria-label={entry.value} className="chrona-sched__hover-card-tags">
              {entry.tags.map((tag, tagIndex) => (
                <span
                  className={tag.look === "filled" ? "chrona-sched__tag chrona-sched__tag--filled" : "chrona-sched__tag"}
                  data-look={tag.look ?? "outline"}
                  key={`${tag.label}-${tagIndex}`}
                  title={tag.label}
                >
                  {tag.label}
                </span>
              ))}
            </dd>
          ) : (
            <dd>{entry.value}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

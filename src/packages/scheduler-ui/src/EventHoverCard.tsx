import * as React from "react";

import { useBoardHourFormat } from "./boardLocale";
import { spanMinutes, workedMinutes } from "./spans";
import { dateNamesFrom, formatDayTimeLabel } from "./dateNames";
import { FlagGlyph } from "./FlagGlyph";
import { useBoardExtension } from "./extension";
import { ShiftMarkNote, useShiftMarks } from "./ShiftMark";
import { openKindOf } from "./solve";
import { flagReasonText, formatString, type SchedulerStrings } from "./stringResources";
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
}

const beakSize = 8;
const edgePadding = 8;

type DurationWords = Pick<SchedulerStrings, "hoverHours" | "hoverHoursMinutes" | "hoverWorkedSpan">;

/**
 * Hours and minutes in the board's language (W2-P12: never the component's own "h" and "m"). One amount never splits
 * over two lines ("8 Std. 30 Min."): its spaces are no-break spaces. The Unscheduled panel uses it too.
 */
export function formatHoursMinutes(totalMinutes: number, words: Pick<SchedulerStrings, "hoverHours" | "hoverHoursMinutes">): string {
  const minutes = Math.round(totalMinutes);
  const hours = String(Math.floor(minutes / 60));
  const rest = minutes % 60;
  const amount = rest === 0 ? formatString(words.hoverHours, { hours }) : formatString(words.hoverHoursMinutes, { hours, minutes: String(rest) });
  return amount.replace(/ /g, "\u00a0");
}

/**
 * Duration means TIME WORKED, which for a shift with rostered gaps is not
 * the envelope: a chef on 9-2 then 5-10 works 10h across a 13h span, and
 * reporting 13h would overstate every split shift on the board. The span
 * is still shown, in brackets, because it is the number span-of-hours
 * rules care about (Docs/domain_model.md section 4).
 */
function formatDuration(event: SchedulerUiEvent, words: DurationWords): string {
  const worked = formatHoursMinutes(workedMinutes(event), words);
  const span = spanMinutes(event);
  if (Math.round(workedMinutes(event)) === Math.round(span)) {
    return worked;
  }
  return formatString(words.hoverWorkedSpan, { span: formatHoursMinutes(span, words), worked });
}

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

  const entries: readonly { readonly label: string; readonly value: string; readonly wide?: boolean }[] =
    [
      { label: strings.start, value: formatDayTimeLabel(event.start, dateNames, hourFormat) },
      { label: strings.duration, value: formatDuration(event, strings) },
      {
        label: strings.assignedTo,
        value:
          event.status === "needsCover"
            ? event.onCall === true || openKindOf(event, extension?.openShift) !== undefined
              ? strings.unassigned
              : strings.needsCover
            : (resource?.name ?? event.resourceId),
      },
      ...(event.requiredTags && event.requiredTags.length > 0
        ? [{ label: strings.requiredSkills, value: event.requiredTags.join(", ") }]
        : []),
      // An extension's own lines take the fields' place (BoardExtension.hoverEntries).
      ...(extension?.hoverEntries?.(event) ?? event.fields ?? []),
    ];

  return (
    <div
      className={
        placement?.below
          ? "chrona-sched__hover-card chrona-sched__hover-card--below"
          : "chrona-sched__hover-card"
      }
      ref={cardRef}
      style={{
        left: placement?.left ?? anchor.left,
        top: placement?.top ?? anchor.top,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      <div className="chrona-sched__hover-card-title">{event.title}</div>
      {shiftMark ? <ShiftMarkNote className="chrona-sched__hover-card-mark" mark={shiftMark} /> : null}
      <dl className="chrona-sched__hover-card-grid">
        {entries.map((entry, index) => (
          <div className={entry.wide ? "chrona-sched__hover-card-wide" : undefined} key={`${entry.label}-${index}`}>
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
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

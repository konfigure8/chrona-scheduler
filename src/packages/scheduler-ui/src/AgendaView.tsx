import * as React from "react";

import { useBoardHourFormat } from "./boardLocale";
import { formatClockRange } from "./clock";
import { dateNamesFrom } from "./dateNames";
import { groupEventsByDay } from "./monthLayout";
import { useOpenShiftKind } from "./ShiftMark";
import { isOpenOnCall, openKindOf } from "./solve";
import { useSchedulerStrings } from "./strings";
import { eventIntersectsWindow } from "./timelineLayout";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface AgendaViewProps {
  readonly events: readonly SchedulerUiEvent[];
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly resources: readonly SchedulerResource[];
  readonly window: TimeWindow;
}

export function AgendaView(props: AgendaViewProps): JSX.Element {
  const { events, onEventClick, resources, window } = props;
  const strings = useSchedulerStrings();
  const hourFormat = useBoardHourFormat();
  const kindOf = useOpenShiftKind();
  const formatTimeRange = (event: SchedulerUiEvent): string => formatClockRange(event.start, event.end, hourFormat);
  const resourcesById = React.useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  );
  const groups = React.useMemo(
    () =>
      groupEventsByDay(
        events.filter((event) => eventIntersectsWindow(event, window)),
        dateNamesFrom(strings),
        kindOf,
      ),
    [events, kindOf, window, strings],
  );

  return (
    <div className="chrona-sched__agenda">
      {groups.length === 0 ? (
        <p className="chrona-sched__unscheduled-empty">
          {strings.agendaEmpty}
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group.date.getTime()}>
          <h3 className="chrona-sched__agenda-day">{group.label}</h3>
          <ul className="chrona-sched__agenda-list">
            {group.events.map((event) => (
              <li key={event.id}>
                <button
                  className="chrona-sched__agenda-item"
                  onClick={
                    onEventClick ? () => onEventClick(event) : undefined
                  }
                  type="button"
                >
                  <span className="chrona-sched__agenda-time">
                    {formatTimeRange(event)}
                  </span>
                  <span className="chrona-sched__agenda-title">
                    {event.title}
                  </span>
                  <span className="chrona-sched__agenda-resource">
                    {resourcesById.get(event.resourceId)?.name ??
                      (event.status === "needsCover" ? strings.unassigned : event.resourceId)}
                  </span>
                  {isOpenOnCall(event) ? (
                    <span className="chrona-sched__agenda-on-call">{strings.legendOnCall}</span>
                  ) : openKindOf(event, kindOf) ? (
                    <span className={`chrona-sched__agenda-${openKindOf(event, kindOf)?.kind ?? ""}`}>
                      {openKindOf(event, kindOf)?.label}
                    </span>
                  ) : event.status === "needsCover" ? (
                    <span className="chrona-sched__agenda-needs-cover">{strings.legendNeedsCover}</span>
                  ) : (
                    <span />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

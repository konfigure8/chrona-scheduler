import * as React from "react";

import { dateNamesFrom } from "./dateNames";
import { groupEventsByDay } from "./monthLayout";
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

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

export function AgendaView(props: AgendaViewProps): JSX.Element {
  const { events, onEventClick, resources, window } = props;
  const strings = useSchedulerStrings();
  const resourcesById = React.useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  );
  const groups = React.useMemo(
    () =>
      groupEventsByDay(
        events.filter((event) => eventIntersectsWindow(event, window)),
        dateNamesFrom(strings),
      ),
    [events, window, strings],
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
                      event.resourceId}
                  </span>
                  {event.status === "needsCover" ? (
                    <span className="chrona-sched__agenda-needs-cover">
                      Needs cover
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

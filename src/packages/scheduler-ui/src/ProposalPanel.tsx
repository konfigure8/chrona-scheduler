import * as React from "react";

import { dateNamesFrom, formatDayLabel } from "./dateNames";
import type { ChangeVerdict } from "./interactions";
import type { ProposalChange } from "./solve";
import { formatString } from "./stringResources";
import { useSchedulerStrings } from "./strings";
import type { SchedulerUiEvent } from "./types";

export interface ProposalPanelEntry {
  readonly change: ProposalChange;
  /** The planner dropped this change; Apply leaves it out. */
  readonly dropped: boolean;
  /** The host's verdict on the proposed placement, when it has rules. */
  readonly verdict?: ChangeVerdict;
}

export interface ProposalPanelProps {
  readonly entries: readonly ProposalPanelEntry[];
  /** Bring the change into view on the board and select it. */
  readonly onFocus?: (change: ProposalChange) => void;
  readonly onToggleDrop: (change: ProposalChange) => void;
  readonly resourceNameById: ReadonlyMap<string, string>;
}

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

/**
 * The change list beside the board while a proposal is open (F31):
 * assigned, moved and unassigned items with where they go, where a
 * moved or unassigned item comes from, the host's notes, and the
 * blocked ones with their reason. Each entry focuses the board; Drop
 * and Keep decide it.
 */
export function ProposalPanel(props: ProposalPanelProps): JSX.Element {
  const strings = useSchedulerStrings();
  const names = React.useMemo(() => dateNamesFrom(strings), [strings]);
  const { entries, onFocus, onToggleDrop, resourceNameById } = props;

  const describe = (event: SchedulerUiEvent): string => {
    const person =
      event.status === "needsCover"
        ? strings.unassigned
        : (resourceNameById.get(event.resourceId) ?? event.resourceId);
    return `${person} · ${formatDayLabel(event.start, names)} ${formatTimeRange(event)}`;
  };

  const blocked = entries.filter((entry) => entry.verdict?.kind === "block");
  const assigned = entries.filter(
    (entry) => entry.verdict?.kind !== "block" && entry.change.kind === "assign",
  );
  const moved = entries.filter(
    (entry) => entry.verdict?.kind !== "block" && entry.change.kind === "move",
  );
  const unassigned = entries.filter(
    (entry) => entry.verdict?.kind !== "block" && entry.change.kind === "unassign",
  );

  const renderGroup = (
    label: string,
    group: readonly ProposalPanelEntry[],
    isBlocked: boolean,
  ): JSX.Element | null => {
    if (group.length === 0) {
      return null;
    }
    return (
      <div className="chrona-sched__proposal-group" key={label}>
        <div className="chrona-sched__unscheduled-group">
          {formatString(label, { count: String(group.length) })}
        </div>
        <ul className="chrona-sched__proposal-list">
          {group.map((entry) => {
            const { change } = entry;
            const note = entry.verdict?.reason;
            return (
              <li
                className={[
                  "chrona-sched__proposal-entry",
                  entry.dropped ? "chrona-sched__proposal-entry--dropped" : "",
                  isBlocked ? "chrona-sched__proposal-entry--blocked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-change-id={change.current.id}
                key={change.current.id}
              >
                <button
                  className="chrona-sched__proposal-item"
                  onClick={onFocus ? () => onFocus(change) : undefined}
                  type="button"
                >
                  <span className="chrona-sched__unscheduled-name">
                    {change.proposed.title}
                  </span>
                  <span className="chrona-sched__proposal-detail">
                    {describe(change.proposed)}
                  </span>
                  {change.kind === "move" || change.kind === "unassign" ? (
                    <span className="chrona-sched__proposal-was">
                      {formatString(strings.proposalWas, {
                        detail: describe(change.current),
                      })}
                    </span>
                  ) : null}
                  {note ? (
                    <span
                      className={
                        isBlocked
                          ? "chrona-sched__proposal-note--block"
                          : "chrona-sched__proposal-note--warn"
                      }
                    >
                      {note}
                    </span>
                  ) : null}
                </button>
                {isBlocked ? null : (
                  <button
                    className="chrona-sched__toolbar-button chrona-sched__proposal-drop"
                    data-testid={entry.dropped ? "proposal-keep" : "proposal-drop"}
                    onClick={() => onToggleDrop(change)}
                    type="button"
                  >
                    {entry.dropped
                      ? strings.proposalKeepChange
                      : strings.proposalDropChange}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <aside
      aria-label={strings.proposalPanelTitle}
      className="chrona-sched__proposal-panel"
      data-testid="proposal-panel"
    >
      <div className="chrona-sched__unscheduled-title">
        {strings.proposalPanelTitle}
      </div>
      {renderGroup(strings.proposalGroupAssigned, assigned, false)}
      {renderGroup(strings.proposalGroupMoved, moved, false)}
      {renderGroup(strings.proposalGroupUnassigned, unassigned, false)}
      {renderGroup(strings.proposalGroupBlocked, blocked, true)}
    </aside>
  );
}

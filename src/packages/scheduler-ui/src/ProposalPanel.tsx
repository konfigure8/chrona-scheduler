import { Button, Checkbox } from "@fluentui/react-components";
import * as React from "react";

import { formatHours } from "./compactChip";
import { dateNamesFrom, formatDayLabel } from "./dateNames";
import { proposalPeople, type ProposalChange } from "./solve";
import { formatString } from "./stringResources";
import { useSchedulerStrings } from "./strings";
import type { SchedulerUiEvent } from "./types";

export interface ProposalPanelEntry {
  readonly change: ProposalChange;
  /** The planner dropped this change; Apply leaves it out. */
  readonly dropped: boolean;
  /**
   * A double booking a drop causes, at the maker's overlap setting:
   * "block" means Apply leaves this change out.
   */
  readonly note?: { readonly kind: "block" | "warn"; readonly reason: string };
  /** Why the change is out of date; Apply leaves it out. */
  readonly outOfDate?: string;
}

export interface ProposalPanelProps {
  readonly entries: readonly ProposalPanelEntry[];
  readonly id?: string;
  /** Opened from the folded tab: over the board, not beside it. */
  readonly overlay?: boolean;
  /** Bring the change into view on the board and select it. */
  readonly onFocus?: (change: ProposalChange) => void;
  /** Keep every change that can still apply, or none of them. */
  readonly onKeepAll?: (keep: boolean) => void;
  readonly onToggleDrop: (change: ProposalChange) => void;
  readonly resourceNameById: ReadonlyMap<string, string>;
}

/** Up to this many changes the list is a checklist; above it, one line per person. */
export const PROPOSAL_CHECKLIST_LIMIT = 24;

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

/**
 * The change list beside the board while a proposal is open (F31):
 * assigned, moved and unassigned items with where they go, where a
 * moved or unassigned item comes from, any double booking a drop
 * causes, and the out-of-date ones with their reason. Each entry
 * focuses the board. Up to 24 changes it is a checklist: a Keep box
 * on each change, and Keep all or none. Above 24 it is one line per
 * person, with their shifts and hours; the shift's menu still drops
 * a change there.
 */
export function ProposalPanel(props: ProposalPanelProps): JSX.Element {
  const strings = useSchedulerStrings();
  const names = React.useMemo(() => dateNamesFrom(strings), [strings]);
  const { entries, onFocus, onKeepAll, onToggleDrop, resourceNameById } = props;
  const nameOf = (resourceId: string): string => resourceNameById.get(resourceId) ?? resourceId;

  const describe = (event: SchedulerUiEvent): string => {
    const person = event.status === "needsCover" ? strings.unassigned : nameOf(event.resourceId);
    return `${person} · ${formatDayLabel(event.start, names)} ${formatTimeRange(event)}`;
  };

  const outOfDate = entries.filter((entry) => entry.outOfDate !== undefined);
  const current = entries.filter((entry) => entry.outOfDate === undefined);
  const assigned = current.filter((entry) => entry.change.kind === "assign");
  const moved = current.filter((entry) => entry.change.kind === "move");
  const unassigned = current.filter((entry) => entry.change.kind === "unassign");
  const summarised = entries.length > PROPOSAL_CHECKLIST_LIMIT;
  const allKept = current.every((entry) => !entry.dropped);
  const heldBack = current.filter((entry) => entry.note?.kind === "block");

  const renderGroup = (
    label: string,
    group: readonly ProposalPanelEntry[],
    checklist: boolean,
    hint?: string,
  ): JSX.Element | null => {
    if (group.length === 0) {
      return null;
    }
    return (
      <div className="chrona-sched__proposal-group" key={label}>
        <div className="chrona-sched__unscheduled-group">
          {formatString(label, { count: String(group.length) })}
        </div>
        {hint ? <div className="chrona-sched__proposal-caption">{hint}</div> : null}
        <ul className="chrona-sched__proposal-list">
          {group.map((entry) => {
            const { change } = entry;
            const note = entry.outOfDate ?? entry.note?.reason;
            const blocks = entry.outOfDate !== undefined || entry.note?.kind === "block";
            return (
              <li
                className={[
                  "chrona-sched__proposal-entry",
                  entry.dropped ? "chrona-sched__proposal-entry--dropped" : "",
                  blocks ? "chrona-sched__proposal-entry--blocked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-change-id={change.current.id}
                key={change.current.id}
              >
                {checklist ? (
                  <Checkbox
                    aria-label={strings.proposalKeepChange}
                    checked={!entry.dropped}
                    className="chrona-sched__proposal-keep"
                    data-testid="proposal-keep-box"
                    onChange={() => onToggleDrop(change)}
                  />
                ) : null}
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
                        blocks
                          ? "chrona-sched__proposal-note--block"
                          : "chrona-sched__proposal-note--warn"
                      }
                    >
                      {note}
                    </span>
                  ) : null}
                </button>
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
      className={
        props.overlay
          ? "chrona-sched__proposal-panel chrona-sched__proposal-panel--overlay"
          : "chrona-sched__proposal-panel"
      }
      data-testid="proposal-panel"
      id={props.id}
    >
      <div className="chrona-sched__proposal-head">
        <div className="chrona-sched__unscheduled-title">{strings.proposalPanelTitle}</div>
        {!summarised && current.length > 0 && onKeepAll ? (
          <Button
            appearance="subtle"
            data-testid="proposal-keep-all"
            onClick={() => onKeepAll(!allKept)}
            size="small"
          >
            {allKept ? strings.proposalKeepNone : strings.proposalKeepAll}
          </Button>
        ) : null}
      </div>
      {summarised ? (
        <div className="chrona-sched__proposal-group" data-testid="proposal-people">
          <div className="chrona-sched__proposal-caption">
            {formatString(strings.proposalPerPerson, { count: String(entries.length) })}
          </div>
          <ul className="chrona-sched__proposal-list">
            {proposalPeople(
              current.map((entry) => entry.change),
              nameOf,
            ).map((line) => (
              <li className="chrona-sched__proposal-person" key={line.resourceId}>
                <span className="chrona-sched__unscheduled-name">{nameOf(line.resourceId)}</span>
                <span className="chrona-sched__proposal-detail">
                  {line.changes === 1
                    ? formatString(strings.proposalPersonShiftOne, {
                        hours: formatHours(line.minutes),
                      })
                    : formatString(strings.proposalPersonShifts, {
                        count: String(line.changes),
                        hours: formatHours(line.minutes),
                      })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {renderGroup(strings.proposalGroupAssigned, assigned, true)}
          {renderGroup(strings.proposalGroupMoved, moved, true)}
          {renderGroup(strings.proposalGroupUnassigned, unassigned, true)}
        </>
      )}
      {summarised
        ? renderGroup(strings.proposalHeldBack, heldBack, false, strings.proposalHeldBackHint)
        : null}
      {renderGroup(strings.proposalGroupOutOfDate, outOfDate, false)}
    </aside>
  );
}

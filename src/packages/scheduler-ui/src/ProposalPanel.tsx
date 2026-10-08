import { Button, Checkbox } from "@fluentui/react-components";
import {
  Checkmark16Regular,
  Dismiss12Regular,
  Dismiss16Regular,
  Info16Regular,
  Warning16Regular,
} from "@fluentui/react-icons";
import * as React from "react";

import { formatHours } from "./compactChip";
import { dateNamesFrom, formatDayLabel } from "./dateNames";
import { DRILL_DOWN_LIMIT, type DrillDownEntry, type ProposalReason } from "./proposalReasons";
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
  /** What the change fixes or adds, from the run's analysis; absent = no line. */
  readonly reason?: ProposalReason;
}

/** A breakdown row's shifts, at the top of the change list (design Pass 1 call 4). */
export interface ProposalDrillDown {
  readonly entries: readonly DrillDownEntry[];
  /** A new value moves focus to the group's heading. */
  readonly focusKey: number;
  readonly heading: string;
  readonly onClose: () => void;
  /** Bring the entry's shifts into view on the board and select them. */
  readonly onFocusEntry: (entry: DrillDownEntry) => void;
}

export interface ProposalPanelProps {
  /** Whether a change's shift can be asked "Why not…?" (not started, in the period). */
  readonly canAskWhyNot?: (change: ProposalChange) => boolean;
  /** The run was too large to explain: one note, and no reason lines (RR2-D8). */
  readonly countsOnly?: boolean;
  readonly drillDown?: ProposalDrillDown;
  readonly entries: readonly ProposalPanelEntry[];
  readonly id?: string;
  /** Opened from the folded tab: over the board, not beside it. */
  readonly overlay?: boolean;
  /** Bring the change into view on the board and select it. */
  readonly onFocus?: (change: ProposalChange) => void;
  /** "Why not…?" on a change; `origin` takes the focus back when the answer closes. */
  readonly onWhyNot?: (change: ProposalChange, origin: HTMLElement) => void;
  /** Keep every change that can still apply, or none of them. */
  readonly onKeepAll?: (keep: boolean) => void;
  readonly onToggleDrop: (change: ProposalChange) => void;
  /** The Must breaches each person's changes fix, for the line per person. */
  readonly personFixes?: ReadonlyMap<string, number>;
  readonly resourceNameById: ReadonlyMap<string, string>;
  /** The "Why not…?" group, at the top of the list (design DR2 call 1). */
  readonly whyNot?: React.ReactNode;
}

/** Up to this many changes the list is a checklist; above it, one line per person. */
export const PROPOSAL_CHECKLIST_LIMIT = 24;

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

/** A reason line: a 16px status icon and the reason, one treatment per state (design Pass 5). */
function ReasonLine(props: { readonly reason: ProposalReason }): JSX.Element {
  const { reason } = props;
  const Icon = reason.tone === "add" ? Dismiss16Regular : reason.tone === "strain" ? Warning16Regular : Checkmark16Regular;
  return (
    <span
      className={`chrona-sched__proposal-reason chrona-sched__proposal-reason--${reason.tone}`}
      data-testid="proposal-reason"
    >
      <Icon aria-hidden="true" className="chrona-sched__proposal-reason-icon" />
      <span>{reason.text}</span>
    </span>
  );
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
 *
 * With the run's analysis each change says what it fixes or adds, and
 * each person line how many Must breaches their changes fix (design
 * R10). A breakdown row opens its shifts as a group at the top, the
 * first 50 listed and the rest counted. Above the size limit the run
 * is counted, not explained, and one note says so.
 */
export function ProposalPanel(props: ProposalPanelProps): JSX.Element {
  const strings = useSchedulerStrings();
  const names = React.useMemo(() => dateNamesFrom(strings), [strings]);
  const { drillDown, entries, onFocus, onKeepAll, onToggleDrop, resourceNameById } = props;
  const nameOf = (resourceId: string): string => resourceNameById.get(resourceId) ?? resourceId;
  const drillHeading = React.useRef<HTMLDivElement | null>(null);
  const drillFocusKey = drillDown?.focusKey;
  React.useEffect(() => {
    if (drillFocusKey !== undefined) {
      drillHeading.current?.focus();
    }
  }, [drillFocusKey]);

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
            const askable = props.onWhyNot !== undefined && (props.canAskWhyNot?.(change) ?? true);
            const itemId = `chrona-change-${change.current.id}`;
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
                <span className="chrona-sched__proposal-body">
                  <button
                    className="chrona-sched__proposal-item"
                    id={itemId}
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
                    {entry.reason && !props.countsOnly ? <ReasonLine reason={entry.reason} /> : null}
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
                  {askable ? (
                    <Button
                      appearance="subtle"
                      aria-describedby={itemId}
                      className="chrona-sched__proposal-whynot"
                      data-testid="proposal-why-not"
                      onClick={(event) => props.onWhyNot?.(change, event.currentTarget)}
                      size="small"
                    >
                      {strings.menuWhyNot}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const drillGroup = (): JSX.Element | null => {
    if (!drillDown) {
      return null;
    }
    const listed = drillDown.entries.slice(0, DRILL_DOWN_LIMIT);
    const more = drillDown.entries.length - listed.length;
    return (
      <div className="chrona-sched__proposal-group chrona-sched__drill" data-testid="drill-group">
        <div className="chrona-sched__drill-head">
          <div
            className="chrona-sched__unscheduled-group chrona-sched__drill-heading"
            data-testid="drill-heading"
            ref={drillHeading}
            tabIndex={-1}
          >
            {drillDown.heading}
          </div>
          <Button
            appearance="subtle"
            aria-label={strings.close}
            data-testid="drill-close"
            icon={<Dismiss12Regular />}
            onClick={drillDown.onClose}
            size="small"
          />
        </div>
        <ul className="chrona-sched__proposal-list">
          {listed.map((entry) => (
            <li key={entry.key}>
              <button
                className="chrona-sched__drill-entry"
                data-testid="drill-entry"
                onClick={() => drillDown.onFocusEntry(entry)}
                type="button"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
        {more > 0 ? (
          <div className="chrona-sched__proposal-caption chrona-sched__drill-more" data-testid="drill-more">
            {formatString(strings.drillMore, { count: String(more) })}
          </div>
        ) : null}
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
      {props.countsOnly ? (
        <div
          className="chrona-sched__horizon-notice chrona-sched__proposal-notice"
          data-testid="counts-only-note"
          role="status"
        >
          <Info16Regular aria-hidden="true" className="chrona-sched__proposal-notice-icon" />
          <span>{strings.countsOnlyNote}</span>
        </div>
      ) : null}
      {props.whyNot}
      {drillGroup()}
      {summarised ? (
        <div className="chrona-sched__proposal-group" data-testid="proposal-people">
          <div className="chrona-sched__proposal-caption">
            {formatString(strings.proposalPerPerson, { count: String(entries.length) })}
          </div>
          <ul className="chrona-sched__proposal-list">
            {proposalPeople(
              current.map((entry) => entry.change),
              nameOf,
            ).map((line) => {
              const fixes = props.countsOnly ? 0 : (props.personFixes?.get(line.resourceId) ?? 0);
              return (
                <li className="chrona-sched__proposal-person" key={line.resourceId}>
                  <span className="chrona-sched__proposal-person-name">
                    <span className="chrona-sched__unscheduled-name">{nameOf(line.resourceId)}</span>
                    {fixes > 0 ? (
                      <ReasonLine
                        reason={{
                          text:
                            fixes === 1
                              ? strings.reasonPersonFixesOne
                              : formatString(strings.reasonPersonFixes, { count: String(fixes) }),
                          tone: "fix",
                        }}
                      />
                    ) : null}
                  </span>
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
              );
            })}
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

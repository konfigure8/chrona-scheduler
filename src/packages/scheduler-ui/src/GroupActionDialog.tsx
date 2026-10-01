import * as React from "react";

import {
  buildOffsetChanges,
  buildReassignChanges,
  dragResultChangesEvent,
  type OffsetUnit,
  type TimelineChange,
  type ValidateChange,
} from "./interactions";
import { rankResourcesByEligibility } from "./skills";
import { formatString, useSchedulerStrings } from "./strings";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

export type GroupActionKind = "move" | "reassign";

export interface GroupActionDialogProps {
  /** Unpinned, scheduled targets the action applies to. */
  readonly events: readonly SchedulerUiEvent[];
  readonly kind: GroupActionKind;
  readonly onApply: (changes: readonly TimelineChange[]) => void;
  readonly onClose: () => void;
  readonly resources: readonly SchedulerResource[];
  readonly validateChange?: ValidateChange;
}

/**
 * Field Service-style explicit group actions: "Move to..." shifts the
 * selection by a typed offset (no pixels involved - the target can be
 * off-screen); "Reassign to..." moves it onto another resource. The
 * verdict preview is LIVE - a blocked choice shows its reason before
 * Apply, and the reassign picker sorts eligible resources first with
 * mismatches annotated (never hidden: allow/warn/block stays the
 * host's rule, exactly like drag hatching).
 */
export function GroupActionDialog(props: GroupActionDialogProps): JSX.Element {
  const { events, kind, onApply, onClose, resources, validateChange } = props;
  const strings = useSchedulerStrings();
  const rankedResources = React.useMemo(
    () => rankResourcesByEligibility(resources, events),
    [resources, events],
  );
  const [amount, setAmount] = React.useState(1);
  const [unit, setUnit] = React.useState<OffsetUnit>("days");
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [resourceId, setResourceId] = React.useState(
    () => rankedResources[0]?.resource.id ?? "",
  );

  React.useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const outcome = React.useMemo(
    () =>
      kind === "move"
        ? buildOffsetChanges(
            events,
            { amount: Math.max(1, Math.round(amount)), direction, unit },
            validateChange,
          )
        : buildReassignChanges(events, resourceId, validateChange),
    [kind, events, amount, direction, unit, resourceId, validateChange],
  );
  const warning = outcome.blocked
    ? undefined
    : outcome.changes.find(
        (change) => change.verdict.kind === "warn" && change.verdict.reason,
      )?.verdict.reason;

  const apply = (): void => {
    if (outcome.blocked) {
      return;
    }
    const effective = outcome.changes.filter(
      (change) =>
        change.event && dragResultChangesEvent(change.event, change.result),
    );
    if (effective.length > 0) {
      onApply(effective);
    }
    onClose();
  };

  const optionLabel = (
    entry: (typeof rankedResources)[number],
  ): string => {
    if (entry.mismatchCount === 0) {
      return entry.resource.name;
    }
    const annotation =
      events.length === 1
        ? formatString(strings.optionMissingSkills, {
            skills: entry.missing.join(", "),
          })
        : formatString(strings.optionSkillMismatch, {
            count: entry.mismatchCount,
            total: events.length,
          });
    return `${entry.resource.name} - ${annotation}`;
  };

  const title =
    kind === "move" ? strings.moveDialogTitle : strings.reassignDialogTitle;

  return (
    <div className="chrona-sched__dialog-backdrop" role="presentation">
      <div aria-label={title} className="chrona-sched__dialog" role="dialog">
        <div className="chrona-sched__dialog-header">
          <span className="chrona-sched__dialog-title">{title}</span>
          <button
            aria-label={strings.close}
            className="chrona-sched__dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="chrona-sched__dialog-body">
          <p className="chrona-sched__dialog-count">
            {events.length === 1
              ? (events[0]?.title ?? "")
              : formatString(strings.itemsCount, { count: events.length })}
          </p>
          {kind === "move" ? (
            <>
              <label className="chrona-sched__dialog-field">
                <span>{strings.moveAmount}</span>
                <input
                  min={1}
                  onChange={(changeEvent) =>
                    setAmount(Number(changeEvent.target.value) || 1)
                  }
                  type="number"
                  value={amount}
                />
              </label>
              <label className="chrona-sched__dialog-field">
                <span>{strings.moveUnit}</span>
                <select
                  onChange={(changeEvent) =>
                    setUnit(changeEvent.target.value as OffsetUnit)
                  }
                  value={unit}
                >
                  <option value="hours">{strings.unitHours}</option>
                  <option value="days">{strings.unitDays}</option>
                  <option value="weeks">{strings.unitWeeks}</option>
                </select>
              </label>
              <label className="chrona-sched__dialog-field">
                <span>{strings.moveDirection}</span>
                <select
                  onChange={(changeEvent) =>
                    setDirection(
                      changeEvent.target.value === "earlier" ? -1 : 1,
                    )
                  }
                  value={direction === 1 ? "later" : "earlier"}
                >
                  <option value="later">{strings.directionLater}</option>
                  <option value="earlier">{strings.directionEarlier}</option>
                </select>
              </label>
            </>
          ) : (
            <label className="chrona-sched__dialog-field">
              <span>{strings.assignedTo}</span>
              <select
                onChange={(changeEvent) =>
                  setResourceId(changeEvent.target.value)
                }
                value={resourceId}
              >
                {rankedResources.map((entry) => (
                  <option key={entry.resource.id} value={entry.resource.id}>
                    {optionLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {outcome.blocked ? (
            <p className="chrona-sched__dialog-block" role="alert">
              {outcome.blocked.reason
                ? formatString(strings.noticeBlocked, {
                    reason: outcome.blocked.reason,
                  })
                : strings.dialogNotAllowed}
            </p>
          ) : null}
          {warning ? (
            <p className="chrona-sched__dialog-warn" role="status">
              {formatString(strings.noticeWarning, { reason: warning })}
            </p>
          ) : null}
        </div>
        <div className="chrona-sched__dialog-actions">
          <button
            className="chrona-sched__dialog-primary"
            disabled={outcome.blocked !== undefined}
            onClick={apply}
            type="button"
          >
            {strings.apply}
          </button>
          <button onClick={onClose} type="button">
            {strings.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

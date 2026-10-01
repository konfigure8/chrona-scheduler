import * as React from "react";

import type { RowDecoration } from "./decorations";
import { assignedHours, missingRequiredTags } from "./skills";
import { formatString, useSchedulerStrings } from "./strings";
import { tagClassName, tagPillStyle, type TagColorMap } from "./tagColors";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

/**
 * Curated staff picker for an unscheduled shift: qualified-and-free
 * people first (sorted by remaining contract hours), near misses
 * greyed with the reason, and a "show everyone" escape hatch. The
 * checks reuse the same primitives the drag rules run on - one
 * eligibility engine, two presentations.
 */
export interface AssignDialogProps {
  readonly decorations?: readonly RowDecoration[];
  readonly event: SchedulerUiEvent;
  readonly events: readonly SchedulerUiEvent[];
  readonly onAssign: (resourceId: string) => void;
  readonly onClose: () => void;
  readonly resources: readonly SchedulerResource[];
  readonly tagColors?: TagColorMap;
}

interface Candidate {
  readonly hoursLeft?: number;
  readonly reason?: string;
  readonly resource: SchedulerResource;
}

function formatRange(start: Date, end: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

/** Monday-start week containing the shift; capacity is weekly. */
function weekWindow(anchor: Date): { end: Date; start: Date } {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { end, start };
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function AssignDialog(props: AssignDialogProps): JSX.Element {
  const { decorations, event, events, onAssign, onClose, resources, tagColors } =
    props;
  const strings = useSchedulerStrings();
  const [query, setQuery] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | undefined>(
    undefined,
  );

  const week = React.useMemo(() => weekWindow(event.start), [event.start]);

  React.useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const candidates = React.useMemo(() => {
    const best: Candidate[] = [];
    const nearMiss: Candidate[] = [];
    const unqualified: Candidate[] = [];
    const eventHours =
      (event.end.getTime() - event.start.getTime()) / 3_600_000;
    for (const resource of resources) {
      const missing = missingRequiredTags(resource, event.requiredTags);
      if (missing.length > 0) {
        unqualified.push({
          reason: formatString(strings.assignReasonMissingSkill, {
            tag: missing.join(", "),
          }),
          resource,
        });
        continue;
      }
      const busy = events.find(
        (candidate) =>
          candidate.resourceId === resource.id &&
          candidate.status !== "needsCover" &&
          overlaps(candidate.start, candidate.end, event.start, event.end),
      );
      if (busy) {
        nearMiss.push({
          reason: formatString(strings.assignReasonBusy, {
            range: formatRange(busy.start, busy.end),
          }),
          resource,
        });
        continue;
      }
      const away = (decorations ?? []).find(
        (decoration) =>
          decoration.kind === "unavailable" &&
          decoration.resourceId === resource.id &&
          overlaps(decoration.start, decoration.end, event.start, event.end),
      );
      if (away) {
        nearMiss.push({
          reason: formatString(strings.assignReasonUnavailable, {
            range: formatRange(away.start, away.end),
          }),
          resource,
        });
        continue;
      }
      const worked = assignedHours(events, resource.id, week);
      const hoursLeft =
        resource.capacityHours !== undefined
          ? resource.capacityHours - worked
          : undefined;
      if (hoursLeft !== undefined && hoursLeft < eventHours) {
        nearMiss.push({
          hoursLeft,
          reason: formatString(strings.assignReasonHours, {
            capacity: resource.capacityHours ?? 0,
          }),
          resource,
        });
        continue;
      }
      best.push({ hoursLeft, resource });
    }
    best.sort(
      (first, second) =>
        (second.hoursLeft ?? Number.MAX_SAFE_INTEGER) -
        (first.hoursLeft ?? Number.MAX_SAFE_INTEGER),
    );
    return { best, nearMiss, unqualified };
  }, [decorations, event, events, resources, strings, week]);

  const matches = (candidate: Candidate): boolean =>
    candidate.resource.name.toLowerCase().includes(query.trim().toLowerCase());
  // Qualified people only by default - free ones selectable, blocked
  // ones dim with the reason. "Show everyone" reveals the unqualified.
  const best = candidates.best.filter(matches);
  const nearMiss = candidates.nearMiss.filter(matches);
  const unqualified = candidates.unqualified.filter(matches);
  const shownRest = showAll ? nearMiss.concat(unqualified) : nearMiss;
  const hiddenCount = showAll ? 0 : unqualified.length;
  const selected =
    best.find((candidate) => candidate.resource.id === selectedId) ??
    shownRest.find((candidate) => candidate.resource.id === selectedId);

  const renderCandidate = (
    candidate: Candidate,
    dimmed: boolean,
  ): JSX.Element => (
    <button
      aria-pressed={candidate.resource.id === selectedId}
      className={[
        "chrona-sched__assign-candidate",
        dimmed ? "chrona-sched__assign-candidate--dim" : "",
        candidate.resource.id === selectedId
          ? "chrona-sched__assign-candidate--selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="assign-candidate"
      key={candidate.resource.id}
      onClick={() => setSelectedId(candidate.resource.id)}
      type="button"
    >
      <span className="chrona-sched__assign-main">
        <span className="chrona-sched__assign-name">
          {candidate.resource.name}
        </span>
        <span className="chrona-sched__assign-meta">
          {candidate.reason ? (
            <span>{candidate.reason}</span>
          ) : (
            <>
              {candidate.resource.groups ? (
                <span>
                  {Object.values(candidate.resource.groups).join(" \u00b7 ")}
                </span>
              ) : null}
              {(candidate.resource.tags ?? []).map((tag) => {
                const pill = tagPillStyle(tag, tagColors);
                const note = candidate.resource.tagNotes?.[tag];
                return (
                  <span
                    className={tagClassName(
                      pill !== undefined,
                      note !== undefined,
                    )}
                    key={tag}
                    style={
                      note
                        ? { ...pill, borderColor: "var(--csui-warn)" }
                        : pill
                    }
                    title={note}
                  >
                    {tag}
                  </span>
                );
              })}
            </>
          )}
        </span>
      </span>
      {candidate.hoursLeft !== undefined &&
      candidate.resource.capacityHours !== undefined ? (
        <span className="chrona-sched__assign-hours">
          {formatString(strings.assignHoursLeft, {
            capacity: candidate.resource.capacityHours,
            left: Math.max(0, Math.round(candidate.hoursLeft * 10) / 10),
          })}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="chrona-sched__dialog-backdrop">
      <div
        aria-label={strings.assignTitle}
        className="chrona-sched__dialog chrona-sched__assign-dialog"
        aria-modal="true"
        data-testid="assign-dialog"
        role="dialog"
      >
        <div className="chrona-sched__dialog-header">
          <span className="chrona-sched__dialog-title">
            {strings.assignTitle}
          </span>
          <button
            aria-label={strings.close}
            className="chrona-sched__dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="chrona-sched__assign-shift">
          <span className="chrona-sched__assign-shift-title">
            {event.title}
          </span>
          <span className="chrona-sched__assign-shift-time">
            {formatRange(event.start, event.end)}
          </span>
          {(event.requiredTags ?? []).map((tag) => {
            const pill = tagPillStyle(tag, tagColors);
            return (
              <span
                className={
                  pill
                    ? "chrona-sched__tag chrona-sched__tag--colored"
                    : "chrona-sched__tag"
                }
                key={tag}
                style={pill}
              >
                {tag}
              </span>
            );
          })}
        </div>
        <input
          autoFocus
          className="chrona-sched__assign-search"
          data-testid="assign-search"
          onChange={(change) => setQuery(change.target.value)}
          placeholder={strings.assignSearchPlaceholder}
          type="search"
          value={query}
        />
        <div className="chrona-sched__assign-list">
          {best.length > 0 ? (
            <div className="chrona-sched__assign-section">
              {strings.assignBestOptions}
            </div>
          ) : null}
          {best.map((candidate) => renderCandidate(candidate, false))}
          {shownRest.length > 0 ? (
            <div className="chrona-sched__assign-section">
              {strings.assignNotAvailable}
            </div>
          ) : null}
          {shownRest.map((candidate) => renderCandidate(candidate, true))}
          {best.length === 0 && shownRest.length === 0 ? (
            <p className="chrona-sched__assign-empty">{strings.assignEmpty}</p>
          ) : null}
        </div>
        <div className="chrona-sched__dialog-actions chrona-sched__assign-foot">
          {hiddenCount > 0 ? (
            <button
              className="chrona-sched__assign-more"
              data-testid="assign-show-all"
              onClick={() => setShowAll(true)}
              type="button"
            >
              {formatString(strings.assignShowEveryone, {
                count: hiddenCount,
              })}
            </button>
          ) : null}
          <span className="chrona-sched__assign-spacer" />
          <button onClick={onClose} type="button">
            {strings.cancel}
          </button>
          <button
            className="chrona-sched__dialog-primary"
            data-testid="assign-confirm"
            disabled={!selected}
            onClick={() => selected && onAssign(selected.resource.id)}
            type="button"
          >
            {formatString(strings.assignAction, {
              name: selected?.resource.name ?? "",
            })}
          </button>
        </div>
      </div>
    </div>
  );
}

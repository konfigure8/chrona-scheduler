import * as React from "react";

import { flagReasonText, formatString, useSchedulerStrings } from "./strings";
import { tagPillStyle, type TagColorMap } from "./tagColors";

import {
  allowVerdict,
  type ChangeVerdict,
  type DragResult,
  type RuleResult,
  type ValidateChange,
} from "./interactions";
import type { TimelineChange } from "./ChronaTimeline";
import type {
  SchedulerResource,
  SchedulerUiEvent,
} from "./types";
import { isDeleteLocked, isPinned, showsPin } from "./locks";

export interface DraftEventInput {
  readonly end: Date;
  /** Skills chosen in the create dialog; the host persists them. */
  readonly requiredTags?: readonly string[];
  readonly resourceId: string;
  readonly start: Date;
  readonly title: string;
}

export interface EventDialogProps {
  /**
   * Selectable skill tags for the create and edit dialogs (chr_skill
   * names in the Dataverse host). Absent = no skills section; the
   * requirement describes the work, so the list is never filtered by
   * assignee.
   */
  readonly availableTags?: readonly string[];
  /** "single" makes the chips a one-of choice (a role); the default is many. */
  readonly tagMode?: "single" | "multiple";
  readonly editable?: boolean;
  readonly event: SchedulerUiEvent;
  /** "create" shows a name field, hides delete, and saves via onSaveDraft. */
  readonly mode?: "create" | "edit";
  readonly onClose: () => void;
  readonly onDeleteEvent?: (event: SchedulerUiEvent) => void;
  readonly onEventChange?: (change: TimelineChange) => void;
  /**
   * Edit-mode skill changes; the host persists them (junction rows in
   * the Dataverse adapter). Without this handler the edit dialog shows
   * no skills section - an affordance never renders without a home.
   */
  readonly onRequiredTagsChange?: (
    event: SchedulerUiEvent,
    tags: readonly string[],
  ) => void;
  /** A host that must wait first returns whether it saved; the dialog stays open until then. */
  readonly onSaveDraft?: (draft: DraftEventInput) => void | Promise<boolean>;
  /** Pin/unpin toggle rendered as an Unpin action wherever the pin mark shows. */
  readonly onTogglePin?: (event: SchedulerUiEvent) => void;
  /** Maker-configured colors for skill/tag pills. */
  readonly tagColors?: TagColorMap;
  readonly resources: readonly SchedulerResource[];
  readonly validateChange?: ValidateChange;
}

function toLocalInputValue(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Fluent-styled details/edit/create dialog: name, times, and assignment
 * editable; mapped fields and required skills read-only; saves through the
 * same verdict seam as drags. Create mode confirms a temporary draft - the
 * draft only materializes on Save.
 */
export function EventDialog(props: EventDialogProps): JSX.Element {
  const {
    availableTags,
    tagMode,
    editable = true,
    event,
    mode = "edit",
    onClose,
    onDeleteEvent,
    onEventChange,
    onRequiredTagsChange,
    onSaveDraft,
    onTogglePin,
    resources,
    tagColors,
    validateChange,
  } = props;
  const pinned = mode !== "create" && isPinned(event);
  const inputsDisabled = !editable || pinned;
  /*
   * One skills row: editable chips when a persistence path exists,
   * otherwise the read-only pills - never both.
   */
  const chipsShown =
    (mode === "create" || onRequiredTagsChange !== undefined) &&
    availableTags !== undefined &&
    availableTags.length > 0;
  const strings = useSchedulerStrings();
  const [title, setTitle] = React.useState(event.title);
  const [start, setStart] = React.useState(toLocalInputValue(event.start));
  const [end, setEnd] = React.useState(toLocalInputValue(event.end));
  const [resourceId, setResourceId] = React.useState(event.resourceId);
  const [selectedTags, setSelectedTags] = React.useState<readonly string[]>(
    event.requiredTags ?? [],
  );
  const [blockReason, setBlockReason] = React.useState<string | undefined>();
  // A save the host must wait for keeps the dialog open, so a refused
  // save keeps what was typed (the host's notice says why).
  const [saving, setSaving] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  /*
   * A refused save's reason is about the inputs as they were; any
   * input change invalidates it so a fixed dialog can save (the live
   * verdict keeps showing rule state meanwhile).
   */
  React.useEffect(() => {
    setBlockReason(undefined);
  }, [end, resourceId, selectedTags, start, title]);

  /*
   * Every verdict - live, save, and candidate ranking - judges the
   * PROPOSED state (chip selection included) in create and edit mode
   * alike, so a skill edit meets the same policy gate as a drag.
   */
  const proposedSubject = React.useMemo<SchedulerUiEvent>(
    () => ({
      ...event,
      requiredTags: selectedTags.length > 0 ? selectedTags : undefined,
    }),
    [event, selectedTags],
  );

  /*
   * Live verdict: warnings surface as the planner types, not after
   * Save vanished the dialog (warn-tier felt identical to off-tier
   * before this - found live in the F3 environment pass).
   */
  const liveVerdict = React.useMemo<ChangeVerdict>(() => {
    const parsedStart = new Date(start);
    const parsedEnd = new Date(end);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedEnd.getTime()) ||
      parsedEnd.getTime() <= parsedStart.getTime()
    ) {
      return allowVerdict;
    }
    return (
      validateChange?.(proposedSubject, {
        end: parsedEnd,
        resourceId,
        start: parsedStart,
      }) ?? allowVerdict
    );
  }, [end, proposedSubject, resourceId, start, validateChange]);

  /*
   * The banner list: every failed rule when the host provides them,
   * else the aggregate reason alone (single-reason hosts).
   */
  const liveResults = React.useMemo<readonly RuleResult[]>(() => {
    if (liveVerdict.results) {
      return liveVerdict.results;
    }
    if (liveVerdict.kind !== "allow" && liveVerdict.reason) {
      return [
        {
          kind: liveVerdict.kind,
          reason: liveVerdict.reason,
          scope: "person",
        },
      ];
    }
    return [];
  }, [liveVerdict]);

  /*
   * "Best options" = the people with no person-scoped failures at the
   * proposed times with the proposed skills (got the skills, not
   * already assigned, within policy); the rest sit under "Other"
   * (still selectable - the save gate decides). Both groups keep the
   * host's resource order.
   */
  const candidateGroups = React.useMemo<
    | {
        readonly best: readonly SchedulerResource[];
        readonly other: readonly SchedulerResource[];
      }
    | undefined
  >(() => {
    if (!validateChange) {
      return undefined;
    }
    const parsedStart = new Date(start);
    const parsedEnd = new Date(end);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedEnd.getTime()) ||
      parsedEnd.getTime() <= parsedStart.getTime()
    ) {
      return undefined;
    }
    const best: SchedulerResource[] = [];
    const other: SchedulerResource[] = [];
    for (const resource of resources) {
      // One verdict per person; the host's validateChange indexes its
      // own data (on-demand evaluation), so this loop stays linear in
      // people, not people x events.
      const verdict = validateChange(proposedSubject, {
        end: parsedEnd,
        resourceId: resource.id,
        start: parsedStart,
      });
      // Item-scoped failures (outside hours) hold for everyone, so
      // only person-scoped results decide who fits; single-reason
      // hosts fall back to the aggregate kind.
      const personClean = verdict.results
        ? !verdict.results.some((result) => result.scope === "person")
        : verdict.kind === "allow";
      (personClean ? best : other).push(resource);
    }
    return { best, other };
  }, [end, proposedSubject, resources, start, validateChange]);

  React.useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const save = (): void => {
    const parsedStart = new Date(start);
    const parsedEnd = new Date(end);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedEnd.getTime()) ||
      parsedEnd.getTime() <= parsedStart.getTime()
    ) {
      setBlockReason(strings.dialogFinishAfterStart);
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setBlockReason(strings.dialogNameRequired);
      return;
    }
    const result: DragResult = {
      end: parsedEnd,
      resourceId,
      start: parsedStart,
    };
    const verdict: ChangeVerdict =
      validateChange?.(proposedSubject, result) ?? allowVerdict;
    if (verdict.kind === "block") {
      setBlockReason(
        verdict.reason
          ? formatString(strings.noticeBlocked, { reason: verdict.reason })
          : strings.dialogNotAllowed,
      );
      return;
    }
    if (mode === "create") {
      const outcome: unknown = onSaveDraft?.({
        end: parsedEnd,
        requiredTags:
          selectedTags.length > 0 ? [...selectedTags].sort() : undefined,
        resourceId,
        start: parsedStart,
        title: trimmedTitle,
      });
      if (outcome instanceof Promise) {
        setSaving(true);
        void outcome.then(
          (saved: unknown) => {
            if (!mounted.current) {
              return;
            }
            setSaving(false);
            if (saved === true) {
              onClose();
            }
          },
          () => {
            if (mounted.current) {
              setSaving(false);
            }
          },
        );
        return;
      }
    } else {
      onEventChange?.({
        event,
        result,
        title: trimmedTitle !== event.title ? trimmedTitle : undefined,
        verdict,
      });
      const sortedSelection = [...selectedTags].sort();
      const original = [...(event.requiredTags ?? [])].sort();
      const tagsChanged =
        sortedSelection.length !== original.length ||
        sortedSelection.some((tag, index) => tag !== original[index]);
      if (onRequiredTagsChange && tagsChanged) {
        onRequiredTagsChange(event, sortedSelection);
      }
    }
    onClose();
  };

  return (
    <div className="chrona-sched__dialog-backdrop" role="presentation">
      <div
        aria-label={mode === "create" ? strings.draftItem : event.title}
        className="chrona-sched__dialog"
        role="dialog"
      >
        <div className="chrona-sched__dialog-header">
          <span className="chrona-sched__dialog-title">
            {mode === "create" ? strings.draftItem : event.title}
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
        <div className="chrona-sched__dialog-body">
          <label className="chrona-sched__dialog-field">
            <span>{strings.name}</span>
            <input
              disabled={inputsDisabled}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              type="text"
              value={title}
            />
          </label>
          <label className="chrona-sched__dialog-field">
            <span>{strings.start}</span>
            <input
              disabled={inputsDisabled}
              onChange={(changeEvent) => setStart(changeEvent.target.value)}
              type="datetime-local"
              value={start}
            />
          </label>
          <label className="chrona-sched__dialog-field">
            <span>{strings.finish}</span>
            <input
              disabled={inputsDisabled}
              onChange={(changeEvent) => setEnd(changeEvent.target.value)}
              type="datetime-local"
              value={end}
            />
          </label>
          <label className="chrona-sched__dialog-field">
            <span>{strings.assignedTo}</span>
            <select
              disabled={inputsDisabled}
              onChange={(changeEvent) => setResourceId(changeEvent.target.value)}
              value={resourceId}
            >
              {resources.every((resource) => resource.id !== event.resourceId) ? (
                <option value={event.resourceId}>
                  {event.status === "needsCover"
                    ? strings.needsCover
                    : strings.unassigned}
                </option>
              ) : null}
              {candidateGroups ? (
                <>
                  {candidateGroups.best.length > 0 ? (
                    <optgroup label={strings.dialogBestOptions}>
                      {candidateGroups.best.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {candidateGroups.other.length > 0 ? (
                    <optgroup label={strings.dialogOtherOptions}>
                      {candidateGroups.other.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </>
              ) : (
                resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))
              )}
            </select>
          </label>
          {chipsShown ? (
            <div className="chrona-sched__dialog-field chrona-sched__dialog-field--static">
              <span>{strings.requiredSkills}</span>
              <span
                className="chrona-sched__dialog-tags"
                role="group"
                aria-label={strings.requiredSkills}
              >
                {availableTags.map((tag) => {
                  const selected = selectedTags.includes(tag);
                  const pill = selected
                    ? tagPillStyle(tag, tagColors)
                    : undefined;
                  return (
                    <button
                      aria-pressed={selected}
                      className={
                        selected
                          ? "chrona-sched__tag chrona-sched__tag--colored chrona-sched__dialog-tag"
                          : "chrona-sched__tag chrona-sched__dialog-tag"
                      }
                      disabled={inputsDisabled}
                      key={tag}
                      onClick={() =>
                        setSelectedTags((previous) =>
                          previous.includes(tag)
                            ? previous.filter((candidate) => candidate !== tag)
                            : tagMode === "single"
                              ? [tag]
                              : [...previous, tag],
                        )
                      }
                      style={pill}
                      type="button"
                    >
                      {tag}
                    </button>
                  );
                })}
              </span>
            </div>
          ) : null}
          {!chipsShown && event.requiredTags && event.requiredTags.length > 0 ? (
            <div className="chrona-sched__dialog-field chrona-sched__dialog-field--static">
              <span>{strings.requiredSkills}</span>
              <span>
                {event.requiredTags.map((tag) => {
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
              </span>
            </div>
          ) : null}
          {(event.fields ?? []).map((field, index) => (
            <div
              className="chrona-sched__dialog-field chrona-sched__dialog-field--static"
              key={`${field.label}-${index}`}
            >
              <span>{field.label}</span>
              <span>{field.value}</span>
            </div>
          ))}
          {mode !== "create" && event.flag ? (
            <p className="chrona-sched__dialog-warn" role="status">
              {flagReasonText(strings, event.flag)}
            </p>
          ) : null}
          {blockReason ? (
            <p className="chrona-sched__dialog-block" role="alert">
              {blockReason}
            </p>
          ) : (
            liveResults.map((result) =>
              result.kind === "block" ? (
                <p
                  className="chrona-sched__dialog-block"
                  key={result.reason}
                  role="alert"
                >
                  {formatString(strings.noticeBlocked, {
                    reason: result.reason,
                  })}
                </p>
              ) : (
                <p
                  className="chrona-sched__dialog-warn"
                  key={result.reason}
                  role="status"
                >
                  {formatString(strings.noticeWarning, {
                    reason: result.reason,
                  })}
                </p>
              ),
            )
          )}
        </div>
        {pinned ? (
          <p className="chrona-sched__dialog-info">{strings.pinnedNotice}</p>
        ) : null}
        <div className="chrona-sched__dialog-actions">
          {editable && !pinned ? (
            <button
              className="chrona-sched__dialog-primary"
              disabled={saving}
              onClick={save}
              type="button"
            >
              {strings.save}
            </button>
          ) : null}
          {/* A pinned shift offers Unpin in place of Save. */}
          {editable && showsPin(event) && onTogglePin ? (
            <button
              className="chrona-sched__dialog-primary"
              onClick={() => {
                onTogglePin(event);
                onClose();
              }}
              type="button"
            >
              {strings.menuUnpin}
            </button>
          ) : null}
          {editable && mode === "edit" && onDeleteEvent && !isDeleteLocked(event) ? (
            <button
              className="chrona-sched__dialog-danger"
              onClick={() => {
                onDeleteEvent(event);
                onClose();
              }}
              type="button"
            >
              {strings.delete}
            </button>
          ) : null}
          <button onClick={onClose} type="button">
            {strings.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

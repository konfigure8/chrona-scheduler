import { Button, Combobox, Field, Option, Spinner } from "@fluentui/react-components";
import {
  ArrowRight16Regular,
  Checkmark16Regular,
  Dismiss12Regular,
  Dismiss16Regular,
  Info16Regular,
  Warning16Regular,
} from "@fluentui/react-icons";
import * as React from "react";

import { dateNamesFrom } from "./dateNames";
import type { ReviewRoster, WhyNotAnswer, WhyNotExtension } from "./extension";
import { useFullScreen } from "./fullScreen";
import type { RosterVersion } from "./solveClient";
import { formatString } from "./stringResources";
import { useSchedulerStrings } from "./strings";
import type { SchedulerResource, SchedulerUiEvent } from "./types";
import {
  whyNotLines,
  whyNotShiftLabel,
  whyNotVerdict,
  type WhyNotAction,
  type WhyNotLine,
  type WhyNotTone,
} from "./whyNot";

export interface WhyNotGroupProps {
  /** The action on the current roster for the person picked; absent in review. */
  readonly actionFor?: (resource: SchedulerResource) => WhyNotAction;
  /** The roster's version now, read when an answer arrives. */
  readonly currentRosterVersion: () => RosterVersion;
  readonly extension: WhyNotExtension;
  /** A new value moves focus to the picker. */
  readonly focusKey: number;
  readonly nameOf: (resourceId: string) => string;
  /** Writes an assign or a swap; the board closes the group. */
  readonly onAct: (action: Extract<WhyNotAction, { kind: "assign" | "swap" }>) => void;
  /** Escape or the close button; the board returns focus to where the question came from. */
  readonly onClose: () => void;
  /** Everyone the picker offers: the board's people but the shift's own, by name. */
  readonly people: readonly SchedulerResource[];
  readonly personMark?: (resource: SchedulerResource) => React.ReactNode;
  /** In review: no action; a change of the proposal says to hold it back. */
  readonly review?: { readonly isChange: boolean };
  /** The roster as it would be applied: the current one plus the kept changes. */
  readonly roster: ReviewRoster;
  readonly rosterVersion: RosterVersion;
  /** The shift asked about, as the roster holds it. */
  readonly shift: SchedulerUiEvent;
  readonly toInstant?: (display: Date) => Date;
}

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly pickedId: string; readonly version: RosterVersion }
  | {
      readonly answer: Extract<WhyNotAnswer, { status: "answered" }>;
      readonly kind: "answered";
      readonly pickedId: string;
      readonly version: RosterVersion;
    }
  | { readonly kind: "unavailable"; readonly pickedId: string; readonly retryAfterSeconds?: number }
  | { readonly kind: "readFailed"; readonly message: string; readonly pickedId: string }
  | { readonly kind: "rosterChanged"; readonly pickedId: string };

const ICONS: Record<WhyNotTone | "info", typeof Checkmark16Regular> = {
  add: Dismiss16Regular,
  fix: Checkmark16Regular,
  info: Info16Regular,
  move: ArrowRight16Regular,
  strain: Warning16Regular,
};

/** A line of the answer: the reason-line treatment, a 16px status icon and its text (design DR2 Pass 5). */
function Line(props: { readonly line: WhyNotLine }): JSX.Element {
  const Icon = ICONS[props.line.tone];
  return (
    <li
      className={`chrona-sched__proposal-reason chrona-sched__proposal-reason--${props.line.tone}`}
      data-testid="why-not-line"
    >
      <Icon aria-hidden="true" className="chrona-sched__proposal-reason-icon" />
      <span>{props.line.text}</span>
    </li>
  );
}

function Lines(props: { readonly lines: readonly WhyNotLine[] }): JSX.Element | null {
  return props.lines.length > 0 ? (
    <ul className="chrona-sched__proposal-list chrona-sched__whynot-lines">
      {props.lines.map((line, index) => (
        <Line key={`${line.tone}:${line.text}:${index}`} line={line} />
      ))}
    </ul>
  ) : null;
}

/**
 * The "Why not…?" group at the top of the change list (design DR2 calls
 * 1 to 4, 11, 12; Pass 6): the shift, a Combobox to pick a person, and
 * the answer, verdict first, in a polite live region. Each state is
 * shown: checking, the answer with what the board can offer, could not
 * check (with when, on a rate limit), a failed read, and a roster that
 * changed while the answer was out, which offers to ask again rather
 * than disappear. Escape closes it.
 */
export function WhyNotGroup(props: WhyNotGroupProps): JSX.Element {
  const strings = useSchedulerStrings();
  const names = React.useMemo(() => dateNamesFrom(strings), [strings]);
  const fullScreen = useFullScreen();
  const { people, shift } = props;
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [query, setQuery] = React.useState("");
  const [listOpen, setListOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const abortRef = React.useRef<AbortController | undefined>(undefined);
  const ids = React.useRef(`chrona-whynot-${Math.random().toString(36).slice(2)}`).current;
  // The latest props, for an answer that lands after a render.
  const latest = React.useRef(props);
  latest.current = props;

  React.useEffect(() => {
    inputRef.current?.focus();
  }, [props.focusKey]);
  React.useEffect(() => () => abortRef.current?.abort(), []);
  // A new shift starts a new question.
  React.useEffect(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
    setQuery("");
  }, [shift.id]);

  const ask = React.useCallback((pickedId: string): void => {
    const current = latest.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const version = current.rosterVersion;
    setPhase({ kind: "loading", pickedId, version });
    const settle = (answer: WhyNotAnswer): void => {
      if (controller.signal.aborted) {
        return;
      }
      if (answer.status === "answered") {
        // S4-2: an answer shows only for the roster on screen.
        setPhase(
          latest.current.currentRosterVersion() === version
            ? { answer, kind: "answered", pickedId, version }
            : { kind: "rosterChanged", pickedId },
        );
      } else if (answer.status === "rosterChanged") {
        setPhase({ kind: "rosterChanged", pickedId });
      } else if (answer.status === "readFailed") {
        setPhase({ kind: "readFailed", message: answer.message, pickedId });
      } else {
        setPhase({ kind: "unavailable", pickedId, retryAfterSeconds: answer.retryAfterSeconds });
      }
    };
    current.extension
      .ask({
        candidate: { resourceId: pickedId, shiftId: current.shift.id },
        currentRosterVersion: current.currentRosterVersion,
        events: current.roster.events,
        resources: current.roster.resources,
        rosterVersion: version,
        signal: controller.signal,
        window: current.roster.window,
      })
      .then(settle, () => settle({ status: "unavailable" }));
  }, []);

  // The roster changed while an answer was out or on screen: say so, never a silent disappearance.
  React.useEffect(() => {
    if ((phase.kind === "loading" || phase.kind === "answered") && phase.version !== props.rosterVersion) {
      abortRef.current?.abort();
      setPhase({ kind: "rosterChanged", pickedId: phase.pickedId });
    }
  }, [phase, props.rosterVersion]);

  const filter = query.trim().toLowerCase();
  const pickedName = "pickedId" in phase ? props.nameOf(phase.pickedId) : undefined;
  const shown =
    filter === "" || (pickedName !== undefined && query === pickedName)
      ? people
      : people.filter((person) => person.name.toLowerCase().includes(filter));

  const holder = shift.status === "needsCover" ? undefined : shift.resourceId;
  const renderAnswer = (): React.ReactNode => {
    switch (phase.kind) {
      case "idle":
        return null;
      case "loading":
        return (
          <div className="chrona-sched__whynot-status" data-testid="why-not-loading">
            <Spinner aria-hidden="true" size="extra-tiny" />
            <span>{formatString(strings.whyNotChecking, { name: pickedName ?? "" })}</span>
          </div>
        );
      case "rosterChanged":
        return (
          <div className="chrona-sched__whynot-status" data-testid="why-not-roster-changed">
            <span>{strings.whyNotRosterChanged}</span>
            <Button data-testid="why-not-ask-again" onClick={() => ask(phase.pickedId)} size="small">
              {strings.whyNotAskAgain}
            </Button>
          </div>
        );
      case "unavailable":
      case "readFailed":
        return (
          <div className="chrona-sched__whynot-status" data-testid="why-not-unavailable">
            <Warning16Regular aria-hidden="true" className="chrona-sched__whynot-warn-icon" />
            <span>
              {phase.kind === "readFailed"
                ? phase.message
                : phase.retryAfterSeconds !== undefined
                  ? formatString(strings.whyNotRetryIn, { seconds: String(phase.retryAfterSeconds) })
                  : strings.whyNotUnavailable}
            </span>
            <Button data-testid="why-not-retry" onClick={() => ask(phase.pickedId)} size="small">
              {strings.tryAgain}
            </Button>
          </div>
        );
      case "answered": {
        const name = pickedName ?? "";
        const { check } = phase.answer;
        const verdict = whyNotVerdict(check, name, strings, props.review !== undefined);
        const VerdictIcon = ICONS[verdict.tone];
        const lines = whyNotLines(check, {
          describe: (match) => props.extension.describe?.(match, props.roster),
          eventsById: new Map(props.roster.events.map((event) => [event.id, event])),
          nameOf: props.nameOf,
          strings,
          takenOffId: holder,
          toInstant: props.toInstant,
        });
        const picked = people.find((person) => person.id === phase.pickedId);
        const unchecked = picked !== undefined && props.extension.unchecked?.(picked, props.roster) === true;
        const action = props.review === undefined && picked ? props.actionFor?.(picked) : undefined;
        return (
          <>
            <p
              className={`chrona-sched__proposal-verdict chrona-sched__proposal-verdict--${verdict.tone}`}
              data-testid="why-not-verdict"
            >
              <VerdictIcon aria-hidden="true" className="chrona-sched__proposal-reason-icon" />
              <span>{verdict.text}</span>
            </p>
            <Lines lines={lines.picked} />
            {unchecked ? (
              <p className="chrona-sched__proposal-reason chrona-sched__proposal-reason--strain" data-testid="why-not-unchecked">
                <Warning16Regular aria-hidden="true" className="chrona-sched__proposal-reason-icon" />
                <span>{formatString(strings.whyNotNoAgreement, { name })}</span>
              </p>
            ) : null}
            {holder !== undefined && lines.takenOff.length > 0 ? (
              <>
                <div className="chrona-sched__proposal-caption chrona-sched__whynot-section">
                  {formatString(strings.whyNotTakingOff, { name: props.nameOf(holder) })}
                </div>
                <Lines lines={lines.takenOff} />
              </>
            ) : null}
            {props.review?.isChange ? (
              <p className="chrona-sched__proposal-caption chrona-sched__whynot-section" data-testid="why-not-in-review">
                {formatString(strings.whyNotInReview, { name })}
              </p>
            ) : null}
            {action?.kind === "assign" ? (
              <div className="chrona-sched__whynot-actions">
                <Button data-testid="why-not-assign" onClick={() => props.onAct(action)}>
                  {formatString(strings.whyNotAssign, { name })}
                </Button>
              </div>
            ) : null}
            {action?.kind === "swap" ? (
              <>
                <Lines lines={action.lines} />
                <div className="chrona-sched__whynot-actions">
                  <Button data-testid="why-not-swap" onClick={() => props.onAct(action)}>
                    {formatString(strings.whyNotSwap, { name, other: props.nameOf(action.other.id) })}
                  </Button>
                </div>
              </>
            ) : null}
            {action?.kind === "leftOpen" ? (
              <p className="chrona-sched__proposal-reason chrona-sched__proposal-reason--strain" data-testid="why-not-left-open">
                <Warning16Regular aria-hidden="true" className="chrona-sched__proposal-reason-icon" />
                <span>{action.text}</span>
              </p>
            ) : null}
            {action?.kind === "blocked" ? (
              <p className="chrona-sched__proposal-note--block chrona-sched__whynot-section" data-testid="why-not-blocked">
                {action.text}
              </p>
            ) : null}
          </>
        );
      }
      default:
        return null;
    }
  };

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="chrona-sched__proposal-group chrona-sched__whynot"
      data-testid="why-not"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || listOpen) {
          return;
        }
        event.stopPropagation();
        // The folded change list's own Escape closes it; this closes only the group.
        event.nativeEvent.stopImmediatePropagation();
        props.onClose();
      }}
    >
      <div className="chrona-sched__drill-head">
        <div className="chrona-sched__unscheduled-group chrona-sched__drill-heading" id={`${ids}-heading`}>
          {strings.menuWhyNot}
        </div>
        <Button
          appearance="subtle"
          aria-label={strings.close}
          data-testid="why-not-close"
          icon={<Dismiss12Regular />}
          onClick={props.onClose}
          size="small"
        />
      </div>
      <div className="chrona-sched__proposal-caption" data-testid="why-not-shift">
        {whyNotShiftLabel(shift, names)}
        {" · "}
        {holder !== undefined ? formatString(strings.whyNotNow, { name: props.nameOf(holder) }) : strings.unassigned}
      </div>
      <Field className="chrona-sched__whynot-field" label={strings.whyNotPerson}>
        <Combobox
          className="chrona-sched__whynot-picker"
          data-testid="why-not-picker"
          mountNode={fullScreen?.mountNode}
          onChange={(event) => setQuery(event.target.value)}
          onOpenChange={(_, data) => setListOpen(data.open)}
          onOptionSelect={(_, data) => {
            if (!data.optionValue) {
              return;
            }
            setQuery(data.optionText ?? "");
            ask(data.optionValue);
          }}
          placeholder={strings.whyNotPlaceholder}
          ref={inputRef}
          selectedOptions={"pickedId" in phase ? [phase.pickedId] : []}
          value={query}
        >
          {shown.length > 0 ? (
            shown.map((person) => (
              <Option key={person.id} text={person.name} value={person.id}>
                <span className="chrona-sched__whynot-option">
                  {person.name}
                  {props.personMark?.(person)}
                </span>
              </Option>
            ))
          ) : (
            <Option disabled text={strings.whyNotNoMatch} value="">
              {strings.whyNotNoMatch}
            </Option>
          )}
        </Combobox>
      </Field>
      <div aria-live="polite" className="chrona-sched__whynot-answer" data-testid="why-not-answer">
        {renderAnswer()}
      </div>
    </section>
  );
}

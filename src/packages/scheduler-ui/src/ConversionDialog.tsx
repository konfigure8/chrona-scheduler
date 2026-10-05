import * as React from "react";

import { ChronaMark } from "./ChronaMark";
import {
  activeCapabilities,
  computeCapabilityTiers,
  type SolveCapability,
} from "./capabilities";
import { formatCapabilityList } from "./capabilityText";
import {
  ConversionBoardAfter,
  ConversionBoardBefore,
} from "./ConversionSampleBoards";
import { countOverlappingShifts, countUnscheduled } from "./conversion";
import type { RowDecoration } from "./decorations";
import { redactProblem } from "./redaction";
import { problemFromSchedule } from "./schedulingContract";
import { formatString, useSchedulerStrings } from "./strings";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

/*
 * The standalone conversion surface's explainer (F22; design ratified
 * by Matt 2026-09-01 from the designer comp): the ONE ratified
 * branded exception to host-Fluent styling - Chrona identity on a
 * fixed light card in every host theme, scoped entirely to this
 * dialog. Trust is the design: real counts are computed locally and
 * say so, the sample boards are labeled fiction whose captions count
 * exactly what is drawn, the ledger discloses precisely what a real
 * run would transmit (F23: the redacted problem - resource IDs, no
 * names, no titles), and "Inspect the exact payload" renders that
 * redacted JSON byte-for-byte. Nothing is sent until connect.
 */

export interface ConversionDialogProps {
  /** Host-declared active tiers; absent = computed from the data
   * here (presence-based, Q2-A) so the claim never over-promises. */
  readonly capabilities?: readonly SolveCapability[];
  readonly coverageGapCount?: number;
  readonly decorations?: readonly RowDecoration[];
  readonly events: readonly SchedulerUiEvent[];
  readonly onClose: () => void;
  readonly onConnect?: () => void;
  readonly onLearnMore?: () => void;
  /** F26: "Open Chrona account" link; absent = no link. */
  readonly portalUrl?: string;
  readonly resources: readonly SchedulerResource[];
  /** The site's time zone, as the real request names it. */
  readonly timeZone?: string;
  /** Board dates back to real moments, as the real request sends them. */
  readonly toInstant?: (display: Date) => Date;
  readonly unscheduledEvents?: readonly SchedulerUiEvent[];
  readonly window: { readonly end: Date; readonly start: Date };
}

/** Render "{open} open items · {conflicts} conflicts" with the two
 * halves individually colorable, splitting the localized template at
 * its separator so translations keep working. */
function SampleCounts(props: {
  readonly conflicts: number;
  readonly open: number;
  readonly tone: "after" | "before";
}): JSX.Element {
  const strings = useSchedulerStrings();
  const values = {
    conflicts: props.conflicts,
    open: props.open,
  };
  const [openPart, conflictPart] = strings.conversionSampleCounts.split(
    "·",
  );
  return (
    <span
      className={`chrona-sched__conversion-boardcounts chrona-sched__conversion-boardcounts--${props.tone}`}
    >
      <span className="chrona-sched__conversion-count-open">
        {formatString((openPart ?? "").trim(), values)}
      </span>
      <span className="chrona-sched__conversion-count-sep"> · </span>
      <span className="chrona-sched__conversion-count-conflicts">
        {formatString((conflictPart ?? "").trim(), values)}
      </span>
    </span>
  );
}

const LedgerCheck = (): JSX.Element => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
    <circle cx="9" cy="9" fill="rgba(37,99,235,.12)" r="9" />
    <path
      d="m5.4 9.4 2.4 2.4 4.8-5.2"
      stroke="#2563EB"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const LedgerMinus = (): JSX.Element => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18">
    <circle cx="9" cy="9" fill="rgba(100,116,139,.14)" r="9" />
    <path
      d="M5.6 9h6.8"
      stroke="#64748B"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

const ShieldGlyph = (): JSX.Element => (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M8 1.5 13.5 3.6v4.1c0 3.2-2.3 5.6-5.5 6.8C4.8 13.3 2.5 10.9 2.5 7.7V3.6L8 1.5Z"
      fill="rgba(37,99,235,.12)"
      stroke="#2563EB"
      strokeLinejoin="round"
      strokeWidth="1.3"
    />
    <path
      d="m5.6 8 1.7 1.7 3.1-3.4"
      stroke="#2563EB"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
);

const InfoGlyph = (): JSX.Element => (
  <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 15 15" width="15">
    <circle cx="7.5" cy="7.5" r="6.75" stroke="#94A3B8" strokeWidth="1.3" />
    <path
      d="M7.5 6.8v3.4"
      stroke="#E2E8F0"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
    <circle cx="7.5" cy="4.6" fill="#E2E8F0" r=".9" />
  </svg>
);

export function ConversionDialog(props: ConversionDialogProps): JSX.Element {
  const {
    capabilities,
    coverageGapCount,
    decorations,
    events,
    onClose,
    onConnect,
    onLearnMore,
    portalUrl,
    resources,
    timeZone,
    toInstant,
    unscheduledEvents,
    window: timeWindow,
  } = props;
  const strings = useSchedulerStrings();
  const [payloadOpen, setPayloadOpen] = React.useState(false);
  const payloadRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  React.useEffect(() => {
    if (payloadOpen) {
      // The expander opens near the bottom of a scrollable column -
      // bring the revealed payload (and its note) into view.
      payloadRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [payloadOpen]);

  const openCount = countUnscheduled(events, unscheduledEvents);
  const conflictCount = countOverlappingShifts(events);

  // The claim names only ACTIVE tiers beyond assignment - "hours and
  // cost respected" is never said over a mapping that has neither.
  const activeTiers =
    capabilities ??
    activeCapabilities(
      computeCapabilityTiers({
        decorations,
        events,
        resources,
        unscheduledEvents,
      }),
    );
  const respectedTiers = activeTiers.filter(
    (capability) => capability !== "assignment" && capability !== "locks",
  );
  const claim =
    respectedTiers.length > 0
      ? `${strings.conversionClaimBase} ${formatString(
          strings.conversionClaimRespected,
          {
            list: formatCapabilityList(strings, respectedTiers, {
              sentenceCase: true,
            }),
          },
        )}`
      : strings.conversionClaimBase;
  const gapCount = coverageGapCount ?? 0;
  const allClear = openCount === 0 && conflictCount === 0 && gapCount === 0;

  const payload = React.useMemo(() => {
    if (!payloadOpen) {
      return "";
    }
    // F23: the ACTUAL would-be wire payload, redacted exactly the way
    // a real solve request is - shown before any account exists.
    const problem = problemFromSchedule({
      events: [...events, ...(unscheduledEvents ?? [])],
      resources: resources.filter((resource) => resource.id !== "r-open"),
      timeZone,
      toInstant,
      unavailability: (decorations ?? [])
        .filter(
          (decoration) =>
            decoration.kind === "unavailable" &&
            decoration.resourceId !== undefined,
        )
        .map((decoration) => ({
          end: decoration.end,
          kind: "unavailable" as const,
          resourceId: decoration.resourceId as string,
          start: decoration.start,
        })),
      window: timeWindow,
    });
    return JSON.stringify(redactProblem(problem).problem, null, 2);
  }, [payloadOpen, events, unscheduledEvents, resources, decorations, timeWindow, timeZone, toInstant]);

  return (
    <div className="chrona-sched__dialog-backdrop">
      <div
        aria-label={strings.conversionTitle}
        aria-modal="true"
        className="chrona-sched__conversion"
        data-testid="conversion-dialog"
        role="dialog"
      >
        <div className="chrona-sched__conversion-rail">
          <ChronaMark size={36} variant="dark" />
          <span className="chrona-sched__conversion-wordmark">Chrona</span>
          <p className="chrona-sched__conversion-pitch">
            {strings.conversionPitchProblem}
          </p>
          <p className="chrona-sched__conversion-pitch">
            {strings.conversionPitchMechanism}
          </p>
          <div className="chrona-sched__conversion-info">
            <span className="chrona-sched__conversion-info-lead">
              <InfoGlyph />
              <span>
                {/* One sentence per line (ruled): "Optional." over
                    "Free to try.", icon to the left of both. */}
                {strings.conversionInfoLead
                  .split(/(?<=\.)\s+/)
                  .map((sentence) => (
                    <span
                      className="chrona-sched__conversion-info-line"
                      key={sentence}
                    >
                      {sentence}
                    </span>
                  ))}
              </span>
            </span>
            {strings.conversionInfoBody}
          </div>
        </div>

        <div className="chrona-sched__conversion-main">
          <button
            aria-label={strings.close}
            className="chrona-sched__conversion-close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
          <h2 className="chrona-sched__conversion-title">
            {strings.conversionTitle}
          </h2>
          <p className="chrona-sched__conversion-sub">
            <span
              className="chrona-sched__conversion-counts"
              data-testid="conversion-counts"
            >
              {allClear
                ? strings.conversionAllClear
                : formatString(strings.conversionSampleCounts, {
                    conflicts: conflictCount,
                    open: openCount,
                  }) +
                  (gapCount > 0
                    ? " · " +
                      formatString(strings.conversionCoverageGaps, {
                        gaps: gapCount,
                      })
                    : "") +
                  strings.conversionCountsSuffix}
            </span>
            <span data-testid="conversion-claim">{claim}</span>
          </p>

          <div className="chrona-sched__conversion-demo">
            <span className="chrona-sched__conversion-section">
              {strings.conversionSampleTitle}
            </span>
            <div className="chrona-sched__conversion-halves">
              <div className="chrona-sched__conversion-half">
                <span className="chrona-sched__conversion-halftag">
                  {strings.conversionSampleBefore}
                </span>
                <ConversionBoardBefore />
                <SampleCounts conflicts={3} open={2} tone="before" />
              </div>
              <div className="chrona-sched__conversion-boardsplit" />
              <span aria-hidden="true" className="chrona-sched__conversion-pivot">
                <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
                  <path
                    d="M2.5 8h10M8.8 3.8 13 8l-4.2 4.2"
                    stroke="#fff"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              <div className="chrona-sched__conversion-half chrona-sched__conversion-half--after">
                <span className="chrona-sched__conversion-halftag">
                  {strings.conversionSampleAfter}
                </span>
                <ConversionBoardAfter />
                <SampleCounts conflicts={0} open={0} tone="after" />
              </div>
            </div>
          </div>

          <div className="chrona-sched__conversion-ledger">
            <div className="chrona-sched__conversion-ledgerhead">
              <span className="chrona-sched__conversion-section">
                {strings.conversionSentTitle}
              </span>
              <button
                aria-expanded={payloadOpen}
                className="chrona-sched__conversion-inspect"
                data-testid="conversion-inspect"
                onClick={() => setPayloadOpen((open) => !open)}
                type="button"
              >
                {strings.conversionInspect}
              </button>
            </div>
            <div className="chrona-sched__conversion-lrow">
              <LedgerCheck />
              {strings.conversionSentWork}
            </div>
            <div className="chrona-sched__conversion-lrow">
              <LedgerCheck />
              {strings.conversionSentPeople}
            </div>
            <div className="chrona-sched__conversion-lrow chrona-sched__conversion-lrow--none">
              <LedgerMinus />
              {strings.conversionSentNothingElse}
            </div>
            {payloadOpen ? (
              <div
                className="chrona-sched__conversion-payload-wrap"
                ref={payloadRef}
              >
                <pre
                  className="chrona-sched__conversion-payload"
                  data-testid="conversion-payload"
                >
                  {payload}
                </pre>
                <span className="chrona-sched__conversion-payload-note">
                  {strings.conversionPayloadNote}
                </span>
              </div>
            ) : null}
          </div>

          <div className="chrona-sched__conversion-lock">
            <ShieldGlyph />
            <span>{strings.conversionLockLine}</span>
          </div>

          <div className="chrona-sched__conversion-buttons">
            {onLearnMore ? (
              <button
                className="chrona-sched__conversion-learn"
                data-testid="conversion-learn-more"
                onClick={onLearnMore}
                type="button"
              >
                {strings.conversionLearnMore}
              </button>
            ) : null}
            {portalUrl ? (
              <a
                className="chrona-sched__conversion-learn"
                data-testid="conversion-account-link"
                href={portalUrl}
                rel="noreferrer"
                target="_blank"
              >
                {strings.openChronaAccount}
              </a>
            ) : null}
            <span className="chrona-sched__conversion-spacer" />
            <button
              className="chrona-sched__conversion-cancel"
              onClick={onClose}
              type="button"
            >
              {strings.conversionNotNow}
            </button>
            {onConnect ? (
              <button
                className="chrona-sched__conversion-connect"
                data-testid="conversion-connect"
                onClick={onConnect}
                type="button"
              >
                {strings.conversionConnect}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

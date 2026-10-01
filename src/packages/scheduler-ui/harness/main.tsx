import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluentProvider, type Theme, webLightTheme } from "@fluentui/react-components";

import {
  buildFixtureSchedule,
  buildLargeFixture,
  buildLevel0Fixture,
  buildLevel1Fixture,
  buildLevel2Fixture,
  buildPlainFixture,
  buildSolvableFixture,
} from "../src/fixtures";
import {
  buildShowcaseFixture,
  buildShowcaseFreeFixture,
} from "../src/fixturesShowcase";
import {
  demoRulesConfig,
  fixtureTagColors,
  fixtureViews,
  useFixtureScheduleHost,
} from "../src/fixtureHost";
import { DataEditor } from "./DataEditor";
import {
  clearOverlay,
  composeFixture,
  extractTables,
  loadOverlay,
  saveOverlay,
  tablesToTagColors,
  type EditableTables,
} from "./dataOverlay";
import "./benchEditor.css";
import type { RulePolicy, SchedulerRulesConfig } from "../src/scheduleRules";
import { periodContaining } from "../src/periods";
import type { PeriodUnit, SchedulerPeriodConfig } from "../src/periods";
import {
  idleSolveState,
  type ProposalChange,
  type ScheduleProposal,
  type SolveState,
} from "../src/solve";
import {
  CAPABILITY_SOLVE,
  deriveEntitlementStatus,
  entitlementAllows,
  planUsageUrl,
  scenarioCapability,
  toEntitlementDisplay,
  type EntitlementSession,
  type EntitlementSnapshot,
} from "../src/entitlement";
import {
  horizonWindow,
  nextAddablePeriod,
  periodKey,
  planStartPeriod,
  railPeriods,
} from "../src/horizon";
import type { RosterCardAction } from "../src/PlanningChrome";
import { defaultSchedulerStrings, formatString } from "../src/strings";
import type { TimeWindow } from "../src/types";
import type { PlanningMode } from "../src/PlanningChrome";
import { activeCapabilities, computeCapabilityTiers } from "../src/capabilities";
import { problemFromSchedule } from "../src/schedulingContract";
import { schedulerLanguages, type SchedulerLocale } from "./languages";
import {
  followRun,
  markRunReviewed,
  redactProblem,
  runSolve,
  SolveCancelledError,
  SolveInFlightError,
  SolveQuotaExceededError,
  type ResumeRunDisplay,
  type SchedulerUiEvent,
  type SolveSession,
} from "../src";
import {
  hostSchedulerTheme,
  hostTokenTheme,
  type HostThemeName,
} from "./hostThemes";
import { SchedulerSurface } from "../src/SchedulerSurface";
import type { HourFormat } from "../src/timeAxis";
import type { StatusColorRule } from "../src/viewConfig";
import type { SchedulerViewKind } from "../src/types";
import "../src/styles.css";

const largeFixture = buildLargeFixture(2000, 10);
const level0Fixture = buildLevel0Fixture();
const level1Fixture = buildLevel1Fixture();
const level2Fixture = buildLevel2Fixture();
const solvableFixture = buildSolvableFixture();
const plainFixture = buildPlainFixture();
const showcaseFixture = buildShowcaseFixture();
const showcaseFreeFixture = buildShowcaseFreeFixture();
const demoFixture = buildFixtureSchedule();

/*
 * Maker rules configuration, persisted in the exact serialized shape
 * the PCF maps chr_ columns into (SchedulerRulesConfig) so the
 * harness doubles as the transparent test bench: no hidden config, no
 * drift. Storage medium differs by host (localStorage here, chr_ rows
 * in Dataverse); the shape is the contract.
 */
const RULES_CONFIG_KEY = "chrona-sched:v1:rules-config";
const SOLVER_URL_KEY = "chrona-sched:v1:solver-url";
const PERIOD_CONFIG_KEY = "chrona-sched:v1:period-config";

interface StoredPeriodConfig {
  readonly anchor: string;
  readonly unit: PeriodUnit | "off";
}

const defaultPeriodConfig: StoredPeriodConfig = {
  anchor: "2026-08-17",
  unit: "fortnight",
};

function loadPeriodConfig(): StoredPeriodConfig {
  try {
    const raw = window.localStorage.getItem(PERIOD_CONFIG_KEY);
    if (!raw) {
      return defaultPeriodConfig;
    }
    return { ...defaultPeriodConfig, ...(JSON.parse(raw) as object) };
  } catch {
    return defaultPeriodConfig;
  }
}

function loadRulesConfig(): SchedulerRulesConfig {
  try {
    const raw = window.localStorage.getItem(RULES_CONFIG_KEY);
    if (!raw) {
      return demoRulesConfig;
    }
    return { ...demoRulesConfig, ...(JSON.parse(raw) as object) };
  } catch {
    return demoRulesConfig;
  }
}

function saveRulesConfig(config: SchedulerRulesConfig): void {
  try {
    window.localStorage.setItem(RULES_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage may be unavailable; the session still works unpersisted.
  }
}

const POLICY_OPTIONS: readonly RulePolicy[] = ["off", "warn", "block"];

function PolicySelect(props: {
  readonly label: string;
  readonly onChange: (policy: RulePolicy) => void;
  readonly testId: string;
  readonly value: RulePolicy;
}): JSX.Element {
  return (
    <label style={{ fontSize: 13 }}>
      {props.label}{" "}
      <select
        data-testid={props.testId}
        onChange={(changeEvent) =>
          props.onChange(changeEvent.target.value as RulePolicy)
        }
        value={props.value}
      >
        {POLICY_OPTIONS.map((policy) => (
          <option key={policy} value={policy}>
            {policy}
          </option>
        ))}
      </select>
    </label>
  );
}

function HarnessApp(): JSX.Element {
  const [view, setView] = React.useState<SchedulerViewKind>("timeline");
  const [hourFormat, setHourFormat] = React.useState<HourFormat>("24");
  const [workingHours, setWorkingHours] = React.useState("6-22");
  const [showBands, setShowBands] = React.useState(true);
  const [roleColors, setRoleColors] = React.useState(false);
  const [showWeekends, setShowWeekends] = React.useState(true);
  const [datasetName, setDatasetName] = React.useState<
    "demo" | "level0" | "level1" | "level2" | "plain" | "showcase" | "showcaseFree" | "solvable" | "stress"
  >("demo");
  /*
   * Gallery default (Matt 2026-08-24): the control exactly as an
   * unconfigured install behaves - bare mapped data, no rules, no
   * views, no colors, no solver, no periods. Generic maker knobs
   * (view, interval, hours, weekends) stay, a gallery user has
   * those.
   */
  const plain = datasetName === "plain";
  const stress = datasetName === "stress";
  const [empty, setEmpty] = React.useState(false);
  // Rows with no dates yet, as a Dataverse view with empty start and end columns delivers them.
  const [withUndated, setWithUndated] = React.useState(false);
  /*
   * Host theme (Power Apps modern theming): a model-driven host hands
   * the control its resolved Fluent v9 theme. The bench simulates
   * that with the real Fluent themes; "none" is the standalone case.
   */
  const [hostTheme, setHostTheme] = React.useState<HostThemeName>("none");
  const [locale, setLocale] = React.useState<SchedulerLocale>("en");
  const [renderMs, setRenderMs] = React.useState<number | undefined>();
  const renderStartRef = React.useRef<number | undefined>();
  const [rulesConfig, setRulesConfig] =
    React.useState<SchedulerRulesConfig>(loadRulesConfig);
  const [solverUrl, setSolverUrl] = React.useState<string>(() => {
    try {
      return (
        window.localStorage.getItem(SOLVER_URL_KEY) ?? "http://127.0.0.1:3001"
      );
    } catch {
      return "http://127.0.0.1:3001";
    }
  });
  const [solveState, setSolveState] =
    React.useState<SolveState>(idleSolveState);
  const [periodStored, setPeriodStored] =
    React.useState<StoredPeriodConfig>(loadPeriodConfig);
  const periodConfig: SchedulerPeriodConfig | undefined =
    periodStored.unit === "off"
      ? undefined
      : {
          anchor: new Date(`${periodStored.anchor}T00:00:00`),
          unit: periodStored.unit,
        };
  /*
   * Horizon settings (PLAN doctrine 2026-08-24): plan-ahead in
   * periods, publish-ahead in days + a time of day. Maker settings
   * in the real host; harness config here.
   */
  const [planAheadPeriods, setPlanAheadPeriods] = React.useState(6);
  const [publishAheadDays, setPublishAheadDays] = React.useState(3);
  const publishAhead = React.useMemo(
    () => ({ days: publishAheadDays, hour: 17 }),
    [publishAheadDays],
  );
  const baseFixture =
    datasetName === "stress"
      ? largeFixture
      : datasetName === "level0"
        ? level0Fixture
        : datasetName === "level1"
          ? level1Fixture
          : datasetName === "level2"
            ? level2Fixture
            : datasetName === "plain"
              ? plainFixture
              : datasetName === "showcase"
                ? showcaseFixture
                : datasetName === "showcaseFree"
                  ? showcaseFreeFixture
                  : datasetName === "solvable"
                    ? solvableFixture
                    : demoFixture;
  /*
   * Bench data editor: the dataset as its future Power Apps tables.
   * A localStorage overlay per dataset replaces whole tables; the
   * fixture host reseeds on the composed fixture's fresh identity.
   */
  const [editorOpen, setEditorOpen] = React.useState(false);
  // F22 Standalone conversion surface bench state.
  const [connected, setConnected] = React.useState(false);
  const [conversionHidden, setConversionHidden] = React.useState(false);
  // F22 deliverable 3: bench-only simulation of the server-reported
  // free-tier allowance (the real numbers come from the account
  // usage summary; the control never computes them).
  const [quotaSpent, setQuotaSpent] = React.useState(false);
  /* F27 stage 2: the bench plays the entitlement session's states so
   * every degradation reads on screen: paid and current (default),
   * free, past due in grace, lapsed, paused after a day of silence,
   * and no claims at all. */
  type BenchEntitlementKind = "above" | "current" | "free" | "grace" | "lapsed" | "none" | "paused";
  const [entitlementKind, setEntitlementKind] = React.useState<BenchEntitlementKind>("current");
  // F26 stage 3: bench-only "latest run" the session would report, so
  // the resume-or-discard prompt can be exercised without a server.
  const [latestRunKind, setLatestRunKind] = React.useState<
    "changed" | "finished" | "none" | "running"
  >("none");
  const [overlayRev, setOverlayRev] = React.useState(0);
  const overlay = React.useMemo(
    () => loadOverlay(datasetName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetName, overlayRev],
  );
  const editorTables = React.useMemo(
    () =>
      overlay?.tables ??
      extractTables(baseFixture, fixtureTagColors, fixtureViews),
    [baseFixture, overlay],
  );
  const activeFixture = React.useMemo(() => {
    const composed = overlay ? composeFixture(baseFixture, overlay.tables) : baseFixture;
    if (!withUndated) {
      return composed;
    }
    const undatedItem = (id: string, title: string, minutes: number): SchedulerUiEvent => ({
      end: new Date(minutes * 60_000),
      id,
      resourceId: "r-open",
      start: new Date(0),
      status: "needsCover",
      title,
      undated: true,
    });
    return {
      ...composed,
      events: [
        ...composed.events,
        undatedItem("undated-1", "Deep clean", 90),
        undatedItem("undated-2", "Stock take", 60),
      ],
    };
  }, [baseFixture, overlay, withUndated]);
  const applyTables = (tables: EditableTables): void => {
    saveOverlay(datasetName, tables);
    setOverlayRev((revision) => revision + 1);
    setEditorOpen(false);
  };
  const resetTables = (): void => {
    clearOverlay(datasetName);
    setOverlayRev((revision) => revision + 1);
    setEditorOpen(false);
  };
  const planningActive = Boolean(
    activeFixture.lifecycleSeed && periodConfig && !plain,
  );
  const [planMode, setPlanMode] = React.useState<PlanningMode>("plan");
  const [selectedKey, setSelectedKey] = React.useState("");
  /*
   * Rosters are explicitly created: the "+" card appends the next
   * adjacent period until the horizon is full. The current period
   * always exists; the bench seeds three created ahead so the
   * carousel and the limit are both demonstrable.
   */
  const [createdKeys, setCreatedKeys] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  const selectedPeriod = React.useMemo(
    () =>
      periodConfig && selectedKey
        ? periodContaining(
            periodConfig,
            new Date(`${selectedKey}T12:00:00`),
          )
        : activeFixture.window,
    [activeFixture.window, periodConfig, selectedKey],
  );
  const currentPeriodWindow = React.useMemo(
    () =>
      periodConfig
        ? periodContaining(periodConfig, activeFixture.now)
        : activeFixture.window,
    [activeFixture.now, activeFixture.window, periodConfig],
  );

  const updatePeriod = (patch: Partial<StoredPeriodConfig>): void => {
    setPeriodStored((previous) => {
      const next = { ...previous, ...patch };
      try {
        window.localStorage.setItem(PERIOD_CONFIG_KEY, JSON.stringify(next));
      } catch {
        // unpersisted is fine
      }
      return next;
    });
  };
  const [proposal, setProposal] = React.useState<
    ScheduleProposal | undefined
  >();

  const updateRules = (patch: Partial<SchedulerRulesConfig>): void => {
    setRulesConfig((previous) => {
      const next = { ...previous, ...patch };
      saveRulesConfig(next);
      return next;
    });
  };

  /*
   * The complete host lives in the shared fixture hook - the same
   * implementation the PCF sandbox mounts - so host semantics cannot
   * drift between harnesses. Everything below the hook is dev chrome.
   * The preference key mirrors the PCF adapter's, which carries
   * context.userSettings.userId plus the view-config row id.
   */
  const host = useFixtureScheduleHost({
    dataset: activeFixture,
    tagColors: overlay ? tablesToTagColors(overlay.tables) : undefined,
    views: overlay ? overlay.tables.views : undefined,
    // The stress board demonstrates two-level nesting by default.
    defaultGroupBy:
      datasetName === "stress" ? ["Regions", "Teams"] : undefined,
    lifecycleSeed: plain ? undefined : activeFixture.lifecycleSeed,
    plain,
    navigationBounds: planningActive
      ? planMode === "plan"
        ? selectedKey
          ? selectedPeriod
          : undefined
        : currentPeriodWindow
      : undefined,
    preferenceKey: plain
      ? "chrona-sched:v1:plain-gallery"
      : "chrona-sched:v1:demo-user:demo-view",
    rulesConfig,
    showAvailabilityBands: showBands,
    showWeekends,
    viewKind: view,
    workingHours,
  });

  const railOptions = React.useMemo(
    () =>
      planningActive && periodConfig
        ? {
            config: periodConfig,
            createdKeys,
            lifecycleByKey: host.lifecycleByKey,
            planAheadPeriods,
            publishAhead,
            today: activeFixture.now,
          }
        : undefined,
    [
      activeFixture.now,
      createdKeys,
      host.lifecycleByKey,
      periodConfig,
      planAheadPeriods,
      planningActive,
      publishAhead,
    ],
  );
  const allEvents = React.useMemo(
    () => [
      ...(host.surfaceProps.events ?? []),
      ...(host.surfaceProps.unscheduledEvents ?? []),
    ],
    [host.surfaceProps.events, host.surfaceProps.unscheduledEvents],
  );
  const rail = React.useMemo(
    () =>
      railOptions
        ? railPeriods(railOptions).map((card) => {
            let assigned = 0;
            let open = 0;
            for (const event of allEvents) {
              if (
                event.end > card.period.start &&
                event.start < card.period.end
              ) {
                if (event.status === "needsCover") {
                  open += 1;
                } else {
                  assigned += 1;
                }
              }
            }
            const total = assigned + open;
            return {
              ...card,
              scheduledPercent:
                total === 0 ? 0 : Math.round((assigned / total) * 100),
            };
          })
        : undefined,
    [allEvents, railOptions],
  );
  // Selection resets when the dataset or cadence changes - never on
  // publish (the planner stays where they are).
  const selectionSeed = `${datasetName}|${periodStored.unit}|${periodStored.anchor}`;
  const lastSelectionSeed = React.useRef("");
  React.useEffect(() => {
    if (!planningActive || !periodConfig) {
      return;
    }
    if (lastSelectionSeed.current === selectionSeed) {
      return;
    }
    lastSelectionSeed.current = selectionSeed;
    const current = periodContaining(periodConfig, activeFixture.now);
    const seededCreated = new Set([periodKey(current)]);
    let step = current;
    for (let index = 0; index < 3 && index < planAheadPeriods; index += 1) {
      step = periodContaining(
        periodConfig,
        new Date(step.end.getTime() + 1),
      );
      seededCreated.add(periodKey(step));
    }
    setCreatedKeys(seededCreated);
    setSelectedKey(
      periodKey(
        planStartPeriod({
          config: periodConfig,
          createdKeys: seededCreated,
          lifecycleByKey: host.lifecycleByKey,
          planAheadPeriods,
          publishAhead,
          today: activeFixture.now,
        }),
      ),
    );
  });
  const cardWindow = (key: string): TimeWindow | undefined =>
    periodConfig
      ? periodContaining(periodConfig, new Date(`${key}T12:00:00`))
      : undefined;
  const cardRange = (window: TimeWindow): string => {
    const day = (date: Date): string =>
      date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${day(window.start)} - ${day(new Date(window.end.getTime() - 1))}`;
  };

  const planning =
    planningActive && rail && railOptions && periodConfig && selectedKey
      ? {
          activeMode: planMode,
          horizon: horizonWindow(
            periodConfig,
            activeFixture.now,
            planAheadPeriods,
          ),
          modes: "both" as const,
          now: activeFixture.now,
          canAddRoster: nextAddablePeriod(railOptions) !== undefined,
          onAddRoster: (): void => {
            const next = nextAddablePeriod(railOptions);
            if (next) {
              setCreatedKeys(new Set([...createdKeys, periodKey(next)]));
            }
          },
          onCardAction: (action: RosterCardAction, key: string): void => {
            const window = cardWindow(key);
            if (!window) {
              return;
            }
            if (action === "publish") {
              host.publishPeriod(key, window);
            } else if (action === "unpublish") {
              host.unpublishPeriod(key);
            } else if (action === "generate") {
              const templates = activeFixture.templates ?? [];
              if (templates.length > 0) {
                host.generate(templates, window, periodConfig?.anchor);
              }
            } else if (action === "optimize") {
              setSelectedKey(key);
              host.surfaceProps.onAnchorChange?.(window.start);
              requestSolve(window);
            } else {
              const removed = host.clearGeneratedInPeriod(
                window,
                formatString(defaultSchedulerStrings.rosterDeleted, {
                  count: "0",
                  range: cardRange(window),
                }),
              );
              host.notify(
                formatString(defaultSchedulerStrings.rosterDeleted, {
                  count: String(removed),
                  range: cardRange(window),
                }),
              );
              const remaining = new Set(createdKeys);
              remaining.delete(key);
              setCreatedKeys(remaining);
              if (selectedKey === key) {
                setSelectedKey(
                  periodKey(
                    planStartPeriod({
                      ...railOptions,
                      createdKeys: remaining,
                    }),
                  ),
                );
              }
            }
          },
          onModeChange: (mode: PlanningMode): void => {
            setPlanMode(mode);
            host.surfaceProps.onAnchorChange?.(
              mode === "plan" ? selectedPeriod.start : currentPeriodWindow.start,
            );
          },
          onSelectPeriod: (key: string): void => {
            setSelectedKey(key);
            host.surfaceProps.onAnchorChange?.(
              new Date(`${key}T00:00:00`),
            );
          },
          rail,
          selectedKey,
        }
      : undefined;

  const requestGenerate = (): void => {
    const templates = activeFixture.templates ?? [];
    if (templates.length === 0 || (planningActive && planMode !== "plan")) {
      return;
    }
    const period = planning
      ? selectedPeriod
      : periodConfig
        ? periodContaining(
            periodConfig,
            host.surfaceProps.anchor ?? activeFixture.window.start,
          )
        : undefined;
    host.generate(templates, period ?? activeFixture.window, periodConfig?.anchor);
  };

  // F22 deliverable 2: the bench plays the adapter - presence-based
  // tiers from the active dataset, declared to the surface and sent
  // on the solve envelope.
  const solveCapabilities = React.useMemo(
    () =>
      activeCapabilities(
        computeCapabilityTiers({
          decorations: host.surfaceProps.decorations,
          events: host.surfaceProps.events ?? [],
          resources: host.surfaceProps.resources ?? [],
          unscheduledEvents: host.surfaceProps.unscheduledEvents,
        }),
      ),
    [
      host.surfaceProps.decorations,
      host.surfaceProps.events,
      host.surfaceProps.resources,
      host.surfaceProps.unscheduledEvents,
    ],
  );

  /*
   * F26 stage 3: the bench plays the plugin. A real host mints this
   * from chr_ChronaSolveSession; here the typed solver URL, the quota
   * checkbox, and the latest-run select stand in. Empty token = the
   * client sends no bearer, and the tenant header keeps the local
   * API's dev bypass working (the recorded e2e wire is unchanged).
   */
  const BENCH_TENANT_HEADERS = { "X-Tenant-Id": "tenant-dev-a" };
  const benchEntitlement = React.useMemo((): EntitlementSnapshot | undefined => {
    if (entitlementKind === "none") {
      return undefined;
    }
    const now = Date.now();
    const paid = entitlementKind !== "free";
    const session: EntitlementSession = {
      capabilities:
        entitlementKind === "lapsed"
          ? []
          : paid
            ? ["solve", "recommend", "workerChangeValidation", "configGenerators", "scenario:workforce-scheduling"]
            : ["solve"],
      expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
      ...(entitlementKind === "grace" ? { graceUntil: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString() } : {}),
      metrics: paid
        ? { resourcesIncluded: 50, resourcesScheduledHighWater: entitlementKind === "above" ? 52 : 12, resourcesScheduledLatest: 7 }
        : {},
      paymentState:
        entitlementKind === "grace" ? "grace" : entitlementKind === "lapsed" ? "lapsed" : paid ? "current" : "free",
      period: { end: "2026-10-01T00:00:00.000Z", start: "2026-09-01T00:00:00.000Z" },
      refreshAfter: new Date(now + 60 * 60 * 1000).toISOString(),
      solutionType: "workforce-scheduling",
      tier: paid ? "workforce-pro" : "free",
      token: "",
    };
    return {
      apiBaseUrl: solverUrl,
      // Paused: the hint passed two hours ago and the first refresh after it failed.
      ...(entitlementKind === "paused" ? { failedSince: new Date(now - 2 * 60 * 60 * 1000).toISOString() } : {}),
      fetchedAt: new Date(entitlementKind === "paused" ? now - 3 * 60 * 60 * 1000 : now).toISOString(),
      portalUrl: "https://portal.chrona.example/",
      session: entitlementKind === "paused" ? { ...session, refreshAfter: new Date(now - 2 * 60 * 60 * 1000).toISOString() } : session,
    };
  }, [entitlementKind, solverUrl]);
  const benchSession: SolveSession = React.useMemo(
    () => ({
      apiBaseUrl: solverUrl,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      latestRun:
        latestRunKind === "none"
          ? undefined
          : {
              createdAt: new Date(Date.now() - 240_000).toISOString(),
              completedAt:
                latestRunKind === "running"
                  ? undefined
                  : new Date(Date.now() - 120_000).toISOString(),
              payloadHash: latestRunKind === "changed" ? "stale" : undefined,
              runId: "run-bench-latest",
              status: latestRunKind === "running" ? "running" : "succeeded",
            },
      portalUrl: connected ? "https://portal.chrona.example/account" : undefined,
      quota: {
        dailySolveLimit: 3,
        remainingSolves: quotaSpent ? 0 : 2,
        solvesUsedToday: quotaSpent ? 3 : 1,
      },
      solverSeconds: { default: 2, max: 600, min: 1 },
      tier: "free",
      token: "",
      ...(benchEntitlement ? { entitlement: benchEntitlement.session } : {}),
    }),
    [benchEntitlement, connected, latestRunKind, quotaSpent, solverUrl],
  );
  const entitlementStatus = React.useMemo(
    () => deriveEntitlementStatus(benchEntitlement, new Date()),
    [benchEntitlement],
  );
  const solveAllowed = entitlementAllows(entitlementStatus, CAPABILITY_SOLVE);
  const scenarioAllowed = entitlementAllows(
    entitlementStatus,
    scenarioCapability(entitlementStatus?.session.solutionType ?? "workforce-scheduling"),
  );

  const currentProblemEvents = (): SchedulerUiEvent[] => [
    ...(host.surfaceProps.events ?? []),
    ...(host.surfaceProps.unscheduledEvents ?? []),
  ];

  const solveAbortRef = React.useRef<AbortController | undefined>(undefined);
  const solveRunIdRef = React.useRef<string | undefined>(undefined);

  /* F31: the answer is a proposal until Apply; the surface previews it. */
  const applySolved = (solved: ScheduleProposal): void => {
    solveAbortRef.current = undefined;
    setProposal(solved);
    setSolveState(idleSolveState);
  };

  const markReviewed = (runId: string | undefined): void => {
    if (runId) {
      void markRunReviewed(
        benchSession,
        runId,
        undefined,
        BENCH_TENANT_HEADERS,
      ).catch(() => undefined);
    }
  };

  /* Apply writes the kept changes as one undoable transaction. */
  const publishProposal = (changes: readonly ProposalChange[]): void => {
    if (changes.length > 0) {
      host.surfaceProps.onEventsChange?.(
        changes.map((change) => ({
          event: change.current,
          result: {
            end: change.proposed.end,
            resourceId: change.proposed.resourceId,
            start: change.proposed.start,
          },
          verdict: { kind: "allow" as const },
        })),
      );
    }
    markReviewed(proposal?.runId);
    setProposal(undefined);
    setSolveState(idleSolveState);
  };

  const cancelSolve = (): void => {
    solveAbortRef.current?.abort();
    solveAbortRef.current = undefined;
    markReviewed(solveRunIdRef.current);
    solveRunIdRef.current = undefined;
    setSolveState(idleSolveState);
  };

  const failSolve = (error: unknown): void => {
    if (error instanceof SolveCancelledError) {
      setSolveState(idleSolveState);
      return;
    }
    setSolveState({
      message: error instanceof Error ? error.message : String(error),
      // F19: a server 402 renders the calm quota notice, not the
      // red failure line.
      reason: error instanceof SolveQuotaExceededError ? "quota" : undefined,
      status: "failed",
    });
  };

  /* F26: resume-or-discard for the session's latest run. Review
   * rebuilds the problem and follows the run with the rebuilt map;
   * "changed" (the server hash no longer matches) offers Discard
   * only; Discard records the reviewed signal and clears the prompt. */
  const resumeRun: ResumeRunDisplay | undefined = benchSession.latestRun
    ? {
        kind:
          latestRunKind === "running"
            ? "running"
            : latestRunKind === "changed"
              ? "changed"
              : "finished",
        onDiscard: () => {
          void markRunReviewed(
            benchSession,
            benchSession.latestRun?.runId ?? "",
            undefined,
            BENCH_TENANT_HEADERS,
          ).catch(() => undefined);
          setLatestRunKind("none");
        },
        onReview:
          latestRunKind === "changed"
            ? undefined
            : () => {
                const events = currentProblemEvents();
                const problem = problemFromSchedule({
                  events,
                  resources: host.surfaceProps.resources ?? [],
                  unavailability: activeFixture.availabilityBands,
                  window: activeFixture.window,
                });
                setSolveState({ status: "running" });
                setLatestRunKind("none");
                const controller = new AbortController();
                solveAbortRef.current = controller;
                solveRunIdRef.current = benchSession.latestRun?.runId;
                followRun({
                  currentEvents: events,
                  extraHeaders: BENCH_TENANT_HEADERS,
                  signal: controller.signal,
                  onStatus: (status) => setSolveState({ status }),
                  redaction: redactProblem(problem),
                  runId: benchSession.latestRun?.runId ?? "",
                  runToken: Date.now().toString(36),
                  session: benchSession,
                  unassignedResourceId: "r-open",
                })
                  .then((solved) => {
                    applySolved(solved);
                    return null;
                  })
                  .catch(failSolve);
              },
        runId: benchSession.latestRun.runId,
      }
    : undefined;

  const requestSolve = (periodOverride?: TimeWindow): void => {
    const allEvents = [
      ...(host.surfaceProps.events ?? []),
      ...(host.surfaceProps.unscheduledEvents ?? []),
    ];
    /*
     * Solve the SELECTED period when planning is active (the
     * selected planning period IS the optimization problem);
     * otherwise the period containing the anchor (generic period
     * display). Uncovered items
     * inside it are the decisions; assigned items in the period plus
     * a one-day edge margin travel pinned; availability spans in the
     * same range go along. No period config = the whole dataset.
     */
    const DAY_MS = 24 * 60 * 60 * 1000;
    const period =
      periodOverride ??
      (planning
        ? selectedPeriod
        : periodConfig
          ? periodContaining(
              periodConfig,
              host.surfaceProps.anchor ?? activeFixture.window.start,
            )
          : undefined);
    const rangeStart = period
      ? new Date(period.start.getTime() - DAY_MS)
      : undefined;
    const rangeEnd = period
      ? new Date(period.end.getTime() + DAY_MS)
      : undefined;
    const solveEvents = period
      ? allEvents.filter((event) =>
          event.status === "needsCover"
            ? event.start >= period.start && event.start < period.end
            : rangeStart !== undefined &&
              rangeEnd !== undefined &&
              event.end > rangeStart &&
              event.start < rangeEnd,
        )
      : allEvents;
    const solveBands = activeFixture.availabilityBands.filter(
      (band) =>
        !rangeStart ||
        !rangeEnd ||
        (band.end > rangeStart && band.start < rangeEnd),
    );
    setSolveState({ status: "queued" });
    setProposal(undefined);
    const controller = new AbortController();
    solveAbortRef.current = controller;
    solveRunIdRef.current = undefined;
    runSolve({
      capabilities: solveCapabilities,
      currentEvents: solveEvents,
      extraHeaders: BENCH_TENANT_HEADERS,
      unassignedResourceId: "r-open",
      onStatus: (status) => setSolveState({ status }),
      onSubmitted: (runId) => {
        solveRunIdRef.current = runId;
      },
      signal: controller.signal,
      problem: problemFromSchedule({
        events: solveEvents,
        resources: host.surfaceProps.resources ?? [],
        unavailability: solveBands,
        window: period ?? activeFixture.window,
      }),
      runToken: Date.now().toString(36),
      session: benchSession,
      tenantId: "tenant-dev-a",
    })
      .then((solved) => {
        applySolved(solved);
        return null;
      })
      .catch((error: unknown) => {
        if (error instanceof SolveInFlightError) {
          // F26: another run holds the calendar; follow it instead.
          setLatestRunKind("running");
          setSolveState(idleSolveState);
          return;
        }
        failSolve(error);
      });
  };

  const discardProposal = (): void => {
    markReviewed(proposal?.runId);
    setProposal(undefined);
    setSolveState(idleSolveState);
  };

  const selectDataset = (
    name:
      | "demo"
      | "level0"
      | "level1"
      | "level2"
      | "plain"
      | "showcase"
      | "showcaseFree"
      | "solvable"
      | "stress",
  ): void => {
    renderStartRef.current = performance.now();
    setDatasetName(name);
  };

  React.useEffect(() => {
    if (renderStartRef.current !== undefined) {
      const started = renderStartRef.current;
      renderStartRef.current = undefined;
      requestAnimationFrame(() => {
        setRenderMs(Math.round(performance.now() - started));
      });
    }
  }, [datasetName]);

  const statusColorRules: readonly StatusColorRule[] | undefined = roleColors
    ? [
        { color: "#f0e6f7", field: "Role", value: "Supervisor" },
        { color: "#e6f2e6", field: "Role", value: "Kitchen" },
      ]
    : undefined;

  const pxPerHour = host.surfaceProps.config?.pxPerHour ?? 60;
  const zoomFitted = host.surfaceProps.config?.fitToWidth === true;

  // The stress dataset now routes through the stateful host (full
  // functionality at scale); only the empty probe stays an overlay.
  const datasetOverrides = empty
    ? { events: [], resources: [], unscheduledEvents: [] }
    : undefined;

  return (
    <div>
      <h1 style={{ fontSize: 18 }}>Chrona Scheduler UI harness</h1>
      <p style={{ color: "#616161", fontSize: 13 }}>
        Fixture data only. Drag bars to move, edges to resize, empty slots to
        create, unscheduled items onto rows to assign. Ctrl+Z / Ctrl+Y for
        undo / redo.
      </p>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: 13 }}>
          Zoom{" "}
          <select
            onChange={(changeEvent) =>
              changeEvent.target.value === "fit"
                ? host.resetIntervalZoom()
                : host.surfaceProps.onZoomChange?.(
                    Number(changeEvent.target.value),
                  )
            }
            value={zoomFitted ? "fit" : pxPerHour}
          >
            <option value="fit">Fit</option>
            <option value={30}>Compact</option>
            <option value={60}>Normal</option>
            <option value={120}>Wide</option>
            {!zoomFitted && ![30, 60, 120].includes(pxPerHour) ? (
              <option value={pxPerHour}>{pxPerHour}px/h</option>
            ) : null}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          View{" "}
          <select
            onChange={(changeEvent) =>
              setView(changeEvent.target.value as SchedulerViewKind)
            }
            value={view}
          >
            <option value="timeline">Timeline</option>
            <option value="roster">Roster</option>
            <option value="topDown">Top down</option>
            <option value="day">Day columns</option>
            <option value="month">Month grid</option>
            <option value="agenda">Agenda</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Hours{" "}
          <select
            onChange={(changeEvent) =>
              setHourFormat(changeEvent.target.value as HourFormat)
            }
            value={hourFormat}
          >
            <option value="24">24h</option>
            <option value="12">12h</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Working{" "}
          <select
            onChange={(changeEvent) => setWorkingHours(changeEvent.target.value)}
            value={workingHours}
          >
            <option value="none">All hours</option>
            <option value="6-22">06-22</option>
            <option value="8-18">08-18</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          <input
            checked={showBands}
            onChange={(changeEvent) => setShowBands(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Bands
        </label>
        <label style={{ fontSize: 13 }}>
          <input
            checked={roleColors}
            onChange={(changeEvent) => setRoleColors(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Role colors
        </label>
        <label style={{ fontSize: 13 }}>
          <input
            checked={showWeekends}
            onChange={(changeEvent) =>
              setShowWeekends(changeEvent.target.checked)
            }
            type="checkbox"
          />{" "}
          Weekends
        </label>
        <label style={{ fontSize: 13 }}>
          Dataset{" "}
          <select
            data-testid="dataset-select"
            onChange={(changeEvent) =>
              selectDataset(
                changeEvent.target.value as
                  | "demo"
                  | "level0"
                  | "level1"
                  | "level2"
                  | "plain"
                  | "showcase"
                  | "showcaseFree"
                  | "solvable"
                  | "stress",
              )
            }
            value={datasetName}
          >
            <option value="demo">Demo (conflict showcase)</option>
            <option value="plain">Plain (gallery default)</option>
            <option value="solvable">Roster week (solvable)</option>
            <option value="showcase">Showcase (rostered fortnight)</option>
            <option value="showcaseFree">Showcase (free scheduler)</option>
            <option value="level0">Level 0 (solve ladder)</option>
            <option value="level1">Level 1 (skills split)</option>
            <option value="level2">Level 2 (availability)</option>
            <option value="stress">Stress (2,000 x 10)</option>
          </select>
        </label>
        <button
          data-testid="edit-data-button"
          onClick={() => setEditorOpen(true)}
          style={{ fontSize: 13 }}
          title="Edit the selected dataset as its future Power Apps tables (stored locally)"
          type="button"
        >
          Edit data{overlay ? " *" : ""}
        </button>
        <button
          data-testid="generate-button"
          onClick={requestGenerate}
          style={{ fontSize: 13 }}
          title="Expand demand templates into open shifts for the current period (reconciles on re-run)"
          type="button"
        >
          Generate shifts
        </button>
        <label style={{ fontSize: 13 }}>
          <input
            checked={empty}
            onChange={(changeEvent) => setEmpty(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Empty
        </label>
        <label style={{ fontSize: 13 }} title="Rows with no start or end yet">
          <input
            checked={withUndated}
            data-testid="bench-undated"
            onChange={(changeEvent) => setWithUndated(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Undated
        </label>
        <label style={{ fontSize: 13 }} title="F22: simulate a connected instance">
          <input
            checked={connected}
            data-testid="bench-connected"
            onChange={(changeEvent) => setConnected(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Connected
        </label>
        <label style={{ fontSize: 13 }} title="F22: maker hides the conversion surface (honored only when connected)">
          <input
            checked={conversionHidden}
            data-testid="bench-hide-optimize"
            onChange={(changeEvent) =>
              setConversionHidden(changeEvent.target.checked)
            }
            type="checkbox"
          />{" "}
          Hide Optimize
        </label>
        <label style={{ fontSize: 13 }} title="F22 deliverable 3: simulate today's free solves being used up">
          <input
            checked={quotaSpent}
            data-testid="bench-quota-spent"
            onChange={(changeEvent) => setQuotaSpent(changeEvent.target.checked)}
            type="checkbox"
          />{" "}
          Quota spent
        </label>
        <label style={{ fontSize: 13 }} title="F26: the latest run the solve session would report for this calendar">
          Latest run{" "}
          <select
            data-testid="bench-latest-run"
            onChange={(changeEvent) =>
              setLatestRunKind(
                changeEvent.target.value as "changed" | "finished" | "none" | "running",
              )
            }
            value={latestRunKind}
          >
            <option value="none">none</option>
            <option value="finished">finished, unreviewed</option>
            <option value="running">running</option>
            <option value="changed">finished, schedule changed</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }} title="F27: the entitlement session's state the control would derive">
          Entitlement{" "}
          <select
            data-testid="bench-entitlement"
            onChange={(changeEvent) => setEntitlementKind(changeEvent.target.value as BenchEntitlementKind)}
            value={entitlementKind}
          >
            <option value="current">paid, current</option>
            <option value="above">paid, above plan</option>
            <option value="free">free, registered</option>
            <option value="grace">past due, in grace</option>
            <option value="lapsed">lapsed</option>
            <option value="paused">unreachable for a day</option>
            <option value="none">no claims</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Host theme{" "}
          <select
            data-testid="host-theme"
            onChange={(changeEvent) =>
              setHostTheme(changeEvent.target.value as HostThemeName)
            }
            value={hostTheme}
          >
            <option value="none">None (standalone)</option>
            <option value="light">Fluent light</option>
            <option value="dark">Fluent dark</option>
            <option value="branded">Branded (teal)</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Zone{" "}
          <select
            onChange={(changeEvent) =>
              host.setDisplayZone(changeEvent.target.value)
            }
            value={host.displayZone}
          >
            <option value="site">Site time</option>
            <option value="Etc/UTC">UTC</option>
            <option value="Pacific/Auckland">Pacific/Auckland</option>
            <option value="Australia/Adelaide">Australia/Adelaide</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Solver{" "}
          <input
            data-testid="solver-url"
            onChange={(changeEvent) => {
              setSolverUrl(changeEvent.target.value);
              try {
                window.localStorage.setItem(
                  SOLVER_URL_KEY,
                  changeEvent.target.value,
                );
              } catch {
                // unpersisted is fine
              }
            }}
            style={{ width: 160 }}
            value={solverUrl}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Locale{" "}
          <select
            data-testid="bench-locale"
            onChange={(changeEvent) =>
              setLocale(changeEvent.target.value as SchedulerLocale)
            }
            value={locale}
          >
            {Object.entries(schedulerLanguages).map(([tag, language]) => (
              <option key={tag} lang={tag} value={tag}>{language.name}</option>
            ))}
          </select>
        </label>
        {renderMs !== undefined ? (
          <span data-testid="render-ms" style={{ fontSize: 13 }}>
            Render: {renderMs}ms
          </span>
        ) : null}
        <span data-testid="harness-message" style={{ fontSize: 13 }}>
          {host.message}
        </span>
      </div>
      <details data-testid="rules-config" style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>
          Rules configuration (maker settings; stored as the PCF maps
          chr_ columns)
        </summary>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "8px 0",
          }}
        >
          <PolicySelect
            label="Skill mismatch"
            onChange={(policy) => updateRules({ skillMismatchPolicy: policy })}
            testId="rules-skill-policy"
            value={rulesConfig.skillMismatchPolicy}
          />
          <PolicySelect
            label="Overlap"
            onChange={(policy) => updateRules({ overlapPolicy: policy })}
            testId="rules-overlap-policy"
            value={rulesConfig.overlapPolicy}
          />
          <PolicySelect
            label="Working hours"
            onChange={(policy) => updateRules({ workingHoursPolicy: policy })}
            testId="rules-hours-policy"
            value={rulesConfig.workingHoursPolicy}
          />
          <label style={{ fontSize: 13 }}>
            Window{" "}
            <input
              data-testid="rules-hours-start"
              max={24}
              min={0}
              onChange={(changeEvent) =>
                updateRules({
                  workingStartHour: Number(changeEvent.target.value),
                })
              }
              style={{ width: 48 }}
              type="number"
              value={rulesConfig.workingStartHour ?? 0}
            />
            {" - "}
            <input
              data-testid="rules-hours-end"
              max={24}
              min={0}
              onChange={(changeEvent) =>
                updateRules({
                  workingEndHour: Number(changeEvent.target.value),
                })
              }
              style={{ width: 48 }}
              type="number"
              value={rulesConfig.workingEndHour ?? 24}
            />
          </label>
          <PolicySelect
            label="Availability"
            onChange={(policy) => updateRules({ availabilityPolicy: policy })}
            testId="rules-availability-policy"
            value={rulesConfig.availabilityPolicy}
          />
          <PolicySelect
            label="Min break"
            onChange={(policy) => updateRules({ minimumBreakPolicy: policy })}
            testId="rules-break-policy"
            value={rulesConfig.minimumBreakPolicy}
          />
          <label style={{ fontSize: 13 }}>
            Break minutes{" "}
            <input
              data-testid="rules-break-minutes"
              min={0}
              onChange={(changeEvent) =>
                updateRules({
                  minimumBreakMinutes: Math.max(
                    0,
                    Number(changeEvent.target.value) || 0,
                  ),
                })
              }
              style={{ width: 64 }}
              type="number"
              value={rulesConfig.minimumBreakMinutes}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Period{" "}
            <select
              data-testid="period-unit"
              onChange={(changeEvent) =>
                updatePeriod({
                  unit: changeEvent.target.value as PeriodUnit | "off",
                })
              }
              value={periodStored.unit}
            >
              <option value="off">off</option>
              <option value="week">week</option>
              <option value="fortnight">fortnight</option>
              <option value="month">month</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Anchor{" "}
            <input
              data-testid="period-anchor"
              onChange={(changeEvent) =>
                updatePeriod({ anchor: changeEvent.target.value })
              }
              type="date"
              value={periodStored.anchor}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Plan ahead{" "}
            <input
              data-testid="plan-ahead"
              min={1}
              max={12}
              onChange={(changeEvent) =>
                setPlanAheadPeriods(
                  Math.max(1, Number(changeEvent.target.value) || 1),
                )
              }
              style={{ width: 48 }}
              type="number"
              value={planAheadPeriods}
            />{" "}
            periods
          </label>
          <label style={{ fontSize: 13 }}>
            Publish ahead{" "}
            <input
              data-testid="publish-ahead-days"
              min={0}
              max={60}
              onChange={(changeEvent) =>
                setPublishAheadDays(
                  Math.max(0, Number(changeEvent.target.value) || 0),
                )
              }
              style={{ width: 48 }}
              type="number"
              value={publishAheadDays}
            />{" "}
            days
          </label>
          <PolicySelect
            label="Cross-group"
            onChange={(policy) => updateRules({ crossGroupPolicy: policy })}
            testId="rules-group-policy"
            value={rulesConfig.crossGroupPolicy}
          />
        </div>
      </details>
      <div style={{ height: "calc(100vh - 130px)", minHeight: 420 }}>
        {/* As the control does: the host's Fluent theme, else Fluent's light theme. */}
        <FluentProvider
          style={{ display: "contents" }}
          theme={(hostTokenTheme(hostTheme) as Theme | undefined) ?? webLightTheme}
        >
        <SchedulerSurface
          {...host.surfaceProps}
          hourFormat={hourFormat}
          onCancelSolve={cancelSolve}
          onDiscardProposal={discardProposal}
          onPublishProposal={publishProposal}
          periodConfig={plain ? undefined : periodConfig}
          planning={planning}
          onRequestSolve={
            plain || (planningActive && planMode !== "plan") || !solveAllowed
              ? undefined
              : () => requestSolve()
          }
          conversionSurface={
            plain
              ? {
                  connected,
                  hidden: conversionHidden,
                  onConnect: () => host.notify("Connect flow would open here"),
                  onLearnMore: () => host.notify("Learn-more would open here"),
                  portalUrl: benchSession.portalUrl,
                }
              : undefined
          }
          resumeRun={plain ? undefined : resumeRun}
          proposal={plain ? undefined : proposal}
          solveCapabilities={plain ? undefined : solveCapabilities}
          generation={
            plain || (activeFixture.templates ?? []).length === 0 || !scenarioAllowed
              ? undefined
              : {
                  onGenerate: (generateWindow) =>
                    host.generate(activeFixture.templates ?? [], generateWindow),
                  periodConfigured: periodConfig !== undefined,
                }
          }
          solveQuota={
            plain ||
            (planningActive && planMode !== "plan") ||
            (entitlementStatus !== undefined && entitlementStatus.kind !== "free")
              ? undefined
              : {
                  dailySolveLimit: benchSession.quota.dailySolveLimit,
                  onUpgrade: () => host.notify("Upgrade flow would open here"),
                  portalUrl: benchSession.portalUrl,
                  remainingSolves: benchSession.quota.remainingSolves,
                }
          }
          solveState={plain ? undefined : solveState}
          entitlement={
            plain
              ? undefined
              : toEntitlementDisplay(entitlementStatus, {
                  onRetry: () => host.notify("Retry would refresh the entitlement now"),
                  planUrl: planUsageUrl(benchEntitlement?.portalUrl, "bench.crm6.dynamics.com"),
                })
          }
          statusColorRules={plain ? undefined : statusColorRules}
          undoRedo={{
            canRedo: host.canRedo,
            canUndo: host.canUndo,
            onRedo: host.redo,
            onUndo: host.undo,
          }}
          strings={schedulerLanguages[locale].strings}
          onOpenSettings={() => host.notify("The view settings form would open here")}
          theme={hostSchedulerTheme(hostTheme)}
          view={view}
          {...datasetOverrides}
        />
        </FluentProvider>
      </div>
      {editorOpen ? (
        <DataEditor
          key={`${datasetName}:${overlayRev}`}
          onApply={applyTables}
          onClose={() => setEditorOpen(false)}
          onReset={resetTables}
          tables={editorTables}
        />
      ) : null}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.render(<HarnessApp />, rootElement);
}

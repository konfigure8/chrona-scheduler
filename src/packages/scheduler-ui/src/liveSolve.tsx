/**
 * F41 Live solve on the board (RULED 2026-09-29, Docs/domain_model.md 6.5): while
 * a solve runs, the board follows the best roster so far. Shifts move to other
 * workers, appear where the solver fills them and drop into the open shifts, each
 * with a short animation; a progress panel above the board names the run, counts
 * the seconds, shows the four stages, a live scorecard and a quality chart. The
 * motion follows the approved prototype (research/2026-11-03-f41-live-solve):
 * chips lift, arc and land with a ring; swaps cross on opposite bends; a long move
 * leaves a faint trail; a Must break that clears flashes green; a sweep reads
 * across the columns; reduced motion crossfades only.
 */
import * as React from "react";

import {
  liveQuality,
  liveRedrawDelayMs,
  SOLVE_STAGES,
  type LiveFacts,
  type SolveProgress,
  type SolveStage,
} from "./solve";
import { ScoreTile, type ScoreTileProps } from "./ProposalScorecard";
import { REPLAY_FIRST_LANDING_MS, REPLAY_MS, usePrefersReducedMotion, useTweenedNumber } from "./tween";

export { REPLAY_FIRST_LANDING_MS, REPLAY_MS, usePrefersReducedMotion, useTweenedNumber };
import { formatString } from "./stringResources";
import { useSchedulerStrings } from "./strings";

/** The gap between two chips' flights at most, as the prototype's stagger. */
const STAGGER_STEP_MS = 45;
/**
 * A live redraw's flights start within this time, however many shifts change (Matt 2026-11-10
 * "Always fly, staggered"): the gap between two chips shrinks as the changes grow, so the last
 * chip starts within this window and lands a flight (at most 720 ms) later. A redraw that comes
 * sooner takes each chip from where it is in the air (getSnapshotBeforeUpdate).
 */
export const LIVE_STAGGER_MS = 1200;
/** A move longer than this many pixels leaves a faint trail. */
const TRAIL_MIN_PX = 60;
const EASE = "cubic-bezier(.45,0,.15,1)";

/**
 * The ruling's pace (F41): the value the board draws, after half a second of
 * quiet and at least every two seconds while it keeps changing. Undefined at once.
 */
export function useLiveRedraw<T>(value: T | undefined): T | undefined {
  const [shown, setShown] = React.useState<T | undefined>(value);
  const latest = React.useRef(value);
  const pendingSince = React.useRef<number | undefined>(undefined);
  latest.current = value;
  React.useEffect(() => {
    if (value === undefined) {
      pendingSince.current = undefined;
      setShown(undefined);
      return undefined;
    }
    const now = Date.now();
    pendingSince.current ??= now;
    const timer = setTimeout(() => {
      pendingSince.current = undefined;
      setShown(latest.current);
    }, liveRedrawDelayMs(pendingSince.current, now, now));
    return () => clearTimeout(timer);
  }, [value]);
  return value === undefined ? undefined : shown;
}

interface ChipBox {
  readonly el: HTMLElement;
  readonly rect: DOMRect;
}

/** Each shift's chip or bar on the board, by its event id: the first one drawn. */
function measureChips(root: HTMLElement): Map<string, ChipBox> {
  const boxes = new Map<string, ChipBox>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-event-id]")) {
    const id = el.dataset.eventId;
    if (id && !boxes.has(id) && !id.startsWith("ghost:")) {
      boxes.set(id, { el, rect: el.getBoundingClientRect() });
    }
  }
  return boxes;
}

function inView(rect: DOMRect, view: DOMRect): boolean {
  return rect.width > 0 && rect.bottom > view.top && rect.top < view.bottom && rect.right > view.left && rect.left < view.right;
}

function canAnimate(el: HTMLElement): boolean {
  return typeof el.animate === "function";
}

export interface ChipMotionProps {
  /** Animate the board's chips when this changes: the roster the board draws. */
  readonly version: unknown;
  /** The board follows a run: chips move. */
  readonly active: boolean;
  /** The review takes over from a run: the board's layout changes, so the chips only fade. */
  readonly handover?: boolean;
  /** This redraw is the first roster, or an answer with no best before it: it replays shift by shift. */
  readonly replay?: boolean;
  /** The surface: its chips and bars carry data-event-id. */
  readonly scope: React.RefObject<HTMLElement | null>;
  /** Shifts behind a Must break on the roster drawn; one that clears flashes green. */
  readonly mustBroken?: ReadonlySet<string>;
  /** Shifts left open on the roster drawn: a shift that drops into them rings red, one filled rings blue. */
  readonly open?: ReadonlySet<string>;
  readonly reduced: boolean;
  /** "reading": a sweep reads across the columns; "applied": one green sweep. Keyed by sweepKey. */
  readonly sweep?: "applied" | "reading";
  readonly sweepKey?: number;
}

/**
 * The board's motion layer. React draws the new roster; this measures every chip
 * just before the change lands (getSnapshotBeforeUpdate) and plays each from where
 * it was to where it is (FLIP), on the Roster grid and the Timeline alike. Every
 * changed chip in view flies, staggered within the redraw, however many change
 * (Matt 2026-11-10 "Always fly, staggered"); only with reduced motion do the
 * changed chips crossfade instead.
 */
export class ChipMotion extends React.Component<ChipMotionProps> {
  private readonly layer = React.createRef<HTMLDivElement>();
  private readonly trails = new Set<HTMLElement>();

  componentWillUnmount(): void {
    this.clearTrails();
  }

  /** No trail outlives the run, and no chip is left mid-flight: all of it goes when the motion stops. */
  private clearTrails(): void {
    for (const line of this.trails) {
      line.getAnimations?.().forEach((animation) => animation.cancel());
      line.remove();
    }
    this.trails.clear();
    for (const chip of this.flying) {
      chip.getAnimations?.().forEach((animation) => animation.cancel());
      chip.classList.remove("chrona-sched__chip--flying");
    }
    this.flying.clear();
  }

  private readonly flying = new Set<HTMLElement>();

  componentDidMount(): void {
    this.fitToGrid();
  }

  /** The layer covers the board's grid only, so the sweeps and trails never cross the panel, the toolbar or the legend. */
  private fitToGrid(): void {
    const layer = this.layer.current;
    const host = layer?.parentElement;
    const grid = this.props.scope.current?.querySelector<HTMLElement>(".chrona-sched__roster, .chrona-sched__timeline");
    if (!layer || !host) {
      return;
    }
    if (!grid) {
      layer.style.display = "none";
      return;
    }
    const box = grid.getBoundingClientRect();
    const origin = host.getBoundingClientRect();
    layer.style.display = "";
    layer.style.left = `${box.left - origin.left}px`;
    layer.style.top = `${box.top - origin.top}px`;
    layer.style.width = `${box.width}px`;
    layer.style.height = `${box.height}px`;
  }

  getSnapshotBeforeUpdate(previous: ChipMotionProps): Map<string, ChipBox> | null {
    const root = this.props.scope.current;
    if (!root || !this.props.active || previous.version === this.props.version) {
      return null;
    }
    // A redraw can land while the last one's chips are still in the air (its stagger and flights take up to about two
    // seconds): each chip is measured where it is seen, then its old flight stops, so the new one starts from there
    // and the landing is measured at rest.
    const before = measureChips(root);
    for (const { el } of before.values()) {
      if (typeof el.getAnimations === "function") {
        for (const animation of el.getAnimations()) animation.cancel();
      }
    }
    return before;
  }

  componentDidUpdate(previous: ChipMotionProps, _state: unknown, before: Map<string, ChipBox> | null): void {
    const root = this.props.scope.current;
    this.fitToGrid();
    if (!this.props.active || this.props.handover) {
      this.clearTrails();
    }
    if (!root || !before) {
      return;
    }
    const after = measureChips(root);
    // Chips move only inside the grid's view: a chip under the header or the stats columns lands without a flight.
    const grid = root.querySelector<HTMLElement>(".chrona-sched__roster, .chrona-sched__timeline");
    const view = (grid ?? root).getBoundingClientRect();
    const moved: { id: string; from: DOMRect; to: ChipBox }[] = [];
    const appeared: ChipBox[] = [];
    for (const [id, box] of after) {
      const old = before.get(id);
      if (!old) {
        if (inView(box.rect, view)) {
          appeared.push(box);
        }
        continue;
      }
      const dx = old.rect.left - box.rect.left;
      const dy = old.rect.top - box.rect.top;
      if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && (inView(box.rect, view) || inView(old.rect, view))) {
        moved.push({ id, from: old.rect, to: box });
      }
    }
    if (this.props.replay && !this.props.reduced) {
      this.playReplay(moved, appeared, previous, view);
    } else if (this.props.reduced || this.props.handover === true) {
      for (const { to } of moved) {
        fade(to.el);
      }
      for (const box of appeared) {
        fade(box.el);
      }
    } else {
      const byStart = new Map(moved.map((entry) => [`${Math.round(entry.from.left)}:${Math.round(entry.from.top)}`, entry.id]));
      const items = landingOrder(moved, appeared);
      const step = staggerStep(items.length, LIVE_STAGGER_MS);
      items.forEach((item, order) => {
        const delay = order * step;
        if (!item.from) {
          pop(item.box.el, delay);
          return;
        }
        // A swap: the partner started where this one lands, so the two cross on opposite bends.
        const partner = byStart.get(`${Math.round(item.box.rect.left)}:${Math.round(item.box.rect.top)}`);
        const bend = partner !== undefined ? (item.id < partner ? 16 : -16) : item.box.rect.top > item.from.top ? 10 : -10;
        const ring = this.props.open?.has(item.id)
          ? "danger"
          : previous.open?.has(item.id)
            ? "brand"
            : undefined;
        this.fly(item.box.el, item.from, item.box.rect, delay, bend, ring, view);
      });
    }
    // A Must break that clears flashes green.
    if (previous.mustBroken && this.props.mustBroken) {
      for (const id of previous.mustBroken) {
        const box = after.get(id);
        if (!this.props.mustBroken.has(id) && box && !this.props.open?.has(id) && inView(box.rect, view)) {
          ringOn(box.el, "success", this.props.reduced ? 0 : 420);
        }
      }
    }
  }

  /**
   * The replay: every chip of the roster lands in turn, by start (the board's columns left to
   * right, top to bottom within a column), spread over REPLAY_MS, however many there are.
   */
  private playReplay(
    moved: readonly { id: string; from: DOMRect; to: ChipBox }[],
    appeared: readonly ChipBox[],
    previous: ChipMotionProps,
    view: DOMRect,
  ): void {
    const items = landingOrder(moved, appeared);
    const step = staggerStep(items.length, REPLAY_MS);
    items.forEach((item, order) => {
      const delay = order * step;
      if (item.from) {
        const ring = this.props.open?.has(item.id) ? "danger" : previous.open?.has(item.id) || !this.props.open ? "brand" : undefined;
        this.fly(item.box.el, item.from, item.box.rect, delay, item.box.rect.top > item.from.top ? 10 : -10, ring, view);
      } else {
        pop(item.box.el, delay);
      }
    });
  }

  private fly(el: HTMLElement, from: DOMRect, to: DOMRect, delay: number, bend: number, ring: "brand" | "danger" | undefined, view: DOMRect): void {
    if (!canAnimate(el)) {
      return;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const distance = Math.hypot(dx, dy);
    const duration = Math.min(720, 300 + distance * 0.75);
    el.classList.add("chrona-sched__chip--flying");
    this.flying.add(el);
    const animation = el.animate(
      [
        { boxShadow: "var(--csui-shadow)", transform: `translate(${dx}px, ${dy}px) scale(1)` },
        { boxShadow: "var(--csui-shadow-flyout)", offset: 0.5, transform: `translate(${dx / 2 + bend}px, ${dy / 2}px) scale(1.07)` },
        { boxShadow: "none", transform: "translate(0, 0) scale(1)" },
      ],
      { delay, duration, easing: EASE, fill: "backwards" },
    );
    if (Math.abs(dy) >= TRAIL_MIN_PX) {
      this.trail(from, to, delay, duration, view);
    }
    animation.finished
      .then(() => {
        this.flying.delete(el);
        el.classList.remove("chrona-sched__chip--flying");
        if (ring) {
          ringOn(el, ring, 0);
        }
      })
      .catch(() => {
        this.flying.delete(el);
        el.classList.remove("chrona-sched__chip--flying");
      });
  }

  /** A faint line along a long move, fading in and out with the chip. */
  private trail(from: DOMRect, to: DOMRect, delay: number, duration: number, view: DOMRect): void {
    const layer = this.layer.current;
    const host = layer?.parentElement;
    if (!layer || !host) {
      return;
    }
    const origin = layer.getBoundingClientRect();
    const line = document.createElement("div");
    line.className = "chrona-sched__motion-trail";
    const top = Math.max(Math.min(from.top, to.top) + to.height / 2, view.top) - origin.top;
    const bottom = Math.min(Math.max(from.top, to.top) + to.height / 2, view.bottom) - origin.top;
    line.style.left = `${from.left + from.width / 2 - origin.left}px`;
    line.style.top = `${top}px`;
    line.style.height = `${Math.max(0, bottom - top)}px`;
    layer.appendChild(line);
    this.trails.add(line);
    const done = (): void => {
      this.trails.delete(line);
      line.remove();
    };
    if (!canAnimate(line)) {
      done();
      return;
    }
    line
      .animate([{ opacity: 0 }, { offset: 0.4, opacity: 0.55 }, { opacity: 0 }], { delay, duration, easing: "ease-out" })
      .finished.then(done)
      .catch(done);
  }

  render(): JSX.Element {
    return (
      <div aria-hidden="true" className="chrona-sched__motion-layer" data-testid="live-motion" ref={this.layer}>
        {this.props.sweep ? (
          <div
            className={`chrona-sched__motion-sweep chrona-sched__motion-sweep--${this.props.sweep}`}
            data-testid={`live-sweep-${this.props.sweep}`}
            key={`${this.props.sweep}-${this.props.sweepKey ?? 0}`}
          />
        ) : null}
      </div>
    );
  }
}

interface Landing {
  readonly box: ChipBox;
  /** Where the chip was: absent for a chip that appears. */
  readonly from: DOMRect | undefined;
  readonly id: string;
}

/** The order chips land in: by where they land, the board's columns left to right, top to bottom within a column. */
function landingOrder(moved: readonly { id: string; from: DOMRect; to: ChipBox }[], appeared: readonly ChipBox[]): Landing[] {
  return [
    ...moved.map((entry) => ({ box: entry.to, from: entry.from, id: entry.id })),
    ...appeared.map((box) => ({ box, from: undefined, id: box.el.dataset.eventId ?? "" })),
  ].sort((a, b) => a.box.rect.left - b.box.rect.left || a.box.rect.top - b.box.rect.top);
}

/**
 * The gap between two chips' starts: the prototype's 45 ms, closer as the chips grow, so all
 * `count` start within `window` ms. Every chip flies; none waits past the window.
 */
export function staggerStep(count: number, window: number): number {
  return count <= 1 ? 0 : Math.min(STAGGER_STEP_MS, window / count);
}

function fade(el: HTMLElement): void {
  if (canAnimate(el)) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "backwards" });
  }
}

function pop(el: HTMLElement, delay = 0): void {
  if (canAnimate(el)) {
    el.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { delay, duration: 320, easing: EASE, fill: "backwards" });
  }
}

const RING_TOKEN: Record<"brand" | "danger" | "success", string> = {
  brand: "var(--csui-brand)",
  danger: "var(--csui-danger)",
  success: "var(--csui-success)",
};

/** The ring a chip gives off as it lands, or as its Must break clears. */
function ringOn(el: HTMLElement, tone: "brand" | "danger" | "success", delay: number): void {
  if (!canAnimate(el)) {
    return;
  }
  const color = `color-mix(in srgb, ${RING_TOKEN[tone]} 60%, transparent)`;
  el.animate([{ boxShadow: `0 0 0 0 ${color}` }, { boxShadow: "0 0 0 7px transparent" }], { delay, duration: 650, easing: "ease-out" });
}

/** One better roster on the chart: when it came and where it sits, 0 worse to 1 better. */
export interface LiveChartPoint {
  readonly quality: number;
  readonly seconds: number;
}

/**
 * The chart's points over a run: one each time the board draws a new best roster.
 * The first roster's facts set each band's scale; starts over with each run.
 */
export function useLiveChartPoints(runKey: unknown, version: unknown, facts: LiveFacts | undefined, seconds: number): readonly LiveChartPoint[] {
  const [points, setPoints] = React.useState<readonly LiveChartPoint[]>([]);
  const first = React.useRef<LiveFacts | undefined>(undefined);
  const clean = React.useRef(0);
  const secondsRef = React.useRef(seconds);
  secondsRef.current = seconds;
  React.useEffect(() => {
    first.current = undefined;
    clean.current = 0;
    setPoints([]);
  }, [runKey]);
  React.useEffect(() => {
    if (!facts) {
      return;
    }
    first.current ??= facts;
    if (facts.mustBroken === 0 && facts.open === 0) {
      clean.current += 1;
    }
    const quality = liveQuality(facts, first.current, clean.current - 1);
    setPoints((previous) => [...previous, { quality, seconds: secondsRef.current }]);
    // Only a new roster adds a point; its facts come with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return points;
}

const CHART_W = 260;
const CHART_H = 74;
const qualityY = (quality: number): number => 72 - quality * 68;

/**
 * Roster quality over the run (F41): each point is a better roster, the area
 * under the line fills in as the solver improves, the time axis shows seconds,
 * and the quality axis reads only Worse and Better. The line shows up to the
 * clock, with a dot at its head.
 */
export function LiveChart(props: { readonly points: readonly LiveChartPoint[]; readonly seconds: number }): JSX.Element {
  const strings = useSchedulerStrings();
  const end = Math.max(10, Math.ceil(Math.max(props.seconds, props.points[props.points.length - 1]?.seconds ?? 0) / 10) * 10);
  const x = (seconds: number): number => (Math.min(seconds, end) / end) * CHART_W;
  let line = "";
  let area = "";
  props.points.forEach((point, index) => {
    const px = x(point.seconds);
    const py = qualityY(point.quality);
    if (index === 0) {
      line = `M${px},${py}`;
      area = `M${px},${CHART_H} L${px},${py}`;
    } else {
      const previous = qualityY(props.points[index - 1]?.quality ?? point.quality);
      line += ` L${px},${previous} L${px},${py}`;
      area += ` L${px},${previous} L${px},${py}`;
    }
  });
  const last = props.points[props.points.length - 1];
  if (last) {
    line += ` L${CHART_W},${qualityY(last.quality)}`;
    area += ` L${CHART_W},${qualityY(last.quality)} L${CHART_W},${CHART_H} Z`;
  }
  const clip = React.useRef(`chrona-live-clip-${Math.random().toString(36).slice(2)}`).current;
  const head = x(props.seconds);
  return (
    <figure aria-label={strings.solveChartLabel} className="chrona-sched__live-chart" data-testid="live-chart" role="img">
      <span aria-hidden="true" className="chrona-sched__live-chart-y">
        <span>{strings.solveChartBetter}</span>
        <span>{strings.solveChartWorse}</span>
      </span>
      <span className="chrona-sched__live-plot">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <defs>
          <clipPath id={clip}>
            <rect height={CHART_H + 8} width={head} x="0" y="-4" />
          </clipPath>
        </defs>
        <line className="chrona-sched__live-chart-base" vectorEffect="non-scaling-stroke" x1="0" x2={CHART_W} y1={CHART_H - 0.5} y2={CHART_H - 0.5} />
        <line className="chrona-sched__live-chart-mid" vectorEffect="non-scaling-stroke" x1="0" x2={CHART_W} y1={CHART_H / 2} y2={CHART_H / 2} />
        <g clipPath={`url(#${clip})`}>
          <path className="chrona-sched__live-chart-area" d={area} />
          <path className="chrona-sched__live-chart-line" d={line} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* The head dot stays round however the plot stretches. */}
      {last ? (
        <span
          className="chrona-sched__live-chart-head"
          data-testid="live-chart-head"
          style={{ left: `${(head / CHART_W) * 100}%`, top: `${(qualityY(last.quality) / CHART_H) * 100}%` }}
        />
      ) : null}
      </span>
      <span aria-hidden="true" className="chrona-sched__live-chart-x">
        <span>{formatString(strings.solveElapsed, { seconds: "0" })}</span>
        <span>{formatString(strings.solveElapsed, { seconds: String(end) })}</span>
      </span>
    </figure>
  );
}

function stageLabel(strings: ReturnType<typeof useSchedulerStrings>, stage: SolveStage): string {
  return stage === "reading"
    ? strings.solveStageReading
    : stage === "firstRoster"
      ? strings.solveStageFirst
      : stage === "improving"
        ? strings.solveStageImproving
        : strings.solveStagePolish;
}

const CHECK_PATH = "M2 5.2 4.2 7.3 8 2.9";

/** The four stages, each finished one with a check mark that draws itself. */
export function LiveStages(props: { readonly label?: string; readonly stage?: SolveStage }): JSX.Element {
  const strings = useSchedulerStrings();
  const at = props.stage ? SOLVE_STAGES.indexOf(props.stage) : -1;
  return (
    <ol aria-label={props.label} className="chrona-sched__live-stages" data-testid="live-stages">
      {SOLVE_STAGES.map((stage, index) => {
        const state = index < at ? "done" : index === at ? "now" : "next";
        return (
          <li
            aria-current={state === "now" ? "step" : undefined}
            className={`chrona-sched__live-stage chrona-sched__live-stage--${state}`}
            data-state={state}
            data-testid={`live-stage-${stage}`}
            key={stage}
          >
            {index > 0 ? <span aria-hidden="true" className="chrona-sched__live-link" /> : null}
            <span aria-hidden="true" className="chrona-sched__live-dot">
              <svg viewBox="0 0 10 10">
                <path d={CHECK_PATH} />
              </svg>
            </span>
            {stageLabel(strings, stage)}
          </li>
        );
      })}
    </ol>
  );
}

export interface SolveProgressPanelProps {
  readonly progress: SolveProgress;
  /** "Auto scheduling 84 shifts for 12 workers". */
  readonly title: string;
  readonly stage?: SolveStage;
  readonly points: readonly LiveChartPoint[];
  /** The live scorecard's tiles: the board's, then an extension's. */
  readonly tiles: React.ReactNode;
}

/**
 * The progress panel above the board (F41): the run's name and seconds, Stop and
 * review and Cancel, the four stages, the quality chart and the live scorecard.
 * It takes the place of the toolbar's spinner while a solve runs.
 */
export function SolveProgressPanel(props: SolveProgressPanelProps): JSX.Element {
  const strings = useSchedulerStrings();
  const { progress } = props;
  return (
    <section aria-label={props.title} className="chrona-sched__live-panel" data-testid="live-panel">
      <div className="chrona-sched__live-head">
        <span aria-hidden="true" className="chrona-sched__spinner" />
        <span className="chrona-sched__live-title" data-testid="solve-progress">
          <span data-testid="live-title">{progress.stopping ? progress.label : props.title}</span>
          <span aria-hidden="true" className="chrona-sched__live-seconds" data-testid="live-seconds">
            {progress.stopping ? null : formatString(strings.solveElapsed, { seconds: String(progress.seconds) })}
          </span>
        </span>
        {/* Said once per stage, never every second. */}
        <span aria-live="polite" className="chrona-sched__live-announce" role="status">
          {progress.stopping ? progress.label : props.stage ? stageLabel(strings, props.stage) : ""}
        </span>
        <span className="chrona-sched__live-actions">
          {progress.onStop ? (
            <button
              className="chrona-sched__toolbar-button chrona-sched__solve-stop"
              data-testid="solve-stop"
              // Waits while stopping, as the board's waiting buttons do: focus stays on it.
              aria-disabled={progress.stopping ? true : undefined}
              onClick={progress.stopping ? undefined : progress.onStop}
              type="button"
            >
              {strings.solveStop}
            </button>
          ) : null}
          {progress.onCancel ? (
            <button
              className="chrona-sched__toolbar-button chrona-sched__solve-cancel"
              data-testid="solve-cancel"
              onClick={progress.onCancel}
              type="button"
            >
              {strings.cancel}
            </button>
          ) : null}
        </span>
      </div>
      <LiveStages label={props.title} stage={props.stage} />
      <div className="chrona-sched__live-body">
        <LiveChart points={props.points} seconds={progress.seconds} />
        <dl className="chrona-sched__live-tiles" data-testid="live-tiles">
          {props.tiles}
        </dl>
      </div>
    </section>
  );
}

/**
 * A live scorecard tile whose figure eases to each new value (the prototype's
 * number tweens), and gives a small bump when it changes.
 */
export function LiveNumberTile(
  props: Omit<ScoreTileProps, "value"> & {
    readonly format?: (value: number) => string;
    /** The tile turns good when the figure shown reaches this, not before: the colour follows the count. */
    readonly goodAt?: number;
    readonly reduced: boolean;
    /** When the replay ends (ms): the figure counts up with the chips and lands then. Absent = a short ease. */
    readonly replayEndsAt?: number;
    readonly value: number;
  },
): JSX.Element {
  const { format, goodAt, reduced, replayEndsAt, value, ...tile } = props;
  const shown = useTweenedNumber(value, reduced, replayEndsAt);
  // The good tone waits for the figure shown to reach its mark, so the colour never runs ahead of the count.
  const tone = goodAt !== undefined && tile.tone === "good" ? (shown === goodAt ? "good" : undefined) : tile.tone;
  const [bump, setBump] = React.useState(0);
  const last = React.useRef(value);
  React.useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      if (!reduced) {
        setBump((count) => count + 1);
      }
    }
  }, [reduced, value]);
  return (
    <ScoreTile
      {...tile}
      {...(tone ? { tone } : { tone: undefined })}
      className={bump > 0 ? "chrona-sched__live-tile chrona-sched__live-tile--bump" : "chrona-sched__live-tile"}
      key={bump}
      value={format ? format(shown) : String(shown)}
    />
  );
}

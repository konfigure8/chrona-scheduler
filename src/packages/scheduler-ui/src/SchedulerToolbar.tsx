import * as React from "react";
import {
  Button,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Tooltip,
} from "@fluentui/react-components";
import {
  Calendar,
  DateRangeType,
  DayOfWeek,
  DEFAULT_DATE_FORMATTING,
  defaultCalendarStrings,
  type CalendarStrings,
  type DateFormatting,
} from "@fluentui/react-calendar-compat";
import {
  ArrowRedo20Regular,
  ArrowUndo20Regular,
  CalendarLtr20Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  FullScreenMaximize20Regular,
  FullScreenMinimize20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";

import { dateNamesFrom, formatDateLongLabel, type DateNames } from "./dateNames";
import { useFullScreen } from "./fullScreen";
import { formatString, useSchedulerStrings, type SchedulerStrings } from "./strings";
import {
  formatWindowLabel,
  stepAnchor,
  type SchedulerTimeScale,
  type TimeScaleOption,
} from "./viewConfig";
import type { TimeWindow } from "./types";

export interface ToolbarTimeScale {
  readonly effective: number;
  readonly onChange: (minutes: number) => void;
  readonly options: readonly TimeScaleOption[];
}

export interface ToolbarConversionOptimize {
  readonly onOpen: () => void;
}

export interface ToolbarUndoRedo {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly onRedo: () => void;
  readonly onUndo: () => void;
}

/** The maker's settings for this board; shown only to users who can change them. */
export interface ToolbarSettings {
  readonly onOpen: () => void;
}

export interface SchedulerToolbarProps {
  readonly anchor: Date;
  /** The board's full screen, the browser's own: the button at the end. */
  readonly fullScreen?: {
    readonly active: boolean;
    readonly onToggle: () => void;
  };
  readonly settings?: ToolbarSettings;
  /** Undo/redo buttons; keyboard shortcuts stay host-side. */
  readonly undoRedo?: ToolbarUndoRedo;
  /** Standalone conversion surface: quiet Optimize opening the explainer. */
  readonly conversionOptimize?: ToolbarConversionOptimize;
  /** An extension's items after the interval switcher. */
  readonly afterIntervals?: React.ReactNode;
  /** Span used when the "daySpan" interval is offered. */
  readonly daySpanDays?: number;
  readonly interval: SchedulerTimeScale;
  /**
   * Which intervals to offer; order preserved. Defaults to
   * Day/Week/Month; an empty list hides the switcher.
   */
  readonly intervals?: readonly SchedulerTimeScale[];
  readonly onAnchorChange: (next: Date) => void;
  /**
   * Previous and Next step here instead of by the interval, such as
   * by the roster period the Roster grid shows.
   */
  readonly onStep?: (direction: -1 | 1) => void;
  /** The week's first day for the date picker, 0 Sunday to 6 Saturday. */
  readonly weekStartsOn?: number;
  readonly onIntervalChange: (interval: SchedulerTimeScale) => void;
  readonly onNewEvent?: () => void;
  /** Teams-style time-scale menu; omitted when the view has no sub-day axis. */
  readonly timeScale?: ToolbarTimeScale;
  /** Display-zone label chip: the site's city ("Perth"), or an offset ("UTC+10:00"). */
  readonly timeZoneLabel?: string;
  /** The zone in full for the chip's tooltip ("Australia/Perth · UTC+08:00"). */
  readonly timeZoneDetail?: string;
  /** Deterministic "today" for hosts and tests; defaults to the real clock. */
  readonly today?: Date;
  readonly window: TimeWindow;
}

function intervalLabel(
  strings: SchedulerStrings,
  interval: SchedulerTimeScale,
): string {
  const labels: Record<SchedulerTimeScale, string> = {
    day: strings.intervalDay,
    daySpan: strings.intervalDaySpan,
    month: strings.intervalMonth,
    week: strings.intervalWeek,
  };
  return labels[interval];
}

const defaultIntervals: readonly SchedulerTimeScale[] = ["day", "week", "month"];

/** Fluent's icon-only button: subtle, medium, with a tooltip that is also its name. */
function ToolbarIconButton(props: {
  readonly disabled?: boolean;
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId?: string;
}): JSX.Element {
  const mountNode = useFullScreen()?.mountNode;
  return (
    <Tooltip content={props.label} mountNode={mountNode} relationship="label">
      <Button
        appearance="subtle"
        aria-label={props.label}
        data-testid={props.testId}
        disabled={props.disabled}
        icon={props.icon}
        onClick={props.onClick}
        size="medium"
      />
    </Tooltip>
  );
}

/** The day picker in the user's language; the week starts on Monday, as the board does. */
function calendarStrings(strings: SchedulerStrings, names: DateNames): CalendarStrings {
  return {
    ...defaultCalendarStrings,
    days: [...names.weekdaysLong],
    goToToday: strings.today,
    months: [...names.monthsLong],
    nextMonthAriaLabel: strings.nextMonth,
    prevMonthAriaLabel: strings.previousMonth,
    selectedDateFormatString: "{0}",
    shortDays: names.weekdaysShort.map((day) => day.charAt(0).toLocaleUpperCase()),
    shortMonths: [...names.monthsShort],
    todayDateFormatString: "{0}",
  };
}

/** In the board's language, like every date the board writes: "17 August 2026", German "17. August 2026". */
function calendarDateFormatting(names: DateNames): DateFormatting {
  return { ...DEFAULT_DATE_FORMATTING, formatMonthDayYear: (date) => formatDateLongLabel(date, names) };
}

function rangeTypeFor(interval: SchedulerTimeScale): DateRangeType {
  if (interval === "week") {
    return DateRangeType.Week;
  }
  if (interval === "month") {
    return DateRangeType.Month;
  }
  return DateRangeType.Day;
}

/** The visible range behind a calendar icon; picking a day moves the board there. */
function DateNavigator(props: {
  readonly anchor: Date;
  readonly interval: SchedulerTimeScale;
  readonly label: string;
  readonly names: DateNames;
  readonly onAnchorChange: (next: Date) => void;
  readonly today?: Date;
  readonly weekStartsOn?: number;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const [open, setOpen] = React.useState(false);
  // Full screen hides the page body, so the picker mounts in the board.
  const mountNode = useFullScreen()?.mountNode;
  const localized = React.useMemo(
    () => calendarStrings(strings, props.names),
    [strings, props.names],
  );
  const formatting = React.useMemo(() => calendarDateFormatting(props.names), [props.names]);
  return (
    <Popover
      mountNode={mountNode}
      onOpenChange={(_event, data) => setOpen(data.open)}
      open={open}
      positioning="below-start"
      trapFocus
    >
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={strings.goToDate} mountNode={mountNode} relationship="description">
          <Button
            appearance="subtle"
            className="chrona-sched__toolbar-range"
            icon={<CalendarLtr20Regular />}
            size="medium"
          >
            <span data-testid="toolbar-range">{props.label}</span>
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface aria-label={strings.goToDate}>
        <Calendar
          dateRangeType={rangeTypeFor(props.interval)}
          dateTimeFormatter={formatting}
          firstDayOfWeek={(props.weekStartsOn ?? DayOfWeek.Monday) as DayOfWeek}
          highlightSelectedMonth
          isMonthPickerVisible={false}
          // The calendar stops Esc and asks to be dismissed: the picker closes.
          onDismiss={() => setOpen(false)}
          onSelectDate={(date) => {
            setOpen(false);
            props.onAnchorChange(date);
          }}
          showGoToToday={false}
          strings={localized}
          today={props.today}
          value={props.anchor}
        />
      </PopoverSurface>
    </Popover>
  );
}

function timeScaleOptionLabel(
  strings: SchedulerStrings,
  minutes: number,
): string {
  // Teams annotates the extremes: 60 least space, 5 most space.
  const template =
    minutes === 60
      ? strings.timeScaleLeast
      : minutes === 5
        ? strings.timeScaleMost
        : strings.timeScaleMinutes;
  return formatString(template, { count: minutes });
}

/** Teams-style time-scale dropdown as a Fluent menu with radio items. */
function TimeScaleMenu(props: {
  readonly timeScale: ToolbarTimeScale;
}): JSX.Element {
  const strings = useSchedulerStrings();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (downEvent: PointerEvent): void => {
      if (!rootRef.current?.contains(downEvent.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="chrona-sched__timescale" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={strings.timeScale}
        className="chrona-sched__toolbar-button chrona-sched__timescale-trigger"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        {formatString(strings.timeScaleShort, {
          count: props.timeScale.effective,
        })}
        <span aria-hidden="true" className="chrona-sched__timescale-caret">
          ▾
        </span>
      </button>
      {open ? (
        <div
          aria-label={strings.timeScale}
          className="chrona-sched__menu chrona-sched__timescale-menu"
          role="menu"
        >
          {props.timeScale.options.map((option) => (
            <button
              aria-checked={option.minutes === props.timeScale.effective}
              className="chrona-sched__menu-item chrona-sched__timescale-item"
              disabled={!option.enabled}
              key={option.minutes}
              onClick={() => {
                setOpen(false);
                props.timeScale.onChange(option.minutes);
              }}
              role="menuitemradio"
              type="button"
            >
              <span
                aria-hidden="true"
                className="chrona-sched__timescale-check"
              >
                {option.minutes === props.timeScale.effective ? "✓" : ""}
              </span>
              {timeScaleOptionLabel(strings, option.minutes)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Scheduler time navigation: New event, undo/redo, Today, previous/next
 * and the visible range behind a calendar icon on the left; the
 * time-interval switcher (Day/Week/Month) and the maker's settings on
 * the right. Stepping follows the interval - next in Month moves a
 * calendar month. The representation itself is maker configuration,
 * not a toolbar concern.
 */
export function SchedulerToolbar(props: SchedulerToolbarProps): JSX.Element {
  const {
    anchor,
    daySpanDays,
    interval,
    intervals = defaultIntervals,
    onAnchorChange,
    onIntervalChange,
    onStep,
    weekStartsOn,
    onNewEvent,
    settings,
    timeScale,
    timeZoneDetail,
    timeZoneLabel,
    today,
    window,
  } = props;
  const strings = useSchedulerStrings();
  const names = React.useMemo(
    () => dateNamesFrom(strings),
    [strings.monthsLong, strings.monthsShort, strings.weekdaysLong, strings.weekdaysShort],
  );

  const { conversionOptimize, undoRedo } = props;
  return (
    <div className="chrona-sched__toolbar">
      {/* A secondary button: the run (Optimize, Repair) or Publish is the surface's one primary. */}
      {onNewEvent ? (
        <button
          className="chrona-sched__toolbar-button"
          onClick={onNewEvent}
          type="button"
        >
          + {strings.newEvent}
        </button>
      ) : null}
      {undoRedo ? (
        <div className="chrona-sched__toolbar-group">
          <ToolbarIconButton
            disabled={!undoRedo.canUndo}
            icon={<ArrowUndo20Regular />}
            label={strings.undo}
            onClick={undoRedo.onUndo}
            testId="undo-button"
          />
          <ToolbarIconButton
            disabled={!undoRedo.canRedo}
            icon={<ArrowRedo20Regular />}
            label={strings.redo}
            onClick={undoRedo.onRedo}
            testId="redo-button"
          />
        </div>
      ) : null}
      <button
        className="chrona-sched__toolbar-button"
        onClick={() => onAnchorChange(today ?? new Date())}
        type="button"
      >
        {strings.today}
      </button>
      <div className="chrona-sched__toolbar-group">
        <ToolbarIconButton
          icon={<ChevronLeft20Regular />}
          label={strings.previous}
          onClick={() =>
            onStep
              ? onStep(-1)
              : onAnchorChange(stepAnchor(anchor, interval, -1, daySpanDays))
          }
        />
        <ToolbarIconButton
          icon={<ChevronRight20Regular />}
          label={strings.next}
          onClick={() =>
            onStep
              ? onStep(1)
              : onAnchorChange(stepAnchor(anchor, interval, 1, daySpanDays))
          }
        />
      </div>
      <DateNavigator
        anchor={anchor}
        interval={interval}
        label={formatWindowLabel(window, interval, names)}
        names={names}
        onAnchorChange={onAnchorChange}
        today={today}
        weekStartsOn={weekStartsOn}
      />
      {timeZoneLabel ? (
        <span
          className="chrona-sched__toolbar-tz"
          title={
            timeZoneDetail
              ? `${strings.timeZoneChip} \u00b7 ${timeZoneDetail}`
              : strings.timeZoneChip
          }
        >
          {timeZoneLabel}
        </span>
      ) : null}
      {/* The time scale is a view control: it sits with the interval tabs and wraps with them as one cluster. */}
      <div className="chrona-sched__toolbar-trailing">
      {timeScale ? <TimeScaleMenu timeScale={timeScale} /> : null}
      {intervals.length > 0 ? (
      <div
        aria-label={strings.interval}
        className="chrona-sched__toolbar-views"
        role="tablist"
      >
        {intervals.map((candidate) => (
          <button
            aria-selected={candidate === interval}
            className={
              candidate === interval
                ? "chrona-sched__toolbar-view chrona-sched__toolbar-view--active"
                : "chrona-sched__toolbar-view"
            }
            key={candidate}
            onClick={() => onIntervalChange(candidate)}
            role="tab"
            type="button"
          >
            {intervalLabel(strings, candidate)}
          </button>
        ))}
      </div>
      ) : null}
      {props.afterIntervals}
      {conversionOptimize ? (
        <button
          className="chrona-sched__toolbar-button"
          data-testid="conversion-optimize"
          onClick={conversionOptimize.onOpen}
          type="button"
        >
          {strings.conversionOptimize}
        </button>
      ) : null}
      {settings ? (
        <ToolbarIconButton
          icon={<Settings20Regular />}
          label={strings.schedulerSettings}
          onClick={settings.onOpen}
          testId="scheduler-settings"
        />
      ) : null}
      {props.fullScreen ? (
        <ToolbarIconButton
          icon={
            props.fullScreen.active ? (
              <FullScreenMinimize20Regular />
            ) : (
              <FullScreenMaximize20Regular />
            )
          }
          label={props.fullScreen.active ? strings.fullScreenExit : strings.fullScreen}
          onClick={props.fullScreen.onToggle}
          testId="full-screen"
        />
      ) : null}
      </div>
    </div>
  );
}

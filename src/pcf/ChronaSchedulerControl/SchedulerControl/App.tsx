import * as React from "react";
import { FluentProvider, type Theme, webLightTheme } from "@fluentui/react-components";

import {
  fluentThemeToSchedulerTheme,
  type FluentV9Tokens,
  SchedulerSurface,
  type SchedulerTheme,
} from "@chrona/scheduler-ui";

import { F0Preview } from "./F0Preview";
import type { IInputs } from "./generated/ManifestTypes";
import { useDataverseScheduleHost } from "./useDataverseHost";

export interface AppProps {
  readonly context: ComponentFramework.Context<IInputs>;
  readonly dataFingerprint: string;
  /** Rows beyond the dataset cap stayed unloaded; the surface says so. */
  readonly rowCapReached: boolean;
}

/**
 * Modern theming: the host hands us the resolved Fluent v9 theme -
 * the customer's brand ramp, in their light or dark mode - through
 * `fluentDesignLanguage.tokenTheme`. Microsoft's guidance for
 * components not built from Fluent React components is to read those
 * tokens directly, which is exactly what the scheduler's token
 * contract consumes. When modern theming is off (older apps, or a
 * standalone install) this is undefined and the package's stylesheet
 * defaults stand.
 */
function useHostTheme(
  context: ComponentFramework.Context<IInputs>,
): Partial<SchedulerTheme> | undefined {
  // The platform types declare Theme as `... & any`, so narrow at the
  // boundary: the adapter reads named string tokens and ignores the
  // rest.
  const tokens = context.fluentDesignLanguage?.tokenTheme as
    | FluentV9Tokens
    | undefined;
  return React.useMemo(
    () => fluentThemeToSchedulerTheme(tokens),
    [tokens],
  );
}

function DataverseApp(props: AppProps): JSX.Element {
  const host = useDataverseScheduleHost(
    props.context,
    props.dataFingerprint,
    props.rowCapReached,
  );
  const theme = useHostTheme(props.context);
  return (
    <SchedulerSurface {...host.surfaceProps} theme={theme} view={host.view} />
  );
}

/**
 * Fixture mode is EXPLICIT: `calendarConfigId = "demo"` renders the
 * client-side fixture demo (no writes, instant first value - the
 * zero-agent onboarding path from Docs/strategy.md). Everything else
 * with bound columns renders the Dataverse host, empty views included
 * - an empty bound view is an empty schedule, never fixture data,
 * because pre-data the test harness and a real empty view are
 * indistinguishable through the dataset API and production must never
 * guess.
 */
export function App(props: AppProps): JSX.Element {
  // The toolbar's Fluent components take the host's theme; with modern theming off, Fluent's light theme.
  const fluentTheme =
    (props.context.fluentDesignLanguage?.tokenTheme as Theme | undefined) ?? webLightTheme;
  return (
    <FluentProvider style={{ display: "contents" }} theme={fluentTheme}>
      <AppBody {...props} />
    </FluentProvider>
  );
}

function AppBody(props: AppProps): JSX.Element {
  const demo =
    (props.context.parameters.calendarConfigId?.raw ?? "")
      .trim()
      .toLowerCase() === "demo";
  const bound =
    !demo && (props.context.parameters.workItems?.columns?.length ?? 0) > 0;
  if (bound) {
    return (
      <DataverseApp
        context={props.context}
        dataFingerprint={props.dataFingerprint}
        rowCapReached={props.rowCapReached}
      />
    );
  }
  return <F0Preview theme={useHostTheme(props.context)} />;
}

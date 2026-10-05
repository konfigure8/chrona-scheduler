/**
 * Phase F0 proof host: the PCF sandbox consumes the SAME fixture host
 * as the Vite harness (useFixtureScheduleHost), so host semantics -
 * status flips, rules, widths, preferences - are written once and
 * cannot drift between harnesses. Phase F2 swaps the fixture host for
 * the Dataverse adapter behind the same Surface props.
 */
import * as React from "react";

import {
  SchedulerSurface,
  type SchedulerTheme,
  useFixtureScheduleHost,
} from "@chrona/scheduler-ui";

export function F0Preview(props: {
  /** Host Fluent theme when modern theming is on; else undefined. */
  readonly theme?: Partial<SchedulerTheme>;
}): JSX.Element {
  const host = useFixtureScheduleHost({
    preferenceKey: "chrona-sched:v1:pcf-sandbox",
  });
  return (
    <SchedulerSurface
      {...host.surfaceProps}
      theme={props.theme}
      view="timeline"
    />
  );
}

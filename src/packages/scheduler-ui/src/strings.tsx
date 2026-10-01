import * as React from "react";

import {
  defaultSchedulerStrings,
  resolveStrings,
  type SchedulerStrings,
} from "./stringResources";

export { flagReasonText } from "./stringResources";
export {
  defaultSchedulerStrings,
  formatString,
  resolveStrings,
  type SchedulerStrings,
} from "./stringResources";

const StringsContext = React.createContext<SchedulerStrings>(
  defaultSchedulerStrings,
);

export function SchedulerStringsProvider(props: {
  readonly children?: React.ReactNode;
  readonly strings?: Partial<SchedulerStrings>;
}): JSX.Element {
  const value = React.useMemo(
    () => resolveStrings(props.strings),
    [props.strings],
  );
  return (
    <StringsContext.Provider value={value}>
      {props.children}
    </StringsContext.Provider>
  );
}

export function useSchedulerStrings(): SchedulerStrings {
  return React.useContext(StringsContext);
}

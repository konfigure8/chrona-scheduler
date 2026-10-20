import { Tooltip } from "@fluentui/react-components";
import * as React from "react";

import { useFullScreen } from "./fullScreen";
import { tagClassName, tagPillStyle, type TagColorMap } from "./tagColors";

/**
 * A person's tag (a role in Workforce) as a pill in its colour. A tag
 * with a note, such as a skill that is missing or runs out (F4
 * Validated role membership), takes the warning stroke. Where the pill
 * stands alone it takes focus and shows the note as a Fluent tooltip,
 * which also describes it to assistive technology; inside a row that is
 * itself a control, the note is the pill's native tip only.
 */
export function RolePill(props: {
  readonly colors: TagColorMap | undefined;
  readonly focusable?: boolean;
  readonly note?: string;
  readonly tag: string;
}): JSX.Element {
  const mountNode = useFullScreen()?.mountNode;
  const { note, tag } = props;
  const pill = tagPillStyle(tag, props.colors);
  const element = (
    <span
      className={tagClassName(pill !== undefined, note !== undefined)}
      style={note ? { ...pill, borderColor: "var(--csui-warn)" } : pill}
      tabIndex={note && props.focusable ? 0 : undefined}
      title={note && !props.focusable ? note : undefined}
    >
      {tag}
    </span>
  );
  return note && props.focusable ? (
    <Tooltip
      content={<span className="chrona-sched__tag-note">{note}</span>}
      mountNode={mountNode}
      positioning="after"
      relationship="description"
    >
      {element}
    </Tooltip>
  ) : (
    element
  );
}

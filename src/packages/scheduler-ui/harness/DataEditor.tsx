import * as React from "react";

import type { FixtureView } from "../src/fixtureHost";
import type {
  AvailabilityBand,
  AvailabilityBandKind,
  SchedulerResource,
} from "../src/types";
import type {
  EditableGroupValue,
  EditableSkill,
  EditableTables,
} from "./dataOverlay";

/*
 * Bench data editor: the selected dataset as the tables it will
 * become in Power Apps - one tab per future Dataverse table, column
 * headers carrying the friendly name over the chr_ logical name.
 * Bench chrome only; edits apply through the localStorage overlay
 * and the board reseeds behind the dialog.
 */

export interface DataEditorProps {
  readonly onApply: (tables: EditableTables) => void;
  readonly onClose: () => void;
  readonly onReset: () => void;
  readonly tables: EditableTables;
}

type TabId =
  | "availability"
  | "groups"
  | "roles"
  | "shifts"
  | "skills"
  | "staff"
  | "templates"
  | "views";

const TABS: readonly { readonly id: TabId; readonly label: string; readonly table: string }[] = [
  { id: "staff", label: "Staff", table: "chr_resource" },
  { id: "groups", label: "Groups", table: "chr_groupset / chr_group" },
  { id: "shifts", label: "Shifts", table: "chr_shift" },
  { id: "skills", label: "Skills", table: "chr_skill" },
  { id: "roles", label: "Roles", table: "chr_role" },
  { id: "templates", label: "Demand templates", table: "chr_shiftdemandtemplate" },
  { id: "availability", label: "Availability", table: "chr_availability" },
  { id: "views", label: "Views", table: "chr_schedulerview" },
];

const KINDS: readonly AvailabilityBandKind[] = [
  "unavailable",
  "preferred",
  "unpreferred",
  "busyElsewhere",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toLocalInput(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string, fallback: Date): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function minutesToTime(minutes: number): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

function timeToMinutes(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return fallback;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function Header(props: {
  readonly logical: string;
  readonly name: string;
}): JSX.Element {
  return (
    <th>
      <span className="chrona-bench-editor__col">{props.name}</span>
      <span className="chrona-bench-editor__logical">{props.logical}</span>
    </th>
  );
}

function SkillChips(props: {
  readonly all: readonly EditableSkill[];
  readonly onToggle: (skill: string) => void;
  readonly selected: readonly string[];
}): JSX.Element {
  return (
    <span className="chrona-bench-editor__chips">
      {props.all.map((skill) => {
        const on = props.selected.includes(skill.name);
        return (
          <button
            aria-pressed={on}
            className={
              on
                ? "chrona-bench-editor__chip chrona-bench-editor__chip--on"
                : "chrona-bench-editor__chip"
            }
            key={skill.name}
            onClick={() => props.onToggle(skill.name)}
            type="button"
          >
            {skill.name}
          </button>
        );
      })}
    </span>
  );
}

export function DataEditor(props: DataEditorProps): JSX.Element {
  const [tab, setTab] = React.useState<TabId>("staff");
  const [draft, setDraft] = React.useState<EditableTables>(props.tables);
  const nextIdRef = React.useRef(1);
  const { onClose } = props;

  React.useEffect(() => {
    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const newId = (prefix: string): string =>
    `${prefix}-edit-${Date.now().toString(36)}-${nextIdRef.current++}`;

  const patch = <K extends keyof EditableTables>(
    key: K,
    rows: EditableTables[K],
  ): void => setDraft((previous) => ({ ...previous, [key]: rows }));

  const updateRow = <T,>(
    rows: readonly T[],
    index: number,
    changes: Partial<T>,
  ): readonly T[] =>
    rows.map((row, i) => (i === index ? { ...row, ...changes } : row));

  const removeRow = <T,>(rows: readonly T[], index: number): readonly T[] =>
    rows.filter((_, i) => i !== index);

  const staffOptions = (
    <>
      <option value="r-open">(unscheduled)</option>
      {draft.staff.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </>
  );

  /** Grouping sets in first-seen order (chr_groupset rows). */
  const setNames = [...new Set(draft.groupValues.map((row) => row.set))];

  const valuesOf = (set: string): readonly string[] =>
    draft.groupValues
      .filter((row) => row.set === set)
      .map((row) => row.value);

  const valueOptions = (set: string): JSX.Element => (
    <>
      <option value="">(none)</option>
      {valuesOf(set).map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </>
  );

  const withGroup = (
    groups: Readonly<Record<string, string>> | undefined,
    set: string,
    value: string,
  ): Readonly<Record<string, string>> => {
    const next: Record<string, string> = { ...(groups ?? {}) };
    if (value) {
      next[set] = value;
    } else {
      delete next[set];
    }
    return next;
  };

  const remapAll = (
    map: (groups: Readonly<Record<string, string>> | undefined) =>
      Readonly<Record<string, string>> | undefined,
  ): void =>
    setDraft((current) => ({
      ...current,
      shifts: current.shifts.map((shift) => ({
        ...shift,
        groups: map(shift.groups) ?? {},
      })),
      staff: current.staff.map((person) => ({
        ...person,
        groups: map(person.groups),
      })),
      templates: current.templates.map((slot) => ({
        ...slot,
        groups: map(slot.groups) ?? {},
      })),
    }));

  /**
   * Lookup semantics: renaming a chr_group value follows through to
   * every row referencing it within its set.
   */
  const renameGroupValue = (index: number, value: string): void => {
    const row = draft.groupValues[index];
    if (!row) {
      return;
    }
    setDraft((current) => ({
      ...current,
      groupValues: current.groupValues.map((candidate, i) =>
        i === index ? { ...candidate, value } : candidate,
      ),
      views: current.views.map((view) =>
        view.filter?.set === row.set && view.filter.value === row.value
          ? { ...view, filter: { set: row.set, value } }
          : view,
      ),
    }));
    remapAll((groups) =>
      groups?.[row.set] === row.value
        ? { ...groups, [row.set]: value }
        : groups,
    );
  };

  /** Renaming a chr_groupset renames the dimension everywhere. */
  const renameGroupSet = (index: number, set: string): void => {
    const previous = draft.groupValues[index]?.set;
    if (!previous || previous === set) {
      return;
    }
    setDraft((current) => ({
      ...current,
      groupValues: current.groupValues.map((candidate) =>
        candidate.set === previous ? { ...candidate, set } : candidate,
      ),
      views: current.views.map((view) =>
        view.filter?.set === previous
          ? { ...view, filter: { set, value: view.filter.value } }
          : view,
      ),
    }));
    remapAll((groups) => {
      if (!groups || groups[previous] === undefined) {
        return groups;
      }
      const next: Record<string, string> = { ...groups };
      const value = next[previous];
      delete next[previous];
      if (value !== undefined) {
        next[set] = value;
      }
      return next;
    });
  };

  const roleOptions = (
    <>
      <option value="">(no role)</option>
      {draft.roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </>
  );

  const renderStaff = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_name" name="Name" />
          {setNames.map((set) => (
            <Header key={set} logical="chr_group" name={set} />
          ))}
          <Header logical="chr_capacityhours" name="Capacity h/wk" />
          <Header logical="chr_skills" name="Skills" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.staff.map((person, index) => (
          <tr key={person.id}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "staff",
                    updateRow(draft.staff, index, { name: e.target.value }),
                  )
                }
                value={person.name}
              />
            </td>
            {setNames.map((set) => (
              <td key={set}>
                <select
                  onChange={(e) =>
                    patch(
                      "staff",
                      updateRow(draft.staff, index, {
                        groups: withGroup(person.groups, set, e.target.value),
                      }),
                    )
                  }
                  value={person.groups?.[set] ?? ""}
                >
                  {valueOptions(set)}
                </select>
              </td>
            ))}
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "staff",
                    updateRow(draft.staff, index, {
                      capacityHours: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }),
                  )
                }
                style={{ width: 64 }}
                type="number"
                value={person.capacityHours ?? ""}
              />
            </td>
            <td>
              <SkillChips
                all={draft.skills}
                onToggle={(skill) => {
                  const tags = person.tags ?? [];
                  patch(
                    "staff",
                    updateRow(draft.staff, index, {
                      tags: tags.includes(skill)
                        ? tags.filter((tag) => tag !== skill)
                        : [...tags, skill],
                    }),
                  );
                }}
                selected={person.tags ?? []}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${person.name}`}
                className="chrona-bench-editor__delete"
                onClick={() => patch("staff", removeRow(draft.staff, index))}
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderShifts = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_title" name="Title" />
          <Header logical="chr_start" name="Start" />
          <Header logical="chr_end" name="End" />
          <Header logical="chr_resourceid" name="Staff" />
          {setNames.map((set) => (
            <Header key={set} logical="chr_group" name={set} />
          ))}
          <Header logical="chr_roleid" name="Role" />
          <Header logical="chr_requiredskills" name="Extra skills" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.shifts.map((shift, index) => (
          <tr key={shift.id}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, { title: e.target.value }),
                  )
                }
                value={shift.title}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, {
                      start: fromLocalInput(e.target.value, shift.start),
                    }),
                  )
                }
                type="datetime-local"
                value={toLocalInput(shift.start)}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, {
                      end: fromLocalInput(e.target.value, shift.end),
                    }),
                  )
                }
                type="datetime-local"
                value={toLocalInput(shift.end)}
              />
            </td>
            <td>
              <select
                onChange={(e) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, {
                      resourceId: e.target.value,
                    }),
                  )
                }
                value={shift.resourceId}
              >
                {staffOptions}
              </select>
            </td>
            {setNames.map((set) => (
              <td key={set}>
                <select
                  onChange={(e) =>
                    patch(
                      "shifts",
                      updateRow(draft.shifts, index, {
                        groups: withGroup(shift.groups, set, e.target.value),
                      }),
                    )
                  }
                  value={shift.groups?.[set] ?? ""}
                >
                  {valueOptions(set)}
                </select>
              </td>
            ))}
            <td>
              <select
                onChange={(e) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, {
                      roleId: e.target.value || undefined,
                    }),
                  )
                }
                value={shift.roleId ?? ""}
              >
                {roleOptions}
              </select>
            </td>
            <td>
              <SkillChips
                all={draft.skills}
                onToggle={(skill) =>
                  patch(
                    "shifts",
                    updateRow(draft.shifts, index, {
                      extraSkills: shift.extraSkills.includes(skill)
                        ? shift.extraSkills.filter((tag) => tag !== skill)
                        : [...shift.extraSkills, skill],
                    }),
                  )
                }
                selected={shift.extraSkills}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${shift.title}`}
                className="chrona-bench-editor__delete"
                onClick={() => patch("shifts", removeRow(draft.shifts, index))}
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderGroups = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_groupset.chr_name" name="Set" />
          <Header logical="chr_group.chr_name" name="Value" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.groupValues.map((row, index) => (
          <tr key={index}>
            <td>
              <input
                onChange={(e) => renameGroupSet(index, e.target.value)}
                value={row.set}
              />
            </td>
            <td>
              <input
                onChange={(e) => renameGroupValue(index, e.target.value)}
                value={row.value}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${row.set} ${row.value}`}
                className="chrona-bench-editor__delete"
                onClick={() =>
                  patch("groupValues", removeRow(draft.groupValues, index))
                }
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderSkills = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_name" name="Name" />
          <Header logical="chr_color" name="Color" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.skills.map((skill, index) => (
          <tr key={index}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "skills",
                    updateRow(draft.skills, index, { name: e.target.value }),
                  )
                }
                value={skill.name}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "skills",
                    updateRow(draft.skills, index, { color: e.target.value }),
                  )
                }
                type="color"
                value={skill.color}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${skill.name}`}
                className="chrona-bench-editor__delete"
                onClick={() => patch("skills", removeRow(draft.skills, index))}
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderRoles = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_name" name="Name" />
          <Header logical="chr_requiredskills" name="Required skills" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.roles.map((role, index) => (
          <tr key={role.id}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "roles",
                    updateRow(draft.roles, index, { name: e.target.value }),
                  )
                }
                value={role.name}
              />
            </td>
            <td>
              <SkillChips
                all={draft.skills}
                onToggle={(skill) =>
                  patch(
                    "roles",
                    updateRow(draft.roles, index, {
                      skills: role.skills.includes(skill)
                        ? role.skills.filter((tag) => tag !== skill)
                        : [...role.skills, skill],
                    }),
                  )
                }
                selected={role.skills}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${role.name}`}
                className="chrona-bench-editor__delete"
                onClick={() => patch("roles", removeRow(draft.roles, index))}
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderTemplates = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_title" name="Title" />
          <Header logical="chr_days" name="Days" />
          <Header logical="chr_start" name="Start" />
          <Header logical="chr_end" name="End" />
          <Header logical="chr_count" name="Count" />
          <Header logical="chr_cyclelength" name="Cycle weeks" />
          <Header logical="chr_cycleweek" name="Week" />
          {setNames.map((set) => (
            <Header key={set} logical="chr_group" name={set} />
          ))}
          <Header logical="chr_roleid" name="Role" />
          <Header logical="chr_requiredskills" name="Extra skills" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.templates.map((slot, index) => (
          <tr key={`${slot.templateId}-${slot.slotId}`}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      title: e.target.value,
                    }),
                  )
                }
                value={slot.title}
              />
            </td>
            <td>
              <span className="chrona-bench-editor__chips">
                {WEEKDAYS.map((day, weekday) => {
                  const on = slot.daysOfWeek.includes(weekday);
                  return (
                    <button
                      aria-pressed={on}
                      className={
                        on
                          ? "chrona-bench-editor__chip chrona-bench-editor__chip--on"
                          : "chrona-bench-editor__chip"
                      }
                      key={day}
                      onClick={() =>
                        patch(
                          "templates",
                          updateRow(draft.templates, index, {
                            daysOfWeek: on
                              ? slot.daysOfWeek.filter((d) => d !== weekday)
                              : [...slot.daysOfWeek, weekday].sort(),
                          }),
                        )
                      }
                      type="button"
                    >
                      {day}
                    </button>
                  );
                })}
              </span>
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      startMinutes: timeToMinutes(
                        e.target.value,
                        slot.startMinutes,
                      ),
                    }),
                  )
                }
                style={{ width: 72 }}
                type="time"
                value={minutesToTime(slot.startMinutes)}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      endMinutes: timeToMinutes(e.target.value, slot.endMinutes),
                    }),
                  )
                }
                style={{ width: 72 }}
                type="time"
                value={minutesToTime(slot.endMinutes)}
              />
            </td>
            <td>
              <input
                min={1}
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      count: Math.max(1, Number(e.target.value) || 1),
                    }),
                  )
                }
                style={{ width: 56 }}
                type="number"
                value={slot.count}
              />
            </td>
            <td>
              <input
                min={1}
                onChange={(e) => {
                  const cycleLength = Math.max(1, Number(e.target.value) || 1);
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      cycleLength,
                      cycleWeek: Math.min(slot.cycleWeek, cycleLength),
                    }),
                  );
                }}
                style={{ width: 56 }}
                type="number"
                value={slot.cycleLength}
              />
            </td>
            <td>
              <input
                max={slot.cycleLength}
                min={1}
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      cycleWeek: Math.min(
                        slot.cycleLength,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    }),
                  )
                }
                style={{ width: 56 }}
                type="number"
                value={slot.cycleWeek}
              />
            </td>
            {setNames.map((set) => (
              <td key={set}>
                <select
                  onChange={(e) =>
                    patch(
                      "templates",
                      updateRow(draft.templates, index, {
                        groups: withGroup(slot.groups, set, e.target.value),
                      }),
                    )
                  }
                  value={slot.groups?.[set] ?? ""}
                >
                  {valueOptions(set)}
                </select>
              </td>
            ))}
            <td>
              <select
                onChange={(e) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      roleId: e.target.value || undefined,
                    }),
                  )
                }
                value={slot.roleId ?? ""}
              >
                {roleOptions}
              </select>
            </td>
            <td>
              <SkillChips
                all={draft.skills}
                onToggle={(skill) =>
                  patch(
                    "templates",
                    updateRow(draft.templates, index, {
                      extraSkills: slot.extraSkills.includes(skill)
                        ? slot.extraSkills.filter((tag) => tag !== skill)
                        : [...slot.extraSkills, skill],
                    }),
                  )
                }
                selected={slot.extraSkills}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${slot.title}`}
                className="chrona-bench-editor__delete"
                onClick={() =>
                  patch("templates", removeRow(draft.templates, index))
                }
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderAvailability = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_resourceid" name="Staff" />
          <Header logical="chr_kind" name="Kind" />
          <Header logical="chr_start" name="Start" />
          <Header logical="chr_end" name="End" />
          <Header logical="chr_label" name="Label" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.availability.map((band, index) => (
          <tr key={index}>
            <td>
              <select
                onChange={(e) =>
                  patch(
                    "availability",
                    updateRow(draft.availability, index, {
                      resourceId: e.target.value,
                    }),
                  )
                }
                value={band.resourceId}
              >
                {staffOptions}
              </select>
            </td>
            <td>
              <select
                onChange={(e) =>
                  patch(
                    "availability",
                    updateRow(draft.availability, index, {
                      kind: e.target.value as AvailabilityBandKind,
                    }),
                  )
                }
                value={band.kind}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "availability",
                    updateRow(draft.availability, index, {
                      start: fromLocalInput(e.target.value, band.start),
                    }),
                  )
                }
                type="datetime-local"
                value={toLocalInput(band.start)}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "availability",
                    updateRow(draft.availability, index, {
                      end: fromLocalInput(e.target.value, band.end),
                    }),
                  )
                }
                type="datetime-local"
                value={toLocalInput(band.end)}
              />
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "availability",
                    updateRow(draft.availability, index, {
                      label: e.target.value || undefined,
                    }),
                  )
                }
                value={band.label ?? ""}
              />
            </td>
            <td>
              <button
                aria-label="Delete availability row"
                className="chrona-bench-editor__delete"
                onClick={() =>
                  patch("availability", removeRow(draft.availability, index))
                }
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderViews = (): JSX.Element => (
    <table className="chrona-bench-editor__grid">
      <thead>
        <tr>
          <Header logical="chr_name" name="Label" />
          <Header logical="chr_filterset" name="Filter set" />
          <Header logical="chr_filtergroup" name="Filter value" />
          <Header logical="chr_displayzone" name="Display zone" />
          <th />
        </tr>
      </thead>
      <tbody>
        {draft.views.map((view, index) => (
          <tr key={view.id}>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "views",
                    updateRow(draft.views, index, { label: e.target.value }),
                  )
                }
                value={view.label}
              />
            </td>
            <td>
              <select
                onChange={(e) => {
                  const set = e.target.value;
                  patch(
                    "views",
                    updateRow(draft.views, index, {
                      filter: set
                        ? { set, value: valuesOf(set)[0] ?? "" }
                        : undefined,
                    }),
                  );
                }}
                value={view.filter?.set ?? ""}
              >
                <option value="">(no filter)</option>
                {setNames.map((set) => (
                  <option key={set} value={set}>
                    {set}
                  </option>
                ))}
              </select>
            </td>
            <td>
              {view.filter ? (
                <select
                  onChange={(e) =>
                    patch(
                      "views",
                      updateRow(draft.views, index, {
                        filter: view.filter
                          ? { set: view.filter.set, value: e.target.value }
                          : undefined,
                      }),
                    )
                  }
                  value={view.filter.value}
                >
                  {valuesOf(view.filter.set).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : null}
            </td>
            <td>
              <input
                onChange={(e) =>
                  patch(
                    "views",
                    updateRow(draft.views, index, { zone: e.target.value }),
                  )
                }
                value={view.zone}
              />
            </td>
            <td>
              <button
                aria-label={`Delete ${view.label}`}
                className="chrona-bench-editor__delete"
                onClick={() => patch("views", removeRow(draft.views, index))}
                type="button"
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const addRow = (): void => {
    switch (tab) {
      case "staff":
        patch("staff", [
          ...draft.staff,
          { id: newId("r"), name: "New staff" } as SchedulerResource,
        ]);
        return;
      case "shifts": {
        const start = new Date(draft.shifts[0]?.start ?? new Date());
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(17, 0, 0, 0);
        const id = newId("e");
        patch("shifts", [
          ...draft.shifts,
          {
            base: {
              end,
              id,
              resourceId: "r-open",
              start,
              status: "needsCover",
              title: "New shift",
            },
            end,
            extraSkills: [],
            groups: {},
            id,
            resourceId: "r-open",
            start,
            title: "New shift",
          },
        ]);
        return;
      }
      case "groups":
        patch("groupValues", [
          ...draft.groupValues,
          {
            set: setNames[0] ?? "New set",
            value: "New value",
          } as EditableGroupValue,
        ]);
        return;
      case "skills":
        patch("skills", [
          ...draft.skills,
          { color: "#5c2e91", name: "New skill" },
        ]);
        return;
      case "roles":
        patch("roles", [
          ...draft.roles,
          { id: newId("role"), name: "New role", skills: [] },
        ]);
        return;
      case "templates":
        patch("templates", [
          ...draft.templates,
          {
            count: 1,
            cycleLength: 1,
            cycleWeek: 1,
            daysOfWeek: [1, 2, 3, 4, 5],
            endMinutes: 17 * 60,
            extraSkills: [],
            groups: {},
            slotId: newId("slot"),
            startMinutes: 9 * 60,
            templateId: draft.templates[0]?.templateId ?? newId("tpl"),
            title: "New slot",
          },
        ]);
        return;
      case "availability": {
        const start = new Date();
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(17, 0, 0, 0);
        patch("availability", [
          ...draft.availability,
          {
            end,
            kind: "unavailable",
            resourceId: draft.staff[0]?.id ?? "r-open",
            start,
          } as AvailabilityBand,
        ]);
        return;
      }
      case "views":
        patch("views", [
          ...draft.views,
          { id: newId("view"), label: "New view", zone: "site" } as FixtureView,
        ]);
        return;
      default:
        return;
    }
  };

  const activeTab = TABS.find((candidate) => candidate.id === tab) ?? {
    id: "staff" as TabId,
    label: "Staff",
    table: "chr_resource",
  };

  return (
    <div className="chrona-sched chrona-sched__dialog-backdrop chrona-bench-editor">
      <div
        aria-label="Edit dataset"
        aria-modal="true"
        className="chrona-sched__dialog chrona-bench-editor__dialog"
        data-testid="data-editor"
        role="dialog"
      >
        <div className="chrona-sched__dialog-header">
          <span className="chrona-sched__dialog-title">
            Edit dataset — {activeTab.label}
            <span className="chrona-bench-editor__logical">
              {activeTab.table}
            </span>
          </span>
          <button
            aria-label="Close"
            className="chrona-sched__dialog-close"
            onClick={props.onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div aria-label="Tables" className="chrona-bench-editor__tabs" role="tablist">
          {TABS.map((candidate) => (
            <button
              aria-selected={candidate.id === tab}
              className={
                candidate.id === tab
                  ? "chrona-bench-editor__tab chrona-bench-editor__tab--on"
                  : "chrona-bench-editor__tab"
              }
              key={candidate.id}
              onClick={() => setTab(candidate.id)}
              role="tab"
              type="button"
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <div className="chrona-bench-editor__body">
          {tab === "staff" ? renderStaff() : null}
          {tab === "groups" ? renderGroups() : null}
          {tab === "shifts" ? renderShifts() : null}
          {tab === "skills" ? renderSkills() : null}
          {tab === "roles" ? renderRoles() : null}
          {tab === "templates" ? renderTemplates() : null}
          {tab === "availability" ? renderAvailability() : null}
          {tab === "views" ? renderViews() : null}
          <button
            className="chrona-bench-editor__add"
            data-testid="editor-add-row"
            onClick={addRow}
            type="button"
          >
            + Add row
          </button>
        </div>
        <div className="chrona-sched__dialog-actions">
          <button
            data-testid="editor-reset"
            onClick={props.onReset}
            type="button"
          >
            Reset to fixture
          </button>
          <span style={{ flex: "1 1 auto" }} />
          <button onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className="chrona-sched__dialog-primary"
            data-testid="editor-apply"
            onClick={() => props.onApply(draft)}
            type="button"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

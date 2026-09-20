# Where things are set up

Chrona Scheduler is a Power Apps component framework (PCF) control on a view. Its settings live in three places, and a fourth arrives with Chrona Workforce Scheduler.

## 1. The property pane on the view

The pane maps your columns: title, start, end, the person or asset, status, group, pin, lock, priority and the rest. It is edited in the view designer under **Components**. Every binding is explained in [bindings.md](bindings.md).

## 2. The scheduler calendar row, one per scheduler

Table **Chrona Scheduler Calendar** (`chr_chronaschedulercalendar`). The first sample run creates one named after your table and links your view to it. Without a row, the scheduler still works: the lanes come from the resource lookup, with no grouping, capacity or policies.

| Setting | Column | What it does | Without it |
| --- | --- | --- | --- |
| Resource table | `chr_resourcetable` | The people or asset table, picked from a list, for example `contact` or your own. | The table behind the Resource lookup. |
| Resource name column | `chr_resourcenamecolumn` | The column shown as the lane's name, picked from the table's columns. | The table's primary name. |
| Group column | `chr_resourcegroupcolumn` | Lanes grouped under this column's value, for example a team or a site; picked from the table's columns. | No groups. |
| Subgroup column | `chr_resourcesubgroupcolumn` | A second grouping level, picked from the table's columns. | None. |
| Time zone column | `chr_resourcetimezonecolumn` | A column with a person's IANA time zone, picked from the table's columns. | None. |
| Capacity column | `chr_resourcecapacitycolumn` | Weekly hours per person, picked from the table's number columns; shows hours against capacity and lets the optimizer respect them. | No hours. |
| Cost column | `chr_resourcecostcolumn` | Employer cost per hour, in cents, for the optimizer. | No cost. |
| Resource filter | `chr_resourcefilter` | An OData `$filter` fragment for the lanes, for example active people only. | Every row. |
| Overlap policy | `chr_overlappolicy` | Two rows on the same person at the same time: off, warn or block. | Warn. |
| Skill mismatch policy | `chr_skillmismatchpolicy` | A row on a person without the role it requires: off, warn or block. | Block. |
| Working hours policy | `chr_workinghourspolicy` | A row outside the view's working hours: off, warn or block. | Off; the shading is the guidance. |
| Availability policy | `chr_availabilitypolicy` | A row over booked leave or another unavailable span: off, warn or block. | Block. |
| Default solve seconds | `chr_defaultsolverseconds` | How long the optimizer works on a run. The service caps it per plan. | 30 seconds. |

Warn lands the row with a note. Block snaps it back with the reason. The same rules score the optimizer's proposals, so a proposed change shows its note before you apply it.

## 3. The scheduler view row, one per view

Table **Chrona Scheduler View** (`chr_chronaschedulerview`), keyed by the view's id. The first sample run creates or links it. These are the maker's defaults; each person's own toolbar choices take precedence for them.

| Setting | Column | What it does | Without it |
| --- | --- | --- | --- |
| Bound view | `chr_viewid` | The id of the view this row configures; Connect sets it. | The row is not found. |
| Layout | `chr_layout` | The board's layout: timeline lanes, the roster grid, top-down columns or the agenda list. | Timeline. |
| Display time zone | `chr_displaytimezone` | An IANA zone such as `Australia/Brisbane`, or `site` for stored wall-clock times. | The user's Power Apps time zone, labelled with its offset. |
| Slot length | `chr_slotminutes` | The time scale bars snap to, picked as a duration. | 30 minutes. |
| Hour width | `chr_pxperhour` | Width of one hour in pixels, the board's density. | The control's default. |
| Working start | `chr_workingstart` | Start of the working day, picked from a list; earlier hours are shaded. | No shading. |
| Working end | `chr_workingend` | End of the working day, picked from a list; later hours are shaded. | No shading. |
| Show weekends | `chr_showweekends` | Whether weekends are shown by default. | Shown. |

## 4. The toolbar, per person

Each person's choices are remembered for them, per view: the interval (day, week, work week, month), the time scale, weekends, the grouping, the unscheduled panel (shown or hidden, its width, All or In view) and the width of the resource column. They override the view row's defaults for that person only.

## 5. With Chrona Workforce Scheduler

The scenario solution adds its own tables, each with a page in its app: skills, roles and the skills a role needs, the roles and skills of people, availability types and availability, demand and demand drivers, work item templates with their spans, and resource preferences. The scheduler reads them for role matching, availability bands, the coverage strip, generation and the optimizer's rules.

## Editing the rows without an app

The two configuration tables are managed, org-owned and plain. In the maker portal, select **Tables**, search for **Chrona Scheduler**, open the table, and edit the rows in its data grid, or add the two tables to any model-driven app as pages. The row for your view is the one whose view id matches; the calendar row is named after your table.

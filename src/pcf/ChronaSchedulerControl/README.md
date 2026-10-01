# Chrona Scheduler Control

A Power Apps code component (PCF virtual control) that renders the
Chrona scheduler over any Dataverse table. Non-premium by design: no
external services, work items arrive through the bound dataset,
reference data and configuration through Dataverse rows.

This document is recipe-shaped on purpose: an AI agent implementing
Chrona for a maker should be able to follow it step by step.

## What you bind

| Binding | Kind | Purpose |
| --- | --- | --- |
| `workItems` | dataset | The rows to schedule. Layer 1: shifts. Layer 2: tasks, work orders, appointments. Any table works. |
| `calendarConfigId` | text property | Optional pointer to a `chr_chronaschedulercalendar` row id or name. Unlocks the config-driven resource load, mapping rows, and saved-view configuration. |

Resources are deliberately NOT a second dataset: they are reference
data. With no configuration the control derives schedule rows from the
work items' resource lookups; the `calendarConfigId` mapping rows name
the customer's resource table (groups, timezones, people who hold no
assignments yet) and the control loads it via WebAPI.

## Recipe: bind work items

1. Add the control to a view, subgrid, or custom page and bind
   `workItems` to the table you schedule.
2. Map the property-set columns:

| Property-set | Required | Type | Meaning |
| --- | --- | --- | --- |
| `title` | yes | text | Bar/card label. |
| `start` | yes | datetime | Start instant (stored UTC; the control converts for display). |
| `end` | yes | datetime | End instant. Rows with `end <= start` are skipped and counted. |
| `resource` | no | lookup | The assigned resource. Empty = unscheduled (needs cover). |
| `status` | no | choice/text | Optional explicit status. `Open`, `Unassigned`, `Needs cover`, `Unscheduled` (any case) mean needs cover; anything else means assigned. Unmapped: status derives from the `resource` lookup. |
| `group` | no | choice/text | Organizational bucket; groups the unscheduled panel. |
| `pinned` | no | yes/no | The simple spelling of a full lock. |
| `lockType` | no | choice/text | Dimensional lock: `resource` (person fixed, time may move), `time` (time fixed, person may change), `both` (immovable; `full` accepted). Wins over `pinned` when both are mapped. |
| `bundleId` | no | text | Links sibling seats of a multi-resource work item group (reserved; renders as a hover field today). |
| `publishState` | no | choice/text | Draft/published outward state (reserved; renders as a hover field today). |
| `provenance` | no | choice/text | `manual` / `solver` / `agent`. The control stamps `manual` on every manual edit; feeds minimum-disruption repair. |
| `windowStart` / `windowEnd` | no | datetime | Per-item promise window (reserved columns; constraints arrive with the solver). |

3. Rows the maker's view filters out never reach the control; security
   roles apply as usual. That is the point of dataset binding.

## Recipe: full configuration (optional)

The complete config surface - the resource table mapping, skills and
colors, availability bands, demand curves for the coverage strip, and
resource-preference rules - is specified column-by-column in
[Docs/pcf_config_schema.md](../../Docs/pcf_config_schema.md). Point
`calendarConfigId` at a `chr_chronaschedulercalendar` row (by id or
name) to activate it; every part degrades independently to the
zero-config behavior below.

## Recipe: per-view configuration (optional)

Create one `chr_chronaschedulerview` row per bound view to set maker
defaults. The key is the native view id (savedquery/userquery id) the
dataset reports.

| Column | Type | Meaning |
| --- | --- | --- |
| `chr_viewid` | text | The bound view's id. |
| `chr_displaytimezone` | text | IANA zone for display, or `site` to render stored wall-clock. Absent: UTC, labeled. |
| `chr_slotminutes` | number | Default snap/scale slot minutes (user preference overrides). |
| `chr_pxperhour` | number | Default density (user preference overrides). |

No row, or no table, is fully supported: the control renders with
UTC display and built-in defaults. User preferences (zoom, slot
minutes, column widths, panel filter) persist per user per view in
browser storage under `chrona-sched:v1:{userId}:{viewId}`.

## Edit semantics (v1)

- Move, resize, assign from the unscheduled panel, reassign, retitle:
  the control PATCHes the bound row in place (start, end, resource
  lookup, title), stamps `provenance = manual` when that column is
  mapped, and shows the result optimistically.
- Delete deletes the row. Pin/unpin writes `lockType` (`both`/empty)
  when mapped, else the `pinned` boolean.
- Locked rows refuse the edits their lock dimension forbids; group
  reassign skips resource-locked rows, group move skips time-locked
  rows.
- Unschedule clears the resource lookup.
- Create and duplicate are disabled until the config surface can
  supply your table's required columns (Phase F3).
- When Dataverse is unreachable (the local test harness), edits apply
  locally and the status line says so.

## Local development

- `pnpm run start` - Control Sandbox with watch rebuild (port 8181).
  Without data it renders the fixture demo; load
  `e2e/fixtures/workItems.csv` in the harness data input to exercise
  the real Dataverse adapter mapping.
- `pnpm run test:pcf` - builds the real bundle and runs the Playwright
  smoke suite against the sandbox (port 8182), covering both the
  fixture fallback and the CSV-bound adapter path.
- Deep behavior tests live in `packages/scheduler-ui` (Vite harness,
  99+ Playwright specs); the control suite is the integration canary.

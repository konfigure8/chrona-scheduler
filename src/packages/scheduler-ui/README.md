# @chrona/scheduler-ui

Chrona-owned scheduler UI (architecture decision 2026-08-17). Replaces
the third-party scheduler in the Chrona Scheduler PCF so the freely
distributed wedge control carries no commercial UI licensing.

## Constraints (product)

- Runs inside Power Apps standalone with no Chrona backend.
- Configurable like Calendar 365: the hosting adapter maps customer Dataverse
  tables/columns into `SchedulerUiEvent` (title, start/end, resource, status,
  color, mapped display fields). Components never hardcode a domain shape.
- Views: resource timeline (primary) and traditional roster grid; more later.
- Power Apps look: Fluent v9 styling is NON-NEGOTIABLE. Every visual
  primitive (tags, menus, dialogs, cards, buttons) must match its Fluent v9
  equivalent - 4px control radii, neutral tag backgrounds, Fluent type ramp,
  Fluent elevation - expressed through the CSS custom properties on
  `.chrona-sched`; the PCF adapter may override tokens from the platform
  theme, never the shapes. When adding a new primitive, check the Fluent v9
  component spec first; do not invent styling.
- PCF best practice: React 16.14-compatible (platform-library React), no
  globals, no external network calls, bundle-size discipline.

## Development loop (fast, local, no Power Apps)

- `pnpm --filter @chrona/scheduler-ui dev` - Vite hot-reload harness on
  fixture data at `http://localhost:5184`.
- `pnpm --filter @chrona/scheduler-ui test` - node specs for the pure
  engines (layout, interactions math, undo, config, decorations,
  virtualization, theme).
- `pnpm --filter @chrona/scheduler-ui test:e2e` - Playwright regression
  suite (26 tests) driving the harness on its own server (port 5185):
  every drag interaction, verdicts, undo/redo, keyboard, all seven
  views, config knobs, virtualized stress, dark theme, accessibility.
- `pnpm --filter @chrona/scheduler-ui typecheck` - strict TypeScript
  including the e2e specs.

The PCF (`pcf/ChronaSchedulerControl`) is a thin Dataverse-binding adapter
around this package. Power Apps environment proof is per-release evidence, never
the iteration loop.

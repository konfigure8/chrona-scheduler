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

## Seams for later scenarios

Skills (Workforce) and location and routing (a field service planner)
plug in without package rewrites:

- Host-pluggable validation: interactions call
  `validateChange(event, targetResource, targetRange)`, which returns
  allow, warn or block with reason text. The package renders the
  verdict (slot tint, warning cue, reason chip); the host and the
  solver own the rules. Skill matching, availability, labour rules and
  travel feasibility all use this one seam.
- Generic resource attributes: `SchedulerResource.fields` and `.tags`
  carry skills, location and capacity as mapped data. The package core
  has no skill or geo types; the adapter maps meaning.
- Row decoration layer: availability bands, and later travel segments,
  breaks and holidays, are one rendering primitive - spans drawn on a
  resource row that are not events.
- Container-scoped rendering: the package does not assume it owns the
  viewport, so a map pane can sit beside the timeline.

## Conventions

- Run the conventions checklist before building; verify styling on
  screenshots before claiming it; fix a defect class, not one instance.
- Every user preference has a maker-configured default: a new setting
  lands as maker configuration first, user override second.
- Preferences persist through the versioned preference store
  (`createPreferenceStore`; the control's key is in
  `pcf/ChronaSchedulerControl/README.md`): unknown keys survive, a
  corrupt payload falls back to the defaults, and render-time clamps do
  not rewrite stored preferences.
- The `SchedulerStrings` bundles are typed complete, so a missing string
  fails the compile; the control's `unit/strings.spec.ts` fails when a
  resx falls behind. Weekday and month names travel in the bundle as
  pipe-separated lists, so date labels keep the "Mon 17 Aug" shape in
  the user's Power Apps language rather than the browser's. Customer
  data (group values, skill names, titles) stays as entered.
- Decorations, working windows and validation run in the display time
  frame; instants convert only at the host boundary.
- An assign drop needs real pointer movement and a release inside the
  canvas, so a plain click does not schedule. Today-washes stay off the
  status palette.

## Development loop (fast, local, no Power Apps)

- `pnpm --filter @chrona/scheduler-ui test` - node specs for the pure
  engines (layout, interactions math, undo, config, decorations,
  virtualization, theme).
- `pnpm --filter @chrona/scheduler-ui typecheck` - strict TypeScript.

The PCF (`pcf/ChronaSchedulerControl`) is a thin Dataverse-binding adapter
around this package. Power Apps environment proof is per-release evidence, never
the iteration loop.

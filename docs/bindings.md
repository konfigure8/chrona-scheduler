# Bindings

The property pane of Chrona Scheduler in the view designer lists one static input, Calendar configuration, and eighteen column bindings. Three bindings are required. Everything else is optional and stays at **Select an option** until you have a reason to bind it.

## Required

| Binding | Bind to | What it does |
| --- | --- | --- |
| Title | A text column | The text on each bar: your name or subject column. |
| Start | A date and time column | When the row starts. |
| End | A date and time column | When the row ends. |

**Done** in the property pane stays grey until these three are bound.

## Lanes

| Binding | Bind to | What it does |
| --- | --- | --- |
| Resource | A lookup column to the person or asset a row is assigned to | Bound, the scheduler shows one lane per person and an unscheduled panel for rows without one. Unbound, it is a calendar. The table's Owner is not offered; add a lookup column such as Assigned to. |

## Static input

| Input | Value | What it does |
| --- | --- | --- |
| Calendar configuration | Leave empty | Id or name of a Chrona Scheduler Calendar row. Connect creates one for this view. |

## Optional

| Binding | Bind to | What it does |
| --- | --- | --- |
| Status | A text or choice column | Rows whose status reads open or unassigned show as needing cover. |
| Group | A text or choice column | Buckets rows, for example by team. |
| Subgroup | A text or choice column | The second lane level under Group. |
| Role | A lookup to the Role table (Chrona Workforce Scheduler) | The role the row needs; people are matched by the roles they hold. |
| Pinned | A Yes/No column | A pinned row keeps its person and time when optimizing. |
| Lock | A text or choice column | What stays fixed on the row: time, resource, or both. |
| Priority | A whole number column, 1 to 100 | Higher rows are placed first when optimizing. |
| Bundle | A text column | Links rows that are scheduled together. |
| Publish state | A text or choice column | The row's lifecycle, for example draft or published. |
| Provenance | A text or choice column | The scheduler writes who changed the row: a person or the optimizer. |
| Window start | A date and time column | Earliest start the row may move to. |
| Window end | A date and time column | Latest end the row may move to. |
| Template | A lookup column | The template the row was generated from. Needs Chrona Workforce Scheduler. |
| Generation origin | A multiline text column | Reconciliation detail for generated rows. Leave unbound without Chrona Workforce Scheduler. |

## Column types

- Text or choice: a single line of text or a choice column; the scheduler reads the label.
- Lookup: a plain lookup to one table. Owner and Customer lookups are not offered.
- Date and time: the scheduler shows times in the user's time zone.

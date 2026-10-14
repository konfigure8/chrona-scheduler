# Where things are set up

Chrona Scheduler is a Power Apps component framework (PCF) control on a view. Its settings live in three places, and a fourth arrives with Chrona Workforce Scheduler.

## 1. The property pane on the view

The pane maps your columns: title, start, end, the person or asset, status, group, pin and the rest. It is edited in the view designer under **Components**. Every binding is explained in [bindings.md](bindings.md).

## 2. The scheduler calendar row, one per scheduler

Table **Chrona Scheduler Calendar** (`chr_chronaschedulercalendar`). The first sample run creates one named after your table and links your view to it. Without a row, the scheduler still works: the lanes come from the resource lookup, with no grouping, capacity or policies.

| Setting | Column | What it does | Without it |
| --- | --- | --- | --- |
| Time zone | `chr_timezone` | The site's time zone, picked from a list, such as `Australia/Perth`. The board shows every time in it, for everyone. The first sample run sets yours. In Chrona Workforce Scheduler, the calendar's site sets it. | Each user's own Power Apps time zone. |
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
| Product | `chr_product` | The product this calendar optimizes with: Chrona Scheduler, or Chrona Workforce Scheduler for roles and availability. | Chrona Scheduler. |

Warn lands the row with a note. Block snaps it back with the reason. These rules check the changes you make by hand. The optimizer checks its proposal as a whole; if you drop one of its changes, your overlap setting checks the shifts that stay.

## 3. The scheduler view row, one per view

Table **Chrona Scheduler View** (`chr_chronaschedulerview`), keyed by the view's id. The first sample run creates or links it. These are the maker's defaults; each person's own toolbar choices take precedence for them.

| Setting | Column | What it does | Without it |
| --- | --- | --- | --- |
| Bound view | `chr_viewid` | The view this row configures, picked from the public views; Connect sets it. | The row is not found. |
| Layout | `chr_layout` | The board's layout: timeline lanes, the roster grid, top-down columns or the agenda list. | Timeline. |
| Color by | `chr_colorby` | What colors the rows: the role's color, one color per lane group, or the warning tint for rows needing cover. | Nothing; the bars stay neutral. |
| Display time zone | `chr_displaytimezone` | Another IANA zone for this view, or `user` for each user's own. | The calendar's time zone. |
| Slot length | `chr_slotminutes` | The time scale bars snap to, picked as a duration. | 30 minutes. |
| Hour width | `chr_pxperhour` | Width of one hour in pixels when the board opens on Day; Week and Month open fitted to the board. | 60 pixels. |
| Working start | `chr_workingstart` | Start of the working day, picked from a list; earlier hours are shaded. | No shading. |
| Working end | `chr_workingend` | End of the working day, picked from a list; later hours are shaded. | No shading. |
| Show weekends | `chr_showweekends` | Whether weekends are shown by default. | Shown. |
| Period | `chr_periodunit` | The roster period: week, fortnight or month. The Roster grid shows a whole period at a time. In Chrona Workforce Scheduler, the calendar's site sets it. | The Roster grid shows the week. |
| Period starts on | `chr_periodanchor` | The first day of the first roster period; periods repeat from here. In Chrona Workforce Scheduler, the calendar's site sets it. | Needed with Period. |

## 4. The toolbar, per person

Each person's choices are remembered for them, per view: the zoom in each interval, the time scale, weekends, the grouping, the unscheduled panel (shown or hidden, its width, All or In view) and the width of the resource column. With Chrona Workforce Scheduler, the toolbar's Stats menu also picks the stats beside the Roster grid. They override the view row's defaults for that person only.

The week starts on the first day of the week in each person's Power Apps regional settings; a roster **Period** starts on its **Period starts on** date.

The last button on the toolbar shows the board on the whole screen. Select it again or press Esc to go back. The board leaves full screen before it opens a record, the settings or a command of the app.

## 5. With Chrona Workforce Scheduler

The scenario solution adds its own tables, each with a page in its app: skills, roles and the skills a role needs, the roles and skills of people, availability types and availability, agreements and their rules, demand and demand drivers, and work item templates with their spans. The scheduler reads them for role matching, availability bands and preferred times, agreement rules, the coverage strip, generation and the optimizer's rules.

### Sites

Each calendar belongs to a site, and the site sets what every calendar at it shares:

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Time zone | `chr_timezone` | The site's time zone. Its calendars and shifts take it. | Required. |
| Period | `chr_periodunit` | The roster period: week, fortnight or month. The Roster grid, Generate and Optimize plan by it on every calendar at the site. | The Roster grid shows the week. |
| Period starts on | `chr_periodanchor` | The first day of the first roster period; periods repeat from here. Rotating templates count their **Cycle week** from it. | Needed with Period. |

### Agreements

An agreement holds the rostering rules of an award, an enterprise agreement or your own policy. Each person works under one agreement. Roles play no part.

Set agreements up on the app's **Agreements** page, with the **Chrona Workforce Admin** role. Turn on auditing before the first rule: see [Install Chrona Workforce Scheduler](https://chrona365.com/docs/workforce/install).

1. Add an agreement and give it a **Name**.
2. In its **Rules** grid, add one row for each rule:

| Column | What it holds | When empty |
| --- | --- | --- |
| Rule | One of the eight rules below. | Required. |
| Value | Hours, or whole days for **Days in a row** and **Days off**. Above 0. | Required. |
| Must or Should | **Must** always holds: Optimize leaves a shift open rather than break it. **Should** gives way when the roster is better for it. | Must. **Minimum hours** and **Overtime** are always Should. |
| Period | For **Maximum hours**, **Minimum hours**, **Days off** and **Overtime**: Day, Week, Fortnight, Month or Roster period. | Week. |
| Over (weeks) | For **Weekly rest** and **Average hours**: how many weeks each window runs, 1 to 52. | 1. |
| Rate (%) | For **Overtime**: what an hour past the value pays, as a percentage of the person's **Hourly rate**. 150 is time and a half. | No overtime cost. |
| Clause | The clause of the award or agreement the rule comes from, such as 21.3. | None. |
| On | Only rules that are on count. | On. |
| Effective start | The rule's first day, in the site's time zone. | Always. |
| Effective end | The rule's last day. On or after the start. | No end. |

The rules:

| Rule | Value | What it limits |
| --- | --- | --- |
| Minimum rest (hours) | Hours | The rest between two shifts. |
| Days in a row | Days | The most days worked in a row. |
| Maximum hours | Hours | The most hours worked in each period. |
| Minimum hours | Hours | The fewest hours worked in each period. |
| Days off | Days | The fewest days off in each period. A day off is a day on which no shift starts. Not per day. |
| Overtime | Hours | The hours worked in each period before the rate pays. Add one row for each step, such as 38 hours at 150% and 48 hours at 200%. |
| Weekly rest | Hours | The hours off in one stretch in every window, such as 24 hours in every week. |
| Average hours | Hours | The most hours a week, on average, over each window, such as 38 hours over 26 weeks. |

3. In its **People** grid, add the people who work under it. You can also set **Agreement** on a person, beside **Hours per week** and **Hourly rate**.

How the rules apply:

- Optimize keeps every Must rule, and leaves a shift open rather than break one. It keeps each Should rule where it can.
- Periods are counted on the site's clock. When the site's roster **Period** is a week or a fortnight, weeks start on the day of its **Period starts on** date and fortnights on that date, so a week or fortnight rule lines up with the roster. Otherwise a week starts on the first day of the week in the Power Apps regional settings of the person who runs Optimize. A month is a calendar month. **Roster period** is the period Optimize plans.
- A period that ends after the period Optimize plans is counted up to that end. **Days off** and **Minimum hours** are reduced in proportion to the days counted.
- **Weekly rest** and **Average hours** look at every window of weeks, one week after another.
- **Overtime** costs the hours past each step at the step's rate above the person's **Hourly rate**. A person with no rate costs nothing extra. Optimize weighs the cost with the other Should rules.
- When two rules of one type are in force on the same day, both hold.
- The rule in force when the later work starts applies. Rest before a shift uses the minimum in force when that shift starts. Each day of a run uses the limit in force that day.
- To stop a rule, set its **Effective end**. Switching it off changes past periods too.
- The rules also count the shifts before the roster period, as far back as the longest rule needs: its rest, its run of days, the start of its period or its window.
- A person with no agreement, or with no rule in force, is not checked. The board marks each such person, unless no one has an agreement.
- A deactivated agreement counts as no agreement.
- Dataverse refuses to delete an agreement while people work under it. Move them to another agreement first.
- In the review, broken **Maximum hours** and **Average hours** rules count as maximum hours, and broken **Days off** and **Weekly rest** rules count as other Must rules.
- A change by hand that breaks a Must rest or days in a row rule gets a warning on the board. The board does not block it.

With an agent: the `generate_agreement` tool of the Chrona Model Context Protocol (MCP) server turns your rules into the requests that create the agreement and its rules. Your agent links the people with its own Dataverse tools, so no person data reaches Chrona.

## Editing the rows without an app

Makers open the view row from the gear on the board, shown to users who can edit it. The two configuration tables are managed, org-owned and plain. In the maker portal, select **Tables**, search for **Chrona Scheduler**, open the table, and edit the rows in its data grid, or add the two tables to any model-driven app as pages. The row for your view is the one whose view id matches; the calendar row is named after your table.

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
| Capacity column | `chr_resourcecapacitycolumn` | Weekly hours per person, picked from the table's number columns; shows hours against capacity and lets Auto Schedule respect them. In Chrona Workforce Scheduler, each person's contracts set the hours instead (see **Contracts**). | No hours. |
| Cost column | `chr_resourcecostcolumn` | Employer cost per hour, in cents, for Auto Schedule. In Chrona Workforce Scheduler, the **Hourly rate** on each person's contract applies instead. | No cost. |
| Resource filter | `chr_resourcefilter` | An OData `$filter` fragment for the lanes, for example active people only. | Every row. |
| Overlap policy | `chr_overlappolicy` | Two rows on the same person at the same time: off, warn or block. | Warn. |
| Skill mismatch policy | `chr_skillmismatchpolicy` | A row on a person without the role it requires: off, warn or block. | Block. |
| Working hours policy | `chr_workinghourspolicy` | A row outside the view's working hours: off, warn or block. | Off; the shading is the guidance. |
| Availability policy | `chr_availabilitypolicy` | A row over booked leave or another unavailable span: off, warn or block. | Block. |
| Run for | `chr_defaultsolverseconds` | How long Auto Schedule works on a run, in seconds. The service caps it per plan. | 30 seconds. |
| Product | `chr_product` | The product this calendar uses: Chrona Scheduler, or Chrona Workforce Scheduler for roles and availability. | Chrona Scheduler. |

Warn lands the row with a note. Block snaps it back with the reason. These rules check the changes you make by hand. Auto Schedule checks its proposal as a whole; if you drop one of its changes, your overlap setting checks the shifts that stay.

## 3. The scheduler view row, one per view

Table **Chrona Scheduler View** (`chr_chronaschedulerview`), keyed by the view's id. The first sample run creates or links it. These are the maker's defaults; each person's own toolbar choices take precedence for them.

| Setting | Column | What it does | Without it |
| --- | --- | --- | --- |
| Bound view | `chr_viewid` | The view this row configures, picked from the public views; Connect sets it. | The row is not found. |
| Layout | `chr_layout` | The board's layout: timeline lanes, the roster grid, top-down columns or the agenda list. | Timeline. In Chrona Workforce Scheduler, the roster grid. |
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

Each person's choices are remembered for them, per view: the zoom in each interval, the time scale, weekends, the unscheduled panel (its width, All or In view) and the width of the resource column. With Chrona Workforce Scheduler, the toolbar's Stats menu also picks the stats beside the Roster grid. They override the view row's defaults for that person only.

The week starts on the first day of the week in each person's Power Apps regional settings. In Chrona Workforce Scheduler, it starts on the site's **Week starts on** day. A roster **Period** starts on its **Period starts on** date.

The last button on the toolbar shows the board on the whole screen. Select it again or press Esc to go back. The board leaves full screen before it opens a record, the settings or a command of the app.

## 5. With Chrona Workforce Scheduler

The scenario solution adds its own tables, each with a page in its app: skills, roles and the skills a role needs, the roles and skills of people, availability types and availability, agreements and their rules, demand and demand drivers, and shift types and coverage. The scheduler reads them for role matching, availability bands and preferred times, agreement rules, the coverage strip, generation and Auto Schedule's rules.

### Skills with dates

A skill can count for set days only, such as a licence that runs out. Open a person, and in the **Skills** grid open the skill. **Valid from** (`chr_validfrom`) is its first day and **Valid until** (`chr_validuntil`) its last day. Leave either one empty for no limit on that side. To renew a skill, add it again from the day after the old one ends.

A person holds a role on a shift only when every skill that the role needs is valid from the shift's start to its end:

- On the board, a shift outside those days counts as a shift for a role the person does not hold. The calendar's **Skill rule** (`chr_skillmismatchpolicy`) is **Block**, **Warn** or **Off**. Under the person's name on the roster grid, a note names a missing skill, a skill that has run out or starts later, and a skill that runs out within 30 days.
- Auto Schedule gives a shift only to a person whose skills for its role are valid for the whole shift.
- In Chrona Workforce Mobile, a person takes an open shift, a swap or cover only when they hold the shift's role and its skills are valid over each work period of the shift.

### Sites

A calendar with a site shows only the shifts at that site. A calendar with no site shows every shift. The site sets what every calendar at it shares:

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Time zone | `chr_timezone` | The site's time zone. Its calendars and shifts take it. | Required. |
| Week starts on | `chr_weekstart` | The first day of the site's weeks: the board's weeks and week numbers, the rules that count per week, Auto Schedule and the worker app. | Monday. |
| Currency | `chr_currency` | The currency of the site's wages and hourly rates. The board shows wages and overtime cost in it. Pick one of your environment's currencies. To add one, open the Power Platform admin center, select your environment, then **Settings** > **Business** > **Currencies**. | The organization's base currency. A new site gets it. |
| Period | `chr_periodunit` | The roster period: week, fortnight or month. The Roster grid, Generate and Auto Schedule plan by it on every calendar at the site. | The Roster grid shows the week. |
| Period starts on | `chr_periodanchor` | The first day of the first roster period; periods repeat from here. Rotating coverage rows count their **Cycle week** from it. | Needed with Period. |
| Night time from, Night time to | `chr_nightstart`, `chr_nightend` | The site's night time. An end at or before the start is the next day. | The night time of the site's country. |
| Night hours | `chr_nighthours` | The hours of a shift's work, breaks left out, inside the night time that make it a night shift. | The country's. |
| More than the night hours | `chr_nightmore` | Yes: more than the night hours. No: at least. | The country's. |

A site's own night time counts only when **Night time from**, **Night time to** and **Night hours** are all set. Otherwise it takes its country's, from its time zone: Germany 23:00 to 06:00, more than 2 hours; the Netherlands 00:00 to 06:00, more than 1 hour; France 21:00 to 06:00, at least 3 hours; anywhere else 23:00 to 06:00, at least 3 hours. A shift is a night shift when that much of its work falls in the night time, or when its shift type's **Night shift** is **Always**.

### Planning horizon

A Workforce calendar can show its coming rosters above the board. On the calendar form, in the **Planning** section:

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Planning horizon | `chr_planninghorizon` | **Yes** shows the coming rosters at the top of the board, with **Publish**, **Outcomes** and **Auto Schedule** for the selected roster. Needs the site's **Period**. | No: the board shows its period bar. |
| Plan ahead | `chr_planahead` | How many rosters after the current one the planning horizon shows. | 6. |
| Publish ahead | `chr_publishahead` | How many days before a roster starts it is due to be published, by 17:00. | 3. |

Each roster has a card: how much of it is filled, when it was published and the changes since, and the day it is due to be published. Select a card to show its roster. The card's menu offers **Publish {count} changes**, **Generate** and **Auto Schedule this roster**. A roster that was never published can be published once the roster before it is. The toolbar keeps its actions, and the roster header above the board offers **Publish {count} changes**, **Outcomes** and **Auto Schedule this roster** for the roster on screen.

### Agreements

An agreement holds the rostering rules of an award, an enterprise agreement or your own policy. Each person works under one agreement. Roles play no part.

Set agreements up on the app's **Agreements** page, with the **Chrona Workforce Admin** role. Turn on auditing before the first rule: see [Install Chrona Workforce Scheduler](https://chrona365.com/docs/workforce/install).

1. Add an agreement and give it a **Name**. Save it.
2. On its **Rules** tab, add each rule to its group: **Rest**, **Days on and off**, **Hours**, **Overtime**, **Night shifts** or **Weekends**. Each group has its own button, such as **Add rest rule**. A rule reads as one sentence with its numbers, its **Must** or **Should** level, its dates, its clause and its On switch. Each rule is one row of the **Agreement rule** table, with these columns:

| Column | What it holds | When empty |
| --- | --- | --- |
| Rule | One of the seventeen rules below. | Required. |
| Value | Hours; whole days for **Days in a row** and **Days off**; night shifts for **Night shifts in a row** and **Night shifts in a period**; weekends for **Weekends worked** and **Weekends in a row**; days for **Sundays and public holidays worked**. **Complete weekends** sets no number. Above 0. | Required. |
| Must or Should | **Must** always holds: Auto Schedule leaves a shift open rather than break it. **Should** gives way when the roster is better for it. | Must. **Minimum hours** and **Overtime** are always Should. |
| Period | For **Maximum hours** and **Overtime**: Day, Week, Fortnight, Month or Roster period. For **Minimum hours** and **Days off**: Week, Fortnight, Month or Roster period. For **Night shifts in a period**: Week, Fortnight, Month, Roster period or Rolling weeks. For **Weekends worked**: Month, Roster period or Rolling weeks. For **Weekends in a row** and **Sundays and public holidays worked**: Month or Roster period. | Week; Month for the weekend rules. |
| Over (weeks) | For **Weekly rest**, **Average hours**, and **Night shifts in a period** or **Weekends worked** with Rolling weeks: how many weeks each window runs, 1 to 52. | 1. |
| Nights in a row | For **Rest after a run of nights**: the night shifts in a row that start the rest, 1 to 14. | 1. |
| Rate (%) | For **Overtime**: what an hour past the value pays, as a percentage of the **Hourly rate** on the person's contract. 150 is time and a half. | No overtime cost. |
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
| Night shifts in a row | Night shifts | The most night shifts in a row. |
| Night shifts in a period | Night shifts | The most night shifts in each period or window, such as 36 in every 16 weeks. |
| Hours in a night shift | Hours | The most paid hours in one night shift. |
| Rest after a night shift | Hours | The rest after a night shift, up to the start of the next shift. |
| Rest after a run of nights | Hours | The rest after the last of **Nights in a row** or more night shifts in a row, such as 46 hours after 3. |
| Weekends worked | Weekends | The most weekends worked in each period or window, such as 2 a month. |
| Weekends in a row | Weekends | The most weekends worked one after another in each period. |
| Complete weekends | None | All of the weekend or none of it: a person who works one weekend day works the others too. |
| Sundays and public holidays worked | Days | The most Sundays and public holidays worked in each period, such as 3 a month. Public holidays are not counted: the rule counts Sundays. |

3. On its **Applies to** tab, select **Add a person** or **Add everyone in a role**. **Add everyone in a role** adds those people now. A person who joins the role later needs their own agreement. Adding a person moves them from the agreement they had. You can also set **Agreement** on a person.
4. On its **Source** tab, select **Attach document** to keep the agreement as published, up to 32 megabytes (MB). The tab lists each clause the rules cite, with its words and its rules.

How the rules apply:

- Auto Schedule keeps every Must rule, and leaves a shift open rather than break one. It keeps each Should rule where it can.
- Periods are counted on the site's clock. A week starts on the site's **Week starts on** day. When the site's roster **Period** is a week or a fortnight, fortnights start on its **Period starts on** date. To line a week or fortnight rule up with the roster, set **Period starts on** to a date on that day. A month is a calendar month. **Roster period** is the period Auto Schedule plans.
- A period that ends after the period Auto Schedule plans is counted up to that end. **Days off** and **Minimum hours** are reduced in proportion to the days counted.
- **Weekly rest**, **Average hours**, and **Night shifts in a period** or **Weekends worked** with Rolling weeks look at every window of weeks, one week after another.
- The five night rules count only night shifts (see **Sites**). A run of night shifts ends at a day off or at a shift that is not a night shift. **Night shifts in a period** counts each night shift in the period it starts in.
- The four weekend rules count the agreement's weekend days. The **Weekend** button in the **Weekends** group sets them: one to three days in a row, such as Friday and Saturday. If you set none, the weekend is Saturday and Sunday. A shift belongs to the weekend of the day it starts, on the site's clock.
- **Auto Schedule** weighs wages in every run: each person's hours at the **Hourly rate** on their contract, the contract in force on the day. It picks the cheaper of two people who fit equally well. It does not leave a shift open to save money. A person with no rate costs nothing.
- **Overtime** costs the hours past each step at the step's rate above the rate of the day the hour is worked. An hour counts once: a **Day** rule counts first, then **Week**, **Fortnight**, **Month** and **Roster period**, and each longer period counts only the hours that are not overtime yet. With 8 hours a day and 40 a week, five 10-hour days give 10 hours of overtime, all from the **Day** rule. The days leave 40 hours, so the week adds none.
- The board counts wages from the same hours and rates: **Wages** and **Overtime hours** in the toolbar's **Stats** menu, **Wages** and **Overtime cost** in a proposal, and the roster's **Outcomes**. They count hourly rates and overtime, with no loadings.
- When two rules of one type are in force on the same day, both hold.
- The rule in force when the later work starts applies. Rest before a shift uses the minimum in force when that shift starts. Each day of a run uses the limit in force that day.
- To stop a rule, set its **Effective end**. Switching it off changes past periods too.
- The rules also count the shifts before the roster period, as far back as the longest rule needs: its rest, its run of days, the start of its period or its window. Their breaks are not read, so a night shift before the roster period is judged from its start to its end.
- A person with no agreement, or with no rule in force, is not checked. The board marks each such person, unless no one has an agreement.
- A deactivated agreement counts as no agreement.
- Dataverse refuses to delete an agreement while people work under it. Move them to another agreement first.
- In the review, broken **Maximum hours**, **Days off**, **Weekly rest** and **Average hours** rules each count on a row of their own. Broken night rules count as night shifts. Broken weekend rules count as weekends. A shift under a contract's **Minimum engagement** counts on its own row.
- A change by hand that breaks a Must rest or days in a row rule gets a warning on the board. The board does not block it.

With an agent: the `agreement_reading` tool of the Chrona Model Context Protocol (MCP) server tells your agent how to read your agreement document and propose its rules, each with its clause number. Your agent writes nothing until you confirm each clause number and value. The `generate_agreement` tool then turns the rules into the requests that create the agreement and its rules. Your agent attaches the document, keeps each clause's words and links the people with its own Dataverse tools. The document, its words and person data do not reach the Chrona MCP server.

### Contracts

A contract holds one person's own terms: their employment type, their dates, their guaranteed and maximum hours, their hourly rate and their minimum engagement. The agreement holds the rules everyone on it shares. A contract adds limits to them and cannot loosen them. In Chrona Workforce Scheduler, a person's hours and hourly rate come only from their contracts.

First, set up your employment types on the app's **Employment types** page, with the **Chrona Workforce Admin** role. Name each one your way, such as Full-time, Part-time and Casual. Its **Availability** is where a person starts: **Available unless marked unavailable** or **Unavailable unless marked available**. A person's first contract gives them the availability of its employment type. A person who starts unavailable works only in the **Available** time they give in Chrona Workforce Mobile or that you add in the **Availability** grid on their form; with none, they get no shifts.

Then open a person and select the **Contracts** tab:

1. Select **New contract**.
2. Pick the **Employment type** and the **Start**. Pick an **End** only if the contract ends. Leave it empty if the contract is ongoing. If a later contract exists, an empty **End** becomes the day before it.
3. Enter the **Guaranteed hours**, the **Maximum hours**, **Hours per**, the **Hourly rate** and the **Minimum engagement**.
4. Select **Save**.

| Field | What it holds | When empty |
| --- | --- | --- |
| Employment type | The type from the **Employment types** page. | No type. |
| Start | The contract's first day. | Required. |
| End | The contract's last day. On or after the start. | Ongoing. |
| Guaranteed hours | The hours Auto Schedule gives the person in each period where it can, a Should rule. | None, as for a casual. |
| Maximum hours | The most hours the person works in each period, a Must rule. | Only the agreement's limits. |
| Hours per | The period of both hours: Week, Fortnight, Month or Roster period. | Week. |
| Hourly rate | The rate, in the **Currency** of the site whose calendar you schedule the person on. Chrona reads the amount as you enter it and converts no money. Wages and overtime cost read it. | No rate: **Wages** leave the person out. |
| Minimum engagement | The fewest paid hours in each of the person's shifts, 0.25 to 24, a Must rule. | No minimum. |

How contracts apply:

- A person has one contract in force on each day. A new contract ends the contract before it on the day before the new one starts. The page tells you before you save. A contract that shares a day with another of the person's contracts is refused.
- To change a person's terms from a later day, add a new contract. Editing a contract that has started changes it from its first day.
- **End contract** sets a contract's last day. A contract that has not started has **Delete** instead. The contract before it then runs until the day before the next contract, or with no end.
- A contract's rules apply only on its own days. Auto Schedule keeps each person within their **Maximum hours** and gives them their **Guaranteed hours** where it can, both over **Hours per**. The agreement's rules still hold. When a contract allows more hours than the agreement, the contract shows a warning, and the agreement's limit applies.
- Auto Schedule gives a person no shift shorter than their **Minimum engagement**, counting paid hours (the shift less its unpaid breaks). Each part of a split shift is one shift. When you make a shift shorter than it by hand, the board warns, and a proposal counts it under **Minimum engagement**.
- The Roster grid shows each person's hours against the contract in force on the roster's first day: the bar runs to the maximum, with a mark at the guaranteed hours. Its tip names each figure.
- **Wages** count each shift at the rate of the contract in force on its day. The wages note names each person with no rate.
- The **Chrona Workforce User** role reads contracts. The **Chrona Workforce Admin** role adds, changes, ends and deletes them.

### Import a roster from Excel

Bring a roster you keep in an Excel workbook into the roster period on the board. Select **Import** on the toolbar, or under **Actions** when the roster has shifts. A roster with no shifts also offers **Import from Excel**. The import has four steps: **File**, **Mapping**, **Check** and **Import**. Nothing is written until you confirm.

1. **File**: select **Choose workbook**. Chrona reads an .xlsx file of up to 10 MB in your browser, and the file stays there. It reads a person per row, a day per row, a block per week, or a row per shift, and leaves other sheets, such as a staff list, out. For a file in another layout, select **Download the Chrona template** and fill it in.
2. **Mapping**: give each code in the file a meaning, such as **Shift**, **Leave** or **Day off**, and give each shift code its times.
   - Without an agent, select **Map it here**.
   - With an agent, select **Share with my agent**. The page saves a summary of the file in your environment: sheet names, headers and codes, with names and notes replaced. The page shows the words to give your agent, such as "Map Chrona import 7F3K". Your agent reads the summary with its own Dataverse tools and maps it with the `import_mapping` tool of the Chrona MCP server. The mapping it writes back shows as **From your agent**.

   Then select **Check the whole file**.
3. **Check**: the page lists each cell it cannot place, with the reason, such as an unknown code, a merged cell or two codes in one cell. Fix the file, or select **Import without them**. Shifts already on the file's days stop the import, unless an earlier import wrote them. Clear those shifts on the board first.
4. **Import**: Chrona writes the people, shift types, demand, leave and shifts with your own Dataverse rights. Keep the page open. **Stop** keeps what is written. To finish, import the file again: a second import writes no row twice.

After the write, Chrona reads the roster back and compares it with the file, table by table and hours by person. When they match, Chrona saves the roster's counts. **Outcomes** shows them as **Hand-built**, beside **Now** and **Before**.

### Mark absent and find cover

When a person cannot work, select **Mark absent**. On a roster that has started, it is on the toolbar. On a coming roster, it is under **Actions**. The menu of a person, and the menu of a shift that has a person, also offer it as **Mark [name] absent**.

1. Type the person's name. Set **From** and its **Start time**, then **Until**: **End of that day**, **End of the next day** or a date you pick. Set a **Reason**: the reasons are your availability types.
2. The shifts that the absence overlaps need cover at once. A shift that the person has started ends at the start time. The person keeps the part they worked, and the rest is a shift of its own that needs cover.
3. With **Find cover now**, Chrona repairs the roster that holds the absence. A repair moves only the shifts that the absence opens, open shifts and on-call shifts. Every other shift keeps its person. Nothing changes until you apply.
4. The review lists the cover for the absent person first, one chain of moves at a time. Select **Drop this cover** to leave a chain out, then **Apply**. A shift that nobody can take without breaking a Must rule stays open, and the review says so.

**Discard** keeps the absence and the open shifts. **Undo absence** removes the absence and gives each shift it opened back to its person, while that shift is still open.

A coverage row's **How many** is the shifts you need. Set **Maximum** above it to allow more: Generate also makes the shifts above How many, up to Maximum, as optional shifts. Left open, an optional shift shows quietly, not as a shift that needs cover. Auto Schedule fills it when people are free. Workers can take it in Chrona Mobile like any open shift.

An on-call shift is backup cover. Set **On call** on the Shift form. Left open, it shows as backup, not as a shift that needs cover. Auto Schedule staffs it when people are free. A repair can move its person onto a shift that the absence opens.

To tell a person what they need to know for a shift, write **Shift instructions** in the shift's dialog on the board, or on the Shift form. Once you publish, they see them in the shift's details in Chrona Mobile. A change to them is a change to publish.

### Outcomes

**Outcomes**, under **Actions**, shows what the roster on screen comes to: broken rules, open required shifts, people with no agreement, preferences met, wages and overtime.

- **Now** counts the roster as it stands.
- **Hand-built** is the roster you imported, when you imported one.
- **Before** is the previous roster, as last applied.

Chrona saves a roster's counts at each import and each **Apply**, in your environment: numbers only, no names. A count that Chrona did not save shows as **Not saved**. **Last 12 rosters** shows the trend.

## Editing the rows without an app

Makers open the view row from the gear on the board, shown to users who can edit it. The two configuration tables are managed, org-owned and plain. In the maker portal, select **Tables**, search for **Chrona Scheduler**, open the table, and edit the rows in its data grid, or add the two tables to any model-driven app as pages. The row for your view is the one whose view id matches; the calendar row is named after your table.

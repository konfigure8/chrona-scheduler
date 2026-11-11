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
| Capacity column | `chr_resourcecapacitycolumn` | Weekly hours per person, picked from the table's number columns; shows hours against capacity and lets Auto Schedule respect them. In Chrona Workforce Scheduler, each worker's contracts set the hours instead (see **Contracts**). | No hours. |
| Cost column | `chr_resourcecostcolumn` | Employer cost per hour, in cents, for Auto Schedule. In Chrona Workforce Scheduler, the **Hourly rate** on each worker's contract applies instead, else the **Standard hourly rate** of the shift's role. | No cost. |
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

The scenario solution adds its own tables, each with a page in its app: skills, roles and the skills a role needs, the roles and skills of workers, availability types and availability, agreements and their rules, demand and demand drivers, and shift types and coverage. The scheduler reads them for role matching, availability bands and preferred times, agreement rules, the coverage strip, generation and Auto Schedule's rules.

### Skills with dates

A skill can count for set days only, such as a licence that runs out. Open a worker, and in the **Skills** grid open the skill. **Valid from** (`chr_validfrom`) is its first day and **Valid until** (`chr_validuntil`) its last day. Leave either one empty for no limit on that side. To renew a skill, add it again from the day after the old one ends.

A worker holds a role on a shift only when every skill that the role needs is valid from the shift's start to its end:

- On the board, a shift outside those days counts as a shift for a role the worker does not hold. The calendar's **Skill rule** (`chr_skillmismatchpolicy`) is **Block**, **Warn** or **Off**. Under the worker's name on the roster grid, a note names a missing skill, a skill that has run out or starts later, and a skill that runs out within 30 days.
- Auto Schedule gives a shift only to a worker whose skills for its role are valid for the whole shift.
- In Chrona Workforce Mobile, a worker takes an open shift, a swap or cover only when they hold the shift's role and its skills are valid over each work period of the shift.

### Allow and deny lists

A shift type lists workers (**Shift type workers**, `chr_shifttypeworker`), each **Preferred**, **Unpreferred** or **Prohibited**. It also carries **Risk factors** (`chr_riskfactors`), and a worker has **Prohibited risk factors** (`chr_prohibitedriskfactors`). Risk factors are one choice for the whole organization: **Infectious disease** and **Heavy lifting** ship with it, and makers add their own. Record the risk factor only: Chrona stores no medical reason. Set a shift type's lists in **Advanced** at the bottom of its card on the **Shift types** page, and one shift's in **Advanced** under **Role** and **Skills** on the shift. Set a worker's prohibited risk factors and the Deny rule with the Chrona MCP (Model Context Protocol) server (last item below).

- A shift keeps its own list (**Shift workers**, `chr_shiftworker`). The calendar's **Deny rule** is the column `chr_denypolicy`. What Generate, Auto Schedule, the board and Chrona Workforce Mobile do with the lists is in [Allow and deny lists](https://chrona365.com/docs/workforce/allow-and-deny).
- The Chrona MCP server's `generate_configuration` sets the lists, the risk factors and the Deny rule up.

### Sites

A calendar with a site shows only the shifts at that site. A calendar with no site shows every shift. The site sets what every calendar at it shares:

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Region | `chr_region` | The site's country, or its state or province where public holidays differ by region, such as Bavaria (`DE-BY`). Set it first: the Holiday calendar and Time zone lists then show only the region's. | The Holiday calendar list is turned off. |
| Holiday calendar | `chr_holidaycalendar` | The site's public holidays. Pick one of the region's holiday calendars, or a calendar with no region. | Required, unless No public holidays is ticked. |
| No public holidays | `chr_nopublicholidays` | Tick this when the site has no public holidays. The form then clears and locks Holiday calendar. | Off: the site needs a Holiday calendar. |
| Time zone | `chr_timezone` | The site's time zone. Its calendars and shifts take it. | Required. |
| Week starts on | `chr_weekstart` | The first day of the site's weeks: the board's weeks and week numbers, the rules that count per week, Auto Schedule and the worker app. | Monday. |
| Currency | `chr_currency` | The currency of the site's wages. The board shows wages and overtime cost in it. A site always has one. Pick one of your environment's currencies. To add one, open the Power Platform admin center, select your environment, then **Settings** > **Business** > **Currencies**. | The organization's base currency. A new site gets it. |
| Period | `chr_periodunit` | The roster period: week, fortnight or month. The Roster grid, Generate and Auto Schedule plan by it on every calendar at the site. | The Roster grid shows the week. |
| Period starts on | `chr_periodanchor` | The first day of the first roster period; periods repeat from here. Rotating coverage rows count their **Cycle week** from it. | Needed with Period. |
| Night time from, Night time to | `chr_nightstart`, `chr_nightend` | The site's night time. An end at or before the start is the next day. | The night time of the site's country. |
| Night hours | `chr_nighthours` | The hours of a shift's work, breaks left out, inside the night time that make it a night shift. | The country's. |
| More than the night hours | `chr_nightmore` | Yes: more than the night hours. No: at least. | The country's. |

A site's own night time counts only when **Night time from**, **Night time to** and **Night hours** are all set. Otherwise it takes its country's, from its time zone: Germany 23:00 to 06:00, more than 2 hours; the Netherlands 00:00 to 06:00, more than 1 hour; France 21:00 to 06:00, at least 3 hours; anywhere else 23:00 to 06:00, at least 3 hours. A shift is a night shift when that much of its work falls in the night time, or when its shift type's **Night shift** is **Always**.

#### Holiday calendars

A holiday calendar holds a list of public holidays. Open **Holiday calendars** in the Chrona Workforce Scheduler app. A Chrona Workforce Admin creates and changes them.

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Name | `chr_name` | The calendar's name, such as Bavaria. | Required. |
| Region | `chr_region` | The region whose public holidays Chrona gets. When you set or change it, Chrona gets the public holidays of this year and next year from Nager.Date (date.nager.at): the country's and the region's own. | Chrona gets no days. You add each day yourself. |

To get the newest days, select **Fetch latest** on the calendar. Chrona adds a day only on a date that has no day yet. To add a day yourself, add it to the calendar's **Public holidays** list with its date and name. To remove a day, deactivate it: Chrona does not add it again.

A shift that starts on a public holiday of its site's calendar, on the site's clock, counts in the **Sundays and public holidays worked** rule: on the board, in Auto Schedule and in Chrona Workforce Mobile.

### Planning horizon

A Workforce calendar can show its coming rosters above the board. On the calendar form, in the **Planning** section:

| Setting | Column | What it does | If empty |
| --- | --- | --- | --- |
| Planning horizon | `chr_planninghorizon` | **Yes** shows the coming rosters at the top of the board, with **Publish**, **Outcomes** and **Auto Schedule** for the selected roster. Needs the site's **Period**. | No: the board shows its period bar. |
| Plan ahead | `chr_planahead` | How many rosters after the current one the planning horizon shows. | 6. |
| Publish ahead | `chr_publishahead` | How many days before a roster starts it is due to be published, by 17:00. | 3. |

Each roster has a card: how much of it is filled, when it was published and the changes since, and the day it is due to be published. Select a card to show its roster. The card's menu offers **Publish {count} changes**, **Generate** and **Auto Schedule this roster**. A roster that was never published can be published once the roster before it is. The toolbar keeps its actions, and the roster header above the board offers **Publish {count} changes**, **Outcomes** and **Auto Schedule this roster** for the roster on screen.

### Agreements

An agreement holds the rostering rules of an award, an enterprise agreement or your own policy. Each worker works under one agreement. Roles play no part.

Set agreements up on the app's **Agreements** page, with the **Chrona Workforce Admin** role. A new agreement needs its **Currency**, which its amounts are in. It changes only while the agreement has no amount. Turn on auditing before the first rule: see [Install Chrona Workforce Scheduler](https://chrona365.com/docs/workforce/install).

1. Add an agreement and give it a **Name**. Save it.
2. On its **Rules** tab, add each rule to its group: **Rest**, **Days on and off**, **Hours**, **Overtime**, **Night shifts**, **Weekends**, **Duties**, **Hours balance**, **Premium rates** or **Pay loadings**. Each group has its own button, such as **Add rest rule**. A rule reads as one sentence with its numbers, its **Must** or **Should** level, its dates, its clause and its On switch. The Hours balance rules have no level and are not solver rules. Premium rates and pay loadings have no level either: they price hours and limit nothing. Each rule is one row of the **Agreement rule** table, with these columns:

| Column | What it holds | When empty |
| --- | --- | --- |
| Rule | One of the 28 rules below. | Required. |
| Value | Hours; whole days for **Days in a row** and **Days off**; night shifts for **Night shifts in a row** and **Night shifts in a period**; weekends for **Weekends worked** and **Weekends in a row**; days for **Sundays and public holidays worked**; days a week for **Days off a week, monthly average**; Sundays for **Sundays worked in a rolling window**; weeks for **Rotation**, 1 to 52; duties for **Duties in a period**; hours for **Most hours over** and **Most hours under**; months for **Settle within**; roster periods for **Pay back within**; points of the rate for **Pay loading**, such as 25. **Complete weekends** and **On call during work** set no number: the Agreement rules page stores 1. **Premium rate** has no value. Above 0. | Required, except for **Premium rate**. |
| Must or Should | **Must** always holds: Auto Schedule leaves a shift open rather than break it. **Should** gives way when the roster is better for it. | Must. **Minimum hours** and **Overtime** are always Should. The four **Hours balance** rules, **On call during work**, **Premium rate** and **Pay loading** have none. |
| Period | For **Maximum hours** and **Overtime**: Day, Week, Fortnight, Month or Roster period. For **Minimum hours** and **Days off**: Week, Fortnight, Month or Roster period. For **Night shifts in a period**: Week, Fortnight, Month, Roster period or Rolling weeks. For **Weekends worked**: Month, Roster period or Rolling weeks. For **Weekends in a row** and **Sundays and public holidays worked**: Month or Roster period. For **Duties in a period**: Week, Fortnight, Month or Roster period. | Week; Month for the weekend rules. |
| Over (weeks) | For **Weekly rest**, **Average hours**, **Sundays worked in a rolling window**, and **Night shifts in a period** or **Weekends worked** with Rolling weeks: how many weeks each window runs, 1 to 52. | 1. |
| Nights in a row | For **Rest after a run of nights**: the night shifts in a row that start the rest, 1 to 14. | 1. |
| Rate (%) | For **Overtime**: the estimated cost of an hour past the value, as a percentage of the worker's hourly rate. 150 is time and a half. For **Premium rate** with **of the rate**: what an hour on its days and times pays, 100 to 1000. Up to two decimals, such as 112.5. **of the rate with loadings** (Overtime and Premium rate): the percentage is of the worker's rate with their pay loading added, so 150% with a 25% loading is 187.5%; with **of the rate** the loading adds on top, 175%. Payroll pays from its own rates. | No overtime cost. |
| Amount | For **Premium rate** with **an hour extra**: the amount an hour pays above the worker's rate, in the agreement's **Currency**. Its code shows beside the box. When the currency cannot be read, the page says "currency unknown" there, with **Try again**. At a site in another currency, the amount is left out of the cost and the board names the worker. Chrona converts no money. A premium rate has a rate or an amount, not both. | None. |
| Days | For **Premium rate**: the days it pays on, Monday to Sunday and **Public holidays** (the days of the site's holiday calendar), at least one. For **Overtime**: the days the rule pays on, by the day a shift starts; none is all days, so Sunday overtime is a row of its own. | All days, for **Overtime**. |
| Hours | For **Premium rate**: **all day**; **between** two times; **for whole shifts that start between** two times, such as an afternoon shift starting 12:00 to 18:00, Monday to Friday; **for whole shifts that finish between** two times, such as a shift that finishes after 18:00 (18:00 to 00:00) or after midnight and by 08:00 (00:00 to 08:00); or **for whole night shifts** (the site's night time, or a shift type that is always a night shift). A whole shift counts on the day it starts, and the rate pays every hour of it. | all day. |
| From, To | For **Premium rate** with **between**: the clock times it pays between, in 15-minute steps, on the site's clock. With **for whole shifts that start between** or **finish between**: the times a shift's start or end falls between. Both modes read the window from the day the shift starts. A window whose end is at or before its start ends the next day. A **finish between** window that starts at 00:00 begins at the midnight that ends the start day. **all day** has none. | all day. |
| With other rates | For **Premium rate**, after **If another rate covers the same hour,**: **the higher one applies**: where rates cover the same hour, only the higher one pays, and on an overtime hour the higher of it and the overtime rate. **this rate's extra adds on top**: its extra adds to the higher of the other rates and to overtime, for a supplement paid beside them, such as a night supplement on a Sunday. | the higher one applies. |
| Employment type | For **Pay loading**: the employment type of the workers it is for, by the contract in force on the day. | Required for **Pay loading**. |
| Clause | The clause of the award or agreement the rule comes from, such as 21.3. | None. |
| Source link | Where the rule comes from: the page of the agreement, or the official page for a legal minimum. Select the rule's clause tag to set it. It is a web address that starts with https:// or http://. | None. |
| Date checked | The day the source was last read for the rule. Today or an earlier day. | None. |
| Overtime basis | For **Overtime**: what the hours count past. **after**: the hours worked in the period. **beyond the rostered shift** (period Day): the hours past the worker's published shifts that day; 0 hours is from the shift's end. **past full-time hours** (period Week): unplanned hours past the full-time week (the value), less the next week's hours below full time. **from day … in a row** (period Day): the hours of the day worked in a row in the site's week that **Day in a row** names, and of each later day of that run; the value is the hours within that day, 0 from its first hour. A day with no work ends the run, and the run starts again on the site's first day of the week. | after. |
| Day in a row | For **Overtime** with **from day … in a row**: the day worked in a row in the week the rule pays on, 2 to 7. A rule for the seventh day, such as Labor Code 510, is two rules: day 7 in a row after 0 hours at 150%, and day 7 in a row after 8 hours at 200%. | Required with that basis; 7 when you pick it. |
| Count days on call from home as days worked | For **Days off** and **Days off a week, monthly average**: On counts a day with an On call from home duty as a day worked. | Off. |
| On | Only rules that are on count. | On. |
| Effective start | The rule's first day, in the site's time zone. | Always. |
| Effective end | The rule's last day. On or after the start. | No end. |

The rules:

| Rule | Value | What it limits |
| --- | --- | --- |
| Minimum rest (hours) | Hours | The rest between two shifts. |
| Days in a row | Days | The most days worked in a row. |
| Maximum hours | Hours | The most hours worked in each period. A cap, with no cost: **Maximum hours** per **Day** stops a longer day, and **Overtime** per **Day** costs the hours past its value. |
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
| Complete weekends | None | All of the weekend or none of it: a worker who works one weekend day works the others too. |
| Sundays and public holidays worked | Days | The most Sundays and public holidays worked in each period, such as 3 a month. Public holidays are the days of the site's holiday calendar. A Sunday that is also a public holiday counts once. |
| Days off a week, monthly average | Days a week | The fewest days off a week on average over each calendar month, such as 2. Each month needs the value times its days / 7, rounded up: 2 a week is 8 days off in a 28-day February and 9 in a 29-, 30- or 31-day month. It has no period. |
| Sundays worked in a rolling window | Sundays | The most Sundays worked in any window of weeks, such as 2 in any 3 weeks, so the weekly rest falls on a Sunday at least once every 3 weeks. Public holidays are not counted. Set the weeks in **Over (weeks)**. |
| Rotation | Weeks | The most weeks in a row a worker works the same shift type, such as 4. It is in the **Days on and off** group. |
| Most hours over | Hours | The most plus hours a worker's hours balance holds (see **Hours balance**). |
| Most hours under | Hours | The most hours a worker's hours balance can be under their guaranteed hours. |
| Settle within | Months | The months within which an hours balance is settled. |
| Pay back within | Roster periods | The roster periods over which Auto Schedule spreads a worker's balance. |
| Duties in a period | Duties | The most duties, **On call at the workplace** and **On call from home** together, in each period, such as 6 a month. A duty counts on the day it starts. |
| Premium rate | None | Pays more for the hours on its days and times: a percentage of the worker's rate or an amount an hour extra. It is in the **Premium rates** group. |
| Pay loading | Percent | Adds a percent of the worker's rate to the hours it covers for one employment type, on top of any premium rate: 150% on a Saturday plus a 25% loading is 175%. The row's last choice sets the hours it is paid on: **every hour they work**, overtime too, or **their ordinary hours, not overtime**. Use the second for a loading paid for each ordinary hour worked, such as a part-time allowance. A part-timer at $30.00 with 15% on ordinary hours only is paid $34.50 an ordinary hour and $45.00 an overtime hour at 150%. It is in the **Pay loadings** group. |
| On call during work | None | On: an **On call from home** duty may overlap the worker's own shifts, so Auto Schedule, a repair or a call-out can give the worker on call work during it. Without it, an On call from home duty and work do not overlap. |

Auto Schedule adds the cost of premium rates and pay loadings to the roster's cost, so a roster with fewer premium hours costs less. The board's **Wages** and **Outcomes** count them at the worker's hourly rate, else the role's **Standard hourly rate**. Two premium rates on one hour do not add up: the one that pays more at that rate applies, a percentage or an amount, and so does the higher of a premium rate and an overtime rate, unless a premium rate adds on top (**With other rates**). A duty on call from home earns no premium. Rates estimate the schedule's cost; payroll pays from its own rates. The payroll export puts each premium rate's hours in an hour category of its own: see [Exports](https://chrona365.com/docs/workforce/exports).

The **Duties** group also holds the agreement's two duty credits, each a whole percent from 0 to 100: **An hour on call at the workplace counts as … of a paid hour** (empty is 100%) and **An hour on call from home counts as … of a paid hour** (empty is 0%). A credit is the share of each duty hour that counts toward a contract's **Guaranteed hours** and **Maximum hours**, toward the board's Roster hours and toward labour cost. An 8-hour night on call at the workplace at 25% counts 2 hours. The working-time rules do not use the credits: they count On call at the workplace in full and leave On call from home out.

**Record call-ins during on call at the workplace** is the agreement's switch under the credits, **Off** by default. On: a worker on call at the workplace records call-ins as on a duty from home, and each call-in counts in full as worked time, on top of the duty's credit. Off: work done during the duty is part of its credit. Its **(i)** says so.

**Count remote call-ins** is a switch on **Minimum rest**, **Weekly rest**, **Days off** and **Days off a week, monthly average**, **On** by default. Off: only call-ins worked on site count for that rule, so a call-in worked remotely does not break the rest or the day off. The switch is greyed while its rule is off.

A **call-in** is time a worker works when called during an on-call duty: on call from home, or on call at the workplace when **Record call-ins during on call at the workplace** is On. In Chrona Workforce Mobile, the worker taps **Clock in when called** inside the duty and **Clock out** when done, or adds it afterwards with **Add call-in**, its start and finish inside the duty. On a duty on call from home, **Clock in when called** and **Add call-in** ask where it was worked, **On site** or **Remotely**, with no preset. **Clock out** of an on-site call-in asks **Travel, both ways (minutes)**, which is part of its times. On a duty on call at the workplace, a call-in is always **On site** with no travel, so the app and the board record it without asking. A call-in that runs into the worker's shift ends at the shift start with **Start my shift**, which clocks the shift in at that moment. Each call-in lists under the duty as **Saved**, **Submitted**, **Approved**, **Returned** or **Voided**, goes on the worker's timesheet, and the manager approves it like any time. For a worker without Mobile, a planner right-clicks a duty that has started on the board, selects **Call-ins**, then **Add call-in**: the start and finish offer only times inside the duty, the planner chooses **On site** or **Remotely**, and the call-in is approved when the planner saves it. An On call at the workplace duty clocks in and out like any shift; with **Record call-ins during on call at the workplace** On, its card also offers **Clock in when called** and **Add call-in**, and its call-ins run beside the duty's own clock. While a call-in runs, the worker clocks out of the call-in before **Clock out of duty**. The board's Roster hours tooltip gives approved call-ins a line of their own.

To remove a call-in, the worker deletes it in Chrona Workforce Mobile while it is **Saved** or **Returned**. Once it is approved, the worker selects **Request void** and gives a reason, and the manager's OK voids it. A planner edits or voids a call-in that a planner added, from the duty's **Call-ins** (**Edit**, or **Void** with a reason), and the worker gets a notice. A voided call-in stays listed, struck through, with who voided it and why; it leaves pay, the hours balance and the export. In a pay period that has ended, adding, changing or voiding a call-in needs **Allow past corrections** (Mobile, then **Setup**, **App settings**, **Timesheets**) and a reason.

A shift with recorded time (a clock time, a call-in, or an entry that is no longer a draft) can't be deleted: Chrona says so and asks you to reassign it. A shift whose time entries are only planned, with nothing recorded yet, is deleted with them. A reassigned duty leaves the former worker's schedule; the call-ins they recorded stay on their timesheet.

3. On its **Applies to** tab, select **Add a worker** or **Add everyone in a role**. **Add everyone in a role** adds those workers now. A worker who joins the role later needs their own agreement. Adding a worker moves them from the agreement they had. You can also set **Agreement** on a worker.
4. On its **Source** tab, select **Attach document** to keep the agreement as published, up to 32 megabytes (MB). The tab lists each clause the rules cite, with its words and its rules.

How the rules apply:

- Auto Schedule keeps every Must rule, and leaves a shift open rather than break one. It keeps each Should rule where it can.
- Periods are counted on the site's clock. A week starts on the site's **Week starts on** day. When the site's roster **Period** is a week or a fortnight, fortnights start on its **Period starts on** date. To line a week or fortnight rule up with the roster, set **Period starts on** to a date on that day. A month is a calendar month. **Roster period** is the period Auto Schedule plans.
- A period that ends after the period Auto Schedule plans is counted up to that end. **Days off** and **Minimum hours** are reduced in proportion to the days counted.
- **Weekly rest**, **Average hours**, **Sundays worked in a rolling window**, and **Night shifts in a period** or **Weekends worked** with Rolling weeks look at every window of weeks, one week after another.
- **Days off a week, monthly average** counts each calendar month. A month the roster ends in needs its share of the month's days off, rounded down; the next roster counts the whole month, with the shifts already worked.
- A rest regime that averages days off over the month, with at least 1 day off within any week and a Sunday off at least once every 3 weeks, takes four rules: **Days off a week, monthly average** 2, **Days in a row** 6, **Weekly rest** 24 hours and **Sundays worked in a rolling window** 2 over 3 weeks.
- **Rotation** counts from a worker's first shift of one shift type to their last before a shift of another type, on the site's clock. Days off inside it count, so 4 weeks allows 28 days. A shift with no shift type is not counted. A worker who must not rotate, such as a permanent night worker, works under an agreement without a Rotation rule.
- The order of shifts comes from **Minimum rest**: there is no rule for it. With 11 hours' rest, a Late that ends at 21:30 cannot be followed by an Early at 06:30 the next day (9 hours). With these times, Early then Late and Late then Night are fine, so shifts can rotate forward, Early to Late to Night, and Early, Late, Early costs more than Early, Early, Early.
- An **On call from home** duty is not working time: the rest, days, hours, night and weekend rules leave it out, except a **Days off** or **Days off a week, monthly average** rule with **Count days on call from home as days worked** On. Its approved call-ins count as worked time, as **Count remote call-ins** sets. **On call at the workplace** is working time and counts in full. **Duties in a period** counts both.
- A duty of either type can be a night shift: set **Night shift** on its shift type, or let the site's night time decide. A night duty shows the night marker on the board, and night shift preferences and **Spread night shifts** count it.
- The five night rules count only night shifts (see **Sites**). A run of night shifts ends at a day off or at a shift that is not a night shift. **Night shifts in a period** counts each night shift in the period it starts in.
- The four weekend rules count the agreement's weekend days. The **Weekend** button in the **Weekends** group sets them: one to three days in a row, such as Friday and Saturday. If you set none, the weekend is Saturday and Sunday. A shift belongs to the weekend of the day it starts, on the site's clock.
- **Auto Schedule** weighs wages in every run: each worker's hours at the **Hourly rate** on their contract, the contract in force on the day. With no rate on the contract, each shift costs at the **Standard hourly rate** of its role. It picks the cheaper of two workers who fit equally well. It does not leave a shift open to save money.
- **Overtime** costs the hours past each step at the step's rate above the rate of the day the hour is worked. An hour counts once: a **Day** rule counts first, then **Week**, **Fortnight**, **Month** and **Roster period**, and each longer period counts only the hours that are not overtime yet. With 8 hours a day and 40 a week, five 10-hour days give 10 hours of overtime, all from the **Day** rule. The days leave 40 hours, so the week adds none.
- The board counts wages from the same hours and rates: **Wages** and **Overtime hours** in the toolbar's **Stats** menu, **Wages** and **Overtime cost** in a proposal, and the roster's **Outcomes**. They count hourly rates, premium rates, pay loadings and overtime.
- The rates, **Wages**, **Overtime cost** and **Outcomes** estimate the schedule's cost. Payroll pays from its own rates. The export carries hours, hour categories and times, not rates or money.
- **Overtime basis**: Auto Schedule, the board's **Wages** and the overtime warning count the **After a set number of hours** and **Days in a row in the week** rules. **Beyond the rostered shift** and **Past full-time weekly hours** compare approved time with the published shifts, so the payroll export counts them from approved time. An hour is overtime once: the **After a set number of hours** rules count first.
- **Past full-time weekly hours** settles a week at the end of the next week; the payroll export marks hours still open as provisional (see [Export hours and staffing reports: Overtime](https://chrona365.com/docs/workforce/exports#overtime)).
- **Overtime is voluntary**, at the top of the **Overtime** group, is Off by default. On: Auto Schedule gives the agreement's workers no overtime of any kind: no hours past an **after** step's hours on the days it pays, also when the step's days count over a week, and no day that a **from day … in a row** step would pay. A shift that would need it stays open for the call-out. The offer tells each worker the overtime the shift puts them into before they accept. A planner can still assign them by hand, with the warning. Worked overtime is always paid.
- A drag, assign or edit on the board that puts a worker into overtime warns, such as **Puts Ava into overtime: 6 h at 150% (+$135, estimated)**. It does not block. The shift that puts the worker into overtime, such as the one you dropped, carries an **Overtime** mark, listed in the legend, and its hover card shows the overtime. The cost is the extra pay above base pay, estimated from your rates; payroll pays from its own rates.
- Approving a shift request, a swap or a cover that puts a worker into overtime shows the same note first: on a scheduler's **Requests** page, and in Chrona Workforce Mobile for the worker's manager. On the **Requests** page, a timesheet shows the overtime it adds to its pay period, per rate, with the estimated cost: each shift at the worker's hourly rate, else at the **Standard hourly rate** of its role. Hours still inside a make-up week are marked provisional.
- When two rules of one type are in force on the same day, both hold.
- The rule in force when the later work starts applies. Rest before a shift uses the minimum in force when that shift starts. Each day of a run uses the limit in force that day.
- To stop a rule, set its **Effective end**. Switching it off changes past periods too.
- The rules also count the shifts before the roster period, as far back as the longest rule needs: its rest, its run of days, the start of its period or its window. Their breaks are not read, so a night shift before the roster period is judged from its start to its end.
- A worker with no agreement, or with no rule in force, is not checked. The board marks each such worker, unless no one has an agreement.
- A deactivated agreement counts as no agreement.
- Dataverse refuses to delete an agreement while workers work under it. Move them to another agreement first.
- In the review, broken **Maximum hours**, **Days off**, **Weekly rest** and **Average hours** rules each count on a row of their own; a broken **Days off a week, monthly average** counts as **Days off**. Broken night rules count as night shifts. Broken weekend rules count as weekends. A broken **Duties in a period** counts on its own row, and so does a broken **Rotation**. A shift under a contract's **Minimum engagement** counts on its own row.
- A change by hand that breaks a Must rest, days in a row or **Rotation** rule gets a warning on the board. The board does not block it. An On call duty over the worker's own shift warns as an overlap unless **On call during work** holds.

With an agent: the `agreement_reading` tool of the Chrona Model Context Protocol (MCP) server tells your agent how to read your agreement document and propose its rules, each with its clause number. Your agent writes nothing until you confirm each clause number and value. The `generate_agreement` tool then turns the rules into the requests that create the agreement and its rules. Your agent attaches the document, keeps each clause's words and links the workers with its own Dataverse tools. The document, its words and worker data do not reach the Chrona MCP server.

### Contracts

A contract holds one worker's own terms: their employment type, their dates, their guaranteed and maximum hours, their hourly rate and their minimum engagement. The agreement holds the rules everyone on it shares. A contract adds limits to them and cannot loosen them. In Chrona Workforce Scheduler, a worker's hours come only from their contracts; a worker's rate is the contract's **Hourly rate**, else the **Standard hourly rate** of the shift's role.

First, set up your employment types on the app's **Availability** page, under **Roster**, with the **Chrona Workforce Admin** role. Name each one your way, such as Full-time, Part-time and Casual. A type can name a **Default pattern**: workers of the type who have no availability pattern of their own work only inside it. **Changes from the phone** lets its workers ask in Chrona Workforce Mobile to change their pattern or add one-off times; you approve each request. A worker with no pattern can work any time they are not unavailable.

Then open a worker and select the **Contracts** tab:

1. Select **New contract**.
2. Pick the **Employment type** and the **Start**. Pick an **End** only if the contract ends. Leave it empty if the contract is ongoing. If a later contract exists, an empty **End** becomes the day before it.
3. Enter the **Guaranteed hours**, the **Maximum hours**, **Hours per**, the **Hourly rate** and the **Minimum engagement**.
4. Select **Save**.

| Field | What it holds | When empty |
| --- | --- | --- |
| Employment type | The type from the **Availability** page, under **Roster**. | No type. |
| Start | The contract's first day. | Required. |
| End | The contract's last day. On or after the start. | Ongoing. |
| Guaranteed hours | The hours Auto Schedule gives the worker in each period where it can, a Should rule. | None, as for a casual. |
| Maximum hours | The most hours the worker works in each period, a Must rule. | Only the agreement's limits. |
| Hours per | The period of both hours: Week, Fortnight, Month or Roster period. | Week. |
| Hourly rate | The rate, in the contract's currency, whose code shows beside the box. When the currency cannot be read, the page says "currency unknown" there, with **Try again**. At a site in another currency, the rate is left out of the cost and the board names the worker. Chrona converts no money. Wages and overtime cost read it. | The **Standard hourly rate** of the shift's role applies. |
| Currency | Set when the contract is made, from the sites of the worker's schedulers. It shows as plain text with one currency there. Several: you pick one. A worker on no site: a picker with your organization's base currency selected. To change it, clear the rate and save first. | The contract takes the one currency of the worker's sites. With several or none, the save is refused. |
| Minimum engagement | The fewest paid hours in each of the worker's shifts, 0.25 to 24, a Must rule. | No minimum. |

How contracts apply:

- A worker has one contract in force on each day. A new contract ends the contract before it on the day before the new one starts. The page tells you before you save. A contract that shares a day with another of the worker's contracts is refused.
- To change a worker's terms from a later day, add a new contract. Editing a contract that has started changes it from its first day.
- **End contract** sets a contract's last day. A contract that has not started has **Delete** instead. The contract before it then runs until the day before the next contract, or with no end.
- A contract's rules apply only on its own days. Auto Schedule keeps each worker within their **Maximum hours** and gives them their **Guaranteed hours** where it can, both over **Hours per**. The agreement's rules still hold. When a contract allows more hours than the agreement, the contract shows a warning, and the agreement's limit applies.
- Auto Schedule gives a worker no shift shorter than their **Minimum engagement**, counting paid hours (the shift less its unpaid breaks). Each part of a split shift is one shift. When you make a shift shorter than it by hand, the board warns, and a proposal counts it under **Minimum engagement**.
- The Roster grid shows each worker's hours against the contract in force on the roster's first day: the bar runs to the maximum, with a mark at the guaranteed hours. Its tip names each figure.
- **Wages** count each shift at the **Hourly rate** of the contract in force on its day, else the **Standard hourly rate** of its role. The wages note names each worker with no rate.
- The **Chrona Workforce User** role reads contracts. The **Chrona Workforce Admin** role adds, changes, ends and deletes them.

### Hours balance

Each worker with guaranteed hours has an hours balance: the hours they worked against the hours their contract guarantees, carried from one pay period to the next. Open a worker and select the **Hours balance** tab to see the balance and each entry, with the **Chrona Workforce Admin** role.

- When a worker's timesheet for a pay period is approved, Chrona adds an **Accrual**: the approved hours, plus leave that counts as worked, less the guaranteed hours for the pay period's days. Call-ins count in full. Time on an **On call at the workplace** duty and each **On call from home** duty count at the agreement's duty credits (see [Agreements](#agreements)). Each day owes its share of the contract in force that day: the guaranteed hours spread over the days the worker works in **Hours per**. Those are the days their availability pattern makes available, or with no pattern the days outside their agreement's weekend.
- A leave type counts as worked when **Counts as worked** is Yes on it, under **Availability** types. A day of such leave credits the hours of the shifts it took off. A working day of it with no shift credits that day's share.
- A later change to a counted pay period, such as a corrected timesheet or a leave approved or cancelled afterwards, adds an **Adjustment** for the difference.
- When a worker joins with a balance from before Chrona, select **Add entry** and add an **Opening** entry. To correct a balance, add an **Adjustment**. Each needs a reason. No one changes an entry: a correction is a new entry.
- A public holiday of the site's holiday calendar on one of the worker's working days credits that day's share. A holiday they worked counts as worked, once.
- Four agreement rules hold the balance: **Most hours over** (hours), **Most hours under** (hours), **Settle within** (months) and **Pay back within** (roster periods). When an **Accrual** takes the balance above **Most hours over**, Chrona adds a **Payout** entry for the hours above it. For payroll codes and payout source requirements, see [Export hours and staffing reports](https://chrona365.com/docs/workforce/exports). The four rules are not solver rules; **Settle within** is stored, and the settlement at the end of each window is not yet in Chrona. Add them in the **Hours balance** group of the agreement's **Rules** tab, or with your agent's `generate_agreement`.
- With **Pay back within**, Auto Schedule moves each worker's guaranteed hours for the roster period by their balance over that many roster periods: +12 hours over 3 periods lowers a 154-hour target to 150. A raised target stops at the maximum hours. A worker on schedulers with different roster periods pays back by the week.
- With **Most hours over**, hours past the guaranteed hours go to the balance first: overtime counts only past the hours the balance can still take. Auto Schedule and the board's **Wages** and **Overtime** count the same.
- On the board's **Roster** layout, each worker shows their balance under the hours bar, amber at a limit and red past it. The hours bar reads the moved target; its tip says what it moved from.
- In Chrona Workforce Mobile, a worker sees their balance, the date it is paid back by, this period's target and each entry on the **More** page (My contract).
- A worker with no guaranteed hours in a pay period gets no **Accrual** for it.

### Import a roster from Excel

Bring a roster you keep in an Excel workbook into the roster period on the board. Select **Import** on the toolbar, or under **Actions** when the roster has shifts. A roster with no shifts also offers **Import from Excel**. The import has four steps: **File**, **Mapping**, **Check** and **Import**. Nothing is written until you confirm.

1. **File**: select **Choose workbook**. Chrona reads an .xlsx file of up to 10 MB in your browser, and the file stays there. It reads a worker per row, a day per row, a block per week, or a row per shift, and leaves other sheets, such as a worker list, out. For a file in another layout, select **Download the Chrona template** and fill it in.
2. **Mapping**: give each code in the file a meaning, such as **Shift**, **Leave** or **Day off**, and give each shift code its times.
   - Without an agent, select **Map it here**.
   - With an agent, select **Share with my agent**. The page saves a summary of the file in your environment: sheet names, headers and codes, with names and notes replaced. The page shows the words to give your agent, such as "Map Chrona import 7F3K". Your agent reads the summary with its own Dataverse tools and maps it with the `import_mapping` tool of the Chrona MCP server. The mapping it writes back shows as **From your agent**.

   Then select **Check the whole file**.
3. **Check**: the page lists each cell it cannot place, with the reason, such as an unknown code, a merged cell or two codes in one cell. Fix the file, or select **Import without them**. Shifts already on the file's days stop the import, unless an earlier import wrote them. Clear those shifts on the board first.
4. **Import**: Chrona writes the workers, shift types, demand, leave and shifts with your own Dataverse rights. Keep the page open. **Stop** keeps what is written. To finish, import the file again: a second import writes no row twice.

After the write, Chrona reads the roster back and compares it with the file, table by table and hours by worker. When they match, Chrona saves the roster's counts. **Outcomes** shows them as **Hand-built**, beside **Now** and **Before**.

### Mark absent and find cover

When a worker cannot work, select **Mark absent**. On a roster that has started, it is on the toolbar. On a coming roster, it is under **Actions**. The menu of a worker, and the menu of a shift that has a worker, also offer it as **Mark [name] absent**.

1. Type the worker's name. Set **From** and its **Start time**, then **Until**: **End of that day**, **End of the next day** or a date you pick. Set a **Reason**: the reasons are your availability types.
2. The shifts that the absence overlaps need cover at once. A shift that the worker has started ends at the start time. The worker keeps the part they worked, and the rest is a shift of its own that needs cover.
3. With **Find cover now**, Chrona repairs the roster that holds the absence. A repair moves only the shifts that the absence opens, open shifts and duties. Every other shift keeps its worker. Nothing changes until you apply.
4. The review lists the cover for the absent worker first, one chain of moves at a time. Select **Drop this cover** to leave a chain out, then **Apply**. A shift that nobody can take without breaking a Must rule stays open, and the review says so.

**Discard** keeps the absence and the open shifts. **Undo absence** removes the absence and gives each shift it opened back to its worker, while that shift is still open.

A coverage row's **How many** is the shifts you need. Set **Maximum** above it to allow more: Generate also makes the shifts above How many, up to Maximum, as optional shifts. Left open, an optional shift shows quietly, not as a shift that needs cover. Auto Schedule fills it when workers are free. Workers can take it in Chrona Workforce Mobile like any open shift.

Set **Duty type** on a shift type on the **Shift types** page: **Work** (the default), **On call at the workplace** or **On call from home**. Generate copies it to each shift it makes. A later change to the shift type does not change shifts already made. To change one shift, set **Duty type** on the Shift form. A duty follows its coverage row as other shifts do: **How many** duties are required, and the ones above it, up to **Maximum**, are optional.

- A required duty left open needs cover: the board shows it as **Needs cover**, and Admin Home and the review count it. Auto Schedule fills it unless a Must rule blocks it. When you mark its worker absent, it opens and needs cover. Fill it with **Find cover**. A shift that needs cover and is longer than 30 minutes comes before a duty: when nobody else fits, Find cover moves the worker on call onto the absent worker's shift, and the duty then needs cover.
- An optional duty left open is backup: the board shows it dashed, not as a shift that needs cover. Auto Schedule staffs it when workers are free, and a repair can move its worker onto a shift that the absence opens.
- Call-out, offers, picks, the open shifts list and the open shift notices leave a duty out.
- A duty is not demand: staffing standards add no shift of a duty shift type and do not count the hours of a duty.
- Generate has no public holiday rule: for a duty on a public holiday, add a coverage row for that day or make the shift by hand.
- A site's **Share work fairly** can include **Spread duties**: Auto Schedule gives each worker about the same number of duties, both types together. **Hours** counts a duty at its agreement's credit. The working-time rules count a duty as **Agreements** describes. The board's hover card shows the duty. The Roster hours count each duty at its agreement's credit (see **Agreements**), and their tip shows the hours worked and each duty's credit.

To tell a worker what they need to know for a shift, write **Shift instructions** in the shift's dialog on the board, or on the Shift form. Once you publish, they see them in the shift's details in Chrona Workforce Mobile. A change to them is a change to publish.

### Outcomes

**Outcomes**, under **Actions**, shows what the roster on screen comes to: broken rules, open required shifts, workers with no agreement, preferences met, wages and overtime.

- **Now** counts the roster as it stands.
- **Hand-built** is the roster you imported, when you imported one.
- **Before** is the previous roster, as last applied.
- **Actual overtime hours** and **Actual overtime cost** sit under the planned **Overtime hours** and **Overtime cost**: the overtime of the time you approved on the roster's days, counted as the payroll export counts it. Hours of **Past full-time weekly hours** still inside their make-up week show as provisional. A roster with no approved time yet shows a dash with the tip **No approved time yet**. The cost prices each shift at the worker's hourly rate, else at the role's **Standard hourly rate**; it is an estimate, and payroll pays from its own rates.

Chrona saves a roster's counts at each import and each **Apply**, in your environment: numbers only, no names. A count that Chrona did not save shows as **Not saved**. **Last 12 rosters** shows the trend.

## Editing the rows without an app

Makers open the view row from the gear on the board, shown to users who can edit it. The two configuration tables are managed, org-owned and plain. In the maker portal, select **Tables**, search for **Chrona Scheduler**, open the table, and edit the rows in its data grid, or add the two tables to any model-driven app as pages. The row for your view is the one whose view id matches; the calendar row is named after your table.

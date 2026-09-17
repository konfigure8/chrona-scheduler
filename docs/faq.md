# Questions

## Installing

**The import wizard's Environment Variables step says "2 updates needed". What do I type?**
Nothing. The two addresses are filled in already; the heading is the wizard's wording for prefilled values. Select **Import**.

**The import banner says translated labels for language 1031 could not be imported.**
The solution carries German labels. They install only where German is enabled for the environment. Nothing else is missing.

**How do I know the import has finished?**
The solution appears in the Solutions list, under the **Managed** filter, and the banner above the list reports the result.

**Creating a table right after the import fails with "another Import running".**
The platform finishes the import in the background for a minute or so after the banner. Wait a minute and select **Save** again.

**Does anyone need a Chrona account?**
No. The scheduler works without one, and Connect registers your environment with the Chrona service without a sign-up form. A Chrona account matters only for plans and usage.

## Binding the scheduler

**Chrona Scheduler is not in the Add a component list.**
Select **Get more components**, select the **Chrona Scheduler** row, then **Add**. It then appears in the list. The added entry does not survive leaving the designer without saving.

**Done stays grey in the property pane.**
Title, Start and End must be bound first.

**Resource does not offer Owner.**
Resource takes a plain lookup to one table. Add a lookup column, for example Assigned to, pointing at User or your people table. When you create that column, the related table search for "User" lists several tables; choose the entry named exactly User.

**The property pane shows loading placeholders that never resolve.**
That happens when the bindings of a view that already has the scheduler are edited again. Add the scheduler to a fresh view instead.

**My new columns are not on the form.**
After adding columns, select **Update forms and views**, pick the columns, then **Update**, then **Publish all customizations** under Solutions. The app can keep the old form for a few minutes; reload it.

**Which platforms should I tick under Show component on?**
Web and Tablet. A phone layout is not part of this release.

## Using it

**What is saved when I drag a row?**
The row's start, end and, with a Resource binding, its lookup. Every edit writes to your table at once; Undo and Redo write back the same way.

**What does Optimize send?**
A pseudonymous copy of the rows in the period: ids replaced with placeholders, no names or titles. You can read the exact payload before the first run from the Optimize dialog. The answer comes back as a proposal on the board; nothing is written until you select **Apply**.

**What does a connected environment cost?**
Nothing for the scheduler. A connected environment gets a free daily allowance of optimizations. Scenario solutions such as Chrona Workforce Scheduler are licensed separately.

**What happens when the day's free allowance is used up?**
The scheduler says so and Optimize returns the next day. Scheduling itself keeps working.

## Languages

The scheduler and the solution's labels ship in English and German. The user's Power Apps language picks the strings; German labels on tables and views appear where German is enabled for the environment.

## Removing the solution

Take Chrona Scheduler off every view that uses it first, then delete the solution from the Solutions list. The platform refuses to delete a solution a view still depends on and names those views.

## Help

support@chrona365.com

# Questions

## Installing

### The import wizard's Environment Variables step says "2 updates needed". What do I type?
Nothing. The two addresses are filled in already; the heading is the wizard's wording for prefilled values. Select **Import**.

### The import banner says translated labels could not be imported.
The banner may name a language ID. Dataverse installs translated labels only for languages enabled in the environment. The warning does not stop the scheduler import. For example, 1031 is German. See the [language IDs](#languages) below.

### How do I know the import has finished?
The solution appears in the Solutions list, under the **Managed** filter, and the banner above the list reports the result.

### Creating a table right after the import fails with "another Import running".
The platform finishes the import in the background for a minute or so after the banner. Wait a minute and select **Save** again.

### Does anyone need a Chrona account?
No. The scheduler works without one. **Try a free sample run** in the Optimize dialog connects your environment to the Chrona service without a sign-up form. A Chrona account matters only for plans and usage.

## Binding the scheduler

### Chrona Scheduler is not in the Add a component list.
Select **Get more components**, select the **Chrona Scheduler** row, then **Add**. It then appears in the list. The added entry does not survive leaving the designer without saving.

### Done stays grey in the property pane.
Title, Start and End must be bound first.

### Resource does not offer Owner.
Resource takes a plain lookup to one table. Add a lookup column, for example Assigned to, pointing at User or your people table. When you create that column, the related table search for "User" lists several tables; choose the entry named exactly User.

### The property pane shows loading placeholders that never resolve.
That happens when the bindings of a view that already has the scheduler are edited again. Add the scheduler to a fresh view instead.

### My new columns are not on the form.
After adding columns, select **Update forms and views**, pick the columns, then **Update**, then **Publish all customizations** under Solutions. The app can keep the old form for a few minutes; reload it.

### Which platforms should I tick under Show component on?
Keep Web and Tablet and untick Mobile. A phone layout is not part of this release.

## Using it

### What is saved when I drag a row?
The row's start, end and, with a Resource binding, its lookup. Every edit writes to your table at once; Undo and Redo write back the same way.

### What does Optimize send?
A pseudonymous copy of the rows in the period: ids replaced with placeholders, no names or titles. You can read the exact payload before the first run from the Optimize dialog. The answer comes back as a proposal on the board; nothing is written until you select **Apply**.

### What does a connected environment cost?
Nothing for the scheduler. A connected environment gets a free daily allowance of optimizations. Scenario solutions such as Chrona Workforce Scheduler are licensed separately.

### What happens when the day's free allowance is used up?
The scheduler says so and Optimize returns the next day. Scheduling itself keeps working.

## Languages

Chrona Scheduler supports English, German, French, Spanish, Portuguese, Dutch and Italian. Download the current package from [GitHub releases](https://github.com/konfigure8/chrona-scheduler/releases).

| Language | Language ID in the solution |
| --- | --- |
| English | 1033 |
| German | 1031 |
| French | 1036 |
| Spanish | 3082 |
| Portuguese | 2070 (Portugal), 1046 (Brazil) |
| Dutch | 1043 |
| Italian | 1040 |

The user's Power Apps language selects available scheduler text. Dataverse installs translated table and view labels only for languages enabled in the environment. The Portuguese locales use the same wording.

## Removing the solution

Take Chrona Scheduler off every view that uses it first, then delete the solution from the Solutions list. The platform refuses to delete a solution a view still depends on and names those views.

## Help

support@chrona365.com

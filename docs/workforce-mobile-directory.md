# Connect your directory to Chrona Workforce Mobile

Save an import definition to choose who joins Chrona Workforce Mobile and how their details stay current. The definition holds your selected groups, optional office and department filters, field rules and onboarding choices. Background sync keeps worker names, email addresses and reporting managers up to date from Microsoft Entra ID.

Open **Setup → People & access** in your Chrona administration app. Start with **Import definitions**. Use the existing directory connection when it is ready; your Power Platform administrator can repair or configure the connection when needed.

## Connection

Check the directory connection before you select people. **Connections configured** means the required saved connections are present. Use **Check connection** to read directory groups through those connections. **Directory read checked** confirms that read succeeded. Use **Check again** to reload the saved setup state; this clears the earlier read result. A saved connection alone is not proof of directory access.

The **Setup checklist** shows the directory and Dataverse connections, directory flows, worker site, directory updates and connection user. **Not checked** means Chrona could not read a setting. Ask your administrator to check access before changing that setting. Use the repair link beside an item that needs attention.

**App activity** shows whether Chrona records first app use and last activity for the People views. If this is off, use **Enable app activity** to start recording future use. Earlier activity is not filled in. This records app use, not Microsoft Entra sign-ins, and does not change access. You can turn recording off in **App settings → App activity**; existing activity dates are kept.

The directory connection uses Microsoft Graph for group selection, worker profiles and reporting managers. The same connection is used for background sync. Your Dataverse connection reads and updates the saved Chrona records.

The connection account is separate from the workers who will use the app. Selecting a Dataverse user in the advanced settings does not sign in as that user or change the account used by the background flows.

If the connection needs attention, use [Fix a connection](#fix-a-connection). You can return to setup after the connection is repaired.

## Groups

Search by group name or browse the available groups. Select each group you need, including a Microsoft Teams group when it contains the workers you want. Group type labels help you distinguish the results. Selected groups stay visible as tags; remove a tag to exclude that group. Refine your search if the list does not include the group you need. You do not need to write a filter expression or copy a group ID.

Your selection includes **direct user members** of the groups:

- A person in several selected groups is imported once.
- People inside a nested group are not included through the parent group. Select the nested group itself when you need its direct members.
- Disabled directory accounts cannot receive new app access.
- A reporting manager can be outside the selected groups. Chrona can record that manager for reporting without creating worker app access or sending an invitation.

Review the selected groups before you save. Removing a group can remove people from the source's scope. Chrona checks all selected groups before it stops access for people who are no longer included. An incomplete directory read must not be treated as a list of people who have left.

### Filter by office or department

After you select groups, load the available office and department values. Chrona reads the direct members of those groups and offers the values held in their Entra profiles. Choices appear only after the complete read succeeds.

- Select one or more values in either field. A person can match any selected value within that field.
- If you select both office and department values, a person must match both fields.
- Leave a field empty to include all values for that field. **Clear filters** includes everyone in the selected groups.
- Office values come from Entra **Office location**. They do not create or map Scheduler locations.

For example, select the Brisbane and Sydney offices and the Care department to include Care workers in either office. A worker with an empty office value does not match a selected office.

Changing the groups or connection user makes the choices out of date. Load the choices again before you save changed filters. New or changed filters need a complete read from the last 30 minutes for the same groups and connection user. If a selected value no longer appears, clear that value or correct the directory profile and load the choices again. You can keep unchanged saved filters without another read. You can always clear filters when a read is unavailable and no read is in progress.

An incomplete read does not remove people from scope. A disabled account is still processed to stop access, even if its profile no longer matches an office or department filter.

## Fields

Chrona uses these directory fields:

| Worker information | Directory source |
| --- | --- |
| Name | Display name |
| Email | Email address; sign-in name if email is empty |
| Reporting manager | Manager relationship, when directory management is selected |

Change these directory-managed fields in Microsoft Entra ID.

The manager is a person, not a text label. Select directory-managed reporting managers to keep the relationship in step with Entra. If managers are maintained in Chrona, directory sync leaves those relationships under your control.

**Imported people** shows the saved worker values after a sync. Run sync to bring in changes from the directory.

A reporting-manager link does not itself give approval authority or app access. Review a missing or disabled manager before relying on the relationship. The field list shows the supported mapping; it is not a general-purpose field-mapping editor.

## Automation

Review account linking, invitations and sync scheduling before you activate this import definition.

### Set up worker sign-in

Set up and test the worker site's sign-in before you enable automatic account linking or invitations. For **Let imported people sign in with Microsoft Entra**, use the site's built-in Microsoft Entra provider in the same tenant as the imported accounts. The provider must be enabled. Email-based contact matching and custom authority, issuer or identity-claim overrides are not supported by this option. The setup check must confirm that the provider is configured for this site.

After a complete successful sync, this option links each eligible worker's existing contact to the verified Microsoft Entra account ID. The worker then uses that work account to sign in. Name or email changes keep the same link. A conflicting identity needs review; Chrona does not move the identity to another contact. Account linking does not send an invitation. Clearing the option stops new automatic links and leaves existing links in place.

The worker must have active access and be within any access dates. A manual access stop or expired access prevents a new link. An existing sign-in link can remain when access is stopped; Chrona still checks worker access before it returns worker data.

Check these separate prerequisites with one worker before you expand the rollout:

| Check | What to do |
| --- | --- |
| Microsoft Entra sign-in | Confirm that the worker can use the site's built-in provider with an account in the same tenant. |
| MFA or security information | Complete the organization's required authentication or security-information registration. This verifies the person; it does not grant the app permissions. |
| App consent | Review the permissions requested by this site's app. If tenant policy requires administrator approval, ask the identity administrator to review the request. Consent does not complete MFA. |
| Private development site | Add the test user to the site's permitted users. This site-visibility check is separate from the worker's account link and Chrona access. |
| First worker session | Open the worker app, sign in and confirm that the intended worker sees the correct data. A configured badge alone does not prove this step. |

Review the actual app and tenant policy for your site. Directory-reader connection permissions are a separate setup task.

Microsoft documents the [default Entra provider for code sites](https://learn.microsoft.com/en-us/power-pages/configure/create-code-sites), [site identity settings](https://learn.microsoft.com/en-us/power-pages/security/authentication/configure-site), [site visibility](https://learn.microsoft.com/en-us/power-pages/security/site-visibility) and [user and administrator consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview).

### Choose onboarding

Choose what should happen to new workers:

| Choice | Result |
| --- | --- |
| Prepare only | Import worker records. You decide when to send invitations. |
| Invite new workers | Prepare invitations for eligible newcomers after a complete sync. First confirm that your site's sign-in and invitation delivery are configured. |

Automatic invitations apply to new eligible workers after you enable the policy. They do not resend old invitations or invite every previously imported person. Review existing uninvited people in **People**.

Use **Save draft** after you choose the required groups and settings. A draft is excluded from scheduled sync. When the connection and setup checks pass, use **Save and start sync**. An active source uses **Save and run sync**. These actions save the settings and request a run; they do not repair a connection or turn on a disabled Power Automate flow.

The installed schedule checks for work every 30 minutes when your administrator has enabled it. Processing can take longer; use the run result to confirm completion.

After you activate the source, use **Run sync** for an immediate request. Check the result, processed count and any items that need attention. A queued or running sync has not yet completed. An invitation prepared by sync is not proof that an email reached the worker.

## Fix a connection

Keep the source and its selected groups. Use **Manage connections** to open the platform connection settings, then repair the connection the source uses:

1. Open [Power Automate](https://make.powerautomate.com/) and select the same environment as your Chrona app.
2. Open **Connections**. Find the directory connection used by the Chrona solution. Ask its owner to update the connection if it requires sign-in. For a new directory connection, use **HTTP with Microsoft Entra ID** and set both the resource URI and base URL to `https://graph.microsoft.com`.
3. Open **Solutions**, then **Chrona Workforce Mobile**. Bind the directory connection reference to the approved directory connection. Check the Dataverse connection reference too.
4. Check the directory flows and turn on any required flow that is off. Repair its connection first if needed. A user who cannot use a connection might not be able to enable its flow.
5. In the solution settings, check that **Worker administration website ID** identifies this worker site and **Worker directory automation enabled** is `true`.
6. In Chrona, select the Dataverse user used by the Power Automate connection. This selection does not change that connection's account.
7. Select **Check again**, then **Check connection**. Review the groups and filters, then run sync again. Read the new result before you assume updates have resumed.

Microsoft explains how to [manage and repair connections](https://learn.microsoft.com/en-us/power-automate/add-manage-connections) and [change a solution's connection reference](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference). The connection owner or your Power Platform administrator can make these changes; you do not need to enter a directory password in Chrona.

## Common questions

### What happens when a name or email address changes?

The next successful sync updates the existing worker. Chrona matches the directory identity by its stable ID, not by the person's name or email address. An email change does not create a second worker or automatically link a different sign-in account. If an address is already linked to another contact, review the conflict before retrying. Review invitations that were sent to the old address.

### Does importing a worker let them sign in?

Import creates or updates the worker records. To link eligible same-tenant work accounts after a complete sync, enable **Let imported people sign in with Microsoft Entra** and complete [Set up worker sign-in](#set-up-worker-sign-in). If this option is off, import does not create that account link. Use the site's configured invitation path when needed. Test the complete first sign-in with a small group before expanding the rollout.

### What happens when someone leaves?

A sync that reads a disabled account stops its Chrona access. After a complete sync, a person who has left all selected groups or no longer matches the saved filters loses access through that source. Leaving one selected group does not remove a person who still qualifies through another selected group. These are scheduled checks; they are not an instant directory-event connection. Use **Deactivate access** in People when you need to stop Chrona access directly.

If the account is enabled again and the person is eligible, a later complete sync can restore access that directory sync itself stopped. It does not undo a manual stop, expired access or an earlier stop whose reason is unknown. A manual stop made before or during a directory suspension remains in effect. A partial or failed read does not restore access. The worker keeps the same person and contact records across directory definitions and email changes.

### Can I use a second directory?

This setup uses the directory connection configured for the environment. Selecting another group does not connect another tenant. Ask your Power Platform administrator to review a second-directory requirement before adding another source.

### A worker cannot get into the app. What should I check?

Open the worker in **People**. Check their access status, directory account, email address, invitation and suggested next action together. Repair the failed step: resend an eligible invitation, review stopped access, or ask the identity administrator to restore sign-in. Reimporting the worker does not reset their password or repair the site's identity provider.

If a sync fails, open its details, correct the reported connection or profile issue, then retry. Keep the existing source so its identity links and history are retained.

# Call-out for open shifts

Chrona Workforce Scheduler offers an open shift to the people who can take it, one level after another, until someone accepts. Each scheduler sets it on its calendar row.

## How a call-out runs

- A published open shift that starts within the call-out horizon gets a call-out. The horizon is 3 days unless the scheduler sets another number of days. 0 switches call-out off.
- Chrona ranks the people who keep every Must rule. People who cost nothing are asked first. Then each goal, from the last goal in the scheduler's goal order up, adds a level. People who break the first goal are asked last.
- The levels open at even steps until the cut-off: 60 minutes before the shift starts unless the scheduler sets another number. A call-out that starts after the cut-off asks every level at once.
- Each person gets the offer in Chrona Workforce Mobile, by email with Accept and Decline links, and by text when the scheduler has texts on and the person has a mobile number.
- An accept is the same request as in the app: Chrona checks every Must rule again, and the Review open-shift requests setting decides between a manager's approval and the first person who accepts. When the shift has its person, the others read "This shift is filled".
- At the cut-off, a call-out that found nobody becomes No one took it, and the scheduler's planners get an alert.
- While a call-out runs or is paused, only the people with an offer see the shift under Open shifts. When it stops or finds nobody, everyone who can take the shift sees it again.

## Set up call-out

**Turn on call-out**

1. Complete the Workforce Mobile setup. In Power Automate, select your environment, then **Solutions > Chrona Workforce Scheduler > Connection references**. Check that `chr_workeradmin_dataverse` uses the Mobile administration application-user connection. Its application user needs the shipped **Chrona Workforce Admin** role.
2. Open **Cloud flows > Chrona Call-out timer** and select **Turn on**. This flow opens later levels and ends offers at the cut-off.
3. Turn on **Chrona Scheduled tasks** as the install guide describes. The hourly **Call-out start** task starts offers for published open shifts that enter their horizon. In **Configuration > Auto Task Log**, use **Run now** to check at once. Check the last run and its count. For failures, see [When scheduled tasks stop](https://chrona365.com/docs/workforce/auto-task-log#when-scheduled-tasks-stop); a Dataverse rollback can stop the whole call without a saved log row.
4. Set up the accept links below. Publish an open shift inside the scheduler's horizon. Check the timer's run history and the offer in the worker app before you rely on the flow.

The Admin role includes user-level Create, Read, Write and Delete on **Callback Registration**, as required by the [Dataverse row trigger](https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger). If Turn on reports a missing callback privilege, update the managed Workforce solution and check the application user's role. Do not grant System Administrator as a workaround. After the update, turn on the timer and check an actual run; an On status alone does not prove that the trigger works.

**Set up call-out texts**

Texts leave from your own Azure Communication Services (ACS) resource. An agent with the Chrona MCP server can prepare these steps. Azure charges and sender availability depend on your country and resource; approve purchases before the agent creates paid resources.

1. Use an existing ACS resource, or create one in your Azure subscription. Under **Phone numbers**, select a sender that supports SMS to your workers' countries. Number approval can take time. An alphanumeric sender sends one way and uses the accept link.
2. As a **Chrona Workforce Admin**, call `chr_SetCallOutTexts` with `ConnectionString` (from the ACS resource's **Keys** page), `Sender` (the phone number or sender ID) and `ResourceId` (the ACS resource ID). Pass the connection string securely at execution; do not paste it into chat, logs or a saved plan. The API returns only `Configured: true`.
3. Chrona stores the credential and sender in secured columns on the existing Chrona connection row. No customer Key Vault is needed. Do not grant users read access to these columns. Dataverse System Administrators retain their platform access. Run the API again with the new connection string when you rotate an ACS key.
4. For a number that supports replies, bind `chr_callout_eventgrid` to an Azure Event Grid connection whose user can create an event subscription on the ACS resource. Turn on **Chrona Call-out text replies**. Check that Event Grid lists a subscription for `Microsoft.Communication.SMSReceived`. The API sets the non-secret **Call-out texts resource** environment variable used by this flow. When you change the resource ID, turn this flow off before the API call, then turn it on again.
5. Turn on **Send texts** in the scheduler's **Call-out** settings. Publish an eligible open shift. Check receipt of its text; for two-way texts, reply YES and check the text-replies flow's run history and the shift's result. A successful setup response alone does not prove message delivery.

A worker replies YES to take the latest offer, or opens the link. STOP ends texts to that person.

**Accept links**

The email and text links open the worker mobile site without sign-in. The page shows the shift; the worker taps Accept shift or Decline. A link works once and stops at the shift start.

1. Turn on the Chrona Call-out answer page flow.
2. In Power Pages, open the worker mobile site, go to **Set up** > **Cloud flows** and register the flow. Allow the **Anonymous Users** web role.
3. The site must be public: a private site lets no one in without sign-in.

Check the answer-page flow’s run history after an actual answer. If any flow cannot start, open it in Power Automate and fix the connection or permission named in the error.

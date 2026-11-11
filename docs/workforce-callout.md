# Call-out for open shifts

Chrona Workforce Scheduler offers an open shift to the workers who can take it, one level after another, until someone accepts. Each scheduler sets it on its calendar row.

## How a call-out runs

- A published open shift that starts within the call-out horizon gets a call-out. The horizon is 3 days unless the scheduler sets another number of days. 0 switches call-out off.
- Chrona ranks the workers who keep every Must rule. Workers who cost nothing are asked first. Then each goal, from the last goal in the scheduler's goal order up, adds a level. Workers who break the first goal are asked last.
- The levels open at even steps until the cut-off: 60 minutes before the shift starts unless the scheduler sets another number. A call-out that starts after the cut-off asks every level at once.
- Each worker gets the offer in Chrona Workforce Mobile, by email with Accept and Decline links, and by text when the scheduler has texts on and the worker has a mobile number.
- An accept is the same request as in the app: Chrona checks every Must rule again, and the Review open-shift requests setting decides between an approval, by the worker's manager or a planner of the scheduler, and the first worker who accepts. When the shift has its worker, the others read "This shift is filled".
- At the cut-off, a call-out that found nobody becomes No one took it, and the scheduler's planners get an alert.
- While a call-out runs or is paused, only the workers with an offer see the shift under Open shifts. When it stops or finds nobody, everyone who can take the shift sees it again.

## Set up call-out

**Turn on call-out**

1. Complete the Workforce Mobile setup.
2. Turn on **Chrona Scheduled tasks** and **Chrona Call-out timer** as the install guide describes in step 7. Both flows use the connection reference **Chrona Scheduled tasks Dataverse**, so one connection serves both. The timer opens later levels and ends offers at the cut-off. It is the only call-out flow. The hourly **Call-out start** task starts offers for published open shifts that enter their horizon. In **Configuration > Auto Task Log**, use **Run now** to check at once. Check the last run and its count. For failures, see [When scheduled tasks stop](https://chrona365.com/docs/workforce/auto-task-log#when-scheduled-tasks-stop); a Dataverse rollback can stop the whole call without a saved log row.
3. Set up the accept links below. Publish an open shift inside the scheduler's horizon. Check the timer's run history and the offer in the worker app before you rely on the flow.

On the application-user route of install step 7, the application user has the role **Chrona Workforce Admin**. The role includes user-level Create, Read, Write and Delete on **Callback Registration**, as required by the [Dataverse row trigger](https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger). If Turn on reports a missing callback privilege, update the managed Workforce solution and check the role of the connection's user. Do not give the application user System Administrator as a workaround. After the update, turn on the timer and check an actual run; an On status alone does not prove that the trigger works.

**Set up call-out texts**

Texts leave from your own Twilio account. Each text carries only the offer link; the worker opens it and answers on the offer page. Workers do not answer by reply, because a reply to a text does not work reliably in every country. An agent with the Chrona MCP server can prepare these steps. Provider charges and sender availability depend on your country; approve purchases before the agent buys a number or registers a sender.

1. In the Twilio Console, select a sender that can send SMS to your workers' country: a phone number, a registered alphanumeric sender ID, or a Messaging Service with a sender. Some countries need a regulatory bundle or sender registration, which can take days. In Australia, alphanumeric sender IDs must be registered first.
2. Under **Account > API keys & tokens**, create an API key for this environment. Twilio shows its secret once. Chrona needs the API key only. Do not give it your account's Auth Token.
3. As a **Chrona Workforce Admin**, call `chr_SetCallOutTexts` with `ConnectionString` = `AccountSid=AC...;ApiKeySid=SK...;ApiKeySecret=...` and `Sender` (the phone number in international format, the `MG...` Messaging Service SID or the sender ID). The API takes these two values only and refuses anything else with a message that names the expected format. Pass the secret securely at execution; do not paste it into chat, logs or a saved plan. The API returns only `Configured: true`.
4. Turn on **Send texts** in the scheduler's **Call-out** settings. Publish an eligible open shift and check that its text arrives. A successful setup response alone does not prove message delivery.

Chrona stores the key and sender in secured columns on the existing Chrona connection row. No customer Key Vault is needed. Do not grant users read access to these columns. Dataverse System Administrators retain their platform access.

No reply flow and no public endpoint are needed. Chrona sends each text and reads nothing back from Twilio but whether the send call worked. Twilio's own STOP filtering stays on in your account: a worker who replies STOP to your Twilio sender gets no more texts from it until they text START to it, and Chrona reads neither reply. A worker can also turn **Text message** off under **More** > **Notification preferences** in Chrona Workforce Mobile. To rotate the key, create a new one, call the API with it, then delete the old key in Twilio.

**Accept links**

The email and text links open the worker mobile site without sign-in. The page shows the shift; the worker taps Accept shift or Decline. A link works once and stops at the shift start.

The page answers through the site's **chrona-offer-answer** server logic, which the site carries. It sends only the link's code and the answer to Chrona. It adds no table permission to the site.

1. In Power Pages, open the worker mobile site and go to **Set up** > **Server logic**. Check that **chrona-offer-answer** is there with the **Anonymous Users** and **Authenticated Users** web roles.
2. The site must be public: a private site lets no one in without sign-in.
3. Open a real offer link in a signed-out browser: the shift appears. Select **Accept shift** or **Decline**, then open the link again: it shows the answer you gave.

If the timer flow cannot start, open it in Power Automate and fix the connection or permission named in the error.

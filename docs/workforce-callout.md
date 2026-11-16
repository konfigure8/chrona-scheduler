# Set up call-out delivery

Set up the call-out timer, texts and offer links for Chrona Workforce Scheduler, then verify a real offer before relying on delivery.

## How a call-out runs

See [Candidates and call-out](https://chrona365.com/docs/workforce/call-out#how-a-call-out-runs) for when a call-out starts, who receives offers, ranking, approval and planner actions.

## Set up call-out

**Turn on call-out**

1. Complete the Workforce Mobile setup.
2. Check that **Chrona Scheduled tasks** and **Chrona Call-out timer** are on. Both flows use the connection reference **Chrona Scheduled tasks Dataverse**, so one connection serves both, and both are on after an import in which the admin picked that connection. If they are off, turn them on as the install guide describes in step 7. The timer opens later levels and ends offers at the cut-off. It is the only call-out flow. The hourly **Call-out start** task starts offers for shifts that lost their worker and enter their horizon while published open. In **Configuration > Auto Task Log**, use **Run now** to check at once. Check the last run and its count. For failures, see [When scheduled tasks stop](https://chrona365.com/docs/workforce/auto-task-log#when-scheduled-tasks-stop); a Dataverse rollback can stop the whole call without a saved log row.
3. Set up the accept links below. On a future assigned, published shift inside the scheduler's horizon, remove the worker and publish the shift open. Check the timer's run history and the offer for an eligible worker listed on that scheduler in the worker app before you rely on the flow. A shift that never had a worker does not start a call-out.

On the application-user route of install step 7, the application user has the role **Chrona Workforce Admin**. The role includes user-level Create, Read, Write and Delete on **Callback Registration**, as required by the [Dataverse row trigger](https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger). If Turn on reports a missing callback privilege, update the managed Workforce solution and check the role of the connection's user. Do not give the application user System Administrator as a workaround. After the update, turn on the timer and check an actual run; an On status alone does not prove that the trigger works.

**Set up call-out texts**

Texts leave from your own Twilio account. Each text carries only the offer link; the worker opens it and answers on the offer page. Workers do not answer by reply, because a reply to a text does not work reliably in every country. An agent with the Chrona MCP server can prepare these steps. Provider charges and sender availability depend on your country; approve purchases before the agent buys a number or registers a sender.

1. In the Twilio Console, select a sender that can send SMS to your workers' country: a phone number, a registered alphanumeric sender ID, or a Messaging Service with a sender. Some countries need a regulatory bundle or sender registration, which can take days. In Australia, alphanumeric sender IDs must be registered first.
2. Under **Account > API keys & tokens**, create an API key for this environment. Twilio shows its secret once. Chrona needs the API key only. Do not give it your account's Auth Token.
3. As a **Chrona Workforce Admin**, call `chr_SetCallOutTexts` with `ConnectionString` = `AccountSid=AC...;ApiKeySid=SK...;ApiKeySecret=...` and `Sender` (the phone number in international format, the `MG...` Messaging Service SID or the sender ID). The API takes these two values only and refuses anything else with a message that names the expected format. Pass the secret securely at execution; do not paste it into chat, logs or a saved plan. The API returns only `Configured: true`.
4. Turn on **Send texts** in the scheduler's [Call-out settings](https://chrona365.com/docs/workforce/scheduler-settings#call-out). Publish a shift that lost its worker open inside the scheduler's horizon, and check that an eligible worker listed on that scheduler receives the text. A successful setup response alone does not prove message delivery.

Chrona stores the key and sender in secured columns on the existing Chrona connection row. No customer Key Vault is needed. Do not grant users read access to these columns. Dataverse System Administrators retain their platform access.

No reply flow and no public endpoint are needed. Chrona sends each text and reads nothing back from Twilio but whether the send call worked. Twilio's own STOP filtering stays on in your account: a worker who replies STOP to your Twilio sender gets no more texts from it until they text START to it, and Chrona reads neither reply. A worker can also turn **Text message** off under **More** > **Notification preferences** in Chrona Workforce Mobile. To rotate the key, create a new one, call the API with it, then delete the old key in Twilio.

**Accept links**

The email and text links open the worker mobile site without sign-in. The page shows the shift; the worker taps Accept shift or Decline. A link works once and stops at the shift start.

The page answers through the site's **chrona-offer-answer** server logic, which the site carries. It sends only the link's code and the answer to Chrona. It adds no table permission to the site.

1. In Power Pages, open the worker mobile site and go to **Set up** > **Server logic**. Check that **chrona-offer-answer** is there with the **Anonymous Users** and **Authenticated Users** web roles.
2. The site must be public: a private site lets no one in without sign-in.
3. Open a real offer link in a signed-out browser: the shift appears. Select **Accept shift** or **Decline**, then open the link again: it shows the answer you gave.

If the timer flow cannot start, open it in Power Automate and fix the connection or permission named in the error.

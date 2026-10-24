# Findings

Defects and risks found while testing Twenty and its environment. Each finding is a GitHub issue labelled [`finding`](https://github.com/Nikolay-Chillev/twenty-qa/issues?q=label%3Afinding) with steps to reproduce; this page is the summary. Findings record the Twenty version they were seen on.

**Source** separates what Twenty itself does (*product*) from how this environment is set up (*environment*).

| # | Finding | Severity | Source | Status |
|---|---|---|---|---|
| [#17](https://github.com/Nikolay-Chillev/twenty-qa/issues/17) | A request without a token gets 403, an invalid token 401 | Minor | Product | Open, covered by the API smoke tests |
| [#30](https://github.com/Nikolay-Chillev/twenty-qa/issues/30) | An amount with a currency code that does not exist is saved, and the app hides it | Major | Product | Open, reported upstream as [twentyhq/twenty#28761](https://github.com/twentyhq/twenty/issues/28761); covered by an expected failure |
| [#31](https://github.com/Nikolay-Chillev/twenty-qa/issues/31) | Database errors reach API clients with table, constraint and index names | Minor | Product | Open, covered by expected failures |
| [#32](https://github.com/Nikolay-Chillev/twenty-qa/issues/32) | Phone numbers of any length are saved, and letters after the digits are cut off | Minor | Product | Open, reported upstream as [twentyhq/twenty#28764](https://github.com/twentyhq/twenty/issues/28764); covered by expected failures |
| [#34](https://github.com/Nikolay-Chillev/twenty-qa/issues/34) | Deleting by filter over REST has no limit and is permanent by default | Major | Product | Open, reported upstream as [twentyhq/twenty#28762](https://github.com/twentyhq/twenty/issues/28762); covered by an expected failure |
| [#54](https://github.com/Nikolay-Chillev/twenty-qa/issues/54) | A removed invitation still lets the person join while the invite link is on | Major | Product | Open, a risk rather than a plain defect (see the details); covered by an expected failure |

## Details

### #17 A request without a token gets 403, an invalid token 401

Seen on 2.48.0 and again on 2.50.0. `GET /rest/companies` without an `Authorization` header answers `403 FORBIDDEN_EXCEPTION "Missing authentication token"`; the same request with `Bearer not-a-token` answers `401 UNAUTHENTICATED "Token invalid."`. Both requests lack valid credentials, so both should be 401; 403 is for a caller who is known but not allowed. A client that asks for credentials or refreshes its token on 401 does nothing when the token is missing. The smoke tests check both statuses as they are today.

### #30 An amount with a currency code that does not exist is saved, and the app hides it

Seen on 2.48.0 and again on 2.50.0. Creating an opportunity with `amount: {amountMicros: 12500000000, currencyCode: "XYZ"}` answers 201 over REST and GraphQL, and the code is stored as sent. The record page then shows the Amount field empty, as if the deal had no value, while the same deal in EUR shows "12.5k". The API refuses other values that are not on a list, such as a stage ("Valid values are: NEW, SCREENING, …"), so a currency code outside ISO 4217 should be refused too; as it is, an integration or an import with a typo in the currency loses the deal's value in the app. Reported upstream as [twentyhq/twenty#28761](https://github.com/twentyhq/twenty/issues/28761).

| Currency `XYZ` | Currency `EUR` |
|---|---|
| ![The deal in XYZ: its Amount field looks empty](images/finding-30-xyz.png) | ![The same deal in EUR shows € 12.5k](images/finding-30-eur.png) |

### #31 Database errors reach API clients with table, constraint and index names

Seen on 2.48.0 and again on 2.50.0. A person linked to a company that does not exist gets `400 ["insert or update on table \"person\" violates foreign key constraint \"FK_ee066ddacfce46c9a7cb90edd1a\""]`; a second person with the same email gets `400 ["A duplicate entry was detected: unique constraint person.IDX_UNIQUE_87914cd3ce963115f8cb943e2ac was violated"]`. GraphQL returns the same text as `message` next to a friendly `userFriendlyMessage`; REST has only the raw text. The refusals are right, but they expose the database schema and do not name the field at fault.

### #32 Phone numbers of any length are saved, and letters after the digits are cut off

Seen on 2.48.0 and again on 2.50.0. A phone number is refused only when it has no digit at all (`abc`, `телефон`). With the Bulgarian calling code, `12` and `888` are saved, `08812345678901234` is saved with 16 digits (E.164 allows 15), and `088-ABC` is saved as `088` with the rest dropped and no warning. `+359 88 123 4567` is parsed correctly into `881234567`. Reported upstream as [twentyhq/twenty#28764](https://github.com/twentyhq/twenty/issues/28764).

### #34 Deleting by filter over REST has no limit and is permanent by default

Seen on 2.48.0 and again on 2.50.0. Updating companies by filter (`PATCH /rest/companies?filter=…`) refuses more than 200 matches ("Cannot update more than 200 records at once"), and a batch create refuses more than 200 records. Deleting by filter has no such limit: a filter that matched 311 companies deleted all of them in one request. REST deletes are also permanent unless `soft_delete=true` is sent; the OpenAPI document says so, but the app and GraphQL's `deleteCompany` move records to the trash, so the same word does two different things. The records deleted that way are not in the trash and cannot be restored. This suite's REST client sends `soft_delete=true` for a delete and leaves permanent deletes to `destroy()`. Reported upstream as [twentyhq/twenty#28762](https://github.com/twentyhq/twenty/issues/28762), with steps that delete 300 companies in one request.

### #54 A removed invitation still lets the person join while the invite link is on

Seen on 2.50.1. Every invitation email links to `…/invite/<workspace invite hash>?inviteToken=…&email=…`.

What happens with "Invite by link" left on, as a new workspace has it:
- An admin removes the invitation, and it leaves the list of pending ones.
- The person can still open the link, sign up and become a Member.
- The same link lets anyone else join too, since the hash alone is the workspace's public invite link.

With "Invite by link" turned off:
- The removed invitation is refused ("Public invite link is disabled for this workspace").
- A valid invitation still works.

So removing an invitation only takes effect once the public link is turned off as well, and nothing on the members page says so. An admin who removes an invitation sent to the wrong person, or to someone who has left, leaves the door open.

**Twenty's view of the public link.** Twenty's team puts convenience first for the public invite link.
- In [twentyhq/twenty#22857](https://github.com/twentyhq/twenty/issues/22857) a maintainer called invite links inherently not very secure, and advised turning the link off when that matters.
- The link is one permanent hash per workspace ([twentyhq/twenty#26658](https://github.com/twentyhq/twenty/issues/26658)).

Seen that way, the behaviour is intended. What this finding adds:
- "Remove invitation" gives no sign that it revokes nothing while the link is on.
- A personal invitation email hands out the public link.

So it stays here as a risk. If it is reported, it would be as a suggestion for the members page (for example a warning next to "Remove invitation"), not as a defect.

## To investigate

- **The sign-in and invitation pages sometimes stay on a loader.** It happened twice in about 150 loads on 2.50.1, once in Chromium and once in Firefox, and could not be reproduced on demand.
  - The page showed its title ("Welcome, QA Workspace.", "Join QA Workspace team") and a small empty placeholder where the form goes, for 30 seconds.
  - Every request had already been answered, and the console showed no error.
  - A similar hang on the invitation page was reported in [twentyhq/twenty#24254](https://github.com/twentyhq/twenty/issues/24254) and fixed for one case: right after signing out, in the same browser. Here it happened in fresh browsers.
  - To be watched in the nightly runs.
- **After a sort, the page keeps the old reading order.** Since 2.50 a sort moves the table's rows on screen, but not in the page, until the view is saved or the page is reloaded. A screen reader follows the page, so it may read a sorted table in its old order (WCAG 1.3.2, meaningful sequence). To be checked with a screen reader and the accessibility scans (Quality milestone); see the item on #52 below.

- **Permission errors are 400, not 403.** An API key whose role may only read gets `400 PERMISSION_DENIED "Entity performing the request does not have permission"` when it updates a company or reads a revoked object. To be confirmed in the permission tests (Access milestone) before it becomes a finding.
- **The record table has no table semantics.** Rows and cells are plain elements without `table`, `row` or `cell` roles, and column headers are buttons, so a screen reader cannot tell which column a value belongs to. To be checked with the accessibility scans (Quality milestone).
- **Negative deal amounts.** An opportunity of −5 EUR is accepted over REST. A credit or a refund could be a reason, but nothing in the app suggests deals are meant to be negative; to be checked with how the pipeline sums amounts.
- **A new view goes first for everyone.** A view saved with "Save as new view" gets position 0, comes before "All Companies" in every member's list of views, and is what `/objects/companies` opens without a view id, for example in a new browser. The sidebar link keeps each browser's last view, so members who opened the table before are not affected. To be checked whether that order is intended.
- **Deleting a shared view takes one click.** "Delete" in a view's menu removes the view for the whole workspace at once, without a confirmation and without a trash to restore it from. Whether a member may delete a view someone else saved is to be checked in the permission tests (Access milestone).
- **The schema and the server disagree on the workspace name.** `SignUpInNewWorkspaceInput.displayName` is optional in the GraphQL schema, but `signUpInNewWorkspace` without it fails with "Workspace name is required". Minor: the app always sends a name.

## Checked, not a finding

- **The sign-in form tells whether an address has an account.**
  - An unknown address is offered to sign up instead of sign in, and a wrong password gets "Wrong password.".
  - Twenty chose clear feedback over generic messages, with rate limits as the protection ([twentyhq/twenty#3564](https://github.com/twentyhq/twenty/issues/3564)). Throttling sign-in is a feature request for now, and a captcha can be turned on instead ([twentyhq/twenty#26524](https://github.com/twentyhq/twenty/issues/26524)).
  - "Forgot your password?" gives the same answer for any address.
- **Signing up at a workspace's address needs an invitation.** Someone without one gets "User does not have access to this workspace" and is not let in.
- **A used password reset link.** It sends the user back to sign in, with a vague "You do not have permission to perform this action." rather than a word about the link.
- **One rate limit for all API keys of a workspace.** A new API key gets 429 as soon as another key of the same workspace has used up the 100 requests per minute, and the message says "Rate limit exceeded for apiKey". This is by design: the default limit is one pool per workspace, as a comment in Twenty's source explains, and other workspaces are not affected.
- **A session cookie from API sign-in.** `signIn` over GraphQL also sets the web app's `twenty-session` cookie, and later cookie-authenticated calls without a matching `Origin` header are refused with `CSRF_ORIGIN_MISMATCH`. That is the expected CSRF protection; the suite authenticates with tokens and drops the cookie.
- **Records without a name.** A company or an opportunity created without a name is saved with an empty one, the way the app creates an untitled record before the user types; covered by a test.
- **Page size.** `limit` above 200 returns 200 records without an error, as the OpenAPI document gives 200 as the maximum; a negative limit is refused.
- **Trash and links.** A person keeps their link to a company while the company is in the trash and after it is restored; destroying the company keeps the person and clears the link.
- **Sample data in every new workspace.** A new workspace comes with companies and people such as Airbnb and Stripe. Intended as a demo; tests do not rely on it.
- **Empty names on the user.** After onboarding through the API, `currentUser.firstName` is empty while the workspace member has the name. The app shows the member's name, which is where Twenty keeps it per workspace.
- **Tenant isolation.** An API key of one workspace gets 404 for another workspace's records on read, update and delete, and a browser session is bound to its workspace's subdomain ([ADR 0001](adr/0001-run-twenty-with-multiple-workspaces.md)). To be covered by tests in the Access milestone.
- **`/healthz` answers OK while the database is down** (logged as [#12](https://github.com/Nikolay-Chillev/twenty-qa/issues/12) and reported as [twentyhq/twenty#28763](https://github.com/twentyhq/twenty/issues/28763)).
  - Seen on 2.48.0 and 2.50.0: with the database stopped, the endpoint answers `200 {"status":"ok"}`, and on a fresh start it turns green before the API can serve requests.
  - Twenty's team explained it is a liveness check by design: it says whether the server process is up. A check tied to Postgres would restart every server at once during a short database outage and slow the recovery. The health of the database, Redis and the worker is shown in the admin panel.
  - A test run still has to know when the API can serve requests, so this environment checks readiness with a GraphQL query that needs the database ([ADR 0005](adr/0005-adjust-the-environment-for-automated-runs.md)).
- **A sort that seemed not to reorder the table** (logged as [#52](https://github.com/Nikolay-Chillev/twenty-qa/issues/52)).
  - On 2.50 the sorting test failed: the rows stayed in their old order after Sort → Name, in all three browsers, and the same steps passed on 2.49.
  - On screen the table was sorted. Since 2.50 a sort moves the rows on screen without moving them in the page, and the test read the page's order.
  - The test now reads the rows top to bottom as they appear on screen. What this means for screen readers is under "To investigate".

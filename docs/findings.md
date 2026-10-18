# Findings

Defects and risks found while testing Twenty and its environment. Each finding is a GitHub issue labelled [`finding`](https://github.com/Nikolay-Chillev/twenty-qa/issues?q=label%3Afinding) with steps to reproduce; this page is the summary. Findings record the Twenty version they were seen on.

**Source** separates what Twenty itself does (*product*) from how this environment is set up (*environment*).

| # | Finding | Severity | Source | Status |
|---|---|---|---|---|
| [#12](https://github.com/Nikolay-Chillev/twenty-qa/issues/12) | `/healthz` reports OK while the database is down | Minor | Product | Open; related upstream reports [twentyhq/twenty#24432](https://github.com/twentyhq/twenty/issues/24432) and [#26895](https://github.com/twentyhq/twenty/issues/26895) are closed. Worked around by the server health check |
| [#17](https://github.com/Nikolay-Chillev/twenty-qa/issues/17) | A request without a token gets 403, an invalid token 401 | Minor | Product | Open, covered by the API smoke tests |

## Details

### #12 `/healthz` reports OK while the database is down

Seen on 2.48.0. With the database container stopped, `GET /healthz` still answers `200 {"status":"ok","info":{},"error":{},"details":{}}` while every API call fails with 500; on a fresh start it turns green before the API can serve requests. Twenty's own compose file uses `/healthz` as the server's health check and makes the worker wait for it, so an orchestrator sees a healthy server that cannot serve anything. Two upstream issues describe related symptoms (green during first-boot migrations, green while the server hangs); both are closed, but the endpoint still checks nothing in 2.48. This environment checks readiness with a GraphQL query that needs the database ([ADR 0005](adr/0005-adjust-the-environment-for-automated-runs.md)).

### #17 A request without a token gets 403, an invalid token 401

Seen on 2.48.0. `GET /rest/companies` without an `Authorization` header answers `403 FORBIDDEN_EXCEPTION "Missing authentication token"`; the same request with `Bearer not-a-token` answers `401 UNAUTHENTICATED "Token invalid."`. Both requests lack valid credentials, so both should be 401; 403 is for a caller who is known but not allowed. A client that asks for credentials or refreshes its token on 401 does nothing when the token is missing. The smoke tests check both statuses as they are today.

## To investigate

- **Permission errors are 400, not 403.** An API key whose role may only read gets `400 PERMISSION_DENIED "Entity performing the request does not have permission"` when it updates a company or reads a revoked object. To be confirmed in the permission tests (Access milestone) before it becomes a finding.
- **The schema and the server disagree on the workspace name.** `SignUpInNewWorkspaceInput.displayName` is optional in the GraphQL schema, but `signUpInNewWorkspace` without it fails with "Workspace name is required". Minor: the app always sends a name.

## Checked, not a finding

- **One rate limit for all API keys of a workspace.** A new API key gets 429 as soon as another key of the same workspace has used up the 100 requests per minute, and the message says "Rate limit exceeded for apiKey". This is by design: the default limit is one pool per workspace, as a comment in Twenty's source explains, and other workspaces are not affected.
- **A session cookie from API sign-in.** `signIn` over GraphQL also sets the web app's `twenty-session` cookie, and later cookie-authenticated calls without a matching `Origin` header are refused with `CSRF_ORIGIN_MISMATCH`. That is the expected CSRF protection; the suite authenticates with tokens and drops the cookie.
- **Sample data in every new workspace.** A new workspace comes with companies and people such as Airbnb and Stripe. Intended as a demo; tests do not rely on it.
- **Empty names on the user.** After onboarding through the API, `currentUser.firstName` is empty while the workspace member has the name. The app shows the member's name, which is where Twenty keeps it per workspace.
- **Tenant isolation.** An API key of one workspace gets 404 for another workspace's records on read, update and delete, and a browser session is bound to its workspace's subdomain ([ADR 0001](adr/0001-run-twenty-with-multiple-workspaces.md)). To be covered by tests in the Access milestone.

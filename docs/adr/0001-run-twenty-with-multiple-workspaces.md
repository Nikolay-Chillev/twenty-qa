# 0001. Run Twenty with multiple workspaces, each on its own subdomain

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Twenty is a multi-tenant CRM: on its cloud every customer gets a workspace on its own subdomain, and the most damaging bug such a product can have is one tenant seeing another tenant's data. The default self-hosted setup runs a single workspace on `localhost:3000`, which leaves nothing to test isolation against.

Two questions were checked on Twenty 2.48.0 before designing the UI and permission tests around them (#7):

**Can a second workspace be created and reached?** With `IS_MULTIWORKSPACE_ENABLED=true` and `IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS=false`:

- A workspace can be created through the API with a chosen subdomain (`qa` works; `app` is reserved for the landing page and refused as "Subdomain is not valid").
- Access tokens are issued only for the workspace's own address: `getAuthTokensFromLoginToken` refuses `http://localhost:3000` as the origin ("Workspace not found") and accepts `http://qa.localhost:3000`.
- The REST and GraphQL APIs answer on any host; the token decides the workspace.
- An API key of workspace B gets 404 when it reads, updates or deletes a company of workspace A by id, finds nothing with a filter on its name, and GraphQL returns `null` with "Record not found".
- Emails link to the workspace's address, e.g. `http://qa.localhost:3000/reset-password/…`.

**Do Firefox and WebKit work?** A previous project had WebKit refuse cookies for `localhost`. Here Chromium, Firefox and WebKit all sign in through the UI, keep the session across a reload and a navigation, and reuse the state saved by the setup project, both on `localhost:3000` and on workspace subdomains. The session cookie (`twenty-session`, HttpOnly) is bound to the workspace's host: a browser signed in to workspace A sees the sign-in page on workspace B's address. `*.localhost` resolves to the loopback address in all three browsers and in Node.

## Decision

Run the test environment in multi-workspace mode, as Twenty's cloud does:

- The suite's workspace is `QA Workspace` on `http://qa.localhost:3000`; the setup project creates it with that subdomain.
- API calls go to the server URL (`TWENTY_URL`, `http://localhost:3000`); UI projects open the workspace URL.
- Anyone may create a workspace, so tests can set up a second tenant when they need one.
- UI tests run in Chromium on every pull request, and in Firefox and WebKit as well in the nightly run.

## Consequences

- Tenant isolation can be tested through the API and in the browser against a real second workspace (Access milestone).
- Sign-in and token exchange must use the workspace's address; the bootstrap code does, and picks the suite's workspace when a user belongs to several.
- Open workspace creation is a deviation from Twenty's self-hosted default, listed in the README.
- If a CI runner cannot resolve `*.localhost`, an `/etc/hosts` entry for `qa.localhost` is the fallback.

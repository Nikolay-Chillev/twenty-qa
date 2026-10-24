# Test strategy

How this project decides what to test, at which level, and when a change is good enough to merge.

## System under test

[Twenty](https://github.com/twentyhq/twenty) 2.48, an open-source CRM, running in Docker with several workspaces, each on its own subdomain, as on Twenty's cloud ([ADR 0001](adr/0001-run-twenty-with-multiple-workspaces.md)). The scenarios follow a sales team using a B2B SaaS product: companies, people and opportunities, a team with different roles, and an administrator who manages access and the data model.

**In scope**
- Records (companies, people, opportunities, tasks, notes) through the REST and GraphQL APIs and the UI
- Accounts and access: sign-in, password reset, invitations, roles, permissions per object and field, API keys
- Isolation between workspaces (tenants)
- The UI where the risk is in the browser: the data grid, views with filters and sorts, the kanban board, the record page, search, the text editor, CSV import
- The data model: custom objects and fields
- Webhooks and real-time updates between users
- Transactional emails (password reset, invitations)
- Accessibility of key pages, visual regressions of key screens, basic performance

**Out of scope**
- Enterprise features: SSO, custom domains, row-level permissions, record sharing, audit logs, validation rules
- Billing, and features that need a paid model provider (AI agents and chat)
- Email and calendar sync with Google or Microsoft accounts
- Twenty's own unit and integration tests
- Load testing: one container on a CI runner says nothing about production capacity

## Risks and priorities

Each risk gets a priority from its business impact. Priority decides the order of work and the depth of coverage.

| Risk | Impact if it happens | Priority | Covered by |
|---|---|---|---|
| One workspace reads or changes another workspace's data | Data breach across customers, the worst failure for a SaaS product | **P1** | Checked by hand in [ADR 0001](adr/0001-run-twenty-with-multiple-workspaces.md) · API and UI tests planned (Access) |
| Roles and permissions are not enforced | Users see or change data they should not; admins lose control of the workspace | **P1** | Planned (Access) |
| Records are lost or saved wrongly (create, update, delete, restore) | Lost customer data and sales history | **P1** | API: create, read, update and delete companies, people and opportunities over REST and GraphQL; relations; validation; Cyrillic, markup and long values ✅ ([#30](https://github.com/Nikolay-Chillev/twenty-qa/issues/30), [#31](https://github.com/Nikolay-Chillev/twenty-qa/issues/31), [#32](https://github.com/Nikolay-Chillev/twenty-qa/issues/32) open) · filters, sorting with Cyrillic, cursor paging, bulk create, update and delete, trash, restore and permanent delete ✅ ([#34](https://github.com/Nikolay-Chillev/twenty-qa/issues/34) open) |
| A user cannot get in: sign-in, password reset, invitations | Team cannot work; support load | **P1** | Every role signs in in the setup project ✅ · email: password reset link ✅ · more planned (Access) |
| API contracts change under integrations | Integrations and automations break silently | **P2** | Zod contracts for companies, people and opportunities, checked on every REST and GraphQL response ✅ |
| The data grid, kanban or record page misbehave | Users cannot manage their pipeline | **P2** | UI in three browsers: records from the API show in the table, a cell edited in the table reaches the API, a record added with Create is saved, a record opens in the side panel, a person's page links to their company, the sidebar opens each object ✅ · views: a Cyrillic filter and a sort show what the API returns, a saved view keeps its filter and sort after a reload and is listed for the member, a view's filter is changed, a view is renamed and deleted ✅ · kanban planned (Workspace) |
| Import of contacts corrupts or drops data | Bad data from the first day | **P2** | Planned (Workspace) |
| Changes to the data model break records, the API or the UI | Admin changes take the workspace down | **P2** | Planned (Workspace) |
| Webhooks miss events or send data to the wrong place | Integrations go out of sync or leak data | **P2** | Planned (Workspace) |
| A new Twenty version breaks what worked | Regressions reach users of a fast-moving product | **P2** | Pinned image, weekly bumps proven by CI · canary run on the latest version planned ([ADR 0004](adr/0004-pin-twenty-and-watch-new-versions.md)) |
| Updates by one user do not reach another in real time | Users work on stale data | **P3** | Planned (Workspace) |
| Accessibility barriers | Excluded users; non-compliance with the European Accessibility Act | **P3** | Planned (Quality) |
| Visual regressions in key screens | A broken layout reaches users | **P3** | Planned (Quality) |
| Slow pages or API | Lower productivity | **P3** | Planned (Quality) |

## Test levels

```
            UI journeys (Playwright)          few, slow, only what needs a browser
        Email checks (Mailpit)                each journey that sends mail
    API tests (REST + GraphQL)                most rules: records, access, isolation
 Smoke tests                                  "is the environment usable?"
Unit tests of the framework                   fast, no environment
```

- **Unit**: the framework's own logic (settings, addresses, mail queries). No environment, run in milliseconds.
- **Setup**: the workspace, a user per role and an API key, created through Twenty's API before anything else; it fails first when the environment is broken.
- **Smoke**: REST and GraphQL answer with a valid key and refuse requests without one; a password reset email arrives.
- **API**: the bulk of the business rules. Fast, stable and precise about what failed.
- **Email**: the emails Twenty sends, read from Mailpit by a unique recipient.
- **UI**: only what needs a browser. Preconditions come from the API, and every role opens the app already signed in.
- **Non-functional**: accessibility scans with a baseline, screenshot comparisons, a performance smoke test that watches for regressions, not absolute numbers.

## Design principles

1. **Set up through the API, verify through the interface under test.** A UI test never clicks through steps it does not verify.
2. **Every test owns its data.** Records with unique names, unique email addresses, so tests run in any order and in parallel. Changes to the data model run serially.
3. **No fixed waits.** No `waitForTimeout`, `networkidle` or `force`; web-first assertions and polling with a timeout.
4. **Responses are contracts.** Every API response is checked against a Zod schema, so a changed shape fails clearly.
5. **Fixtures, not inheritance.** Clients, users and mailboxes come from Playwright fixtures; no wrappers around Playwright's own API.
6. **Failures explain themselves.** Traces, screenshots and videos are kept on failure, and all HTTP traffic goes through Playwright's request context, so it is in the trace.
7. **Types are checked.** Playwright strips TypeScript types without checking them, so CI runs `tsc` and type-aware lint rules, including one against a missing `await`.

## Test data

- The setup project creates `QA Workspace`, an admin and a member, and an API key with the Admin role, the way the app does it ([README](../README.md#test-data)). Twenty has no seed command in production mode.
- A new workspace comes with sample companies and people; tests may read them but never rely on them.
- Names and addresses are Bulgarian, in Cyrillic, to exercise encoding, search and sorting beyond ASCII.
- No real personal data; every email goes to `example.com` and is caught by Mailpit.

## Environments

One environment definition for local runs and CI: Twenty's server and worker, Postgres, Redis and Mailpit in Docker Compose, every image pinned by digest ([ADR 0002](adr/0002-test-twenty-in-docker-pinned-by-digest.md)). A few settings deviate from Twenty's defaults so a test suite can run against it ([ADR 0005](adr/0005-adjust-the-environment-for-automated-runs.md)); they are listed in the [README](../README.md#test-environment).

Known limitations:
- `/healthz` reports OK while the database is down ([#12](https://github.com/Nikolay-Chillev/twenty-qa/issues/12)), so readiness is checked with a real API call.
- Raised rate limits and throttles mean their defaults are not exercised by ordinary tests; a test that needs a limit sets one on its own workspace.

## Execution

| When | What runs | Where |
|---|---|---|
| Every pull request and push to `main` | Lint, type and format checks, then unit, setup, API and UI tests in Chromium against a fresh environment, summed up in the `CI passed` check (tests are skipped for documentation-only changes) | GitHub Actions |
| Nightly (planned, #20) | Everything, the UI in Chromium, Firefox and WebKit | GitHub Actions |
| On the latest Twenty (planned) | API and UI smoke tests against the newest image, not blocking | GitHub Actions |
| Locally | `./scripts/start.sh`, then `npm test` | Developer machine |

## Merge and release criteria

Every change reaches `main` through a pull request whose `CI passed` check is green; a branch ruleset will enforce it once the repository is public.

A pull request is merged when:
- CI is green: lint, types and all tests
- new tests are independent and have no fixed waits
- documentation is updated where behaviour or setup changed

In CI a failed test is retried once so the report can tell a flaky test from a broken one, but a flaky test still fails the run.

v1.0 is released when the P1 and P2 risks above have API coverage, P1 journeys have UI coverage, the nightly run covers three browsers, and ten consecutive nightly runs pass.

## Reporting

- **[Allure report](https://nikolay-chillev.github.io/twenty-qa/)** published after every run on `main`, with trends across runs; every CI run also keeps the Playwright HTML report and the raw Allure results for 14 days
- **Findings** in Twenty or the environment: GitHub issues labelled `finding`, summarised in [findings.md](findings.md)
- **Decisions**: [architecture decision records](adr/)

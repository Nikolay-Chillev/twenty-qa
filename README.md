# Twenty QA

[![CI](https://github.com/Nikolay-Chillev/twenty-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/Nikolay-Chillev/twenty-qa/actions/workflows/ci.yml)
[![Allure report](https://img.shields.io/badge/Allure-report-orange)](https://nikolay-chillev.github.io/twenty-qa/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Test automation for [Twenty](https://github.com/twentyhq/twenty), an open-source CRM, written in TypeScript with Playwright. The suite covers what a QA team at a B2B SaaS company would care about: the REST and GraphQL APIs and their contracts, roles and permissions, the data grid, kanban and editor in the UI, transactional emails, accessibility and performance. Everything runs against a disposable Docker environment and in CI.

> Work in progress. The plan is tracked in the [milestones](https://github.com/Nikolay-Chillev/twenty-qa/milestones).

## Environment

| Service | Image | URL |
|---|---|---|
| Twenty 2.48.0 (server and worker) | [twentycrm/twenty](https://hub.docker.com/r/twentycrm/twenty) | API: http://localhost:3000<br>Test workspace: http://qa.localhost:3000 |
| Postgres 16 and Redis 8 | official images | internal only |
| Mailpit (catches all outgoing email) | [axllent/mailpit](https://github.com/axllent/mailpit) | http://localhost:8026 |

All images are pinned by digest, so a run always tests the same build.

### Test environment

The environment differs from a default Twenty installation in a few places, all set in [`docker-compose.yml`](docker-compose.yml) ([ADR 0005](docs/adr/0005-adjust-the-environment-for-automated-runs.md)):

| Setting | Twenty default | Here | Why |
|---|---|---|---|
| `EMAIL_DRIVER` and SMTP | emails are only logged | sent to Mailpit | Tests open password reset and invitation emails |
| `API_RATE_LIMITING_LONG_LIMIT` | 100 requests per minute, shared by all API keys of a workspace | 100,000 | The suite seeds its data through the API of one workspace |
| `API_RATE_LIMITING_SHORT_LIMIT` | 100 requests per second | 1,000 | Same |
| `INVITATION_SENDING_BY_EMAIL_THROTTLE_LIMIT` | 10 invitations per address per week | 1,000 | Invitation tests resend to the same addresses |
| `INVITATION_SENDING_BY_WORKSPACE_THROTTLE_LIMIT` | 500 invitations per workspace per week | 100,000 | Every run invites users |
| `EMAIL_SEND_WORKSPACE_DAILY_LIMIT` | 1,000 emails per workspace per day | 100,000 | A local environment is reused across many runs |
| `IS_MULTIWORKSPACE_ENABLED` | one workspace on `localhost` | several, each on its own subdomain | As on Twenty's cloud; needed to test tenant isolation ([ADR 0001](docs/adr/0001-run-twenty-with-multiple-workspaces.md)) |
| `IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS` | only server admins create workspaces | anyone may | Tests create a second workspace when they need one |

Other limits (email send rate, webhook calls, workflow runs) keep their defaults.

**Readiness.** `/healthz` reports OK before the API can serve requests, and keeps doing so with the database down, so the server's health check asks the GraphQL API a question that needs the database. The worker sends emails and calls webhooks; it counts as ready once its email queue consumer is connected to Redis. `scripts/start.sh` returns only when both are healthy.

## Getting started

Requirements: Docker with Compose v2.

```bash
./scripts/start.sh
```

The first start runs the database migrations and takes about 90 seconds. Stop the environment with `docker compose down`, or add `-v` to also drop its data.

## Running the tests

Requirements: Node.js 24 and the environment above.

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit
npm test
```

| Command | What it does |
|---|---|
| `npm test` | Runs all Playwright projects: unit, setup, API and the UI in Chromium, Firefox and WebKit |
| `npm test -- --project=api --project=chromium` | Only some projects; the setup project runs first whenever a project needs it |
| `npm run report` | Builds the Allure report from `allure-results` and opens it; local results add up across runs until the folder is deleted |
| `npm run lint` | ESLint with type-aware rules, including Playwright's |
| `npm run typecheck` | `tsc`; Playwright strips types without checking them |
| `npm run format:check` | Prettier |

Staged files are linted and formatted before each commit (husky and lint-staged).

Settings come from environment variables and are validated on start: `TWENTY_URL` (default `http://localhost:3000`), `MAILPIT_URL` (default `http://localhost:8026`) and `TWENTY_PASSWORD`. Variables in `.env` are read too; the process environment wins.

### Test data

Twenty has no seed command in production mode, so the `setup` project creates everything through the API, the way the app does, before any other test runs:

| What | Value |
|---|---|
| Workspace | `QA Workspace` on `http://qa.localhost:3000`, activated |
| Admin (owns the workspace) | `admin@example.com`, Мария Иванова |
| Member (joined through the invite link) | `member@example.com`, Георги Петров |
| Password of both | `TWENTY_PASSWORD`, generated into `.env` by `scripts/start.sh` |
| API key with the Admin role | saved with the workspace id in `playwright/.auth/workspace.json` |

Both users are taken through onboarding and signed in once in the browser; their state is saved in `playwright/.auth/`, so UI tests open the app already signed in (as the admin, unless a test picks another role). Runs against an existing environment reuse the users, the workspace and a working API key.

### Writing tests

Tests import `test` and `expect` from [`src/fixtures`](src/fixtures/index.ts), which adds:

| Fixture | What it gives a test |
|---|---|
| `api` | REST clients for companies, people and opportunities with the suite's API key: CRUD, trash and restore, lists with filters and paging, bulk operations; every response is checked against a Zod schema in [`src/schemas`](src/schemas/records.ts) |
| `gql` | The same records through GraphQL; each query asks for exactly the fields its schema checks |
| `anonymous` | The REST API without credentials |
| `mailbox` | A unique email address and `waitForEmail()`, read from Mailpit |
| `adminToken`, `password` | For `/metadata` calls an API key cannot make, such as invitations |

Test data comes from the factories in [`src/data/factories.ts`](src/data/factories.ts): Bulgarian people and companies in Cyrillic, unique per test. A bug found in Twenty is covered by a test marked `test.fail` with a link to its finding, so the suite stays green while the bug exists and reports an unexpected pass once it is fixed.

GraphQL calls go through [`graphql()`](src/api/graphql.ts), which fails on GraphQL errors even when the HTTP status is 200. All HTTP traffic, Mailpit included, goes through Playwright's request context, so it shows up in traces.

## Continuous integration

Every pull request and every push to `main` runs [`ci.yml`](.github/workflows/ci.yml):

1. Lint, type check and format check
2. A fresh Twenty and Mailpit started with `scripts/start.sh`
3. The unit, API and UI tests, the UI in Chromium, the setup project first

The HTML report and the Allure results are kept as artifacts of the run, and the container logs too when something fails. After every run on `main`, the [Allure report](https://nikolay-chillev.github.io/twenty-qa/) is published to GitHub Pages with the history of earlier runs, so trends and flaky tests show across runs. In CI a failed test is retried once so the report can tell a flaky test from a broken one, but the run still fails. Changes to documentation only skip the tests. A single `CI passed` check sums up the run.

## Documentation

- [Test strategy](docs/test-strategy.md): scope, risks and priorities, test levels, environments, merge and release criteria
- [Findings](docs/findings.md): what the suite found in Twenty and its environment
- [Architecture decision records](docs/adr/): why Twenty, TypeScript and Playwright, multiple workspaces, pinning and the environment's deviations

## License

[MIT](LICENSE)

# Twenty QA

Test automation for [Twenty](https://github.com/twentyhq/twenty), an open-source CRM, written in TypeScript with Playwright. The suite covers what a QA team at a B2B SaaS company would care about: the REST and GraphQL APIs and their contracts, roles and permissions, the data grid, kanban and editor in the UI, transactional emails, accessibility and performance. Everything runs against a disposable Docker environment and in CI.

> Work in progress. The plan is tracked in the [milestones](https://github.com/Nikolay-Chillev/twenty-qa/milestones).

## Environment

| Service | Image | URL |
|---|---|---|
| Twenty 2.48.0 (server and worker) | [twentycrm/twenty](https://hub.docker.com/r/twentycrm/twenty) | http://localhost:3000 |
| Postgres 16 and Redis 8 | official images | internal only |
| Mailpit (catches all outgoing email) | [axllent/mailpit](https://github.com/axllent/mailpit) | http://localhost:8026 |

All images are pinned by digest, so a run always tests the same build.

### Test environment

The environment differs from a default Twenty installation in a few places, all set in [`docker-compose.yml`](docker-compose.yml):

| Setting | Twenty default | Here | Why |
|---|---|---|---|
| `EMAIL_DRIVER` and SMTP | emails are only logged | sent to Mailpit | Tests open password reset and invitation emails |
| `API_RATE_LIMITING_LONG_LIMIT` | 100 requests per minute, shared by all API keys of a workspace | 100,000 | The suite seeds its data through the API of one workspace |
| `API_RATE_LIMITING_SHORT_LIMIT` | 100 requests per second | 1,000 | Same |
| `INVITATION_SENDING_BY_EMAIL_THROTTLE_LIMIT` | 10 invitations per address per week | 1,000 | Invitation tests resend to the same addresses |
| `INVITATION_SENDING_BY_WORKSPACE_THROTTLE_LIMIT` | 500 invitations per workspace per week | 100,000 | Every run invites users |
| `EMAIL_SEND_WORKSPACE_DAILY_LIMIT` | 1,000 emails per workspace per day | 100,000 | A local environment is reused across many runs |

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
npx playwright install --with-deps chromium
npm test
```

| Command | What it does |
|---|---|
| `npm test` | Runs all Playwright projects |
| `npm run lint` | ESLint with type-aware rules, including Playwright's |
| `npm run typecheck` | `tsc`; Playwright strips types without checking them |
| `npm run format:check` | Prettier |

Staged files are linted and formatted before each commit (husky and lint-staged).

Settings come from environment variables and are validated on start: `TWENTY_URL` (default `http://localhost:3000`) and `MAILPIT_URL` (default `http://localhost:8026`).

## License

[MIT](LICENSE)

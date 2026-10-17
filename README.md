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

## Getting started

Requirements: Docker with Compose v2.

```bash
./scripts/start.sh
```

The first start runs the database migrations and takes about 90 seconds. Stop the environment with `docker compose down`, or add `-v` to also drop its data.

## License

[MIT](LICENSE)

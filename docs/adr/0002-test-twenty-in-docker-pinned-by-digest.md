# 0002. Test Twenty, an open-source CRM, from its official image pinned by digest

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

The project needs a real business application to test, the kind a QA team at a B2B SaaS company works on: rich data, several roles, an API used by integrations, a complex UI, transactional email. A previous project already covers e-commerce (Magento), so a different domain was preferred.

About 45 open-source web applications were screened on: activity in 2026 and how fast maintainers answer outside bug reports, how easily they run in Docker on a CI runner, how rich the UI is, whether there is an API for test setup, whether SMTP can be pointed at a mail catcher, how much browser test coverage the project already has, and the license and contribution process. Most dropped out early: too many services (Plane 13, Zammad 10 with Elasticsearch), extensive browser suites of their own (Mattermost, Grafana, Rocket.Chat), unmaintained (Focalboard), a single maintainer and a beta major version (Wiki.js), a source-available license (Outline).

The shortlist:

| | Twenty | Vikunja | Mealie | Gitea |
|---|---|---|---|---|
| Domain | CRM | Tasks and kanban | Recipes and meal plans | Code hosting |
| GitHub stars | 58k | 6k | 14k | 59k |
| Releases in the last 3 months | 23 | 4 | 10 | 5 |
| Their own browser specs | 9 | 84 | 2 | 30 |
| Containers | 4 | 1–2 | 1–2 | 1–2 |
| API | REST and GraphQL | REST | REST | REST |
| UI | data grid, kanban, rich text, workflows, CSV import, command menu, roles, live updates | kanban, Gantt, rich text, attachments | drag and drop planner, uploads | boards, markdown, uploads |

## Decision

Test Twenty 2.48.0 from its official image `twentycrm/twenty`, pinned by tag **and** digest in `docker-compose.yml`, with Postgres 16 (the version Twenty's own compose file uses), Redis and Mailpit pinned the same way.

Twenty has the richest UI of the shortlist and a business domain far from e-commerce, both REST and GraphQL, and only nine browser specs of its own against a large UI. It releases often, so regressions are likely, and its maintainers triaged most sampled outside reports within an hour.

## Consequences

- A fresh environment starts in about 90 seconds (database migrations on first start) and uses about 1.4 GB of memory, within a GitHub-hosted runner.
- Twenty has no seed command in production mode, so test data is created through its API, the way the app creates it.
- Twenty releases several times a week; pinning keeps runs reproducible, and new versions are followed on purpose ([ADR 0004](0004-pin-twenty-and-watch-new-versions.md)).
- Some features are out of reach without an enterprise key or external accounts (SSO, row-level permissions, Gmail sync); they are out of scope.

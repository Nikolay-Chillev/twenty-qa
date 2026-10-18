# 0005. Adjust Twenty's defaults where they get in the way of automated runs

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Twenty's compose file is meant for running Twenty, not for testing it. Checked on 2.48.0:

- The API allows 100 requests per minute, one pool shared by all API keys of a workspace. A suite that seeds its data through the API gets 429 from the 101st call, even from a brand-new key.
- Invitations are throttled to 10 per address per week and 500 per workspace per week; emails to 1,000 per workspace per day. Invitation tests resend to the same addresses, and a local environment lives through many runs.
- `/healthz` reports OK before the API can serve requests and while the database is down ([#12](https://github.com/Nikolay-Chillev/twenty-qa/issues/12)), so `docker compose up --wait` could hand tests a server that answers 500. The worker, which sends emails and calls webhooks, has no health check at all.
- Twenty needs an encryption key, and the test users need a password.

## Decision

- Raise the API rate limits, the invitation throttles and the daily email limit in `docker-compose.yml`, with each default noted next to it. Every other limit keeps its default.
- The server's health check runs a GraphQL query that needs the database (`checkUserExists`); the worker counts as healthy once its consumer of the email queue is connected to Redis.
- `scripts/start.sh` generates the encryption key and the password of the test users into a git-ignored `.env`, adding only what is missing.
- Run with several workspaces and open workspace creation ([ADR 0001](0001-run-twenty-with-multiple-workspaces.md)).
- List every deviation in the README.

## Consequences

- The suite can seed its data and send invitations freely; a run takes minutes, not hours of waiting for throttles.
- Ordinary tests do not exercise the default limits. A test of a limit sets one on its own workspace, or runs against an environment with the defaults.
- A control run with the default invitation throttle confirmed the setting is the one that applies: the 11th send to an address was refused with "Workspace invitation sending rate limit exceeded".

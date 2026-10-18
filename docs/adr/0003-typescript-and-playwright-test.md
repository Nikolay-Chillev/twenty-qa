# 0003. TypeScript and Playwright Test for all tests

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

The suite needs API tests, UI tests in three browsers, screenshot comparisons, accessibility scans and email checks, with readable reports and traces when something fails. A previous project used Python with pytest and Playwright for Python; Playwright's own test runner, Playwright Test, exists only for JavaScript and TypeScript and brings what that project had to build or do without:

- fixtures with worker and test scope, merged across files
- projects with dependencies, used here for a setup project that signs every role in once
- built-in screenshot comparison (`toHaveScreenshot`) and ARIA snapshots
- traces, sharding and merged reports in the runner itself

Twenty itself is written in TypeScript, and TypeScript with Playwright is the most requested combination for test automation roles in the local market.

## Decision

Write every test in TypeScript with Playwright Test:

- TypeScript 6.0 in strict mode, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; TypeScript 7 once `typescript-eslint` supports it
- Zod 4 schemas as API contracts, the counterpart of Pydantic
- ESLint with type-aware `typescript-eslint` rules and `eslint-plugin-playwright`, Prettier, and lint-staged before each commit
- npm with exact versions; Dependabot proposes updates weekly

## Consequences

- Playwright strips TypeScript types without checking them, so CI runs `tsc` and the type-aware lint rules; `no-floating-promises` and `missing-playwright-await` catch the most common bug in such tests, a missing `await`.
- API, UI and email checks share one runner, one report and one set of fixtures.
- All HTTP traffic goes through Playwright's request context so that it appears in traces. That is why Mailpit is read with a small client of our own: the `mailpit-api` package calls Node's `fetch` directly, its calls are missing from traces, and its kept-alive connections made the test worker crash on exit on Windows.

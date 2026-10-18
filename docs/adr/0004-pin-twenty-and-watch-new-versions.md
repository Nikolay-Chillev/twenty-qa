# 0004. Pin Twenty by digest, and watch new versions with a canary run

- **Status:** Accepted; the canary run is planned for the Workspace milestone
- **Date:** 2026-10-18

## Context

Twenty released 2.46, 2.47 and 2.48 within one week in October 2026. Testing `latest` would change the system under test in the middle of a pull request, and a red build could mean a broken test or a changed Twenty. Pinning one version makes runs reproducible, but on its own it hides regressions until somebody updates the pin, which for a fast-moving product is exactly when testing is most useful.

## Decision

- Pull requests and the nightly run test the pinned image (tag and digest in `docker-compose.yml`).
- Dependabot proposes a new pin once a week; its pull request runs the whole suite, and is merged when green or fixed in the same pull request when the suite needs to follow an intended change.
- A separate canary run tests the newest published image with the API and UI smoke tests. It never blocks a merge. A failure there is triaged: a regression in Twenty becomes a finding (and possibly an upstream report), a test that relied on old behaviour is fixed with the next bump.

## Consequences

- A red pull request always means the change under review, not a new Twenty release.
- Regressions in new versions are seen within a day of the release, often before the weekly bump.
- Findings record the version and image digest they were seen on.

# Parker verification report

Verified locally on October 26, 2026 (Pacific time). This is implementation evidence, not production release approval.

## Current product direction

The subsequent design requests supersede the original two-row desktop map and mobile bottom navigation dock. Lots now follow a vertically scrolling, curved coastline in chronological order. Terrain spans the complete world height. Seeded scenery, richer blue/green/sand colors, smaller parking spaces, and locally bundled pixel logo typography replace the earlier visual treatment. Mobile navigation is in a top-right popover; only capture remains at the bottom.

Screenshots use isolated development fixtures, never real account data:

- [Mobile populated coast](phone-populated.png)
- [Mobile navigation menu](phone-navigation.png)
- [Farther down the mobile coast](phone-coast-scroll.png)
- [Desktop populated coast](desktop-populated.png)
- [Desktop lot panel](desktop-panel.png)
- [50-lot phone world](coast-50-390.png)
- [50-lot desktop world](coast-50-1440.png)

## Executed checks

| Check                 | Result                     | Evidence and scope                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | Pass                       | `npm run typecheck`                                                                                                                                                                                                                                                                    |
| Production build      | Pass                       | `npm run build`; service worker precaches the shell, SVG art and logo font                                                                                                                                                                                                             |
| Unit tests            | 31 pass                    | Date parsing/calendar semantics, readiness/capacity/slot calculations, durable local queue and dependent versions, Undo, Google JWT verification, backup validation and archived-lot round trip                                                                                        |
| Worker/D1 integration | 7 pass                     | Real local Miniflare D1: ownership/CSRF, forged identity rejection, immutable mutation retries, strict capacity races, snapshot restart and page traversal, owner indexes, deletion cookies and abandoned-job cleanup                                                                  |
| Browser tests         | 10 pass                    | Five scenarios on phone Chromium emulation and desktop: capture/reload/edit/task/Undo; strict capacity preserves draft; offline capture/navigation; overflow/reduced-motion/320px screenshots; 50 lots and 1,000 ideas, chronological positions, deep scrolling, mobile menu dismissal |
| Dependency audit      | 0 reported vulnerabilities | npm audit result for the pinned lockfile; not a substitute for security review                                                                                                                                                                                                         |
| Local D1 load harness | Pass                       | 100 account fixtures and 500 inserted ideas; latest numbers in [load-report.json](load-report.json)                                                                                                                                                                                    |
| Cloudflare setup      | Completed                  | CLI authentication, one D1 database, three migrations applied remotely; no public Worker deployment                                                                                                                                                                                    |

Browser verification used the installed Chromium 1243 executable via `PARK_CHROMIUM_PATH`. On another machine, run `npx playwright install chromium` before the browser suite. Each isolated automated client supplies a synthetic documentation-range IP to the local Worker so repeated suites do not share one login quota. Production Cloudflare supplies that header itself; no server rate-limit exception was added.

The load harness measures local database operations and local wall time. Its 1,000/10,000 daily-active-account scenarios are arithmetic forecasts, not concurrent-user load tests or measured provider capacity. The latest baseline is 2,795 rows read and 5,600 rows written, with a forecast of 121 writes per modeled daily active account. D1 write quota is the first modeled constraint. Worker CPU, production overhead and long-term storage need measurement after a controlled deployment.

## Remaining release verification

- Human Google sign-in with the supplied client ID, using two actual Google accounts. The public ID is configured; a successful real sign-in has not been confirmed. Automated tests use explicit localhost-only development authentication and separately test JWT validation.
- Physical iPhone Safari and installed PWA: first installation, offline cold reopening, software keyboard, safe areas, touch behavior, screen reader and large-text behavior. Chromium phone emulation does not establish these results.
- Production origin registration, a production-only cursor secret, OAuth audience/branding/privacy configuration, provider subscription review, deployment and deployed security-header checks.
- Production Worker CPU and D1 metrics, free-tier alerts/quota behavior, real cross-device interrupted-sync exercises and provider backup/restore rehearsal.
- Detailed motion inspection under real-device interruption and accessibility settings. Reduced-motion capture is exercised, but the complete animation acceptance matrix has not been automated.

Account deletion locks normal access first, removes data in bounded chunks, and supports reload/resume. The configured hourly sweep advances up to two unfinished jobs per invocation, including jobs with expired browser credentials. It has been exercised against local D1; the actual Cloudflare scheduled trigger has not been deployed or observed.

No public deployment, billing change, paid service, or external AI API was used. These outstanding release checks must not be read as completed merely because the local build and automated suites pass.

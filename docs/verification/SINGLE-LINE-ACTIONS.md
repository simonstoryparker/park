# Single-line actions and Drop-off revision

Verified locally October 27, 2026, America/Los_Angeles. This report covers the interaction and spec revision, not production release approval.

## Result

One bottom composer accepts ordinary thoughts and explicit slash commands. Type `/` to discover examples, edit one, and submit with Enter or the existing arrow. Lifecycle, field edits, lot creation/archive/restore, bulk moves, navigation, preferences, sync, conflict choices, export and Undo are available from that line. Import opens the native file selector; account deletion retains export, fresh authentication and confirmation. Sign-out retains pending-work protection. These necessary extra steps are documented in spec Section 4.8.

Commands read current records and commit their domain writes and queue entries in one Dexie transaction. Invalid/ambiguous commands retain the draft. Bulk moves roll back completely if strict capacity rejects any member. Completion uses the existing persisted ten-second Undo. Explicit destinations, including General, take precedence over a named lot or date in the thought. Ordinary capture still routes to named/calendar lots automatically when there is no deliberate choice.

Every General Parked item is listed on the home map, without a preview cap. Title and car remain separate hit targets. Ready and In progress appear in the full Drop-off destination without duplicating General items. Lists follow the documented date/order rules. The map measures the growing Drop-off plot before placing later bands. Tablet now uses two columns at 700–999px. A paper header protects scrolling text and keeps navigation clickable.

The idle composer is one line; repeated per-row size buttons and duplicate scenery buildings are removed. Existing vehicle artwork, blue coastline, green terrain, bundled pixel wordmark, and readable system text preserve the supplied inspiration. No new libraries, external images, paid APIs or network-dependent artwork were introduced. Fixture titles in the screenshots are isolated sample data.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| `npm run test:unit` | 58 passed | Includes command lifecycle/editing, duplicate rejection, strict-capacity bulk rollback, queue persistence and deliberate destination precedence |
| `npm run test:integration` | 8 passed | Local Miniflare/D1 ownership, auth, sync, capacity and deletion checks |
| `npm run test:e2e` | 26 passed | Phone Chromium emulation and 1440px desktop; includes command workflows, error draft persistence, all Drop-off rows, explicit General, help, export, protected deletion entry, offline and existing regressions |
| Final affected browser checks | 6 passed | Preferences/protected entry points, chronological 50-lot/1,000-item fixture, natural capture after the header/composer adjustments |
| `npm run build` | Passed | TypeScript, Vite and generated PWA shell |
| `scripts/single-line-visual.ts` | Passed at 320/390/768/1440px | Empty/populated/help/33-item states; zero page errors or horizontal overflow; header navigation receives pointer hits after scrolling |
| Design inspector | 0 failures, 2 warnings | Authenticated isolated local fixture at 1440/768/390px; warnings retain Park’s required paper/coastal palette |
| Source design lint | 0 failures | Existing login eyebrow and legacy shadow declarations remain warnings; floating composer/panels keep intentional shadows |
| `git diff --check` | Passed | Tracked spec whitespace checked |

The first complete browser run after destination precedence changed exposed an old test expectation that named text could override a deliberately chosen Garden lot. The test now verifies the selected destination first, then automatic inference on the next capture. The complete corrected suite passed.

The normal inspector initially measured sign-in. The authenticated inspector uses the same measurement/judging code with a test-only cached account and simulated API outage; it does not modify app authentication or shipping code. Its machine report is [single-line-inspector.json](single-line-inspector.json). Historical verification reports describe earlier revisions and should not be read as current counts.

## Visual evidence and critique

- [Desktop populated](single-line-populated-1440.png)
- [Tablet populated](single-line-populated-768.png)
- [Phone populated](single-line-populated-390.png)
- [Narrow phone](single-line-populated-320.png)
- [Command help](single-line-help-390.png)
- [Long Drop-off list](single-line-many-390.png)

The full matrix uses `single-line-{empty,populated,help,many}-{320,390,768,1440}.png`. The repeatable visual script uses a cached local fixture with API 503 responses and reduced motion. It verifies local functionality during simulated unavailability; it is not a production outage test.

Retained direction: Editorial greeting, seed 1847775643, with Park’s existing palette/type and explicit coastal map requirements taking precedence over generic dashboard composition. No redraw, new photos, clips or licence obligations.

ROUND 1
Seen in one second: a coastal parking world with a thought composer.
Idea (one sentence): Park’s cars connect stored thoughts to readable rows and a single action line.
Live thing: type a thought or command, inspect its interpretation, and commit immediately on device.
Layout words by section: navigation=quiet compact group / landscape=dated lots / drop-off=every title / composer=one line.
Scores: design 7.0 · usability 7.0 · creativity 8.0 · content 8.0 → overall 7.3.
Caps applied: app-screen rules and Park’s required SVG art replace landing-page imagery/motion rules.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Tablet left a large empty right side; the final tablet layout uses two columns.
2. Idle capture used an extra hint row; the final composer puts discovery in the placeholder and shows interpretation only while needed.
3. Long Drop-off rows passed behind transparent fixed headings; the final scrolled header is opaque and its navigation sits above it.

ROUND 2
Seen in one second: thoughts have readable names in the park, with one clear input.
Idea (one sentence): Park’s cars connect stored thoughts to readable rows and a single action line.
Live thing: capture, commands, task completion, and immediate local feedback.
Layout words by section: navigation=compact / landscape=responsive coastal bands / drop-off=readable list / composer=single line.
Scores: design 7.5 · usability 8.0 · creativity 8.0 · content 8.0 → overall 7.8.
Caps applied: app-screen and explicit Park art conventions as above.
Top three remaining tradeoffs (most visible first), each with the screenshot it shows in and the decision:
1. Sparse desktop accounts retain open terrain (`single-line-empty-1440.png`); this preserves honest occupancy and the requested world, without fake lots.
2. A large Drop-off list pushes subsequent map bands down (`single-line-many-390.png`); search and the full-list destination remain available, and every item is retained.
3. Exact command syntax takes learning (`single-line-help-390.png`); discoverable examples and manual panels remain available.

## Specification completeness and release boundary

Version 4.5 reconciles General/Drop-off naming and membership, task capture defaults, explicit routing, calendar-lot creation, chronological map behavior, tablet columns, navigation, field metadata and action exceptions. Section 4.8 defines every supported command, failures, persistence, atomicity, protected flows and acceptance cases. A fresh reader review found and prompted the explicit-General, ordering, alias, metadata and parsed-lot-preview corrections.

Unverified release gates remain explicit: real Google-account login and cross-device sync; installed physical iPhone Safari/PWA keyboard/safe-area/offline reopening; production origins, security headers, metrics, quota monitoring and backup rehearsal; deployed deletion sweep; and the full recorded motion/interruption matrix (occlusion, resize, in-flight Undo and simulated animation exceptions). Existing capture/completion motion is retained; this revision does not establish those unrun gates. No deployment or billing changes were made.

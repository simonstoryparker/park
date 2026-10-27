# Park — Product & Implementation Specification

**Version:** 4.0 — thumb-first parking interaction and visual design revision  
**Updated:** October 26, 2026  
**Platform:** iPhone-first progressive web app (PWA), also comfortable on a Mac  
**Budget:** $0 for development, deployment and operation **within current free-tier limits**; no payment method or automatic paid upgrade  
**Status:** Build-ready product/engineering specification; verify service limits before actual deployment

## 1. Product vision

**Park is a place to leave ideas without turning them into commitments.** Someone thinks, “I want to build this, but not until December.” They can type it, park it, and get back to what they were doing. The idea is safely stored in a recognizable *parking lot*, and is brought back for reconsideration at the appropriate time.

The **parking lot metaphor is the main product experience**, not a graphic added to a task list:

- An **idea** is a **car**. In lists it is readable text; when parked it becomes a small visual car.
- A **lot** holds parked ideas and can have a **name, time window, and optional space limit**.
- **Parking** is a short, satisfying action: a saved idea shrinks into a car and drives toward a lot.
- **Pulling out** means deliberately making the idea **Active**.
- **Ready to revisit** means an idea can be reconsidered; it does **not** become an obligation.
- **Archive** keeps history without suggesting failure. Do not force a junkyard metaphor on the Archive screen.

**Core promise:** Capture an idea with one action; see it go somewhere; forget about it safely until you choose to reconsider it.

Park is not a conventional todo manager. In particular, **lot dates and item revisit dates are not deadlines**. A temporary lot with a two-week window is a place intended for that period, not a requirement to finish everything in two weeks.

### Non-negotiable design principles

1. **Capture comes first.** Only idea text is required. Lot, timing, and capacity management are optional during capture.
2. **Make the metaphor functional.** A collapsed lot shows occupied/empty parking spaces; a limit changes that view and parking behavior.
3. **Low friction beats animation.** Never hold saving hostage to animation, an interpretation dialog, or organizational choices.
4. **Dates tell you when to reconsider, not when work is due.** Never show overdue states, shame messages, or streaks.
5. **Let organization emerge.** Anyone can create a useful lot from a sentence, without completing a multi-field form.
6. **Local-first, private, and free.** Personal accounts and cross-device synchronization are required in V1, but capture/editing works offline after initial sign-in; no paid services or external AI APIs.
7. **Trust matters.** Local save succeeds independently of sync; display pending/failed sync honestly, preserve edits, support export/import, and make dates predictable.
8. **Keep it playful but calm.** The car animation is a moment of closure, not a game that demands attention.
9. **Many free users by design.** Avoid unnecessary server requests, repeated polling, enormous media files, and vendor lock-in. Quota exhaustion must never erase local data.

## 2. Core model and terminology

### Accounts and ownership (required in V1)

- Each friend signs into their **own free Park account** using **Continue with Google**. The Google identity scopes are limited to `openid`, `email`, `profile`. Do not ask for access to Drive, Calendar, or other Google data.
- No passwords are collected, stored, or hashed by Park. **Do not implement homemade password authentication.** An alternative email/password provider may be added in a later release only if it remains free and secure.
- Accounts own independent private ideas and lots. No shared lots, public profiles, or friends/social feed in V1. A user must never be able to read or edit another user's records by guessing a UUID.
- An account has one private built-in **General** lot. All records are scoped to the authenticated user on the server and in the local cache.
- Initial Google login and first-device sync need internet. After a successful login, previously cached account data supports offline use. Logging in to a *new* device always requires internet.
- Sign-out must not expose locally cached private data to the next user. If edits are not yet synchronized, block destructive cache clearing and offer **Sync first / Export pending work / Cancel sign-out**.
- Display the account email/avatar in Settings, allow explicit sign-out, account/data export, and account deletion. Do not expose the email in public URLs or analytics.

### Ideas

Each idea is one stored item and has one lifecycle state:

- **Parked:** Sitting in a lot, including items that are eligible to revisit.
- **Active:** Intentionally pulled out to work on now; not occupying a parking space.
- **Archived:** Finished, dismissed, or kept for reference; not occupying a parking space.

Each idea belongs to exactly **one lot** in V1. The built-in **General** lot is the default destination, so no lot decision is ever required to save. General is unlimited and cannot be deleted. The app can still show **Someday** as an automatic time grouping; *Someday is not a competing required folder*.

An idea can have an optional personal **revisit date**. It may also inherit a not-before date from its lot. The original idea text is preserved even if a recognized time phrase is removed from the display title.

### Lots

A lot is a named container with independent, optional settings:

- **Name** (required; e.g., Robotics, December Projects, Post Surgery)
- **Start date** (optional; the beginning of the period for which the lot is intended)
- **End date or duration** (optional; the last day of that period)
- **Capacity** (optional, e.g. 5 spaces; unlimited by default)
- **Capacity policy** (optional: **soft** by default; **strict** only when deliberately enabled)
- **Visual accent** (optional color/car style; automatic default)

The combinations are deliberately flexible:

| Example | Lot type | Behavior |
| --- | --- | --- |
| Robotics | Permanent, unlimited | Always available |
| Winter Break | Future-starting, optionally ending | Can collect ideas now; becomes ready to revisit when its period starts |
| Post Surgery, 2 weeks starting Tuesday | Temporary | Scheduled before Tuesday, open during the 14-day window, ended afterward |
| Side Projects, max 3 | Capacity-constrained | Show 3 parking spots; explain when full |
| December Experiments, max 4 | Time-bound + capacity-constrained | Both dimensions work together |

**Do not force users to choose a lot type.** Every lot uses the same optional fields.

### Lot lifecycle — derived from dates

- **Upcoming:** Start date is in the future. You may park ideas in it *before* it starts.
- **Open:** It has started and its end has not passed, or it has no applicable time restriction.
- **Ended:** Its window is finished; ideas stay safe and visible, and the app offers review options.
- **Archived:** User explicitly hides a lot from normal browsing. Its items are never automatically deleted.

Do not automatically archive, move, start, or delete ideas because a lot ends. An ended lot remains readable. New parking into it should prompt to extend/reopen it or choose another lot; never silently place a new idea in an ended lot.

### When an idea becomes ready

For a parked idea, define its **effective not-before date** as the **later of** its own `revisitOn` and its lot's `startOn` (ignoring missing values). If both are absent, the idea is **Someday** and does not resurface automatically.

- When the effective date arrives, show the item in **Now → Ready to revisit**; its status remains **Parked** and it still occupies a space.
- A future lot start makes its parked ideas eligible for review **by default**, without copying that date into every item.
- An item with its own later revisit date waits until that date even if the lot starts earlier.
- Editing a lot's start date recalculates eligibility automatically; it does not rewrite each item's personal date.
- If a lot ends before an item's individual revisit date, preserve that item's date. The lot gets an **ended-lot review prompt**, but the item must not be forcibly activated or silently rescheduled.
- A permanent lot without a start date does *not* automatically surface undated ideas.

An **end date is not a due date**. It closes the intended *period of the lot* and prompts a gentle review on app use; it does not impose completion requirements.

## 3. Primary information architecture

Use four simple destinations:

**Lots (default home)**
- **Pinned bottom quick-capture composer** above a compact bottom navigation dock; never place the primary capture bar at the top.
- Collapsible **visual parking lots** are the central browsing experience.
- Each lot header shows name, timing (if any), occupancy/capacity (if any), and a subtle upcoming/open/ended label.
- Collapsed: a compact overhead parking lot illustration with car positions.
- Expanded: accessible, readable idea rows/cards with actions.
- General always exists and is the default parking destination.
- Create Lot is reachable with one tap and through desktop keyboard shortcuts.
- Optional filters by timing (Ready / Future / Someday) and search, without forcing users to reorganize ideas.

**Now / Drop-off zone**
- **Drop-off zone** is a compact readable list for near-term small tasks and ready-to-revisit items, *not* another miniature parking lot.
- **Active** items deliberately pulled out to work on.
- **Ready to revisit** parked cars whose effective date has arrived; actions: Start, Later, Archive.
- Non-urgent prompt to review lots whose window ended. No overdue count.
- Quick capture remains available here too.

**Archive**
- Searchable history of archived items and optionally hidden lots; restore/move supported.

**Settings**
- Signed-in Google account, sync health (`Synced`, `Changes waiting`, `Offline`, `Unable to sync`), sign-out, export/import, deletion, reduced motion, installation instructions, optional default lot preference.
- Make privacy and data ownership clear: cloud copy is private to the account, local edits work offline, server free tiers have usage ceilings.

Mobile uses thumb-reachable bottom navigation (Lots / Now / Archive) immediately beneath the pinned bottom composer, respecting iOS safe areas. When the software keyboard appears, keep the composer above the keyboard and hide or compress navigation; never let it cover the input. Desktop uses a slim sidebar and keyboard shortcuts. Avoid adding another dashboard merely to display counts.

## 4. Main screen details

### 4.1 Collapsed lot view: an actual tiny parking lot

A collapsed lot is a **readable, compact top-down parking illustration**, not a collection of unlabeled emojis. Render with ordinary HTML/CSS and inline SVG for line markings/car silhouettes (do not depend on external images). The component should:

- Show a **header** with lot name, time-window label, and `occupied / capacity` when limited.
- Show **distinct parking spaces** and a small car silhouette or tile for every parked item represented.
- Show **empty spaces** when the lot has a capacity; occupancy must match the stored number of **Parked** items, including Ready items.
- Handle unlimited lots, including **Someday**, with the same top-down lot design. Fit visible cars by reducing *visual scale* as count grows, while maintaining compact/truck relative size. Use a minimum legible visual scale, then bounded preview plus `+N cars`; never imply a maximum. The count in the header remains authoritative.
- For limited lots with many spaces, scale the drawing to the available width until a legibility threshold, then render a bounded preview (e.g. 6–8 spaces) and a clear `+N more` indicator. Never hide the true total or imply all spaces are visible.
- Clearly distinguish an empty lot, available capacity, at-capacity, and over-capacity. Do not use red shame signaling.
- Be tappable/clickable to expand. Keyboard and screen-reader users should get a text label like “Post Surgery, 3 of 5 spaces occupied, opens Tuesday, expand.”
- Avoid visual clutter, 3D graphics, and intricate individual-car interactions in V1.

The miniature lot does not need to allow dragging cars into spots. **Cars are a visual summary; idea cards are the primary editing surface.**

### 4.2 Expanded lot view

Clicking a lot expands a list of its parked ideas. Show each item's title and concise timing (“Not before December,” “Ready to revisit,” “Someday”). Actions: **Start**, **Push back**, **Move**, **Edit**, **Archive**. A subtle car glyph may appear on a card, but text takes priority. Ended-lot controls: **Extend**, **Move ideas**, **Keep as is**, **Archive lot**.

Keep large touch targets and comfortable scrolling. On desktop, support arrow/tab navigation and Enter to expand. Preserve the expanded/collapsed state while navigating during a session; optionally store preference locally.

### 4.3 Quick capture

**Happy path:** open → type → Enter (or Park) → done. No required extra step.

- Default lot: **General**, unless user explicitly selects another; remember last-used lot only as an opt-in setting.
- If a lot is selected, show a compact destination chip next to the composer. One tap changes destination.
- Suggest an existing lot when the text confidently matches its name, but **never silently override a deliberate lot selection**.
- If there is no explicit date, an idea in a future lot inherits the lot's start date for eligibility; in a permanent lot it is Someday.
- Optional parsed date chips appear before saving. They are reversible and must not block a plain-text save.
- Desktop: Enter to park; Shift+Enter for multiline; `/` focuses composer when not typing; Escape closes menus.
- Mobile: a persistent **bottom-anchored writing bar**, with a nearby 1-tap **Compact / Big idea** toggle (car/truck), destination chip, and morphing Enter/Park button, all reachable above the keyboard.
- Big idea defaults to **compact** until explicitly switched, so capturing stays one action. Toggle before or after saving without opening details.
- Immediately return focus after a successful save, ready for the next idea.
- Confirm with quiet feedback (“Parked in Robotics · Undo”).

**When something goes wrong:** If **local persistence** fails, retain the draft and show an actionable error; never play a fake success animation. If local storage succeeds but the server is unreachable, the idea is safely **parked on this device, waiting to sync**. Never say it has synced until the server acknowledges it.

### 4.4 The parking animation (core V1 signature interaction)

1. User submits an idea.
2. App persists it **successfully first** in the current account’s IndexedDB cache and queues a sync mutation, then updates the target lot count.
3. The **Enter/Park button itself morphs** into the selected top-down compact car or truck; a separate text card must not become the car.
4. The vehicle drives **along the side lane/edge of the screen** toward the target lot (or its visible destination chip if the actual lot is offscreen).
5. It slips into an available space in the miniature lot, followed by a subtle one-time highlight and accessible “Parked” confirmation. Separate sync status shows if it is still waiting to reach the cloud.
6. Composer is ready for another idea immediately; movement is non-blocking.

**Implementation requirements:**
- Aim for **~450–700 ms** total; do not add a delay before users can capture again.
- Prefer compositor-friendly `transform`/`opacity` animations and `requestAnimationFrame`/Web Animations API or a lightweight motion library. Avoid animating layout-heavy properties for every frame.
- Measure start and target DOM rectangles using refs only when visible; on offscreen or unavailable targets, animate toward a stable destination chip, or use a simple shrink/fade. Never scroll the page involuntarily to chase the car.
- A fast double-submit must create exactly two records and not interfere with editing. Limit decorative concurrent effects to avoid lag.
- If `prefers-reduced-motion` is enabled, use a brief fade or no movement; saving and feedback still work.
- If the user navigates away mid-animation, the idea remains stored. No animation should control persistence or record status.
- Use simple vector shapes, not imported car photos, sprites, or a 3D engine.

**Definition of success:** The animation makes “I put that aside” feel satisfying **without becoming a speed bump**.

### 4.5 Thumb-first layout and front-end design bar (core V1)

**Information above, actions below:** Scrollable content consists of the **Drop-off zone** near the top, then collapsible top-down **parking lots** including Someday. The persistent bottom action rail contains the composer above compact tab navigation. The rail respects `env(safe-area-inset-bottom)` and mobile viewport changes; on iOS when the keyboard opens, preserve visibility of the composer and collapse/hide the tab rail. Avoid obscuring focused text and avoid an enormous permanent footer.

**Drop-off zone interaction:** A row contains a small car hit target and readable task title. **Tap the car** to mark the task complete (archive with reason `completed`), then animate the car **driving away** and show a short **Undo** action; **tap the title/row text** to open details instead. These must be distinct hit areas and screen-reader actions. Do not mark a big idea complete merely by tapping its truck unless it is explicitly in a completable task context. If a parked-ready item is completed, its parking capacity is released; if the item was Active, it no longer consumes capacity already. Animate only after a successful local transaction and queue the synced change. Undo must be durable and work during pending sync.

**Vehicle semantics:** Every idea has a 1-tap, keyboard-accessible `Compact` or `Big idea` selector. Compact = 1 parking-space unit, truck = 2 *adjacent* units in a conceptual grid. This is a **visual/capacity size**, not a priority, estimate, or deadline. Changing size on an already parked idea immediately updates capacity; apply strict-capacity checks on device and server. If a strict lot cannot fit a newly enlarged truck, do not lose the idea: show an option to keep compact, move lots, or change capacity. Trucks and compact cars stay visually distinguishable at every zoom level. A one-space remainder cannot physically fit a two-space truck even if car-count limit would appear available.

**Adaptive miniature lot renderer:** Use one shared renderer for time-bound lots, permanent lots, General, and Someday. Compute layout from number of parked cars and used-space units. Scale the **whole drawing** for many cars, retaining relative compact/truck sizes and aspect ratios; do not shrink individual cars inconsistently. At a legibility threshold, switch to a bounded representative preview and authoritative `N vehicles / M spaces` text, not microscopically small tappable cars. Cars in the collapsed overview are decoration unless they retain a >=44×44pt accessible interaction target; use the expanded readable list for selecting individual ideas.

**Minimal, non-generic visual language:** One font family, documented spacing/color/radius tokens, restrained accents, consistent hierarchy. No greeting paragraphs, AI-generated inspirational copy, productivity scores, filler subheadings, card-within-card dashboards, random decorative icons, gratuitous gradients, fake content, or unnecessary badges. The parking illustrations and movement carry the app's character. Labels are brief: `Lots`, `Ready`, `Someday`, `Big idea`, `Park`, `Undo`. Prefer whitespace and typographic hierarchy over repeated containers.

**Apple-inspired interaction principles:** Place frequent actions in natural thumb reach; separate navigation from content; preserve familiar menu behavior and comfortable touch targets (~44×44pt); let contextual actions appear near their object; apply motion only to communicate state. Do not imitate Liquid Glass unnecessarily in a web app. Respect reduced motion, keyboard navigation, safe areas, screen readers, and focus. Avoid relying on hover or color alone.

**Front-end acceptance process:** Implement a single exemplary mobile home screen *before* multiplying UI routes. Inspect actual iPhone-sized and desktop screenshots, and test with long labels, 0/1/30+ cars, 2-space trucks, keyboard open, low-vision zoom, offline state, and large text. Delete any UI copy or decoration that adds no information or affordance. Capture should be self-explanatory **without a tutorial paragraph**. Keep screenshots as visual regression baselines and fix alignment/overflow before declaring UI complete.

## 5. One-sentence lot creation — a defining feature

A core user story is:

> “Add a post surgery lot that's for two weeks starting Tuesday.”

The user should be able to do this in **one text field**, without filling out separate name/date/duration/capacity fields.

### 5.1 Creation flow

1. Tap **+ New Lot** (or invoke a desktop keyboard shortcut such as `L` outside text inputs).
2. The focused text field invites “Post surgery for 2 weeks starting Tuesday” or “Robotics max 3.”
3. As the user types, Park extracts **name**, **start**, **duration/end**, and **capacity** when confidently understood.
4. Show editable, inline **interpretation chips**: `Post Surgery` · `Starts Tue, Oct 27` · `Ends Mon, Nov 9` · `Unlimited`.
5. Press Enter / **Create Lot** to save. If all critical parsed values are unambiguous, **one Enter is enough**.
6. For ambiguous time input, preserve it, explain the uncertainty, and ask the user to edit the relevant chip instead of inventing a date. Still allow creating a name-only lot if they choose to ignore uncertain temporal text.
7. New lot appears in the Lots view, optionally expanded. A light “lot appeared” animation is enough; do not demand another form.

**Concrete date example:** Today is **Monday, October 26, 2026**. “Starting Tuesday for two weeks” means start **Tuesday, October 27, 2026**, active through **Monday, November 9, 2026**, and the window ends **at the start of November 10, 2026**. This example deliberately distinguishes an inclusive displayed end date from an exclusive stored end boundary.

### 5.2 Grammar for V1 (local, deterministic, free)

Within the dedicated **Create Lot** field, support:

| Input | Parsed name | Parsed scheduling | Capacity |
| --- | --- | --- | --- |
| `post surgery for 2 weeks starting tuesday` | Post Surgery | Start next Tuesday; 14 local calendar days | Unlimited |
| `robotics max 3` | Robotics | Permanent | 3, soft |
| `winter break starting december 20 for 2 weeks max 4` | Winter Break | Dec 20 through Jan 2 inclusive | 4, soft |
| `school` | School | Permanent | Unlimited |
| `summer ideas starting june 1` | Summer Ideas | Begins Jun 1, no end | Unlimited |
| `finals week until november 20` | Finals Week | Open now; ends Nov 20 inclusive | Unlimited |
| `photography with 5 spots` | Photography | Permanent | 5, soft |

Recognize: `starting [weekday/date]`, `from [date]`, `for N days/weeks`, `until [date]`, `through [date]`, `max N`, `limit N`, `with N spots`, and optional literal word `lot`. Use local calendar arithmetic, not 24-hour millisecond multiplication across DST.

**Parser rules:**
- Parse the **structured suffixes** first, then leave the remaining meaningful words as the proposed name. Do not remove “December” from a name unless it follows a recognized date connector.
- Accept quoted names (`"Post Surgery" for 2 weeks starting Tuesday`) to make edge cases unambiguous.
- If the phrase `for 2 weeks` is given **without a start date**, default to starting **today** only with a visible chip (`Starts today`); this is editable before creation.
- `Tuesday` means the next occurrence of Tuesday on or after today; `next Tuesday` follows a **documented weekday rule** and its *exact date* is always displayed in the preview. Never rely on users to guess which Tuesday the parser chose.
- Interpret `until Nov 20` as **inclusive** Nov 20 for display; store exclusive end Nov 21. With a duration, calculate endExclusive = `startOn + N calendar days`.
- If the parsed end is not after the start, block **only that invalid schedule**, not ordinary name-only creation. Offer a clear edit chip.
- Detect ambiguous dates (`11/12`, `next holidays`, unknown personal events) and do not auto-apply. No AI is required.
- Parse numeric capacity as positive integer (recommended V1 UI range **1–99**); reject `max 0` and negative limits with inline correction.
- Prevent exact case-insensitive duplicate names or prompt to open the existing lot instead. Keep original capitalization for display.
- If there is a parsing failure, the original input remains visible and editable; a fully manual edit-details fallback is always accessible.

### 5.3 Lot edit sheet

Advanced editing should be optional and separate from the one-line flow. Controls: Name, Start (or no start), End (or no end), Capacity (or unlimited), **Soft vs Strict** capacity, optional accent. It should explain the inherited revisit behavior in one short sentence: “Ideas in this lot become ready to reconsider when this lot starts, unless an idea has a later date.”

When editing an existing lot's dates, re-evaluate readiness live. When lowering capacity below current occupancy, **do not eject existing cars**; show `Over capacity · 6/4` and apply the rule only to future arrivals.

## 6. Capacity limits: meaningful without blocking capture

A lot may have an integer max number of occupied spaces. Occupancy = **sum of parking-space units for items with `status: parked` assigned to that lot**. Each compact car uses 1 space; each big idea/truck uses 2 adjacent spaces. Vehicle count and used-space count are separate metrics. Active and archived items keep historical lot association but do **not** consume spaces. Ready-to-revisit parked ideas *do* consume spaces until started or archived.

### Policies

- **Unlimited (default):** No fullness rules.
- **Soft capacity (default when max set):** Show `5/5 spaces occupied`; allow parking one more, then show `6/5` as over capacity. Inform quietly; avoid guilt or blocking normal capture.
- **Strict capacity (opt-in):** New parking is not allowed into that lot when occupied + incomingVehicleSpaces > max. Show a fast choice: **Choose another lot**, **Move a car**, **Change limit**, or **Cancel**. Never discard the draft.

Do not automatically shift ideas into another lot without explicit consent. If a user manually moves an item between lots, apply the destination capacity policy with the same rule. Starting an idea frees a space immediately. Archiving also frees a space; postponing within the lot does not.

To avoid race conditions, check strict occupancy **inside the same IndexedDB transaction** for local operations **and atomically on the server** for online/concurrent devices. A local check alone is not enough. If two offline devices fill the final strict-capacity spot, the second server mutation may be rejected on reconnect: preserve its idea locally and show a **Needs attention — choose a different lot or change the limit** conflict. Never silently delete, overwrite, or misplace a car. For soft limits, a single non-blocking heads-up is sufficient.

**Visual rule:** A limited lot shows empty parking spaces until full, making capacity intuitive; for large limits, use a bounded illustration plus true numbers, not 99 tiny cars.

## 7. Scheduling, resurfacing, and lot expiration

### 7.1 Individual idea dates

A parked item can be Someday or specify its own not-before date: tomorrow, next week, in 2 weeks, in December, explicit date, etc. The quick-capture parser only extracts a **confident revisit phrase**; “finish by Friday” is a deadline-like phrase, not an automatic revisit date.

- Store ISO **local calendar dates** (`YYYY-MM-DD`), not a UTC midnight timestamp.
- “In December” when captured in October 2026 means `2026-12-01` with precision `month` and label `December 2026`.
- “Next week” means next local Monday, labeled as a week.
- “After December” means Jan 1 of the following year.
- “Someday” means `null`, not a far-future timestamp.
- Never guess the date of “after finals” or another personal event without a known date.

### 7.2 Ready and resurface behavior

When `effectiveRevisitOn <= today`, display the parked item in Now → Ready to revisit. No auto-activation. Its actions are:

- **Start** — status becomes Active, parking spot frees.
- **Later** — Tomorrow / Next Week / Next Month / Pick Date / Someday; stays Parked.
- **Move** — to a different lot; follow its start and capacity rules.
- **Archive** — hide but preserve data.

The app checks eligibility on opening, when returning to foreground, after date/lot edits, and on local day change while open. Do not depend on background tasks while PWA is closed.

### 7.3 Ended lots

On first app use after a lot ends, show one gentle, dismissible review prompt on the lot:

> “Post Surgery's planned window ended. Keep these ideas here, extend the lot, or move them?”

Choices: **Keep as is**, **Extend dates**, **Review ideas**, **Move all**, **Archive lot**. No auto-deletion, auto-moving, or repeated nagging. Store dismissal state per current end date, so editing/extending may present the review again when it later ends. Ended lots remain visible by default, optionally under an “Ended” group.

**Important distinction:** A lot *ending* does not mean everything in it is Ready on that day. Readiness is driven by lot start + per-item date; the end triggers a *lot-level organizational check-in*.

## 8. Data model (local cache + Cloudflare D1)

IndexedDB (Dexie) is the immediate offline database, not the only copy. Cloudflare D1 stores authenticated server records and minimal sync metadata. The **same domain model** drives both stores. Scope every record by the authenticated owner; local IndexedDB databases/cache namespaces must be account-specific. Migrations must preserve older records if an early prototype exists.

```ts
type ISODate = string; // YYYY-MM-DD in local-calendar semantics

type ItemStatus = 'parked' | 'active' | 'archived';
type CapacityPolicy = 'soft' | 'strict';

type Idea = {
  id: string;                    // client-generated UUID, stable across devices
  ownerId: string;               // auth-derived, never trusted from client requests
  originalText: string;
  title: string;
  notes: string;
  status: ItemStatus;
  vehicleSize: 'compact' | 'truck'; // compact=1 spot; truck=2 spots, editable
  lotId: string;                  // defaults to built-in General ID
  revisitOn: ISODate | null;     // individual not-before; does not include lot start
  datePrecision: 'day' | 'week' | 'month' | null;
  dateLabel: string | null;
  createdAt: string;             // ISO instant
  updatedAt: string;
  activatedAt: string | null;
  archivedAt: string | null;
  archiveReason: 'completed' | 'dismissed' | null;
};

type Lot = {
  id: string;
  ownerId: string;               // server uses authenticated identity
  name: string;
  startOn: ISODate | null;       // optional inclusive start
  endExclusive: ISODate | null;  // optional exclusive end
  capacity: number | null;      // null = unlimited
  capacityPolicy: CapacityPolicy;
  accent: string | null;        // validated design token, not arbitrary CSS
  sortOrder: number;
  isArchived: boolean;
  endedPromptDismissedFor: ISODate | null;
  createdAt: string;
  updatedAt: string;
};
```

**Built-in General:** Use a stable reserved logical ID scoped to each owner (e.g. `general` within each user), unlimited and always open. Create/recover it during database initialization; block deletion/archival of the built-in lot. Avoid `lotId = null` once migrated, except while validating untrusted imports.

**Derived, never persisted:** `occupiedSpaces` (sum of vehicle units), `vehicleCount`, `spacesRemaining`, `lotStatus`, `effectiveRevisitOn`, `isReady`, `isFull`, `isOverCapacity`. Compute from current records/local date. `effectiveRevisitOn` is the later of `idea.revisitOn` and `lot.startOn`; absent both means Someday. Archiving a lot does not alter its items without an explicit user choice.

**Local indexes:** `ideas.status`, `ideas.lotId`, `ideas.revisitOn`, `ideas.createdAt`; `lots.sortOrder`, `lots.name`. For ~1,000 ideas per user, filtering an indexed local collection in memory is acceptable. Revisit query may derive from lot dates, so do not index only on `idea.revisitOn` and assume eligibility is complete.

**Server tables (D1):**

```sql
users (id PRIMARY KEY, google_sub UNIQUE, email, created_at, deleted_at)
lots (id PRIMARY KEY, owner_id, name, start_on, end_exclusive,
      capacity, capacity_policy, accent, sort_order, is_archived,
      ended_prompt_dismissed_for, version, updated_at, deleted_at)
ideas (id PRIMARY KEY, owner_id, lot_id, original_text, title, notes,
       status, vehicle_size, revisit_on, date_precision, date_label,
       created_at, updated_at, activated_at, archived_at,
       archive_reason, version, deleted_at)
sessions (token_hash PRIMARY KEY, owner_id, expires_at, created_at)
changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner_id,
         entity_type, entity_id, version, operation, changed_at)
processed_mutations (owner_id, mutation_id, result, created_at,
                     PRIMARY KEY (owner_id, mutation_id))
```

The DDL above is **conceptual**, not a ready-to-run migration: add real `NOT NULL`, foreign keys, `CHECK` constraints, proper SQL types, and validated migrations. Index hot access paths such as `(owner_id, seq)` for `changes`, `(owner_id, lot_id, status)` for `ideas`, `(owner_id, updated_at)` as needed, and `(owner_id, lower(name))` for lot-name uniqueness. Always include `owner_id` in authenticated reads/writes. Use D1 `EXPLAIN QUERY PLAN` to verify indexed queries rather than full-table scans. Avoid large text blobs, attachments, and server-side searching that scans all users' ideas.

**Sync-only metadata:** each client has `deviceId`, `lastAppliedCursor`, queued idempotent mutations, and `lastSyncStatus`; records carry numeric **server-assigned `version`** for conflict detection. Use UUID-based mutation IDs. Do not derive sync order from device timestamps. Keep tombstones (deletion records) until a safe expiry/compaction strategy, and offer full snapshot resync if a client cursor is older than retained history. Treat sessions, mutation logs, and change logs as bounded metadata, not permanent archival history.

### Safe invariants and transitions

- Each idea points to an existing lot (General fallback on safe import/migration).
- Lot names unique case-insensitively after trimming; nonempty.
- `endExclusive` must be strictly later than `startOn` when both are set.
- Capacity is null or a positive integer; strict capacity checked transactionally.
- Deleting a lot with items requires **move items to another lot** or **archive whole lot**; never cascade-delete ideas.
- If archived items are restored to Parked, destination capacity rules apply.
- All mutations show failure clearly and leave original content intact.
- Preserve per-item timestamps, date labels, and original text in export/import.

## 9. Implementation architecture — free, cloud-synced and designed to scale

### 9.1 Final V1 stack

| Layer | Recommended technology | Why |
| --- | --- | --- |
| App | React + TypeScript + Vite | Lightweight UI and shared types |
| Styling | Tailwind CSS + custom SVG/CSS | Fast, responsive parking-lot views |
| Offline data | Dexie / IndexedDB | Immediate saves, queued offline mutations, cached browsing |
| Authentication | **Google Identity Services (GIS)** | Free Google sign-in, no self-managed passwords or Firebase daily-active-user auth cap |
| Session/API | **Cloudflare Worker** (TypeScript) | Same-origin HTTPS API, verified login, secure sessions, authorization |
| Database | **Cloudflare D1** (SQLite) | Low-cost row-oriented storage, indexes and owner-scoped queries |
| Hosting | **Cloudflare Workers Static Assets** | Free static asset delivery separate from API quota; no domain purchase required |
| Date + parsing | Tested local TypeScript date utilities and deterministic parser | No AI calls, predictable offline behavior |
| PWA | vite-plugin-pwa | Installed iPhone app and offline shell |
| Testing | Vitest, React Testing Library, Playwright, Worker/D1 integration tests | Detect sync, privacy, concurrency, and quota failures |

**Why not Firebase + Firestore as the scaling-first default?** Firebase is easy to build, and is still a reasonable fallback if implementation simplicity matters more. But Firestore's standard free tier is currently **50,000 document reads/day, 20,000 writes/day and 1 GiB stored**. A Firebase Authentication **with Identity Platform** project on Spark has a **3,000 DAU** limit. Those limits make it a less attractive default for the stated goal of maximizing users on $0. Do **not** claim that every Firebase Auth configuration has the 3,000-DAU limit; it applies to the Identity Platform upgrade. Google Identity Services used directly does not depend on that Firebase-specific cap.

**Keep everything on provider free plans; do not enable paid billing or auto-upgrade.** A free `workers.dev` hostname is sufficient; buy a custom domain only if desired later. Even at $0, limits are not unlimited or guaranteed unchanged: quotas must be reviewed before deployment and monitored afterward.

### 9.2 Google accounts and login security

1. Create a Google OAuth **web client ID**, register the actual HTTPS origin(s), and configure the Google Auth Platform consent/branding screen for an **External, In Production** app when ready to invite friends. Request only basic identity scopes (`openid`, `email`, `profile`); never add sensitive permissions without a new privacy review. Testing configurations can have user-count restrictions.
2. Use the official Google Identity Services sign-in button. Send the Google ID token to a same-origin `POST /api/auth/google` endpoint over HTTPS.
3. **Verify the token on the server** using an established JWT/OIDC verification library compatible with Cloudflare Workers. Require Google's trusted issuer, the exact configured audience, valid signature (Google public keys, cached according to expiry), non-expired token, and other library-required checks. Treat Google `sub` as the stable identity key, **not the email**.
4. Look up/create an internal user ID associated with that Google `sub`. Establish a server-managed session using a cryptographically random opaque token in a `Secure; HttpOnly; SameSite=Lax` cookie (hashed token in `sessions`, with expiration/revocation). Avoid storing auth bearer tokens in localStorage. Protect write endpoints with same-origin/Origin and CSRF protections; enforce an allowlisted Host and HTTPS. Rate-limit login and mutation traffic; validate all inputs.
5. Logout revokes the server session and clears its cookie, while handling queued offline edits safely. Provide **sign out all devices** and **delete account and data** controls (bulk cleanup may be asynchronous as long as there is a reliable bounded process and user-visible status).
6. Every API operation derives `owner_id` from the verified session; ignore incoming `ownerId` as authority. Test unauthorized requests, cross-account UUID enumeration, expired sessions, CSRF, and logout-with-pending-edits.

**Do not build your own username/password system.** Google sign-in alone meets V1 account requirements and avoids password-reset email quotas and password breach liability. An optional managed email/password login can be researched later if demand justifies its free-tier constraints.

### 9.3 Offline-first sync and request minimization

- **Single source of immediate UI truth:** account-scoped IndexedDB. Save idea/lot mutation + outgoing operation record in **one local transaction**; immediately display the parked car. No waiting for the network to animate.
- **Server authoritative for shared-device consistency:** The Worker/D1 copy accepts idempotent mutations, validates ownership and version preconditions, and enforces strict lot capacity atomically. Client sends mutation UUID, entity ID, base version, and only changed fields.
- **Batch outgoing edits:** `POST /api/sync` accepts a bounded list of mutations (e.g. 1–50), validates each, returns accepted versions/conflicts and remote changes. Use one request instead of many writes.
- **Incremental sync:** `GET /api/sync?cursor=<server-sequence>` returns only this account's changes after the cursor, with pagination and an authoritative next cursor. Keep a compact change log indexed by `(owner_id, seq)`; if history is pruned beyond the cursor, return a `snapshot_required` response and replace the local *server-acknowledged portion* from a full, owner-scoped snapshot. Preserve local pending edits when doing so.
- **Sync trigger:** after local changes (short debounce), on app startup/foreground, and on explicit user request. Suppress repetitive polling, background high-frequency refresh and useless requests when nothing has changed. A simple visibility-aware check once every several minutes is sufficient if the app stays open; optimize from measured usage, not assumptions.
- **Conflict behavior:** Non-overlapping edits merge by entity. For two competing versions of the same entity, **never silently overwrite** one person's locally typed text. Prefer explicit conflict resolution/retry for text, and clear deterministic behavior for state/date changes. Idempotent mutation IDs prevent duplicate cars on retry. Use soft-cap visual warnings; strict capacity is confirmed atomically server-side. Preserve rejected changes locally with a visible action needed state.
- **Deletion:** sync tombstones instead of assuming absence means deletion. Retain enough history for inactive devices and provide full-resync fallback; do not let tombstones and processed-mutation records grow without limit. Hard-delete via explicit account deletion workflow, not by normal Archive actions.
- **Offline onboarding:** First Google sign-in cannot happen offline. After a successful login, cached data remains usable offline, including parking and local date checks. While offline, mark cloud sync as pending, never claim other devices are up to date. Avoid letting account A's cached data display to account B after switching accounts.
- **Never require real-time infrastructure** (WebSockets, push channels, background cron, third-party AI, SMS). Eventual consistency on foreground/open is appropriate for Park, and dramatically conserves free usage.

**Suggested endpoints:**

```text
POST   /api/auth/google                 Verify Google ID token; establish session
POST   /api/auth/logout                 Revoke session and clear cookie
GET    /api/me                          Return current user (or 401)
GET    /api/snapshot                    Paginated owner-scoped lots + ideas
GET    /api/sync?cursor=...             Pull changed rows, page via cursor
POST   /api/sync                        Push idempotent mutation batch; return results
GET    /api/export                      Optional server-side export; local export always available
DELETE /api/me                          Request authenticated account/data deletion
```

Do not add an API call for every lot render, every animation frame, or every list scroll. All visual state and date parsing should work from IndexedDB.

### 9.4 Current free-plan quotas (verified October 26, 2026)

| Resource | Free tier relevant to Park | Main risk |
| --- | --- | --- |
| Cloudflare Workers | **100,000 Worker requests/day** | API/auth hits cap; dynamic requests fail until reset |
| Cloudflare static assets | **Free/unlimited static asset requests** | Free plan still has per-project size/build constraints |
| Cloudflare D1 reads | **5,000,000 rows read/day** | Missing indexes or frequent full scans exhaust quota |
| Cloudflare D1 writes | **100,000 rows written/day** | Chatty syncing, redundant indexes, mass rewrites |
| Cloudflare D1 storage | **500 MB per database**, up to **10 databases** / **5 GB total** per Free account | Storage may cap the app before daily request quotas |
| Google Identity Services | Basic Google sign-in; **no Firebase Identity Platform DAU cap applies** | Google sign-in branding/configuration/anti-abuse rules; do not promise unlimited login throughput |

**Warning: hard caps matter.** Cloudflare reports that once free D1 daily read/write limits are exhausted, queries fail until midnight UTC; no automatic continuation. Workers Free requests can also be blocked at their cap. The goal is therefore not an impossible guarantee of unlimited free service: it is **maximize sustainable users and ensure local capture still works during outages/limits**.

**Illustrative math, not a capacity promise:** `100,000 API requests/day ÷ 5 Worker API calls per active user/day = 20,000 daily active users` on the request dimension alone. Actual capacity may be lower due to storage, D1 read/write costs, bursts, sessions, new-user onboarding, abuse, and provider changes. A typical user with a handful of short ideas is cheap; benchmark a realistic workload and calculate each ceiling independently.

**Storage caution:** D1's **500 MB per database** cap is distinct from the 5 GB total per free account. Start with *one* indexed database and monitor headroom. Do not assume 5 GB is available in a single database or create ten databases prematurely. Document a migration/sharding plan if the product eventually reaches that scale; sharding adds complexity and does not increase the Workers account-wide request quota.

### 9.5 Free-tier survival strategy (required V1)

1. **Cache everything locally** and sync only deltas, not whole lists on every open.
2. **Index by owner**, restrict query sizes, page snapshots and large sync responses, and measure D1 rows read/written per API action; keep the number of indexes purposeful.
3. **Batch changes** (including item moves/edits), debounce network pushes, never poll in the background, and disable automatic retry storms after 429/503/quota failures. Retry later with capped exponential backoff and jitter.
4. **Avoid media uploads** and per-user file storage for V1. Limit idea text/notes payload size and number of API operations per minute per user, with documented fair-use safeguards to prevent one client or bot from consuming the entire free tier. Make personal limits generous and transparent rather than surprising users.
5. **Track quotas and alert yourself** (Workers requests, D1 row reads/writes, D1 database size, errors, per-user average). Measure percent used and forecast from a rolling week. Cloudflare dashboard/alerts first; no paid analytics service needed.
6. **Degrade gracefully:** if server quota/outage blocks sync, show `Saved on this device · Syncing later`; still allow capture, reading cached lots, dates, and exports. Never discard queued operations, show `Synced`, or sign users out just because the API is temporarily down. A *new user/new device* cannot access uncached data while the service is unavailable—show a truthful explanation.
7. **Back up/export and document migration:** version the domain and sync schema, provide one-click user export/import, and write scripts to migrate accounts to another database/provider. Do not tie business logic to a specific cloud SDK.
8. **No surprise bills:** stay on free plans and do not attach payment methods or turn on pay-as-you-go as an automatic response to limits. Stop accepting cloud writes rather than silently spending money.

### 9.6 Suggested source layout

```text
src/
  app/                   Shell, nav, account identity, session/sync status
  components/            QuickCapture, Button, Chip, Sheet, EmptyState
  features/
    auth/                Google sign-in, session UI, account management
    ideas/               IdeaCard, capture, lifecycle actions
    lots/                LotCard, MiniParkingLot, LotDetail, LotEditor
    lot-parser/          Deterministic parsing and ambiguity warnings
    idea-parser/         Local date parser
    animation/           ParkingAnimation, reduced motion, target registry
    now/                 Active/ready/ended-lot review
    backup/              Versioned export/import validation
    sync/                Offline queue, batching, cursors, conflicts, retries
  domain/                Typed schemas and pure rules
  data/                  Dexie schema, migrations, account-scoped repositories
  styles/                Design tokens, car and lot vectors
worker/
  src/                   Auth/session validation, route handlers, sync engine
  migrations/            D1 schema/index migration SQL
  tests/                 Worker + local D1 integration and auth isolation
shared/                  Validated API types and domain contracts
```

Repository interfaces decouple UI from storage; isolate Cloudflare access within Worker adapters. Core pure functions still include `parseLotInput`, `effectiveRevisitOn`, `getLotStatus`, `canParkInLot` and `calculateEndExclusive`.

### 9.7 Lot parser implementation sketch

1. Normalize whitespace **for parsing only**, preserving original input.
2. Recognize quoted names, duration tokens, start/end prepositions, capacity tokens, and trailing `lot`.
3. Build a structured draft with recognized spans removed to derive the name. Never aggressively strip words in the middle of a name.
4. Resolve absolute/relative dates against a passed-in `today` (testable clock).
5. Validate duration, boundary ordering, capacity, and duplicate names.
6. Return chips and warnings; do not auto-create until the user presses Create.
7. Persist structured lot fields; do not call a text-generating AI service.

**Example parse contract:**

```ts
parseLotInput('post surgery for 2 weeks starting tuesday', '2026-10-26')
// => {
//   name: 'Post Surgery',
//   startOn: '2026-10-27',
//   endExclusive: '2026-11-10',
//   capacity: null,
//   capacityPolicy: 'soft',
//   warnings: []
// }
```

If parsing confidence is low, show the original phrase plus manual edit chips rather than inventing scheduling details.

## 10. Offline operation, backups, and accessibility

### Data safety

- **Local save succeeds before the animation**; cloud synchronization is a separate queued step. Show pending sync honestly and allow manual retry.
- Cloud storage is not a substitute for export. Provide device JSON backup and restore even for signed-in users.
- Account deletion must include user lots, ideas, sessions, sync metadata, and provider linkage, with progress and clear completion/error reporting.
- Persist successfully **before** rendering the success animation or toast.
- Use IndexedDB transactions for multi-record operations and strict-capacity checks.
- On database errors/quota limits, retain drafts and offer a retry.
- Export **versioned JSON** containing schema version, export date, settings (excluding device-specific fields if applicable), lots, and ideas.
- Import validates every field, previews changes, offers **merge by IDs** or **replace**, and never silently overwrites a database.
- Before a Replace import, offer or produce a fresh backup first when feasible.
- Include a subtle, periodic local-backup reminder, because on-device browser data can be cleared. Do not promise permanent storage.
- Test iOS installed PWA storage separately from Safari tab storage; don't claim they share a database unless verified.

### Accessibility and performance

- Mini lots provide equivalent text labels, counts, and expanded lists to screen-reader users.
- Minimum comfortable touch targets, logical focus order, visible focus rings, sufficient contrast.
- Honor `prefers-reduced-motion`, including in auto-animated car travel.
- Animate using transforms rather than reflow-heavy layout changes.
- Test 1,000+ items, 50+ lots, unusually long names, many parked cars, and tiny screens.
- Core functionality must remain possible without animation, hover, gesture, or color interpretation.

### PWA hosting details

- Manifest: `name=Park`, `display=standalone`, proper theme/icon sizes, responsive viewport.
- Cache static shell with service worker; IndexedDB stores data separately. **Never cache private API responses in a shared/public service-worker cache.**
- Deploy on Cloudflare Workers Static Assets with same-origin `/api/*` routing, HTTPS, correct SPA fallback, manifest scope/start URL, and a free `workers.dev` hostname. Do not route static asset requests through the Worker unnecessarily.
- Show an unobtrusive update prompt; never reload over an unsaved draft.
- No closed-app guaranteed reminders or push notifications in V1. The app checks dates when opened/foregrounded.

## 11. Scope and priorities

**P0 / must ship in V1 (including free personal accounts and thumb-first visual design):**

| Area | Requirement |
| --- | --- |
| Capture | One-field, one-submit capture with built-in General default |
| Lots | Create, edit, expand/collapse, archive safely, and move cars |
| One-line creation | Deterministic lot parser, editable date/capacity chips, manual fallback |
| Theme | Shared top-down renderer for all lots including Someday; adaptive scaling; compact cars and two-space trucks |
| Interaction | Bottom pinned composer; Enter-button-to-car side-lane parking animation; drop-off zone task completion with drive-off and Undo |
| Visual QA | Strict no-fluff typography/copy rules; screenshot review and mobile safe-area/keyboard tests |
| Capacity | Unlimited/soft cap and optional strict cap, including server-side atomic checks |
| Scheduling | Lot start/end, individual idea not-before date, resurfacing, ended-lot review |
| Lifecycle | Parked / Active / Archived, postpone and restore |
| Browsing | Lots-first home, Now, Archive, search |
| Accounts | Google sign-in for individual accounts, secure sessions, sign-out, account deletion |
| Privacy | Every server operation owner-scoped; no shared content and no homemade passwords |
| Sync | Offline local CRUD, batched idempotent sync, conflicts, pagination, transparent status |
| Reliability | Export/import, no loss on outages or quotas, real-device offline testing |
| Scalability | D1 indexes, bounded requests/queries, fair-use guards, quota monitoring, no billing |
| Deployment | Installable iPhone + Mac PWA on free Cloudflare hosting |

**P1 / after the core is reliable:** optional guest mode (local-only then explicit merge into account), managed alternative login method if free, fancy car variants, advanced sorting/filtering, more sophisticated motion, invitations to share app. Do not build collaborative/shared lots without a separate permissions spec.

**Explicitly defer:** Homemade passwords, Firebase/Firestore dependency, push notifications, native iPhone widgets, realtime WebSockets, photos/files/attachments, large AI features, gamification, calendar integrations, complex 3D graphics, public user profiles.

## 12. Implementation phases and exit criteria

### Phase 1 — Offline-first domain and capture

Build typed domain, Dexie schemas, account-scoped local repositories, General lot, capture, basic lot/item lifecycle, local mutation queue, and local JSON backup. Stub the account ID in development only; do not deploy the stub auth.

**Exit:** Capture → park → refresh/reopen → start/archive/restore; mutations persist and sync queue can be inspected. Every local write can be exported.

### Phase 2 — Real accounts + secure cloud backend (before public sharing)

Configure Google Identity Services, Worker static assets + `/api`, D1 migrations/indexes, secure cookie sessions, strict server authorization and abuse limits. Implement first sign-in, owner-scoped seed General, sync batch/changes/snapshot endpoints, conflict handling, and sign-out.

**Exit:** Two different Google accounts cannot access each other's lots/ideas, even with direct API requests and known IDs. One account sees a newly parked idea on iPhone and Mac after sync. Local/offline edits synchronize later without duplicates or invisible loss.

### Phase 3 — Thumb-first parking lot visual experience

First approve an exemplary phone screen. Implement bottom pinned composer/navigation, shared adaptive mini parking lots for Someday and other lots, compact and truck vehicle sizing, space-weighted capacity, drop-off list, Enter-button-to-car side-lane animation and drive-off completion with Undo, reduced-motion behavior, and server-side strict-capacity race protection. Inspect iPhone and desktop screenshots and remove all decorative filler.

**Exit:** 3-spot lot displays correct occupancy; animation plays after a local commit; two devices competing for last spot produce a visible recoverable conflict, never lost text.

### Phase 4 — Natural-language lot creation and scheduling

Implement parser + live chips, duration/date validation, edit sheet, inherited not-before rules, Now resurfacing and end-of-window review.

**Exit:** From Oct 26, 2026, `post surgery for 2 weeks starting tuesday max 5` creates Oct 27–Nov 9 inclusive, 5-space lot. On Nov 10 it offers review without deleting/moving cars.

### Phase 5 — PWA, safety, and release

Make iPhone keyboard UX polished, add install/offline shell, reliable restore/export and account deletion, accessibility, secure caching, sync progress, errors, retries, and performance testing. Deploy free on Cloudflare, no billing method.

**Exit:** User on a previously signed-in installed iPhone can park ideas while offline or while Worker/D1 quotas are simulated as exhausted, then sees them sync later. Export/import works. A fresh phone must sign in online. A user can delete their account/data securely.

### Phase 6 — Measured free-tier optimization (required before broad invitations)

Create usage dashboard/alerts, load-test representative numbers of users, measure reads/writes per endpoint, build a quota-based forecast, fix full-table scans and excessive API calls, and document migration to additional D1 databases/provider if needed.

**Exit:** Repeatable load-test report for 100 / 1,000 / 10,000 simulated daily active accounts with realistic usage profiles, **predicted** daily Worker requests, D1 row reads/writes, storage growth, and clearly stated binding constraints. Do not claim tested user counts without performing the tests.

## 13. Acceptance tests (release gate)

### Core theme, parsing, and timing

1. Plain text + Enter (or one mobile tap) parks an item immediately in the account's General lot; no mandatory settings or multiple screens.
2. A saved item collapses to a car and parks without blocking another capture; reduced-motion mode simplifies or removes travel.
3. Collapsed mini lots, including Someday, scale visually while preserving compact/truck proportions and display true occupied/empty **space** counts; only Parked (including Ready) occupies spaces. Unlimited lots display a bounded preview.
4. A truck uses two capacity units and visually spans two spaces; changing vehicle size recomputes capacity. Soft cap warns but permits over-capacity; strict cap prevents newly accepted overflow **server-side** even with concurrent devices.
5. An item rejected from its strict lot after offline/concurrent conflict is preserved locally with a clear resolution action.
6. `post surgery for 2 weeks starting tuesday` parsed on Oct 26, 2026 starts Oct 27, ends at start of Nov 10. Ambiguous phrases never silently create erroneous dates.
7. Lot start can make parked items ready to revisit but never Active; a later item date overrides the lot start.
8. Ended lots trigger a gentle review, no automatic deletion or moving. No overdue messages.
9. Search, Now, Lots and Archive work with touch/keyboard and many ideas and lots.

### Thumb-first usability and visual quality

- The bottom composer remains reachable when the iPhone keyboard is open, and respects safe-area insets; navigation collapses rather than covering the writing bar.
- The Enter button morphs into a compact car or truck, travels along a side lane, and parks in the correct lot **after local save**. Offscreen destinations degrade gracefully; motion never blocks the next input.
- The drop-off zone displays near-term/ready tasks as readable rows, not a lot; car-tap completes with drive-off animation and Undo, while title tap opens details.
- A 3-space strict lot admits three compacts or one truck plus one compact but not two trucks, across devices and after offline sync.
- Someday and larger lots use the same top-down vehicle rendering; scale down until the minimum readable size, then show compact preview and accurate counts, not tiny inaccessible tap targets.
- Screenshot-review checkpoints exist for iPhone, desktop, long copy, reduced motion, big text, keyboard-open, empty/full/over-capacity and 30+ car states.
- No nonfunctional filler text, decorative badges, fake statistics, unsolicited tutorial paragraphs, excessive gradients, or nested SaaS-style cards appear in the shipped UI.

### Accounts, sync, privacy, and deletion

10. A user creates a free account with **Continue with Google** and gets their own General lot.
11. Users A and B cannot read/write each other's items, lots, sessions or exports by directly calling the API with guessed IDs.
12. The Worker rejects invalid, expired, wrong-audience and wrong-issuer Google tokens; stolen/expired/revoked session cookies fail appropriately.
13. Signed-out and unauthenticated API calls cannot reach private data; CSRF, origin and input-validation checks reject crafted writes.
14. Two devices for the same Google account converge after local changes; duplicate mutation retries do not produce duplicates.
15. Concurrent conflicting edits preserve both meaningful versions until explicit reconciliation or a safe deterministic merge.
16. When offline, capture and all local navigation still work; sync status says pending and the app retries later without losing changes.
17. Simulated Worker/D1 429, 503, storage-limit, invalid cursor, and timeout failures do not erase local ideas, over-retry or produce false “Synced” messages.
18. Sign-out does not expose account A's cached records to account B; pending edits are synced/exported or explicitly retained through a safe process.
19. A user can export/import a versioned JSON backup, and can request deletion of their account and cloud data, with confirmation of completion.
20. The user's initial sign-in on a fresh device requires network; cached signed-in accounts work offline afterward when the session's local authorization state permits it.

### Scaling and zero-dollar operation

21. All frequently accessed D1 queries are indexed by owner, with tested `EXPLAIN QUERY PLAN` and measured rows scanned.
22. Opening/scrolling a lot or playing an animation generates **zero** unnecessary API calls; only changes/visibility-triggered sync use the Worker.
23. A batch of edits uses bounded network calls and idempotent IDs, and outbound retry uses exponential backoff rather than spikes.
24. Static app shell loads on Cloudflare's free static-asset route; `/api/*` is secure and can fail without preventing cached/local work.
25. No paid features, payment method, premium AI API, purchased domain, or automatic upgrade are required for the shipped version.
26. The project documents measured traffic and storage per simulated daily active user, estimated quota headroom, and a migration/backup process.
27. Build works on narrow iPhone screens and Mac, including installation, refresh, PWA launch, and offline reopen.

## 14. Implementation guidance for a coding agent

1. Treat **Version 4.0** as authoritative over earlier local-only Park specs. **Free Google accounts, private per-user data, and sync are V1 requirements**, alongside the visual parking lot and one-line lot creation.
2. Do not interpret $0 as unlimited. Build for maximum efficient usage under free quotas; **continue working locally** if the API becomes unavailable.
3. Prefer direct Google Identity Services + Cloudflare Worker + D1, rather than accidentally implementing Firebase Auth/Firestore because older draft instructions mentioned Firebase.
4. Use only basic Google identity scopes and securely verify all login tokens server-side; never write a homemade password system or trust a client-provided user ID.
5. All server reads and writes include verified owner authorization. Test cross-user access attacks, sessions, CSRF, and account deletion.
6. Save locally first, queue idempotent mutations, sync in batches with an incremental cursor, and surface conflicts/errors honestly.
7. Apply strict capacity in server-side atomic transactions, not just client-side; preserve rejected offline edits for manual resolution.
8. Keep local-calendar date fields `lot.startOn`, `lot.endExclusive`, and `idea.revisitOn` separate. Use a mock clock in tests.
9. Maintain recognizable **top-down lots** for every category including Someday, not generic cards with car emojis. Use a bottom writing bar, clear drop-off list, and Enter-button morphing car animation after local persistence.
10. Keep server workload small: index by owner, avoid full scans, batch edits, restrict abusive clients, no WebSockets or repeated high-frequency polling.
11. Service-worker caches may hold the public static shell but must never leak account-specific API data. Signing out with unsynced changes must be safe.
12. Before inviting friends, test an actual iPhone PWA, two accounts, two devices, Google production OAuth configuration, and quota-exhaustion scenarios.
13. Keep cloud concerns inside adapters so a future provider change or split across multiple databases can be completed without rewriting product UI.
14. Never claim limitless free scaling, security perfection, guaranteed browser storage persistence, or that an account has synced unless acknowledged.

## 15. Useful technical references

- Apple Human Interface Guidelines — layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple Human Interface Guidelines — motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Apple WWDC 2025 — adopting the new iOS design: https://developer.apple.com/videos/play/wwdc2025/323/
- Apple — install a website as a web app: https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- Apple — web push overview (future only): https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- MDN — storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Vite PWA plugin: https://github.com/vite-pwa/vite-plugin-pwa
- Dexie: https://dexie.org/
- Cloudflare Workers free limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers Static Assets billing: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits (including **500 MB per free database**): https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare D1 free quota enforcement: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Cloudflare D1 indexes: https://developers.cloudflare.com/d1/best-practices/use-indexes/
- Google Identity Services setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Google ID token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Google OAuth testing/production limits: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- Firestore standard free limits (comparison): https://firebase.google.com/docs/firestore/pricing
- Firebase Auth with Identity Platform DAU limit (comparison): https://firebase.google.com/docs/auth/


---

**North star:** Park should feel like dropping an exciting, inconvenient idea into a real little parking lot. It is **saved immediately on-device, synced privately between your devices when available**, visually out of the way, and easy to bring back when its time comes — all without relying on an unlimited free cloud tier.

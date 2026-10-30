# Drop-off landscape and leftward completion

Verified locally on October 27, 2026. This revision supersedes the visual treatment in SINGLE-LINE-ACTIONS.md; the single-line commands remain available.

## Result

Drop-off is a to-do list directly on the grassy coastline. The General miniature and cream card are gone; each parked item is represented once, with a large left-facing car/truck and readable title. Separate car/title targets retain completion versus detail behavior. The list has its own growing band above user lots, including on desktop and tablet. Dated lots keep the illustrated bays, wooded edges, signs, and roads. Richer pixel foliage, vehicle details, an office grove, and a rounded floating composer bring the live scene closer to the reference drawings. Functional text remains HTML, and all artwork remains locally generated SVG.

Completion snapshots the actual car before saving, archives locally, and then sends that car off the left edge in 280ms using transform and the shared ease-out curve. The visual overlay is noninteractive and hidden from assistive technology. Undo, scrolling, navigation and resize cancel it; reduced motion skips travel. Rapid duplicate completion events share a pending guard. A failed local save never starts a departure.

The specification now treats the mockups as the primary visual target and explicitly replaces their pictorial Drop-off lot with the requested open list. Storage still uses protected General; no migration or record reassignment is needed.

## Evidence

- Production build passes.
- 58 unit tests pass.
- 26 browser regressions pass across phone and desktop, including persistence, offline capture, commands, capacity, 50 lots/1,000 items, navigation and completion/Undo.
- `scripts/drop-off-review.ts` passes at 390 and 1440px: measures the real WAAPI overlay against the tapped car, verifies a negative horizontal exit, 280ms duration, Undo, scroll/resize/navigation cancellation, rapid duplicate taps, completed-state persistence through reload, reduced motion and idea-kind detail behavior. The script pauses the real animation for inspectable start/leftward frames; it does not replace the animation implementation.
- `scripts/single-line-visual.ts` verifies 320, 390, 768 and 1440px with empty, populated, command-help and 33-item long-list states, no page errors/horizontal overflow, and clickable navigation after scrolling.
- Browser design inspector: 0 failures, 2 warnings. Warm composer paper and saturated coastal/vehicle colors are intentional reference requirements. `drop-off-inspector.json` contains the measurements.
- Source design lint: 0 failures, 50 warnings (legacy shadows/eyebrows and the intentional vehicle shadow). A repository-wide scan also flags gradients in Playwright's generated HTML report; those are testing-tool UI, not Parker source.

Screenshots: `drop-off-home-390.png`, `drop-off-home-1440.png`, `drop-off-departure-start-*.png`, `drop-off-departure-left-*.png`, plus the refreshed `single-line-*.png` responsive set.

## Visual review

The initial revision still read as a rounded green card and allowed tree canopies to touch the heading. The final revision paints the clearing the same grass color as the surrounding land, removes all container chrome, excludes full tree footprints from content, and adds foliage along real lot curbs. The first-screen hierarchy is now Drop-off heading, individual car/title rows, then dated lots. The coast and original pixel wordmark remain visible at narrow widths.

The existing brand and reference drawings take precedence over the generic dashboard direction. The earlier retained Editorial Greeting seed (1847775643) was not redrawn; its visible greeting is removed because the requested scene and task list provide the heading. No generated or licensed third-party imagery was added. Visual critique: design 8, usability 8, identity 8, content 8; remaining tradeoff is intentionally simplified reusable pixel artwork versus the much denser rendered reference. The implementation follows its composition, palette, perspective and object language while keeping readable real data and responsive controls.

## Scope

Local implementation only; no deployment. Physical iPhone/Safari keyboard and installed-PWA behavior and production OAuth were not revalidated by this visual revision. Earlier release gates remain documented separately. No production data was changed.

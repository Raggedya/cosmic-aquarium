# Tourism Artist Reel Port Audit

## Source of truth

- Live reference: `https://raggedya.github.io/cosmic-aquarium/artist/?artist=workfriend`
- Artist entry template: `templates/artist-machine.html`
- Generated Artist route: `github-pages/artist/index.html`
- Artist runtime: `github-pages/assets/discovery-machine.js`
- Artist reel styling: `app/discovery-machine.css` (generated to `github-pages/assets/discovery-machine.css`)
- Shared mechanical constants: `github-pages/assets/machine-mechanics-core.js`

## Artist implementation traced

### Reel markup and geometry

The Artist Machine is a single `.reel` containing one `.reel-strip` with exactly three fixed-height rows: a preceding `span`, selected `strong`, and following `span`. The strip fills the reel viewport as a three-row grid. The centre row occupies the mechanical payline. The upper and lower rows use small opposing `rotateX` transforms, reduced opacity, and blur. The reel viewport supplies the physical drum artwork, clipping, shadows, and top/bottom masks.

### Animation lifecycle

- Authoritative function: `spinReel(index, finalEntry, stopAfter)` in `github-pages/assets/discovery-machine.js`.
- Artist duration: `2350ms` (`620ms` for reduced motion).
- Per-frame movement: `requestAnimationFrame` updates `translate3d(0, y, 0)` on `.reel-strip`.
- Slot cadence: `mechanicalCadence(progress, index)` from `machine-mechanics-core.js`.
- Cadence profile: launch `124ms`, accelerate to `44ms` by progress `0.18`, cruise to `0.70`, then quadratic deceleration over a `190ms` range.
- Row height: `max(16, reel.clientHeight / 3)`.
- Labels are exchanged only when a cadence boundary is crossed; the DOM contains three stable slots rather than an unbounded scrolling list.
- The winner is selected before motion begins. At completion, the strip transform is cleared and the final entry plus its neighbours are rendered directly into the three fixed slots.
- Final lock animation: `.is-locking` for `260ms`; CSS `reelLock` runs for `200ms` from `translateY(-1.5px)` through `translateY(.7px)` to rest.

### Selection and data coupling

- Artist winner selection uses a shuffle bag before animation (`selectPreparedWinner`).
- Reel-specific Artist data access is limited to `reelLabel(entry)` and `reelIdentity(entry)`.
- Mechanical code needs only an entry collection, stable identity, and display label. This is safe to generalise to `{ id, label }` without carrying Bandcamp or Tourism result data into the reel.

### Audio lifecycle

- Engagement: `reel-stop-lock-mixkit-2857.mp3`, volume `.58`, rate `.9`.
- Spin start: `reel-ratchet-mixkit-2641.mp3`, volume `.66`, rate `.96`.
- Continuous motor: `reel-actual-slotmachine-freesound-261346.mp3`, starting at `.15s`, volume `.42`, rate `1`, not looped.
- Reel stop: `reel-stop-lock-mixkit-2857.mp3`, volume `.72`, rate `1.04` for the single Artist reel.
- Motor stop: six 30ms volume steps, then pause/reset.
- Winner cue: `winner-tonal-bloom-mixkit-3109.mp3`, volume `.58`, rate `1`, capped at `1450ms`.
- Ordering in `runSpin`: engagement -> prepared winner -> motor start -> `spinReel` -> reel stop thunk -> motor fade -> `380ms` evaluation pause -> winner cue.
- The Artist runtime has no item-crossing tick sample and no timer-driven click loop.

### Lever and re-spin

- Lever drag uses `leverResistance(progress)` with exponent `.78` and a `.72` trigger threshold.
- Click/keyboard lever activation uses a 250ms visual pull before calling the same `runSpin('lever')` path.
- Re-spin calls the same authoritative `runSpin('spin_again')` function.

### Responsive behaviour

- Artist reel proportions are percentage-based within the fixed cabinet ratio.
- Artist overrides use one column, `left/right: 22%`, `top: 37%`, `height: 20.2%`.
- Internal typography uses clamped sizes and deterministic `is-long` / `is-very-long` classes.

## Dependencies

- `machine-mechanics-core.js`: cadence and lever resistance.
- Browser `requestAnimationFrame`, `performance.now`, `Audio`, and vibration where available.
- The Artist runtime's catalogue/selection code and Bandcamp result loading are not part of the reel engine.
- Artist CSS provides the physical reel skin and three-row optical hierarchy.

## Song-specific concerns to isolate

- `reelLabel` currently reads `track.title`.
- `reelIdentity` currently reads track IDs.
- `randomEntry`, Artist shuffle-bag selection, Bandcamp preparation, player loading, winner splash, analytics, and ticker copy are product-specific and must stay outside the generic reel.

## Port decision

Extract the traced three-slot row population and `spinReel` requestAnimationFrame lifecycle into a small shared `single-reel-engine.js`. Keep its defaults equal to the Artist implementation. Adapt the Artist runtime to call it without changing Artist constants or callbacks. Adapt Tourism discoveries through `{ id, label }`, while retaining the full `TourismDiscovery` object in the tourism runtime for result-panel mapping.

The approved Bendigo cabinet, outer reel chamber position, lever artwork, information panel, action bank, plaque, and data remain unchanged. Only the active reel internals and the spin/audio lifecycle are replaced by the shared Artist implementation.

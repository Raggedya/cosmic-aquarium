# Tourism Machine Reuse Audit

Milestone: **1 — Tourism Restructure**  
Product boundary: **Things To Do Machine**

The existing music and festival products remain the source of proven interaction patterns, but the tourism implementation has its own templates, runtime, data, assets, persistence namespace, desktop entry point, packaging target, and tests. No tourism code is imported by the existing music runtime.

| Existing system | Current purpose | Decision | Shared-dependency risk | Tourism implementation |
|---|---|---|---|---|
| `discovery-machine.js` reel rendering | Renders and animates music selections | Reusable with adaptation | High: music catalogue and playback are tightly coupled | Tourism runtime uses the same five-row transform pattern and transition timing in a separate module |
| Lever pointer mechanics | Drag/click lever, threshold, return animation | Reusable with adaptation | Medium: current handlers update music states | Equivalent pointer threshold and resisted movement are isolated in `tourism-machine.js` |
| Spin timing | Staged start, motion and stop | Reusable with adaptation | Low if expressed as timing constants | Tourism uses a single-reel timing sequence with the established mechanical cadence |
| Easing/deceleration | Cubic-bezier reel stop | Reusable unchanged conceptually | Low | Same progressive deceleration curve, applied only to the tourism reel |
| Winner selection | Avoid recent artists and choose playable music | Reusable with adaptation | High: artist identity and playability rules are music-only | Generic secure random selection and recent-ID avoidance live in `tourism-machine-core.js` |
| Ticker component | Rotates machine and catalogue messages | Reusable with adaptation | Medium: message construction is Melbourne/music-specific | Tourism ticker modes are READY, SPINNING and RESULT, driven by destination facts |
| Audio manager | Lazily loads and gates machine sounds | Reusable with adaptation | Medium: shared mute key would collide | Tourism reuses approved machine sound assets with a separate `aggits:tourism:*` key |
| Sound toggle | Persists and applies mute state | Reusable with adaptation | Medium | Dedicated tourism control and storage namespace |
| Information/result panel | Artwork and release metadata | Reusable with adaptation | High: Bandcamp player assumptions | Dedicated tourism panel renders image, summary, location, distance and hours |
| Button components | Physical cabinet controls | Not suitable visually | High: five circular music controls conflict with approved layout | Four equal tourism action buttons occupy the approved rectangular bank |
| Machine state model | Controls idle, spin, result and playback states | Reusable with adaptation | High: playback states are music-specific | Small tourism state model: READY, LEVER_PULLED, SPINNING, DECELERATION, RESULT |
| Content loading | Loads generated catalogue JSON | Reusable unchanged conceptually | Medium | Tourism loads and validates its own `tourism-data/bendigo.json` file |
| Asset preloading | Warms cabinet and sound assets | Reusable unchanged conceptually | Low | Tourism preloads its cabinet shell and lazily warms sounds |
| Responsive scaling | Fits a portrait cabinet to viewport | Reusable with adaptation | Low | Tourism uses a fixed 768:1280 stage and `min()`-based viewport fitting |
| Desktop app shell | Tkinter single-window configuration app | Reusable with adaptation | High if the existing app is renamed or its storage reused | New `things_to_do_machine.py` app with its own sections and identity |
| Desktop forms/configuration | Styled fields, cards and save scheduling | Reusable with adaptation | Medium | Tourism-specific destination, discovery, ticker, visuals, preview, publish and settings sections |
| Packaging/build | PyInstaller one-file Windows executable | Reusable unchanged structurally | Low with a separate spec | `ThingsToDoMachine.spec` and `build-things-to-do-machine.ps1` create a distinct executable |
| Executable generation | CI and local Windows builds | Reusable unchanged structurally | Low | Separate workflow and artifact name; existing builds are untouched |
| Persistence/local storage | Draft and settings storage | Reusable with adaptation | High: namespace collision | `%LOCALAPPDATA%/AGGITS Things To Do Machine` and tourism-only browser keys |
| Publishing/export | GitHub workflow dispatch and public URL handling | Reusable later with adaptation | High: production workflow is music-schema-specific | Milestone 1 provides a safe preview and publish-ready shell; no production automation is claimed |

## Reuse rule

Pure interaction ideas are reused. Music-specific catalogue, playback, Bandcamp, artist, album, track, festival, and five-button control code is not imported into the tourism surface. This avoids regressions and prevents visible or structural music leakage.

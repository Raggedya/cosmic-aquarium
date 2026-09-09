# Milestone Status

## Milestone 1A: PIXEL-LEVEL GRAPHICAL CONFORMANCE PASS

Status: **NEEDS REVIEW**

The tourism machine uses the supplied Bendigo image as its canonical cabinet asset at the native 762:1280 proportion. The live layer now adds a perspective-calculated cylindrical reel, continuous acceleration/deceleration, item-indexed ticks, overshoot and recoil, a final lock then ding sequence, a pivoting physical lever, mechanically recessed four-button controls, and a relay-style result reveal. Tourism selection, navigation, persistence and data structures are unchanged.

Review screenshots:

- `artifacts/tourism-production-dormant.png`
- `artifacts/tourism-production-spinning.png`
- `artifacts/tourism-production-deceleration.png`
- `artifacts/tourism-production-result.png`
- `artifacts/tourism-production-button-pressed.png`
- `artifacts/tourism-production-400-*.png`

Browser QA covers 762×1280, high-DPI 400% crops, 1080×1920, laptop, portrait tablet and 390×844 mobile viewports. Lever, reel, result, Share, Map, More Info, Another Idea, Home and Sound interactions remain functional. The attraction photographs remain Milestone 1 placeholders pending production tourism content.

## Milestone 1: TOURISM RESTRUCTURE

Status: **NEEDS REVIEW**

Implementation and automated QA are complete. Human visual approval remains the only milestone gate.

### Deliverables

- Separate Bendigo public tourism machine
- Separate Things To Do Machine desktop application
- Separate Windows executable target
- Tourism data schema and mock Bendigo dataset
- Isolated assets, runtime and persistence namespaces
- Reuse audit, master specification and architecture documentation

### Launch and verification

Build public GitHub Pages with `node --experimental-strip-types scripts/build-github-pages.mjs`, serve `github-pages` with the `/cosmic-aquarium` base, then open `/cosmic-aquarium/tourism/`. The Sites route is `/tourism`.

Run the desktop app from source with `python desktop/things_to_do_machine.py`.

Build the separate Windows executable with `powershell -ExecutionPolicy Bypass -File desktop/build-things-to-do-machine.ps1`.

Output: `desktop-dist/ThingsToDoMachine.exe`.

### Files created

- tourism template, CSS, browser runtime, core helpers, generated routes and supplied Bendigo cabinet reference
- typed tourism schema and mock Bendigo data
- tourism desktop app, persistence helpers, preview server, icon, PyInstaller spec and build script
- separate Windows CI workflow and tourism-specific TypeScript/Python tests

### Files modified

- `scripts/build-github-pages.mjs` — validates and emits isolated tourism targets
- `.gitignore` — excludes tourism build environment and QA artifacts
- `desktop/README.md` — documents the separate tourism target

### Reused and refactored systems

- Reused: mechanical reel timing, lever resistance, lazy audio, sound toggle, recent-selection avoidance, viewport fitting, Tkinter shell and PyInstaller pattern.
- Refactored: generic tourism selection, state-driven ticker, place result data, and tourism-only desktop persistence.

### Verification recorded

- 97/97 TypeScript tests pass, including six tourism tests
- 67/67 Python tests pass, including five tourism desktop/schema tests
- TypeScript typecheck passes
- Vinext build passes and contains `/tourism`
- GitHub Pages build passes and contains `/cosmic-aquarium/tourism/`
- ESLint passes with eight pre-existing warnings and zero errors
- `ThingsToDoMachine.exe` builds and starts; desktop smoke test confirms all seven sections and ten mock discoveries
- Browser QA confirms READY → SPINNING/DECELERATION → RESULT from both Another Idea and the lever
- Browser QA confirms equal four-button geometry and no overflow at desktop and 390×844 phone viewport
- Browser console reports zero errors or warnings
- Existing Sites project verified; deployment intentionally left unchanged pending human approval

### Known compromises / remaining review

- The ten Bendigo entries are demonstration content, not production tourism data.
- Discovery images use the approved cabinet reference as a temporary placeholder.
- Remote tourism publishing is deliberately disabled until a tourism-specific production workflow is approved.
- Final sound design, live hours and live distance services remain later milestones.

### Existing-product regression result

Existing music and festival source templates/runtimes were not edited. Their full TypeScript and Python suites pass. Tourism uses separate browser and desktop storage namespaces.

### Human approval checklist

- [ ] Bendigo header and cabinet match the supplied reference hierarchy.
- [ ] No analogue gauges are visible; the tall reel owns the centre.
- [ ] Dormant reel/result panel are appropriately dark.
- [ ] Lever position and “PULL FOR A NEW IDEA” affordance feel correct.
- [ ] Result image/text panel proportions are approved.
- [ ] Four actions are equal, aligned and readable.
- [ ] Lower Bendigo plaque and slogan remain intact.
- [ ] Desktop section names and workflow shell are appropriate for Milestone 2 planning.

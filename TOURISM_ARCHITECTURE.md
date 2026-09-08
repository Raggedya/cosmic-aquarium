# Tourism Product Architecture

```text
data/tourism/bendigo.json
        │ validated during build and again in browser
        ▼
templates/tourism-machine.html
        │
        ├── app/tourism-machine.css
        ├── github-pages/assets/tourism-machine-core.js
        ├── github-pages/assets/tourism-machine.js
        └── public/tourism-machine/bendigo-tourism-cabinet-reference.jpg
        │
        ▼
scripts/build-github-pages.mjs
        │
        └── github-pages/tourism/index.html
            github-pages/tourism-data/bendigo.json
            github-pages/assets/tourism-machine/*

app/tourism/page.tsx
        └── public/tourism/index.html (same isolated runtime for Sites)

desktop/things_to_do_machine.py
        ├── desktop/tourism_config.py
        ├── desktop/ThingsToDoMachine.spec
        └── desktop/build-things-to-do-machine.ps1
                └── desktop-dist/ThingsToDoMachine.exe
```

## Boundaries

- Existing music/festival templates, runtime and desktop applications do not import tourism files.
- The tourism browser namespace is `aggits:tourism:*`.
- The tourism desktop namespace is `%LOCALAPPDATA%/AGGITS Things To Do Machine`.
- Tourism data is stored under `data/tourism` and generated to `tourism-data`.
- The static surface is mirrored into `public/tourism` for the Sites `/tourism` route; both targets use the same template, CSS, runtime and data.
- The build script validates required destination and discovery fields before emitting the route.

## Shared behaviour, isolated implementation

The existing machine established reliable mechanical timing, lever resistance, lazy audio loading, recent-result avoidance and viewport fitting. Milestone 1 preserves those behaviours in small tourism-specific modules because importing the existing runtime would also import music catalogue, playback and Bandcamp dependencies. Future extraction into a genuinely generic package should occur only after both products have stable contracts and shared tests.

## Extension points

- Replace the mock JSON through the tourism desktop workflow.
- Add a publishing workflow accepting the tourism schema.
- Add verified data providers behind the same schema.
- Add hours/distance services without modifying the reel engine.
- Add destinations by generating another validated configuration file and route.

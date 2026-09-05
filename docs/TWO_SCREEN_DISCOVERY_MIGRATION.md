# Cosmic Aquaria two-screen discovery migration

Updated: 2026-09-05

## Audit findings

- Canonical public URL: `https://raggedya.github.io/cosmic-aquarium/`. It is the destination embedded in the universe QR generator, catalogue URLs, Worker admin copy action, and public documentation.
- Public deployment: `.github/workflows/deploy-pages.yml` builds and publishes `github-pages/` to GitHub Pages on a manual workflow dispatch.
- Secondary deployment: `.openai/hosting.json` points at the owner-gated Sites project `project-b-side`; it is not the anonymous public listener.
- Catalogue source: `github-pages/artists/*.json` contains 207 published release manifests, representing 201 canonical artists and 2,077 tracks. `github-pages/aquariums.json` is the generated discovery registry. No catalogue row needs to be copied or rewritten for this pivot.
- Bandcamp playback: manifests retain official public `bandcampEmbedTrackId` values and exact track/release URLs. The listener uses Bandcamp's public embedded player and does not proxy audio.
- Availability: published/disabled state is maintained in the Worker and published status in the static registry. Failed manifest/player initialization is handled by selecting another eligible release.
- Analytics: the public Worker at `https://cosmic-aquaria.andrewharris501.workers.dev` accepts existing anonymous event types. The replacement maps its interactions onto those compatible events, preserving the current D1 analytics schema.
- Legacy routes: `/<release-slug>/` and `/collections/<slug>/` were separate listener pages. They are retained as durable redirects into the canonical root, using `?release=<slug>` or `?categories=<water>` where possible.
- Deep links and sharing: the canonical player state is `/?release=<release-slug>&categories=<comma-separated-waters>`.
- Audio analysis limitation: an official Bandcamp iframe is cross-origin and does not expose its audio stream to this origin's `AudioContext`. The spectrum display therefore remains explicitly decorative/idle. It is not presented as live audio analysis.

## Classification

### KEEP

- `github-pages/artists/*.json`
- `github-pages/aquariums.json`
- `github-pages/artists-index.json`
- `automation/` ingestion and research data
- `scripts/build-github-pages.mjs`
- `scripts/sync-worker.mjs`
- `services/cosmic-worker/`
- `src/adapters/bandcamp-link-adapter.ts`
- QR assets and the canonical URL
- GitHub Pages deployment workflow

### REPURPOSE

- `templates/universe-index.html` becomes the canonical two-screen shell.
- `templates/artist-index.html` becomes a release deep-link redirect.
- `templates/collection-index.html` becomes a category/root redirect.
- Existing Worker analytics event names are reused with richer metadata.
- Existing water/category assignments become union-filterable release categories.

### DEPRECATE

- `src/features/universe-doorway/UniverseDoorway.tsx`
- `src/features/cosmic-aquarium/CosmicAquarium.tsx`
- `github-pages/assets/doorway.js`
- `github-pages/assets/site.js`
- the prior per-artist and collection listener experiences

These remain in source temporarily for ingestion/build-history compatibility, but are no longer emitted as active public experiences.

### REMOVE LATER

Remove deprecated React/static listener code only after the replacement has been stable in production and no remaining build, admin, or ingestion dependency references it. This migration deliberately avoids destructive deletion.

## Migration risks and controls

- GitHub Pages has no server rewrites, so legacy URLs use immediate client/meta redirects rather than returning a server-side 301.
- A static registry is appropriate for the current 207 releases and remains practical into the low thousands. The next scaling step is a read-only Worker endpoint accepting multiple categories; the listener contract is isolated so that change does not require a visual rewrite.
- Bandcamp iframe transport state and audio samples are not available cross-origin. Playback is real and official; spectrum animation is not falsely coupled to it.
- The selection-to-player effect uses bounded DOM/canvas work and stops all animation when hidden or when reduced motion is requested.

## Data migration result

- Existing release manifests found: 207
- Published/eligible release registry entries: 207
- Canonical artists represented: 201
- Tracks retained: 2,077
- Duplicate release URLs removed: 0
- Records rewritten: 0
- Records deleted: 0
- Catalogue migration required: no


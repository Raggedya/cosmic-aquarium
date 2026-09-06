# Melbourne Music Machine repository audit

This audit records the systems retained for the AGGITS single-screen Melbourne Music Machine conversion.

## Reused source-of-truth systems

- `github-pages/aquariums.json`: generated listener-facing Melbourne catalogue. It currently contains 500 validated Melbourne artists and is filtered by the Melbourne membership audit during every public build.
- `github-pages/artists/*.json`: per-release manifests containing artist identity, real Bandcamp release URLs, official Bandcamp embed track IDs, playable tracks, release metadata, locations, tags and water classification.
- `automation/melbourne/membership.json`: canonical Melbourne-only eligibility layer. The public build excludes non-Melbourne and unresolved artists.
- `github-pages/artists-index.json` and `github-pages/artist-search-index.json`: compact generated artist indexes. They remain available for routes and future features; reels do not duplicate artist data.
- `github-pages/universe-stats.json`: generated Melbourne-only artist, release, track and suburb counts. Machine labels use these values rather than hard-coded catalogue claims.

## Reused application logic

- Secure artist-first selection and session repeat avoidance from `discovery-machine-core.js`.
- URL validation, playable-track selection and Bandcamp manifest validation from `discovery-machine-core.js`.
- Official Bandcamp iframe construction and release purchase links from the current player.
- Artist/release/track ticker construction, Melbourne culture messages and concise factual biographies.
- Existing analytics endpoint, event vocabulary and send-beacon/fetch fallback.
- Query-string release deep links and Web Share/clipboard fallback.
- Persistent sound preference, visibility handling and reduced-motion handling.
- Existing analogue L/R meter rendering approach, retuned from emerald to warm vintage hardware.
- Existing licensed impact recordings, layered with lightweight Web Audio motor/relay synthesis for the mechanical choreography.

## Front-end retired from the listener path

- The two-screen selector, genre keys, GO fracture transition and separate player composition.
- Search/genre mode switching on the opening screen.
- NEXT as an exposed button. A fresh lever pull now performs the next discovery while preserving artist-first fairness.

The retired code is replaced only at the public machine entry point. Catalogue manifests, artist routes, collections, validation, Melbourne geography, ingestion and daily growth remain intact.

## Data integrity and truthful counts

The reference artwork says “23,000 songs,” but the current Melbourne-only public build contains 3,744 verified playable Bandcamp tracks. The machine reads `universe-stats.json` and presents the generated total. It never duplicates the catalogue or claims unverified tracks.

## Playback limitation

Bandcamp playback is cross-origin. The machine therefore uses the official embedded player and does not claim access to real audio samples. VU movement is coupled to transport interaction and machine state, with damped procedural ballistics; it is decorative rather than a measured stereo signal.

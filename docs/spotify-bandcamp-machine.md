# AGGITS Spotify + Bandcamp Music Discovery Machine

## Frozen visual contract

`public/music-machine/aggits-spotify-bandcamp-canonical.png` is the immutable 1024 × 1536 visual source. The web experience places functional HTML controls over its existing title, meter, reel, player and lower-button apertures. The source image is never recoloured, redrawn, cropped or structurally reinterpreted.

## Shared systems reused

- `discovery-machine-core.js`: secure randomisation and shuffle-bag selection.
- `machine-mechanics-core.js`: lever resistance and mechanical timing.
- `single-reel-engine.js`: three-row single-reel population, animation and lock.
- Existing licensed AGGITS machine sounds for motor, ratchet, gear travel and lock.
- Existing Cloudflare `/api/activity` analytics store and daily reporting totals.
- Existing GitHub Pages build and publishing output.
- Existing Artist Machine Factory executable, now with an integrated `SPOTIFY + BANDCAMP` top-level mode.

## New systems

- A frozen-geometry machine template and overlay stylesheet.
- A retractable mechanical shutter over an official Spotify iframe.
- An artist-level Spotify/Bandcamp discovery catalogue with 20 proof-of-concept records.
- Separate `OPEN IN SPOTIFY` and `BUY / EXPLORE ON BANDCAMP` actions.
- Explicit machine states: `BOOT`, `IDLE`, `LEVER_PULL`, `PANEL_CLOSING`, `SPIN_START`, `SPINNING`, `RESULT_LOCK`, `PANEL_OPENING`, `PLAYER_REVEALED`, `PLAYING`, and `ERROR`.

## Interaction and analytics map

| Interaction | State/result | Analytics event |
|---|---|---|
| Machine loads | `BOOT → IDLE` | `spotify_machine_loaded` |
| Lever passes resistance/clicks | `LEVER_PULL → SPIN_START` | `lever_pull` |
| Reel starts | `SPIN_START → SPINNING` | `spin_started` |
| Reel locks | `SPINNING → RESULT_LOCK` | `artist_selected`, `spin_completed` |
| Shutter retracts | `RESULT_LOCK → PANEL_OPENING → PLAYER_REVEALED` | `panel_opened`, `spotify_embed_shown` |
| Spotify iframe receives focus | `PLAYER_REVEALED → PLAYING` | `spotify_player_interacted` |
| Open Spotify | external official Spotify URL | `open_spotify_clicked` |
| Open Bandcamp | external artist Bandcamp URL | `bandcamp_clicked` (plus the existing `bandcamp_click` report event) |
| Spin Again | close panel then spin | `spin_again_clicked`, `panel_closed`, normal spin events |

Only privacy-safe session and interaction metadata is sent. No personal identity or Spotify account information is collected.

## Spotify platform limitations

The machine uses Spotify's official embed rather than a simulated player. Browsers and Spotify control playback permissions: playback cannot be forced to autoplay, some content may require the user to sign in or open Spotify, playback availability varies by territory/account, and the host page cannot inspect detailed playback inside the cross-origin iframe. The experience therefore reveals the embed and asks the visitor to press Spotify's own Play control.

## Data extension contract

The source catalogue is `data/spotify/artist-discovery.json`. A record supports:

`id`, `artistName`, `trackTitle`, `spotifyUri`, `spotifyEmbedUrl`, `spotifyOpenUrl`, `bandcampUrl`, `artistImage`, `bioShort`, `genre`, `location`, `label`, `albumTitle`, `releaseYear`, `artistWebsite`, and `customTickerText`.

The proof of concept uses official track-level Spotify embeds wherever Spotify exposes a playable track for the artist. Godspeed You! Black Emperor currently uses its official artist embed because Spotify did not expose a playable top-track record during validation. Optional descriptive fields remain null rather than being invented.

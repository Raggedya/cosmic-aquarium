# AGGITS Spotify + Bandcamp Music Discovery Machine

## Standard-machine visual contract

The Spotify + Bandcamp route is rendered from `templates/artist-machine.html`, the same canonical template used by Standard Artist Machines and the shared basis of Festival Mode. It uses the standard cabinet, title window, meters, single three-row reel, payline, winner reveal, ticker/player display, four-button bank, lever, responsive geometry, typography and mechanical timing. Spotify is a playback/data adapter, not a separate jukebox design.

## Shared systems reused

- `discovery-machine-core.js`: secure randomisation and shuffle-bag selection.
- `machine-mechanics-core.js`: lever resistance and mechanical timing.
- `single-reel-engine.js`: three-row single-reel population, animation and lock.
- Existing licensed AGGITS machine sounds for motor, ratchet, gear travel and lock.
- Existing Standard Machine state controller, meter transport, winner reveal, history, share and reset behaviour in `discovery-machine.js`.
- Existing Cloudflare analytics store and daily reporting totals.
- Existing GitHub Pages build and publishing output.
- Existing Artist Machine Factory executable, now with an integrated `SPOTIFY + BANDCAMP` top-level mode.

## Spotify additions

- A Spotify mode adapter inside the shared Standard Machine runtime.
- Official Spotify playback controls fitted to the Standard Machine's PLAY control.
- An artist-level Spotify/Bandcamp discovery catalogue with 20 proof-of-concept records.
- The selected-track display links to Spotify, while `VISIT BANDCAMP` remains a separate action.

## Interaction and analytics map

| Interaction | State/result | Analytics event |
|---|---|---|
| Machine loads | `BOOT → IDLE` | `spotify_machine_loaded` |
| Lever passes resistance/clicks | `LEVER_PULL → SPIN_START` | `lever_pull` |
| Reel starts | `SPIN_START → SPINNING` | `spin_started` |
| Reel locks | Standard winner reveal | `artist_selected`, `spin_completed` |
| Spotify embed loads | `READY_TO_PLAY` | `panel_opened`, `spotify_embed_shown` |
| Spotify iframe receives focus | `PLAYING` | `spotify_player_interacted` |
| Open Spotify | external official Spotify URL | `open_spotify_clicked` |
| Open Bandcamp | external artist Bandcamp URL | `bandcamp_clicked` (plus the existing `bandcamp_click` report event) |
| Spin Again | close panel then spin | `spin_again_clicked`, `panel_closed`, normal spin events |

Only privacy-safe session and interaction metadata is sent. No personal identity or Spotify account information is collected.

## Spotify platform limitations

The machine uses Spotify's official embed rather than a simulated player. Browsers and Spotify control playback permissions: playback cannot be forced to autoplay, some content may require the user to sign in or open Spotify, playback availability varies by territory/account, and the host page cannot inspect detailed playback inside the cross-origin iframe. The experience therefore reveals the embed and asks the visitor to press Spotify's own Play control.

## Data extension contract

The source catalogue is `data/spotify/artist-discovery.json`. A record supports:

`id`, `artistName`, `trackTitle`, `spotifyUri`, `spotifyEmbedUrl`, `spotifyOpenUrl`, `bandcampUrl`, `artistImage`, `bioShort`, `genre`, `location`, `label`, `albumTitle`, `releaseYear`, `artistWebsite`, and `customTickerText`.

All 20 proof-of-concept records use official track-level Spotify embeds. Optional descriptive fields remain null rather than being invented.

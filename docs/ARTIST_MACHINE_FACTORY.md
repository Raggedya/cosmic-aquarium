# Artist Machine Factory

The Artist Machine Factory creates new one-band machines without changing the locked player, reel, lever, control or winner engine.

## Production contract

Every machine moves through the same states:

`intake → catalogue verified → reference-driven skin generated → candidate QA → internal preview → explicit approval → production build → deployment`

Candidate work is isolated under `automation/artist-machine-factory/candidates/`. A candidate cannot enter `automation/artist-machines/` or the public asset directory until the approval command is run and all validation passes.

The factory stops instead of publishing when it cannot verify the complete public catalogue, find playable Bandcamp embed identifiers, load the standard skin or a supplied reference image, generate the locked skin geometry, or complete the 30-spin no-repeat audit.

## Standard intake

Copy `automation/artist-machine-factory/intake.example.json` and supply:

- artist name, artist-owned Bandcamp URL and city;
- approved biography and optional ticker passages;
- an optional visual reference image for colour, tone and surface character;
- optional internal request and delivery details.

Leave the reference path blank to use the standard red AGGITS artist jukebox skin. When supplied, the reference path may be absolute or relative to the intake file. Credentials never belong in an intake file.

## Operator sequence

### 1. Prepare the candidate

```powershell
python scripts/artist_machine_factory.py prepare --intake C:\intakes\artist.json
```

This ingests the public catalogue once, deduplicates it by Bandcamp track identifier and validates playback and purchase destinations. With no reference image it copies the standard red 747 × 1280 AGGITS artist jukebox skin unchanged. With a reference image it analyses palette, brightness, contrast, saturation, texture and composition, then generates a fresh single-reel skin from the locked AGGITS machine. Reference atmosphere and restrained motifs are transferred into decorative areas while every live control zone remains protected. Art-direction notes such as dark, bright, vibrant or gritty tune the treatment. The factory then runs 30 deterministic discovery selections. The result is immediately ready for its private preview when all checks pass.

The automatic process is local and deterministic: it does not require an image API key, does not invent artist text or logos, and never uploads the private reference image. Advanced operators may still replace a generated skin with the `attach-skin` command before approval.

### 2. Build an isolated approval preview

```powershell
python scripts/artist_machine_factory.py preview --slug artist-slug
```

The command creates and audits a self-contained local preview bundle under `artifacts/artist-machine-factory/<slug>/preview`. The audit requires the artist configuration, complete catalogue, Bandcamp address, generated skin and every single-reel runtime module before the preview may open. Serve that folder locally and open `/cosmic-aquarium/artist/?artist=<slug>`. It does not alter the production registry.

### 3. Audit without changing anything

```powershell
python scripts/artist_machine_factory.py check --slug artist-slug --candidate
```

### 4. Approve and promote

```powershell
python scripts/artist_machine_factory.py approve --slug artist-slug --approved-by "Approver name"
```

Approval records the engine version, approver, timestamp, source report and skin checksum. It then promotes the configuration and skin, rebuilds the public output and runs the full machine test suite. If a quality check fails, the prior production configuration and skin are restored.

The desktop Factory deploys only after explicit approval. When a delivery email is supplied, it registers that address privately with the Cloudflare Worker and sends the permanent link through Resend only after the production deployment succeeds. The address and delivery receipt never enter the public repository. The public link format is:

`https://raggedya.github.io/cosmic-aquarium/artist/?artist=<slug>`

## What remains immutable

- single reel and three-row geometry;
- lever and RE-SPIN shared action;
- four-second winner splash;
- player and Bandcamp lifecycle;
- SHARE, PLAY, VISIT BANDCAMP and RE-SPIN console;
- responsive layout, sounds, meters and accessibility;
- the city machine and Melbourne library.

New artist work is limited to catalogue data, approved editorial copy and the automatically generated geometry-compliant jukebox skin.

## Integrated Festival Mode

The Factory now has `STANDARD MODE` and `FESTIVAL MODE` tabs. Standard Mode remains the existing artist/label pipeline. Festival Mode uses the same managed Git workspace, catalogue importer, festival single-reel runtime, Bandcamp player, preview server, protected publisher and reporting transport.

Festival projects are stored separately under `%USERPROFILE%\AGGITS\Artist Machine Factory\festival-projects\<festival-id>\project.json`. Each record preserves festival identity, copied poster/branding files, raw OCR candidates, the corrected lineup, automatic and manual Bandcamp match evidence, approval decisions, the imported music library, machine settings, reporting coverage and the published URL.

Poster reading runs locally. The packaged RapidOCR models inspect both the original and a contrast-enhanced image; an installed Tesseract is a fallback. Results are reconciled across passes, obvious festival/date/ticket/sponsor text is removed, duplicates and joined column readings are reduced, and the operator reviews the remaining names. OCR is deliberately not trusted as final editorial data.

Bandcamp matching checks name similarity, public profile identity, direct festival links when available, catalogue playability and search candidates. Results are labelled Confirmed, Likely, Ambiguous or Not Found. A manually entered URL is fetched and must expose public catalogue material before it can be approved. Only rows explicitly marked approved are imported.

The generated festival config continues to use `machineMode: festival` and the existing `/festival/?festival=<slug>` route. The current Festival Machine template and `discovery-machine.js` retain the reel, lever, Bandcamp player, buy, re-spin, share and event paths. Festival-specific title, year, header/background artwork and optional website control are configuration rather than a forked player.

Festival Mode uses the same standard, single-reel AGGITS jukebox shell as Standard Mode. There is no separate wooden cabinet or entrance-door presentation. Festival Mode also accepts a complete replacement jukebox skin: drag or browse for a PNG, JPG, JPEG or WEBP exported from the canonical `1024 × 1536` Festival template. The Factory validates the exact canvas, records the template version and SHA-256 manifest, copies the skin into the private Festival project, applies the canonical overlay coordinate map in private preview, and packages the skin with the published Festival Machine. `USE STANDARD RED SKIN` removes the custom selection and restores the built-in red cabinet without changing the music library.

The analytics Worker uses its existing generic event table; no D1 schema migration is required. Festival events carry the festival slug/name and surfaced artist. The daily report now aggregates Festival Machine opens, visitors, spins, artists surfaced, tracks played, Bandcamp and artist-link clicks, buy intent, shares and leading artists.

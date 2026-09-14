# Artist Machine Factory

The Artist Machine Factory creates new one-band machines without changing the locked player, reel, lever, control or winner engine.

## Production contract

Every machine moves through the same states:

`intake → catalogue verified → reference-driven skin generated → candidate QA → internal preview → explicit approval → production build → deployment`

Candidate work is isolated under `automation/artist-machine-factory/candidates/`. A candidate cannot enter `automation/artist-machines/` or the public asset directory until the approval command is run and all validation passes.

The factory stops instead of publishing when it cannot verify the complete public catalogue, find playable Bandcamp embed identifiers, decode the reference image, generate the locked skin geometry, or complete the 30-spin no-repeat audit.

## Standard intake

Copy `automation/artist-machine-factory/intake.example.json` and supply:

- artist name, artist-owned Bandcamp URL and city;
- approved biography and optional ticker passages;
- one visual reference image for colour, tone and surface character;
- optional internal request and delivery details.

The reference path may be absolute or relative to the intake file. Credentials never belong in an intake file.

## Operator sequence

### 1. Prepare the candidate

```powershell
python scripts/artist_machine_factory.py prepare --intake C:\intakes\artist.json
```

This ingests the public catalogue once, deduplicates it by Bandcamp track identifier, validates playback and purchase destinations, analyses the reference image's palette, brightness, contrast, saturation, texture and composition, then generates a complete 747 × 1280 single-reel jukebox skin from the locked AGGITS machine. Reference atmosphere and restrained motifs are transferred into decorative areas while every live control zone remains protected. Art-direction notes such as dark, bright, vibrant or gritty tune the treatment. The factory then runs 30 deterministic discovery selections. The result is immediately ready for its private preview when all checks pass.

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

Deployment and the final email remain deliberate post-approval operations. The public link format is:

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

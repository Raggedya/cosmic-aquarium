# Artist Machine Factory

The Artist Machine Factory creates new one-band machines without changing the locked player, reel, lever, control or winner engine.

## Production contract

Every machine moves through the same states:

`intake → catalogue verified → skin attached → candidate QA → internal preview → explicit approval → production build → deployment`

Candidate work is isolated under `automation/artist-machine-factory/candidates/`. A candidate cannot enter `automation/artist-machines/` or the public asset directory until the approval command is run and all validation passes.

The factory stops instead of publishing when it cannot verify the complete public catalogue, find playable Bandcamp embed identifiers, decode the artwork, satisfy the locked skin geometry, or complete the 30-spin no-repeat audit.

## Standard intake

Copy `automation/artist-machine-factory/intake.example.json` and supply:

- artist name, artist-owned Bandcamp URL and city;
- approved biography and optional ticker passages;
- a visual reference image;
- an approved cabinet skin when it is ready;
- optional internal request and delivery details.

Reference and skin paths may be absolute or relative to the intake file. Credentials never belong in an intake file.

## Operator sequence

### 1. Prepare the candidate

```powershell
python scripts/artist_machine_factory.py prepare --intake C:\intakes\artist.json
```

This ingests the public catalogue once, deduplicates it by Bandcamp track identifier, validates playback and purchase destinations, copies the visual reference into the isolated job, emits a skin-generation brief and runs 30 deterministic discovery selections.

If no final skin was supplied, the candidate stops safely at `awaiting_skin`.

### 2. Generate and attach the approved skin

Use the candidate's `skin-brief.json` and copied reference image for the image-generation/review step. The factory does not pretend visual interpretation can be fully automated. The protected geometry is defined once in `skin-contract.json`.

```powershell
python scripts/artist_machine_factory.py attach-skin --slug artist-slug --skin C:\approved\artist-cabinet.jpg
```

The skin must retain the 747:1280 cabinet ratio, be at least 700 by 1200 pixels, decode successfully and remain below 5 MB.

### 3. Build an isolated approval preview

```powershell
python scripts/artist_machine_factory.py preview --slug artist-slug
```

The command creates a self-contained local preview bundle under `artifacts/artist-machine-factory/<slug>/preview`. Serve that folder locally and open `/cosmic-aquarium/artist/?artist=<slug>`. It contains only the candidate's catalogue and skin; it does not alter the production registry.

### 4. Audit without changing anything

```powershell
python scripts/artist_machine_factory.py check --slug artist-slug --candidate
```

### 5. Approve and promote

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

New artist work is limited to catalogue data, approved editorial copy and a geometry-compliant cabinet skin.

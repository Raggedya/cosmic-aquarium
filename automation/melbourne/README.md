# Cosmic Aquaria — Melbourne universe

The live listener catalogue is built only from canonical artists whose entry in
`membership.json` has `eligible: true`. Source manifests remain untouched in
`github-pages/artists`; non-Melbourne data is quarantined by exclusion, not
deleted.

## Geography and publication rule

- Metropolitan Melbourne is the Victorian Government's 31-LGA definition.
- Localities are derived from authoritative Vicmap Admin locality and LGA
  boundaries by `scripts/refresh_melbourne_geography.py`.
- A location of `Victoria` or `Australia` alone never proves Melbourne.
- Automatic publication requires `MELBOURNE_CONFIRMED`, confidence
  `CONFIRMED` or `HIGH`, and at least one usable Bandcamp track.
- Possible, unknown, and conflicting locations go to `review/location-review.json`.
- Confirmed non-Melbourne artists go to
  `quarantine/non-melbourne-index.json` and remain recoverable.

## Commands

```text
npm run catalogue:melbourne-geography
npm run catalogue:melbourne-audit
npm run build:pages
```

Refresh geography only as an explicit reviewed operation. Deployment does not
perform network geocoding.

## Global-catalogue backup and restore

The immutable pre-migration source snapshot is Git tag
`pre-melbourne-universe-2026-09-06` (commit `4b1e919`). It contains the full
global source catalogue, generated indexes, automation state, classifications,
and permanent routes.

To inspect it without altering the working tree:

```text
git show pre-melbourne-universe-2026-09-06:github-pages/artists-index.json
```

To restore in a separate checkout, create a branch from the tag. Do not delete
or overwrite the Melbourne branch.

## Suggestions

The selector's `ADD TO OUR RADAR` action opens a structured GitHub candidate
issue with status `MELBOURNE_CANDIDATE`. A suggestion is never published
automatically. It must pass artist identity, canonical Bandcamp URL, Greater
Melbourne location, playability, deduplication, and water classification gates.

## Retired global automation

The old global 5,000-artist workflow is preserved but hard-disabled. The daily
schedule is paused. Manual daily runs now reject candidates that lack confirmed
Greater Melbourne location evidence and rebuild membership before publication.
The migration sync archives missing global Worker rows by setting them disabled;
it does not delete catalogue or analytics records.

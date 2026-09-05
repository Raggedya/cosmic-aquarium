# Cosmic Aquaria bulk library expansion

The bulk programme grows the canonical catalogue to 5,000 validated artists. A
normal batch accepts at most 500 new canonical artists; the final batch accepts
only the number still required to reach 5,000.

## Status

Run:

```text
python scripts/bulk_library_status.py
```

The command audits manifests and generated indexes, reports the current target
gap, playable-track count, water and country distributions, broken records, and
the active/review batch state.

## Batch procedure

1. Dispatch `Cosmic Aquaria Bulk Library Expansion` with `dry_run=true`.
2. Inspect the generated report in `automation/bulk/reports/` and the 25-record
   artist sample. A dry run never writes artist manifests or release history.
3. Correct systemic quality issues and resume the same dry-run batch ID. Its
   candidate and decision state is durable.
4. Dispatch the same batch number with `dry_run=false`. Publishing is refused
   unless its matching dry-run report is complete.
5. The workflow rebuilds all public indexes, runs JavaScript and Python tests,
   verifies the exact accepted target, commits the batch, deploys Pages, and
   attempts a full Worker catalogue sync.

Each accepted artist must have a stable artist-owned Bandcamp identity, at least
one verified playable Bandcamp track, one or more waters, a valid purchase page,
provenance, and ticker-ready `bioShort`/`bioSource` metadata. Label-hosted,
compilation, malformed, duplicate, and ambiguous entities go to review and do
not count toward the 5,000 target.

## Resume and idempotency

Batch state lives in `automation/bulk/dry-runs/` or
`automation/bulk/batches/`. Re-running the same command skips terminal candidate
decisions. For a publish interrupted between atomic manifest and state writes,
the next run reconciles manifests bearing the batch ID into both release history
and batch state before continuing.

Each numbered batch reads a later window of the balanced Bandcamp discovery
feeds, so subsequent batches do not simply repeat the first 1,000 candidates.

## Backup and restore

The pre-programme snapshot is stored outside the deploy tree at:

```text
artifacts/bulk-library/backups/pre-bulk-5000-2026-09-06.zip
```

Its SHA-256 checksum is:

```text
1DCAB52D5A2BC9FF2558D91651C193A807CBB3E233378E98C144A80A7C1AFAE9
```

To restore, first stop all publishing workflows and preserve the failed state.
Verify the checksum, extract to a temporary directory, inspect the paths, then
copy only the intended catalogue, manifest, and automation files back into the
repository. Rebuild with `npm run build:pages` and run the full test suite before
committing or deploying. Never extract the archive blindly over an active
working tree.

## Daily discovery

Bulk mode does not replace `.github/workflows/daily-discovery.yml`. Once the
5,000 target is reached, no further bulk batch is allowed and the normal
approximately-20-per-day discovery workflow remains the steady-growth path.

# Master Library migration baseline — 2 September 2026

Backup: `backups/20260902T064054Z`

| Check | Result |
|---|---:|
| Existing Artist Aquarium editions | 206 |
| Canonical Bandcamp artists | 200 |
| Additional release editions retained under existing artists | 6 |
| Editions missing a canonical Artist ID | 0 |
| Existing published routes retained | 206 |
| Existing parent Collections | 1 |

No Artist Aquarium manifest was deleted or renamed. The six-edition difference represents retained additional releases, not discarded artists. The generated Master Library selects one primary Aquarium per canonical Bandcamp artist while all 206 edition routes remain available.

The backup includes the source automation data, all Artist JSON manifests, generated Master/Aquarium indexes and the worker migrations. Restore those files and rebuild the public catalogue to reverse local catalogue changes.

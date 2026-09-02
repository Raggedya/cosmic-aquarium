# Cosmic Aquaria Master Library architecture

## North star

One Bandcamp artist host creates one canonical Artist record and one primary Artist Aquarium. Locations, Labels, Styles, Daily Discovery and curated Collections store memberships that point back to that Artist. They never own copies of an Artist Aquarium.

```text
World doorway
  └─ Collection (location, label, style, daily, curated)
       └─ collection_artist membership
            └─ canonical Artist
                 ├─ primary Artist Aquarium
                 └─ Artist releases / tracks
```

The canonical identity key is the normalized Bandcamp artist subdomain. Album and track URLs on the same subdomain resolve to the same Artist ID. A canonical Artist may retain multiple release Aquarium records, while exactly one is selected as its primary public Artist Aquarium.

## Authoritative data

- `github-pages/artists/*.json` contains release/track manifests used by existing Artist Aquarium routes.
- `github-pages/artists-index.json` is the generated Master Library index.
- `automation/collections/*.json` contains reviewable parent Collection definitions and canonical artist memberships.
- `github-pages/collections/*.json` is the generated public Collection catalogue.
- Cloudflare D1 is the query/reporting copy used for fair random selection, analytics and administration.

Existing Artist URLs are not rewritten. Generated indexes are additive views over those stable manifests.

## Collection model

The shared Collection model currently supports Location, Label, Style (`genre` internally for database compatibility), Daily and Curated doorways. Future collection types can reuse the same membership and filter boundary.

A Location membership carries verification status, evidence, confidence, source, visibility and an administrator-override flag. Only visible `verified` and `high_confidence` memberships are eligible publicly.

The seven canonical Styles are generated collections: Heavy, Dreamy, Quiet, Electronic, Dark, Loud and Strange. Style assignment does not create another Artist or Aquarium.

## Location workflow

1. Open **Locations** in the Windows control room.
2. Enter an unambiguous place such as `Melbourne, Australia`.
3. Research runs as a background GitHub job and conservatively checks public sources.
4. Candidate identities are normalized and deduplicated against the Master Library.
5. Verified existing artists are reused; missing verified Artist Aquaria may be built once.
6. The resulting Location remains a draft until the administrator publishes it.
7. The public Location doorway offers the centre Location world plus the seven Style waters.
8. A selected artist enters their canonical Artist Aquarium with a contextual parent route.

Research never downloads protected audio, bypasses access controls or makes public runtime pages dependent on a live Bandcamp research request.

## Label workflow

The administrator supplies a label name and its public website or roster page. Only explicit Bandcamp links on that page are considered. Existing canonical artists are reused; missing Artist Aquaria are built once; the Label collection remains a draft until published.

## Contextual navigation

Collection entry adds a same-origin `parent` route. The existing delayed top control validates that route and returns to the parent Collection. Direct Artist links retain global Home behaviour. Cross-origin parent values are rejected.

## Fair discovery and scale

Eligibility is query-driven by publication state, membership visibility, verification and optional Style. Selection is shuffled/random after filtering, excludes a short session-local recent list, and never uses popularity. Public collection pages render only the active 10/14-object pool, not the full membership.

## Publishing and recovery

Artist, Location and Label publishing retain stable slugs. A newly researched Collection starts as a draft. The Windows control room invokes the existing serialized GitHub publishing workflows and remains responsive while jobs run.

Before schema or catalogue migration, copy `automation/`, Artist manifests, generated indexes and D1 migrations into a timestamped `backups/` directory. To roll back local data, restore those directories from the matching backup, rebuild Pages, run the full test suite and sync the catalogue. D1 migrations are forward-only; restore a D1 backup before applying a migration if database rollback is required.


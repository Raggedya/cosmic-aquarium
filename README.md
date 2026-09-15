# Cosmic Aquaria

Cosmic Aquaria is a two-screen independent-music discovery machine. A listener breaks one or more glass category controls, presses GO, and receives a random eligible Bandcamp release in the canonical player. The public listener is one data-driven application; releases do not receive bespoke front ends.

The canonical public URL is:

`https://raggedya.github.io/cosmic-aquarium/`

See [the two-screen migration audit](docs/TWO_SCREEN_DISCOVERY_MIGRATION.md) for the preservation boundary, legacy redirects, and Bandcamp audio-analysis limitation.

## Creator workflow

The Windows Studio asks for four things:

1. band or artist name
2. official Bandcamp URL
3. delivery email
4. one of seven independent visual flower worlds

Create dispatches the GitHub Actions workflow. The workflow imports public page metadata when it is available, generates a release manifest, renders and independently decodes the QR artwork, and publishes the catalogue. Publishing then adds the finished machine to the Factory's persistent email queue. **Send Email Batch** delivers up to five finished links and scan-tested QR cards together in one email, independently from publication. A new release becomes eligible in the shared listener without a bespoke UI build.

The Windows build is produced as `desktop-dist/Cosmic Aquaria Studio.exe` by `desktop/build-windows.ps1`. GitHub Actions also offers a downloadable Windows artifact.

Approved Artist Machines also receive two automatic sharing assets: a 1200 × 630 AGGITS jukebox preview card with the band name in the illuminated title panel, and a scan-verified QR card based on the canonical AGGITS floral format. Each artist is published at `/artist/<artist-slug>/` with its own Open Graph and Twitter metadata. The QR card points to that permanent page and is attached to the post-deployment delivery email.

## Email delivery reuse

The Studio dispatches an isolated delivery workflow in `Raggedya/groove-vultures-deep-cuts-fan-challenge`, where the working Resend credentials already live. No secret value is copied, exposed, or duplicated in this repository.

## Bandcamp boundary

Cosmic Aquaria does not download protected audio and does not pretend a public catalogue API exists. Bandcamp's documented API is intended for labels and fulfilment partners and requires approved OAuth access. The public creator therefore uses a bounded, user-initiated read of the supplied Bandcamp page and official embedded-player track IDs where those pages expose them.

If public metadata is unavailable, the experience remains functional and sends discovery to the exact supplied Bandcamp URL without fabricating tracks. Bandcamp remains the listening, purchase and support platform.

Official references:

- https://bandcamp.com/developer
- https://get.bandcamp.help/en/articles/15263071-how-do-i-create-a-bandcamp-embedded-player

## Publishing

The Pages workflow deploys `github-pages/`. Durable release links follow:

`https://raggedya.github.io/cosmic-aquarium/?release=<release-slug>&categories=<category-list>`

Historical `/<artist-or-release-slug>/` URLs remain generated, but redirect into the canonical player. Historical style collection URLs preserve their category when returning to the canonical selection screen. The owner-gated Sites deployment redirects to the same canonical public application when next deployed.

## Master Library and Collections

The Windows Studio is also the private control room for the canonical Master Library, Locations, Labels, Styles, Daily Discovery, Published Aquaria and Themes. The governing rule is **one Artist, one primary Artist Aquarium, many Collection doorways**. Album and track URLs on the same Bandcamp artist host resolve to the same canonical Artist identity.

Locations and Labels contain memberships, verification evidence and publishing state; they do not contain copies of Artist Aquaria. The seven Styles are generated over the same canonical artists. See [the architecture and operator workflow](docs/master-library-architecture.md) and [the migration baseline](docs/migration-report-2026-09-02.md).

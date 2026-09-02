# Cosmic Aquaria Studio

A Windows creator and private control room for publishing and operating Cosmic Aquaria.

The interface asks for only:

- band or artist name
- official Bandcamp URL
- delivery email
- one of seven visual flower worlds selected by thumbnail

The Library area exposes the canonical Master Library plus Locations, Labels, Styles, Daily Discovery, Published Aquaria and Themes. Search, filtering and sorting operate over the generated catalogue. Location and Label research run in serialized background workflows, reuse canonical Artist Aquaria and create reviewable Collection drafts before publication.

Create dispatches the repository's `create-artist.yml` workflow using the authenticated GitHub CLI. GitHub builds the artist page, imports public track metadata when available, creates and independently decode-verifies the floral QR, and publishes GitHub Pages. The Studio then hands the finished link and QR to the existing secret-enabled Resend workflow.

At creation time, the same public Bandcamp response is checked for an artist storefront. Editions with purchasable music or merchandise reveal the restrained Buy Music invitation after the first discovery; editions without a verified storefront do not show it.

## First use

1. Install GitHub CLI and run `gh auth login`.
2. Run `desktop\build-windows.ps1`.
3. Open `desktop-dist\Cosmic Aquaria Studio.exe`.

Email delivery reuses the existing secret-enabled Deep Cuts repository. Cosmic Aquaria does not need a duplicate Resend key.

No Bandcamp account credentials or protected audio are stored. When public metadata cannot be read safely, the page retains the living flower experience and routes discovery to the supplied official Bandcamp URL.

# Cosmic Aquarium Studio

A deliberately minimal Windows creator for publishing artist editions.

The interface asks for only:

- band or artist name
- official Bandcamp URL
- delivery email

Create dispatches the repository's `create-artist.yml` workflow using the authenticated GitHub CLI. GitHub builds the artist page, imports public track metadata when available, creates and independently decode-verifies the floral QR, publishes GitHub Pages, and sends the link and QR through Resend.

## First use

1. Install GitHub CLI and run `gh auth login`.
2. Add `RESEND_API_KEY` and `REPORT_FROM_EMAIL` to the repository Actions secrets. `REPORT_RECIPIENT` is an optional default.
3. Run `desktop\build-windows.ps1`.
4. Open `dist\Cosmic Aquarium Studio.exe`.

No Bandcamp account credentials or protected audio are stored. When public metadata cannot be read safely, the page retains the living flower experience and routes discovery to the supplied official Bandcamp URL.

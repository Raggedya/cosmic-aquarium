# Cosmic Aquarium

Cosmic Aquarium turns a Bandcamp artist into a living flower-based discovery experience. Every generated edition has its own GitHub Pages URL and scan-verified floral QR artwork.

## Creator workflow

The Windows Studio asks for three things:

1. band or artist name
2. official Bandcamp URL
3. delivery email

Create dispatches the GitHub Actions workflow. The workflow imports public page metadata when it is available, generates an artist manifest, creates the page, renders and independently decodes the QR artwork, publishes GitHub Pages, and sends the link and QR through Resend.

The Windows build is produced as `dist/Cosmic Aquarium Studio.exe` by `desktop/build-windows.ps1`. GitHub Actions also offers a downloadable Windows artifact.

## Required repository secrets

- `RESEND_API_KEY`
- `REPORT_FROM_EMAIL`
- `REPORT_RECIPIENT` (optional default)

GitHub does not allow an existing repository secret value to be read or copied. Add the same Resend account credential to this repository once; after that every artist edition reuses it.

## Bandcamp boundary

Cosmic Aquarium does not download protected audio and does not pretend a public catalogue API exists. Bandcamp's documented API is intended for labels and fulfilment partners and requires approved OAuth access. The public creator therefore uses a bounded, user-initiated read of the supplied Bandcamp page and official embedded-player track IDs where those pages expose them.

If public metadata is unavailable, the experience remains functional and sends discovery to the exact supplied Bandcamp URL without fabricating tracks. Bandcamp remains the listening, purchase and support platform.

Official references:

- https://bandcamp.com/developer
- https://get.bandcamp.help/en/articles/15263071-how-do-i-create-a-bandcamp-embedded-player

## Publishing

The Pages workflow deploys `github-pages/`. Artist URLs follow:

`https://raggedya.github.io/cosmic-aquarium/<artist-slug>/`

The primary Sites deployment continues to serve the polished development version and manifest-driven artist routes.

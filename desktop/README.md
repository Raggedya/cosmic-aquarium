# Cosmic Aquaria Studio

## Things To Do Machine

The tourism product is a separate desktop application and executable target. Run it from source with `python desktop/things_to_do_machine.py`, or build `desktop-dist/ThingsToDoMachine.exe` with `powershell -ExecutionPolicy Bypass -File desktop/build-things-to-do-machine.ps1`. Its configuration is stored under `%LOCALAPPDATA%/AGGITS Things To Do Machine` and does not share the Festivals draft/settings namespace.

A Windows creator and private control room for publishing and operating Cosmic Aquaria.

The interface asks for only:

- band or artist name
- official Bandcamp URL
- delivery email
- one of seven visual flower worlds selected by thumbnail

The Library area exposes the canonical Master Library plus Locations, Labels, Styles, Daily Discovery, Published Aquaria and Themes. Search, filtering and sorting operate over the generated catalogue. Location and Label research run in serialized background workflows, reuse canonical Artist Aquaria and create reviewable Collection drafts before publication.

Create dispatches the repository's protected publication workflow using the authenticated GitHub CLI. GitHub builds the artist page, imports public track metadata when available, creates and independently decode-verifies the floral QR, and publishes GitHub Pages. The Factory records each finished machine in a local, restart-safe email queue. **Send Email Batch** delivers the next group of up to five finished links and QR cards in one secret-enabled Resend message; email delivery cannot block publication.

At creation time, the same public Bandcamp response is checked for an artist storefront. Editions with purchasable music or merchandise reveal the restrained Buy Music invitation after the first discovery; editions without a verified storefront do not show it.

## First use

1. Install GitHub CLI and run `gh auth login`.
2. Run `desktop\build-windows.ps1`.
3. Open `desktop-dist\Cosmic Aquaria Studio.exe`.

Email delivery reuses the existing secret-enabled Deep Cuts repository. Cosmic Aquaria does not need a duplicate Resend key.

No Bandcamp account credentials or protected audio are stored. When public metadata cannot be read safely, the page retains the living flower experience and routes discovery to the supplied official Bandcamp URL.

## AGGITS Artist Machine Factory dashboard

`artist_machine_factory_dashboard.py` is the private Windows front end for the locked Artist Machine pipeline. It presents one guided form for:

- band / artist name, official Bandcamp URL and city
- verified bio and line-by-line ticker copy
- an optional colour / tone reference image; blank uses the standard red AGGITS skin
- visual notes, approver and delivery details

The dashboard keeps reference material and candidates in a private folder under Local AppData. It maintains an isolated working copy of the repository and processes the complete playable Bandcamp catalogue. With no reference image it uses the standard red AGGITS jukebox skin unchanged. With a reference image it analyses the palette, light, contrast, texture and composition and transfers that visual character into a fresh skin while protecting the live controls. It validates the skin contract, audits a complete localhost approval bundle and submits only the approved machine configuration and skin to the protected production workflow. The workflow rebases safely, runs the build and full test suite, promotes only a passing candidate, deploys GitHub Pages, and returns the permanent machine link.

Build the portable dashboard and its per-user Windows installer with:

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build-artist-machine-factory.ps1
```

Outputs:

- `desktop-dist\AGGITS Artist Machine Factory.exe`
- `desktop-dist\Install AGGITS Artist Machine Factory.exe`

The installed dashboard uses the existing authenticated GitHub CLI connection. Source/reference images are never pushed to the public repository.

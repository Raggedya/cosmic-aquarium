# Artist Music Machine

Artist Music Machines use the Melbourne Music Machine's shared cabinet, player,
lever, sound, winner and responsive systems. Each published machine is data,
not a separate application.

## Create a machine

Run the catalogue importer with an artist's public Bandcamp URL:

```powershell
python scripts/create_artist_machine.py https://artist.bandcamp.com
```

The importer follows the artist's public music catalogue, validates playable
Bandcamp tracks, deduplicates repeated album/single representations, captures
release artwork and writes a configuration to `automation/artist-machines/`.
The normal site build validates that configuration and publishes the catalogue.

Published machines use this permanent GitHub Pages route:

```text
/artist/?artist=artist-slug
```

An optional selected-track deep link is maintained as:

```text
/artist/?artist=artist-slug&track=track-slug
```

## Enquiry delivery

The public form submits to the existing Cloudflare Worker. It validates the
request server-side, uses a honeypot and IP/email rate limits, stores requests in
D1, and sends the owner notification through the existing Resend integration.

Configure the recipient with `ARTIST_MACHINE_REQUEST_EMAIL` (falling back to
`OWNER_EMAIL`) and the sender with `ARTIST_MACHINE_REQUEST_FROM_EMAIL` (falling
back to `REPORT_FROM_EMAIL`). Credentials remain Worker secrets and are never
included in the browser bundle.

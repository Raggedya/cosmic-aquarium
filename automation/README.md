# Daily discovery boundary

Cosmic Aquaria performs one bounded request per daily run to Bandcamp's public Discover view, requesting the `new` album slice that Bandcamp itself presents to unauthenticated visitors. It then reads only the public album pages needed to create up to twenty Aquariums, with short delays between requests.

This Discover endpoint is public but is not part of Bandcamp's documented partner API, so it is treated as a replaceable provider rather than a permanent contract. The job does not authenticate as a fan, bypass access controls, fetch protected audio, or copy album artwork. If the public response changes or is unavailable, the batch remains `generation_pending`, records the failure, and can be resumed without duplicating completed releases.

Bandcamp's documented API is designed for approved labels and fulfilment partners and does not expose a general new-release catalogue. If Cosmic Aquaria later receives approved API access or an artist-submission feed, that provider can replace the current bounded Discover adapter without changing Aquarium generation, batches, email, or analytics.

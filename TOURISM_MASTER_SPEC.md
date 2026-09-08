# Things To Do Machine — Master Specification

## Milestone 1 boundary

The first implementation is Bendigo, Victoria. It is a structurally complete tourism discovery machine using a small clearly marked demonstration dataset. Automated research, scraping, live hours, live distance calculation, production content generation, accounts, payments and analytics dashboards are outside this milestone.

## Public experience

The public machine follows the supplied timber-and-brass reference: destination header, title plaque, tall single reel, right-side lever, result panel, four equal actions and lower destination plaque. The former music gauges and playback controls are absent.

States:

1. `READY` — reel and result panel dormant; instruction reads “PULL THE LEVER”.
2. `LEVER_PULLED` — lever crosses its resistance point and initiates a spin.
3. `SPINNING` — reel illuminates and cycles destination names while regional facts appear.
4. `DECELERATION` — reel slows using a mechanical easing curve.
5. `RESULT` — the selected discovery locks to the centre and its details/actions illuminate.

Actions are exactly: **Share This**, **View on Map**, **More Info**, **Another Idea**.

## Configuration shell

The separate desktop product provides Destination, Discoveries, Ticker Content, Visuals, Preview, Publish and Settings sections. It persists only tourism data and previews the tourism machine. Milestone 1 intentionally leaves remote publishing as a clearly labelled future workflow.

## Accessibility and responsive behaviour

The lever and controls are keyboard operable, state changes use an ARIA live region, button hit areas match their visual cells, reduced-motion users receive a short non-animated transition, and the portrait cabinet scales without changing its 768:1280 composition.

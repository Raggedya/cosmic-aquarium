# Two-screen listener visual QA

Automated Chromium review on 2026-09-05.

| Viewport | Rendered machine | Page overflow | Console errors |
| --- | --- | --- | --- |
| 390 × 844 | 390 × 666 | none | 0 |
| 393 × 852 | 393 × 671 | none | 0 |
| 430 × 932 | 430 × 734 | none | 0 |

The canonical 750:1280 device proportion is preserved and vertically centred rather than stretched. The review selected DARK + STRANGE and verified two visibly distinct deterministic fracture patterns. The player proof resolved a real eligible release and populated an exact release URL plus official numeric Bandcamp track embed ID.

Interaction smoke results:

- ANYTHING selected alone and was cleared by selecting QUIET.
- GO reveal began after 1,906 ms as observed by Playwright (including input dispatch and manifest preparation); the source hold constant is exactly 1,500 ms.
- NEXT selected a different release while retaining QUIET.
- browser Back returned to category selection with QUIET still selected.
- no uncaught page or console errors were observed.
- the spectrum is marked `data-analysis="unavailable"`; it is not represented as audio-reactive.

## Live production smoke

After the GitHub Pages deployment, the same mobile browser suite verified the public HTTPS URL:

- title: `Cosmic Aquaria — Independent music discovery`
- exactly two listener screens and eight category controls
- 390 × 844 body matched the viewport with no overflow
- DARK + STRANGE resolved João Jardel — *Megapop*
- BUY MUSIC exactly matched the stored release URL
- the official Bandcamp iframe used numeric track ID `4150286046`
- direct player refresh restored the same release
- the legacy release URL redirected to `?release=joao-jardel-megapop`
- the legacy DARK style URL reopened the canonical selector with DARK selected
- `/admin/` returned 404 on the public static origin
- the public Worker health endpoint returned 200
- no uncaught page or console errors were observed

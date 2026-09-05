# Two-screen discovery — forensic VFX closeout

The product design, geometry, hierarchy, and interaction model remained locked. This pass addressed only the residual cues that revealed browser compositing when inspected at 400% device scale.

| Rank | Perceptual damage | Browser tell | Correction |
|---:|---|---|---|
| 1 | Critical | First category impact briefly exposed the pristine tile and a duplicate live label while the fracture bitmap decoded. | All eight deterministic fracture plates are preloaded before interaction. |
| 2 | Critical | Independently scaled selector and player slices produced perfectly straight compositing seams. | Both screens now render from continuous photographic chassis plates; hit areas remain real controls. |
| 3 | High | Lossy WebP ringing and block texture appeared around bright glass rims at inspection zoom. | Canonical plates and selected states now use lossless WebP encoding. |
| 4 | High | Non-DARK selected states retained faint baked typography beneath the live label. | Selected plates are composited from label-clean glass before the live type is added. |
| 5 | High | The player clean-up pass dragged highlights vertically through the display. | The dynamic aperture is rebuilt as a seeded low-frequency glass field, with no cloned highlight columns. |
| 6 | High | Original player artist and transport glyphs survived as faint ghosts behind live content. | Static copy and timing regions are removed at asset-build time, including feathered edge cleanup. |
| 7 | Medium | Uniform CSS scanlines and a repeated diagonal sheen crossed unrelated physical surfaces. | The global procedural overlays were removed; photographed microtexture now carries the material. |
| 8 | Medium | CSS radial bubbles duplicated the photographed bubbles and repeated identical optics. | Synthetic bubble layers are disabled; only the canonical photographic bubbles remain. |
| 9 | Medium | The 32 broad spectrum wedges read as DOM shapes rather than luminous instrument needles. | The display now uses 48 narrow, independently seeded light filaments with a photographic-strength baseline. |
| 10 | Medium | The mandatory return control read as a generic web pill and long metadata used obvious UI truncation. | `HOME` is now a small recessed instrument control; dynamic type scales by content length instead of relying on visible browser ellipses. |

## Verification renders

- `artifacts/two-screen-vfx-closeout/final/final-v4-selector-390x844.png`
- `artifacts/two-screen-vfx-closeout/final/final-v4-selector-dark-390x844.png`
- `artifacts/two-screen-vfx-closeout/final/final-v4-player-390x844.png`
- `artifacts/two-screen-vfx-closeout/final/inspection-400pct/final-v4-400pct-selector-390x844.png`
- `artifacts/two-screen-vfx-closeout/final/inspection-400pct/final-v4-400pct-player-390x844.png`
- `artifacts/two-screen-vfx-closeout/final-breaks-preloaded/`

The 400% proof uses a device scale factor of 4 rather than post-capture enlargement, so raster decoding, CSS compositing, text antialiasing, and subpixel seams are inspected at render time.

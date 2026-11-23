# Mappo 0.2.12 E01b — Whole-city PNG export

**Status:** Merged in [PR #124](https://github.com/xbwtyz/Mappo/pull/124). [Post-merge CI](https://github.com/xbwtyz/Mappo/actions/runs/45095188784) passed and [Issue #110](https://github.com/xbwtyz/Mappo/issues/110) is closed. Publishing requires separate approval.

| Checkpoint | Contract and acceptance |
|---|---|
| P1 — Framing | Developed city includes ordinary road and bridge strokes, block and plaza vertices, properties, plots, building footprints and enabled built defenses, including gate connections. Water and terrain boundary edges do not drive developed framing. Full survey uses the accepted survey boundary and serves as the fallback for an empty developed extent. Add a margin equal to 4% of the longest unpadded span on each side. |
| P2 — Rendering | Render accepted city data with the shared map renderer on a detached canvas and separate camera. Use active layer flags and normal map background, grid, compass and scale. Keep editing overlays and drafts outside the export, including when the live map displays a preview. Neither canvas allocation nor encoding enters project, camera, selection, recovery or edit history. |
| P3 — Size and failure | Preserve fitted aspect ratio to whole-pixel rounding. Offer 2,048 and 4,096 px longest-side presets, independent of monitor pixel ratio. The larger preset caps a single RGBA pixel buffer at 64 MiB before browser and encoding overhead. Free the detached canvas after encoding/download and surface failures in the Project menu. |
| P4 — Controls | Add framing, resolution and displayed dimensions under **Project → Whole-city PNG**, reusing the optional filename. Keep **Download visible map (PNG)** for the current canvas. |
| P5 — Verification | Node fixtures cover bounds, fallback and rejected dimensions. Offline browser QA runs the built HTML under Firefox and Chromium, verifies actual downloads and dimensions, compares images across a live draft and zoom change, verifies layer handling and checks workspace preservation and encoder failure recovery. Full CI on the review commit remains the merge gate. |

## Implementation references

- [Framing and detached export](../../../src/data/whole-city-png.js)
- [Shared map renderer](../../../src/renderer/canvas.js)
- [Offline browser acceptance](../../../scripts/whole-city-png-browser-qa.mjs)

## Acceptance measurements

The Large organic default-seed fixture generated 363 buildings. Both desktop browsers produced a valid 4,096 × 2,824 survey PNG from the offline standalone. In one automated run, render/encode took 112/350 ms in Chromium and 172/284 ms in Firefox. Timings are diagnostic. The preset bounds the canvas allocation before rendering, and end-to-end memory and timing depend on the browser and map.

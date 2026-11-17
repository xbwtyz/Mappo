# Mappo

**Mappo** is an offline-first procedural medieval city mapper, distributed as a single HTML file and developed as modular JavaScript.

## Current release: 0.1-dev.1 — Foundation / survey

This first development milestone is a **functional application shell**, not yet a full city generator. It provides:

- A responsive cartography workspace with Canvas 2D drawing, zoom, pan, fit and coordinate readout.
- Deterministic seeded **site surveys**, with selectable small/medium/large footprints, survey boundaries and planning markers.
- A working generation form, random seed button, survey details and keyboard shortcuts.
- Fully offline operation when the built HTML is opened directly from `file://`.
- A zero-dependency Node build script that generates both `index.html` and `dist/mappo-0.1-dev.1.html`.

**Not implemented yet:** city streets, blocks, buildings, walls, districts, real map editing, project import/export, PNG export or 3D. Site-survey marks are not roads or buildings.

## Try it

Open [`dist/mappo-0.1-dev.1.html`](dist/mappo-0.1-dev.1.html) directly in Firefox/Chromium, no server or install needed. The root `index.html` is identical, for possible static hosting.

Controls: drag canvas to pan; scroll to zoom; `0` to fit; `+`/`-` to zoom. Enter a seed, change size or click **Surprise me** to generate another site survey. URL parameters `?seed=my-seed&size=large` also work.

## Develop and build

Requires Node.js 20+ for the build/test scripts; **not** needed to run the finished HTML.

```bash
npm test
npm run build
npm run check
```

There are no runtime libraries, CDN requests or npm dependencies. The small build tool resolves the project's simple named ES module imports into one self-contained script. Keep source modules' top-level identifiers distinct; the builder checks unsupported import/export syntax.

## Source structure

- `src/core/`: deterministic PRNG, geometry, city data model.
- `src/generators/`: survey footprint generator (future road/building generators live here).
- `src/renderer/`: Canvas drawing and world-space camera.
- `src/ui/`: pointer interaction.
- `src/app.js`: application orchestration.
- `styles/`: app design system.
- `scripts/build.mjs`: reproducible standalone HTML builder.
- `tests/`: regression tests.

## Mappo 0.1 development milestones

1. **0.1-dev.1** (this release): app foundation, seed and survey, Canvas navigation, modular build.
2. **0.1-dev.2**: city boundary, connected roads, irregular blocks and central plaza.
3. **0.1-dev.3**: building footprints, districts and optional fortifications.
4. **0.1-dev.4**: labels, palettes and procedural visual polish.
5. **0.1-dev.5**: inspector, basic edits, project JSON and image export.
6. **0.1.0**: stress testing, documentation, browser validation and release.

Copyright © 2026 Mappo contributors. New implementation; no code from Watabou/MFCG included.

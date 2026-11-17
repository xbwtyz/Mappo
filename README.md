# Mappo

**Mappo** is an offline-first procedural medieval city mapper. Its application is developed as modular JavaScript and distributed as **one standalone HTML file**.

## Current development build: 0.1-dev.2 — City Geometry

Generate a medieval city plan from a seed, explore it on an interactive canvas, and inspect the structure of its street network. This release adds genuine geometric city data rather than simply drawing a picture.

### Features

- **Deterministic generation:** the same seed and settlement size produce the same city plan.
- **Three sizes:** small hamlet, medium town and large city.
- **Connected street graph:** every road junction is connected; roads are classified as primary streets, secondary streets or lanes.
- **Irregular city blocks:** uniquely identified polygons bounded by the streets, with cross-block lanes and no disconnected or dangling segments.
- **Central civic plaza:** a persistent named plaza whose boundary shares real junctions with the street graph.
- **Cartographic rendering:** drawn on Canvas 2D with zoom, pan, fit-to-view, compass, scale bar and survey-boundary guide.
- **City data model:** durable IDs for nodes, roads, blocks and the plaza, ready for later selection, building placement and project saving.
- **Truly standalone release:** complete CSS and JavaScript are compiled into `index.html` and `dist/mappo-0.1-dev.2.html`. No network, external libraries, runtime installation or web server needed.

**Not yet implemented:** building footprints, districts, walls, terrain editing, road editing, project save/load, PNG export, or 3D. The green polygons currently represent **empty city blocks**, not buildings. These are scheduled for later milestones.

## Try it

Open [`dist/mappo-0.1-dev.2.html`](dist/mappo-0.1-dev.2.html) directly in your browser. The identical `index.html` exists at the repository root for convenient static hosting.

- **Generate city layout:** enter a seed and press the generation button.
- **Surprise me:** create a random seed.
- **Size selector:** generate a small, medium or large settlement.
- **Navigate:** drag to pan, scroll to zoom, `0` to fit, `+` / `-` to adjust zoom.
- **Direct linking:** `?seed=my-seed&size=large` provides a reproducible initial layout when hosted.

## Development

Node.js 20+ is needed only when working on the source. The output HTML runs without Node or an internet connection. There are no npm dependencies.

```bash
npm test
npm run build
npm run check
```

The zero-dependency build script assembles named ES modules and embeds all CSS/JS in the HTML template. It verifies that source imports are local, and the build tests verify distribution parity and inline script syntax. Do not add runtime CDN requests. The build script supports the narrow import/export syntax presently in use, not the full JavaScript module grammar.

## Project organization

```text
src/
  core/                 seeded randomness, geometry, city data model
  generators/           survey and city layout generation
  renderer/             canvas drawing and camera
  ui/                   canvas mouse and pointer controls
  app.js                generation, navigation, status and UI binding
styles/app.css          styling
index.template.html     standalone HTML template
scripts/build.mjs       reproducible browser distribution builder
tests/                  deterministic generation, planar geometry, UI and bundle tests
dist/                   self-contained HTML releases
index.html              same standalone build, suitable for static hosting
```

### Geometry notes

The city generator builds a deterministic irregular ring-and-spoke street lattice and then adds cross-block lanes. All intersections, including lane endpoints, are explicit shared graph vertices. City block polygons refer to the same vertex IDs. This makes it possible to build later editing and placement features without trying to infer network connectivity from rendered pixels. The algorithm intentionally favors geometric reliability and a recognizable city pattern at this stage; later releases can introduce more varied layout structures.

## Roadmap to 0.1.0

1. **0.1-dev.1** — Application foundation, seeded site survey and Canvas controls (complete).
2. **0.1-dev.2** — Connected streets, irregular blocks and civic plaza (this build).
3. **0.1-dev.3** — Building footprints, district generation and optional fortifications.
4. **0.1-dev.4** — Visual styles, labels and procedural polish.
5. **0.1-dev.5** — Inspector, basic editing, editable project JSON, image export.
6. **0.1.0** — Browser verification, stress tests, documentation and distribution release.

Copyright © 2026 Mappo contributors.

# Mappo

**Mappo** is an offline-first procedural medieval city mapper. The source is modular JavaScript; every development milestone also ships as **one standalone HTML file** that works without an internet connection, CDN, npm packages, or a web server.

## Current development build: 0.1-dev.3a — Settlement Morphology

**Four city growth patterns**, not just a stretched version of the same circular town:

- **Radial** — ring-and-spoke roads around a central civic square. Preserves the prior milestone's seeded street geometry.
- **Organic** — asymmetric perimeter, curved and staggered streets, and irregular building-block polygons.
- **Linear** — an elongated trade corridor with roads following a bending central axis and transverse streets.
- **Planned** — a nearly orthogonal street grid within a softly chamfered rectangular city extent.

All presets produce explicit, **connected road-junction graphs**, city blocks with persistent vertex identifiers, and a civic plaza. Streets have classifications: primary, secondary, and connecting lanes. The Canvas 2D map supports zoom, pan, fit-to-view, compass and scale bar.

### Run the release

Open **[`dist/mappo-0.1-dev.3a.html`](dist/mappo-0.1-dev.3a.html)** in any modern desktop browser. The repository root `index.html` is identical and can be served as a static website.

- Enter a seed, choose a small/medium/large size and a **settlement layout**; click **Generate city layout**.
- Changing size or layout also regenerates the map using the current seed.
- **Surprise me** picks a random seed.
- Drag on the map to pan, use the scroll wheel to zoom, press `0` to fit, or `+` / `-` to change the zoom.
- For hosted deployments, `?seed=demo&size=large&shape=organic` links to a reproducible configuration. The `shape` parameter also accepts `radial`, `linear`, and `planned`.

**Not implemented yet:** buildings, district identities, walls/towers/gates, hand-editable roads, geography editing, project save/load, PNG export, or 3D. The tinted polygons are **empty city blocks**. Building footprints are next, in 3B.

## Build & test

Develop with Node.js 20 or later. No external package installation is needed.

```bash
npm run check  # rebuild HTML, then run the automated tests
npm test       # tests for geometry, reproducibility and compiled HTML
npm run build  # regenerate index.html and dist/mappo-0.1-dev.3a.html
```

The build script traverses local ES module imports and embeds the JavaScript and CSS in the HTML template; it rejects external runtime imports. `index.html` and the versioned file in `dist/` are generated from the same sources and are identical.

## Repository layout

```text
src/
  core/           PRNG, geometry and the persistent city model
  generators/     survey boundary and per-morphology road/block generation
  renderer/       Canvas 2D rendering and camera
  ui/             pointer-based map navigation
  app.js          generation controls, state and status
styles/app.css    app visual design
index.template.html
scripts/build.mjs
index.html        auto-generated standalone output
dist/        versioned standalone HTML releases
tests/            seeded geometry, browser bundle and UI regression tests
```

The shared data model stores `options.morphology` and every street junction as a node with a stable ID. Roads refer to node endpoints. Blocks refer to ordered vertices from those same nodes. The civic square is an explicit polygon whose edges align with street junctions. This prevents future building-placement features from having to infer geography from rendered pixels.

### Why the city shapes are different

Radial uses an angular, multi-ring lattice. Organic uses a warped and curved planar mesh within a lobed settlement boundary. Linear uses a long, gently curved main travel corridor with secondary cross streets. Planned uses a near-orthogonal grid with seed-controlled spacing. All are seeded and make reproducible project data. No roads are drawn purely as decoration.

## Release roadmap

1. **0.1-dev.1** — Application shell, seeded survey and navigation (complete)
2. **0.1-dev.2** — Connected roads, irregular blocks and civic plaza (complete)
3. **0.1-dev.3a** — Four settlement morphologies (complete; current build)
4. **0.1-dev.3b** — Building footprints and land-parcel population (future)
5. **0.1-dev.3c** — District identities and names (future)
6. **0.1-dev.3d** — Walls, gates and towers (future)
7. **0.1-dev.4** — Rendering styles and visual polish (future)
8. **0.1-dev.5** — Inspector, project JSON persistence and PNG export (future)
9. **0.1.0** — Release hardening, cross-browser testing, documentation and distribution (future)

Copyright © 2026 Mappo contributors.

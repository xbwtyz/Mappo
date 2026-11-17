# Mappo

Mappo is an offline procedural medieval city mapper. Development uses modular JavaScript; each milestone also ships as one standalone HTML file with embedded code and styles.

## Current build: 0.1-dev.3b — Buildings & Properties

Draw a city boundary, place its main square, and generate connected streets, varied properties and building footprints inside it. Boundary shape and street pattern are independent: a horseshoe, branching outline or twin-core settlement can use any of the four street patterns.

Open [`dist/mappo-0.1-dev.3b.html`](dist/mappo-0.1-dev.3b.html) directly in a modern desktop browser. No installation, server, network connection or external assets are required. The root `index.html` is the identical compiled file for static hosting.

### Workflow

1. Choose **Freehand** and drag an outline; release to close it. Alternatively, use **Click points**, place the corners, and press **Close outline** or Enter.
2. Use **Edit points** to drag corners. Double-click an edge to add a corner; select a corner and press Delete to remove it. **Undo edit** reverses outline and center changes.
3. Choose **Place main square**, then click inside the boundary, away from the edge. Mappo initially chooses a location with room for a square.
4. Select an **Organic**, **Planned**, **Radial** or **Linear** street pattern, street density and seed. Click **Generate city**.

Changing street settings does not reshape your boundary. **New street seed** regenerates within the same outline and keeps the chosen center. Density changes block spacing, not the size of a custom outline. Use **Revert edits** to restore the outline, center and settings of the last generated city.

Eight editable starting outlines are available: rounded, organic, long, rectangular, wedge, twin-core, branching and horseshoe. Select one and click **Use**, then adjust it. Applying a preset changes the draft; it does not silently replace the generated city.

Draft boundaries show handles and a dashed outline; the previous street plan is faded. Click Generate to apply the draft. Invalid outlines show an explanation and retain the last good generated city.

### Buildings and properties

Blocks now contain street-facing properties with seeded variation in width, depth, spacing and occupancy. Larger sites are allocated before small-plot infill. A property can combine two or three neighboring plots, and a building can span their internal divisions.

Generated forms include small houses and shops, broader halls and workshops, L-shaped footprints, courtyard buildings, compounds with separate wings, and attached rows. Footprint types have descriptive uses such as inn, guildhall or temple; these are cartographic categories, not simulated economies or populations.

Open ground remains for yards, gardens, gaps and undeveloped space. Buildings are set back from the full rendered street width and the civic square remains clear. Very small or awkward blocks may remain unbuilt.

Under **Map layers** in the left panel:

- **Building footprints** shows or hides roofs.
- **Property boundaries** outlines allocated sites.
- **Underlying plot divisions** shows the smaller plots, including divisions beneath buildings that occupy multiple plots.

The report counts buildings, properties, combined-plot properties and base plots. These layers only change display; they do not regenerate or edit the city. The report itself is hidden on narrower viewports, while the layer controls remain available in the left panel.

### Navigation

- Pan using **Pan map**, middle-button drag, or Space + drag in any tool.
- Scroll to zoom; `+` and `−` also zoom.
- Press `0` or use the fit button to fit the current outline.
- Escape returns to pan mode. Ctrl/Cmd + Z undoes an outline edit when focus is on the map.

Hosted URLs can initialize a preset with `?seed=demo&size=large&shape=organic`. `shape` accepts the four street patterns; custom drawn boundaries are not encoded into URLs.

### Current limits

- One continuous boundary without interior holes. Concave and branching boundaries are supported.
- Crossed or self-touching outlines are rejected. Freehand drawing is simplified before point editing. Boundaries must have enough area for streets and a town center; very narrow necks are rejected with a correction message.
- Keep the page open to retain your custom outline. Project save/load and image export remain later milestones; refreshing does not preserve a custom city.
- Green ground includes the open portions of city blocks. Individual building selection, renaming, manual footprint editing, districts, fortifications, terrain, interiors and 3D remain later phases.
- Road centerlines and blocks respect the boundary. Rendered street strokes have width and may extend slightly beyond it along the perimeter.
- The 3B population stage leaves the 3A.2 street graph, block geometry, plaza and outline intact for the same settings. Building generation is reproducible within this version; future generator revisions may change results.

## Architecture

The data model stores the exact accepted boundary, chosen center, seed, density and street pattern. Roads reference shared junction IDs; blocks and the civic plaza reference those same nodes. Properties and plots have stable IDs; buildings reference their property, occupied plots, block and frontage street. Footprints, courtyard holes and entrance access segments exist independently of Canvas rendering.

The generator clips candidate streets against the boundary and plaza, splits all intersections into explicit junctions, and extracts bounded faces from the resulting planar graph. Small boundary slivers merge into neighboring blocks; obsolete dangling street stubs are removed. Runtime checks reject disconnected graphs, pinched blocks and incomplete coverage before replacing the displayed project.

The population stage divides individual street frontages into variable-width plots, combines neighboring plots into larger properties, then generates inset building footprints. Each accepted property must fit wholly inside its block with a setback from every surrounding street. Property envelopes cannot overlap; building footprints fit within their envelopes. Courtyard holes and open ground remain separate from building area. Runtime checks validate references, property overlap and footprint containment before replacing the displayed city.

The perimeter has a connected street following the boundary. It is not a city wall. Walls and their rendering belong to phase 3D.

```text
src/
  core/           Seeded random, geometry, placement validation, city model
  generators/     Survey, streets, properties, plots and building footprints
  editor/         Outline drawing, cleanup, point editing and undo
  renderer/       Map, roof and plot-layer drawing, camera
  ui/             Pointer interaction and map navigation
  app.js          Application state, generation controls and feedback
styles/app.css
index.template.html
scripts/build.mjs
index.html        Generated standalone output
dist/             Historical and current standalone builds
tests/            Geometry, editor and compiled-application tests
```

## Build and validate

Use Node.js 20.11 or newer. No package installation is required.

```bash
npm run check  # compile the standalone file, then run all automated tests
npm test       # test the existing compiled artifact and source
npm run build  # regenerate index.html and dist/mappo-0.1-dev.3b.html
```

The build embeds local ES modules and rejects external runtime dependencies. Both current HTML outputs must be byte-for-byte identical.

The test suite checks building containment, street clearance, nonoverlapping properties, actual multi-plot occupancy, courtyard holes, compound spacing, type/shape variety, shared-wall rows, layer toggles, and unchanged street generation. It also covers seeded reproducibility, connected roads, explicit crossings, positive simple blocks, exact outline coverage, face-to-road relationships, boundary containment, invalid input, chosen-center preservation, all street patterns, former profile extremes, and outline gestures. Compiled-application interaction checks execute the embedded script with a simulated DOM and Canvas. These do not replace a graphical browser check.

See [`QA.md`](QA.md) for validation results and the remaining manual browser checklist.

## Milestones

- **0.1-dev.1:** Survey foundation and navigation.
- **0.1-dev.2:** Connected roads, blocks and civic plaza.
- **0.1-dev.3a:** Four settlement morphologies.
- **0.1-dev.3a1:** Historical advanced-shape snapshot, recovered from the standalone artifact. This snapshot had unresolved crossings and is not the current validated build.
- **0.1-dev.3a2:** Drawn outlines, point editing and boundary-constrained street generation.
- **0.1-dev.3b:** Varied properties, multi-plot buildings, courtyards, compounds and attached rows.
- **3C:** Districts — future.
- **3D:** Fortifications — future.
- Later 0.1 phases: rendering polish, inspector, project persistence, export and release hardening.

Copyright © 2026 Mappo contributors.

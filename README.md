# Mappo

Mappo is an offline procedural medieval city mapper. Development uses modular JavaScript; each milestone also ships as one standalone HTML file with embedded code and styles.

## Current build: 0.1-dev.3e — Rivers and editable bridges

Draw a city boundary, place its main square, and generate connected streets, varied properties and building footprints inside it. Boundary shape and street pattern are independent: a horseshoe, branching outline or twin-core settlement can use any of the four street patterns.

Open [`dist/mappo-0.1-dev.3e.html`](dist/mappo-0.1-dev.3e.html) directly in a modern desktop browser. No installation, server, network connection or external assets are required. The root `index.html` is the identical compiled file for static hosting.

### Workflow

1. Choose **Freehand** and drag an outline; release to close it. Alternatively, use **Click points**, place the corners, and press **Close outline** or Enter.
2. Use **Edit points** to drag corners. Double-click an edge to add a corner; select a corner and press Delete to remove it. **Undo edit** reverses outline and center changes.
3. Choose **Place main square**, then click inside the boundary, away from the edge. Mappo initially chooses a location with room for a square.
4. Select an **Organic**, **Planned**, **Radial** or **Linear** street pattern, street density and seed. Click **Generate city**.

Changing street settings does not reshape your boundary. **New street seed** regenerates within the same outline and keeps the chosen center. Density changes block spacing, not the size of a custom outline. Use **Revert edits** to restore the outline, center and settings of the last generated city.

Eight editable starting outlines are available: rounded, organic, long, rectangular, wedge, twin-core, branching and horseshoe. Select one and click **Use**, then adjust it. Applying a preset changes the draft; it does not silently replace the generated city.

Draft boundaries show handles and a dashed outline; the previous street plan is faded. Click Generate to apply the draft. Invalid outlines show an explanation and retain the last good generated city.

### Save, load and recovery

- **Download project** writes a `.mappo.json` download containing the complete city, its metadata, unfinished outline edits, undo history, generation controls, map position and layers. Ctrl/Cmd + S also requests a project download.
- **Load project** reads and validates a selected project into a preview. Click **Open project** to replace the workspace, or Cancel to retain the current city.
- **Restore latest recovery** and **Restore previous recovery** reopen browser snapshots. Existing recovery is offered at startup; select it or choose **Keep this city** before recovery resumes.

Loading restores saved geometry directly. It does not regenerate from the seed, so building names, shapes and future record metadata can be retained across builds. Versioned data and explicit migrations retain districts, fortifications and later edits.

Browser recovery uses IndexedDB where available and falls back to localStorage. Blocked storage, exhausted quota and recovery conflicts show a warning; portable downloads and file loading still work. Recovery is local to browser storage and can vary by file/origin. **Download project files to keep versions and move between standalone builds.** The app cannot confirm whether a requested download was ultimately saved on disk.

The current file limit is 20 MiB. Unsupported newer schemas are rejected rather than partially loaded. Unknown compatible JSON fields are retained.

### Districts

Newly generated cities receive connected neighborhoods automatically. The **Neighborhoods** panel lets you choose an automatic count or 1–12 districts and an independent district seed, then **Generate / rebuild districts**. Only district data changes; streets, block shapes, properties and building footprints remain fixed. A separate connected block group receives at least one district if it cannot share a region with the rest of the city.

- Click a block in **Pan map** mode to select its neighborhood and inspect its block, property and building counts. Dragging the map does not select a block.
- Select a neighborhood from the district inspector list, edit its name and color, and click **Apply name & color**.
- With a block selected, choose a neighboring district and click **Move selected block**. The receiving district must share a street edge. Moving a block cannot split its source district or leave a district empty. All properties and buildings in the block inherit the new district.
- Toggle district **Colors**, **Borders** and **Labels** independently of roof/property/plot layers.
- **Undo district edit** restores the last district generation, rename, color change or block move. Up to 20 district edits, selections, pending inspector values and district layer settings are saved with the project.

Districts are geographic neighborhoods. Names do not replace buildings or simulate occupations, wealth or trade. Rules and themes can be added later without coupling neighborhood identity to geometry generation.

Older saved cities load with their original geometry and no newly generated neighborhoods. Choose **Generate / rebuild districts** to add them; district display layers switch on for that first assignment. Project data schema 5 explicitly migrates older files; older apps that cannot read schema 5 should request a newer build rather than partially load it.

See [`DISTRICTS.md`](DISTRICTS.md) for the module boundaries and extension points.

### Rivers and editable bridges

Water is optional. Existing and fresh cities start on dry land until you choose **Generate river** in **Water & Bridges**. Generation uses an independent water seed and proposes a river course with bridge locations. It creates a preview; the current city stays open.

1. Choose a water seed and a river width of **10–90 survey units**, then **Generate river**. **New river seed** proposes another course without changing the street seed.
2. Choose **Edit river points**. Drag the handles, including endpoints; double-click near the course to add an interior point. Select an interior point and press Delete or **Remove selected** to remove it. Endpoints must remain beyond the city.
3. Choose **Move bridges** and drag a bridge marker along the river. The crossing snaps to the course and adjusts its angle to the local river segment. **Add bridge** places a marker near a clicked river location. Select a bridge and Delete or **Remove selected** to remove it.
4. Click **Generate city** to apply the draft. Streets, buildings, neighborhoods and enabled defenses regenerate around the accepted water and crossings. Download a project copy before rebuilding a customized city.

Bridges create actual street connections to both banks. Waterfront streets follow a reserved bank corridor; buildings stay on land. Water boundary edges close the planar arrangement without appearing as roads. Walls leave river openings and keep towers and street gates clear of the water.

Water edits are independent of outline edits. **Undo water edit** keeps up to 20 previous water definitions; **Revert water draft** restores the current city's accepted water. **Remove river from draft** previews dry land and applies only after Generate city. The map's fit control includes river handles while water is being edited. Escape or **Pan map** leaves the water tool; Space-drag and middle-button drag pan in every tool.

Invalid bridge locations, overlapping crossings, sharp/backtracking river bends, water at the square and disconnected banks retain the last valid city and show an explanation. A draft may temporarily have no bridges or invalid river geometry and can still be saved for later correction. Saving/loading never applies or regenerates a draft.

The first water release supports **one river, up to 32 course points, and 1–8 bridges** in a generated city. The course progresses from source to mouth without doubling back; widths are constant along the cross-stream axis. Generated bridge approaches are straight primary streets clipped to land. Lakes, coasts, tributaries, islands, variable widths and custom bridge styles remain extensions. See [`WATER.md`](WATER.md).

### Fortifications

New native cities default to an exterior perimeter wall, connected gates and defensive towers. Open the **Fortifications** panel to change them independently of the city. The Fortifications and Neighborhoods panels collapse separately, and their open state is saved.

- **Walls enabled** plus **Build / update** builds or enables defenses. Uncheck it and apply to disable defenses while retaining their geometry, IDs and metadata.
- Choose **1–8 gates**, **40–200 survey units** of tower spacing and an independent fortification seed, then apply. Changing these settings rebuilds defenses only. Smaller spacing adds towers where clearance allows; corners also receive towers when safe.
- Gates connect to real perimeter street junctions through saved approach paths. Walls have actual openings. If the requested gate count cannot fit safely, Mappo reports the smaller actual count.
- **Show fortification layer** changes display only. It does not change whether defenses are enabled or erase saved records.
- **Undo fortification edit** restores up to 10 previous defense states, including the first build or disabling. History and pending controls travel with project files and browser recovery.

Walls sit outside the perimeter streets. Existing streets, buildings, properties, blocks, neighborhoods and the square remain fixed. Narrow inlets may be bridged by the exterior wall where following them would create an unsafe crossing. Imported older cities stay unchanged and unfortified: enable walls, then choose **Build / update** to add defenses explicitly.

This milestone supports one outer wall ring, round towers and street gates. Custom wall drawing, inner walls, alternate tower/gate forms and gate editing remain future extensions. See [`FORTIFICATIONS.md`](FORTIFICATIONS.md) for geometry contracts and extension points.

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
- Press `0` or use the fit button to fit the current city, including enabled fortifications (or the outline while editing).
- Escape returns to pan mode. Ctrl/Cmd + Z undoes an outline edit when focus is on the map.

Hosted URLs can initialize a preset with `?seed=demo&size=large&shape=organic`. `shape` accepts the four street patterns; custom drawn boundaries are not encoded into URLs.

### Current limits

- One continuous outer boundary; a crossing river is represented separately. Concave and branching boundaries are supported.
- Crossed or self-touching outlines are rejected. Freehand drawing is simplified before point editing. Boundaries must have enough area for streets and a town center; very narrow necks are rejected with a correction message.
- Project save/load and browser recovery are available. PNG export remains a later milestone. Keep portable project downloads as backups; clearing browser data can remove recovery.
- Green ground includes the open portions of city blocks. Individual building selection, renaming, manual footprint editing, functional district themes, lakes/coasts, terrain, interiors and three-dimensional rendering remain later phases.
- Road centerlines and blocks respect the boundary. Rendered street strokes have width and may extend slightly beyond it along the perimeter.
- The 3B population stage leaves the 3A.2 street graph, block geometry, plaza and outline intact for the same settings. Building generation is reproducible within this version; future generator revisions may change results.

## Architecture

The data model stores the exact accepted boundary, chosen center, seed, density and street pattern. Roads reference shared junction IDs; blocks and the civic plaza reference those same nodes. Properties and plots have stable IDs; buildings reference their property, occupied plots, block and frontage street. Footprints, courtyard holes and entrance access segments exist independently of Canvas rendering.

The generator clips candidate streets against the boundary and plaza, splits all intersections into explicit junctions, and extracts bounded faces from the resulting planar graph. Small boundary slivers merge into neighboring blocks; obsolete dangling street stubs are removed. Runtime checks reject disconnected graphs, pinched blocks and incomplete coverage before replacing the displayed project.

The population stage divides individual street frontages into variable-width plots, combines neighboring plots into larger properties, then generates inset building footprints. Each accepted property must fit wholly inside its block with a setback from every surrounding street. Property envelopes cannot overlap; building footprints fit within their envelopes. Courtyard holes and open ground remain separate from building area. Runtime checks validate references, property overlap and footprint containment before replacing the displayed city.

The perimeter has a connected street following the boundary. Fortifications are a separate exterior ring. Saved gates reference perimeter junction IDs through separate approach paths; adding defenses does not rewrite the original street graph.

```text
src/
  core/           Version constants, random, geometry, placement and city model
  generators/     Survey, streets, buildings and independent district/water/fortification generation
  data/           Project format, migrations, validation, files and recovery
  editor/         Outline, water, district and fortification editing and undo
  renderer/       Map, roof, water, bridge, district and fortification layers, camera
  ui/             Pointer interaction, map navigation and project-file workflow
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
npm run build  # regenerate index.html and dist/mappo-0.1-dev.3e.html
```

The build embeds local ES modules and rejects external runtime dependencies. Both current HTML outputs must be byte-for-byte identical.

The test suite checks building containment, street clearance, nonoverlapping properties, actual multi-plot occupancy, courtyard holes, compound spacing, type/shape variety, shared-wall rows, layer toggles, and unchanged street generation. It also covers seeded reproducibility, connected roads, explicit crossings, positive simple blocks, exact outline coverage, face-to-road relationships, boundary containment, invalid input, chosen-center preservation, all street patterns, former profile extremes, and outline gestures. Compiled-application interaction checks execute the embedded script with a simulated DOM and Canvas. These do not replace a graphical browser check.

See [`PROJECT_FORMAT.md`](PROJECT_FORMAT.md) for the persistence contract and migration rules. See [`QA.md`](QA.md) for validation results and the remaining manual browser checklist.

## Milestones

- **0.1-dev.1:** Survey foundation and navigation.
- **0.1-dev.2:** Connected roads, blocks and civic plaza.
- **0.1-dev.3a:** Four settlement morphologies.
- **0.1-dev.3a1:** Historical advanced-shape snapshot, recovered from the standalone artifact. This snapshot had unresolved crossings and is not the current validated build.
- **0.1-dev.3a2:** Drawn outlines, point editing and boundary-constrained street generation.
- **0.1-dev.3b:** Varied properties, multi-plot buildings, courtyards, compounds and attached rows.
- **0.1-dev.3b1:** Portable versioned project files, load preview, recovery and compatibility validation.
- **0.1-dev.3c:** Connected, editable, persistent neighborhoods with district layers and undo.
- **0.1-dev.3d:** Independent exterior fortifications, connected gates, round towers, visibility, undo and schema-4 persistence.
- **0.1-dev.3e:** Generated/editable rivers, land-aware streets and buildings, editable connected bridges and schema-5 persistence.
- **3F:** Building inspector with names, notes and undo — planned.
- Later 0.1 phases: rendering polish, PNG export and release hardening.

Copyright © 2026 Mappo contributors.

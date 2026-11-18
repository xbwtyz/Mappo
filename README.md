# Mappo

Mappo is an offline procedural medieval city mapper. Development uses modular JavaScript; each milestone also ships as one standalone HTML file with embedded code and styles.

## Current feature-branch build: 0.1-dev.ui5d — Phase 5 navigation and integration

Draw a city boundary, place its main square, and generate connected streets, varied properties and building footprints inside it. Boundary shape and street pattern are independent: a horseshoe, branching outline or twin-core settlement can use any of the four street patterns.

Open [`dist/mappo-0.1-dev.ui5d.html`](dist/mappo-0.1-dev.ui5d.html) directly in a modern desktop browser. No installation, server, network connection or external assets are required. The root `index.html` is the identical compiled file for static hosting.

### UI overhaul: Phases 1–5 (Phase 5 on the feature branch)

Use **Project** in the top bar for downloads, validated loading and browser recovery. A dot marks recovery/load decisions. **Layers** in the map header holds all building, property, plot, district and fortification visibility switches. The shared map rail keeps **Select / Pan**, **Fit**, and zoom available in every section. City groups Outline, Main square and Streets, with optional starting shapes and seeds behind expandable settings. [UI_CONTROL_MAP.md](UI_CONTROL_MAP.md) lists the new homes of the existing controls.

The working editor now opens in **City**, with **Landscape**, **Districts** and **Defenses** tabs showing one tool section at a time. Use the arrow buttons to collapse the tools or inspector; the live map takes the available space. **Tools** and **Inspector** buttons reopen the panels. **Generate city** stays available beneath the active tools.

Open **Landscape** for one list of every river, coastline, lake and mountain range. Filter **All / Water / Mountains** or use **Add feature**. Choose a feature type and create its preview in the inspector. Existing river/coast entries are disabled in the creation picker; lakes and ranges retain their independent limits.

Select a feature from the list or map in **Select / Pan** to open only its own editing controls. Selection alone leaves the map in Select/Pan; choose a shape, move or crossing button to edit. Hover and selected outlines use a light halo, with orange marking selection. Nearby feature edges take priority over broad interiors; smaller interiors win overlap ties, then stable IDs break equal ties. Map selection reveals the matching list row, switching a conflicting filter to All. Click a city block to inspect its district; click empty land to clear selection.

**Clear selection** closes an unpinned inspector; **Pin** keeps it open, including its expandable city report. Districts now lists neighborhoods and opens their name/color and connected-block controls in the selection inspector. District count, seed, rebuild and scoped undo remain under Districts; Defenses now groups wall enablement, gate/tower settings and generation seed with a live preview of defense-only changes. Water and terrain retain separate histories, with Undo actions also accessible from the Landscape list after removal. Selected landscape IDs now survive saves even in Select/Pan mode. Full shell/filter/layout persistence remains Phase 6.

Switching sections stops tools whose controls are being hidden while preserving completed drafts, history, pending inputs and the accepted city. An in-progress gesture is cancelled through its original editor. Panel collapse resizes the Canvas without changing the city or camera position/zoom. Shell layout preferences are runtime state in this phase; their portable persistence is planned for Phase 6. Existing project saves and recovery still restore their original city geometry and editor drafts.

See [UI_OVERHAUL_PLAN.md](UI_OVERHAUL_PLAN.md) for the phase-by-phase goals and review checkpoints, and [WORKSPACE_UI.md](WORKSPACE_UI.md) for the modular shell/inspector architecture.

### Workflow

1. Choose **Freehand** and drag an outline; release to close it. Alternatively, use **Click points**, place the corners, and press **Close outline** or Enter.
2. Use **Edit outline points** to drag corners. Double-click an edge to add a corner; select a corner and press Delete to remove it. **Undo outline edit** reverses outline and center changes.
3. Choose **Place main square**, then click inside the boundary, away from the edge. Mappo initially chooses a location with room for a square.
4. Select an **Organic**, **Planned**, **Radial** or **Linear** street pattern, street density and seed. Click **Generate city**.

Changing street settings does not reshape your boundary. **New street seed** regenerates within the same outline and keeps the chosen center. Density changes block spacing, not the size of a custom outline. Use **Revert outline & street edits** to restore the outline, center and settings of the last generated city.

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

Newly generated cities receive connected neighborhoods automatically. The **Neighborhoods** panel lets you choose an automatic count or 1–12 districts and an independent district seed, then **Rebuild districts**. Only district data changes; streets, block shapes, properties and building footprints remain fixed. A separate connected block group receives at least one district if it cannot share a region with the rest of the city.

- Click a block in **Select / Pan** mode to select its neighborhood and inspect its block, property and building counts. Dragging the map does not select a block.
- Select a neighborhood in the Districts list or click one of its blocks on the map. Edit its name/color in the right inspector and click **Apply district changes**.
- With a block selected, choose a neighboring district and click **Move selected block**. The receiving district must share a street edge. Moving a block cannot split its source district or leave a district empty. All properties and buildings in the block inherit the new district.
- Toggle district **Colors**, **Borders** and **Labels** independently of roof/property/plot layers.
- **Undo district edit** restores the last district generation, rename, color change or block move. Up to 20 district edits, selections, pending inspector values and district layer settings are saved with the project.

Districts are geographic neighborhoods. Names do not replace buildings or simulate occupations, wealth or trade. Rules and themes can be added later without coupling neighborhood identity to geometry generation.

Older saved cities load with their original geometry and no newly generated neighborhoods. Choose **Rebuild districts** to add them; district display layers switch on for that first assignment. Project data schema 9 explicitly migrates older files; older apps that cannot read schema 9 should request a newer build rather than partially load it.

See [`DISTRICTS.md`](DISTRICTS.md) for the module boundaries and extension points.

### Mountain ranges and passes

**Landscape → Add feature → Mountain range** supports up to **six independent mountain ranges**, both around the settlement and inside its outline. Choose **Surrounding landscape**, **Inside the city**, or **Across the city edge**, set a seed, size and peak height, then **Create mountain range**. Repeat to add more. Terrain starts empty in fresh and older cities.

- **Edit foothills** reshapes the closed footprint. Drag handles, double-click any edge to add a handle, and Delete a selected handle when the ridge and banks remain safe. Sharp edits self-adjust. Up to 32 footprint handles are supported.
- **Edit ridge / peaks** moves three ridge handles. Select a handle and change **Peak height** to set its elevation. Heights affect contour detail and peak symbols; this release uses a reserved steep-ground footprint rather than calculating a continuous slope simulation.
- **Move range** translates the entire footprint and ridge using the center marker. **Regenerate selected** preserves its identity, name, center and compatible metadata. **Remove selected range** removes only that range and its passes.
- **Move passes** drags a road crossing along the ridge; **Add road pass** adds another. Passes must have two foothills inside the city and remain clear of water and other ranges. Up to twelve passes are supported. Suitable inland ranges receive an initial crossing automatically. A range dividing neighborhoods needs a valid pass before generation can succeed.
- **Generate city** applies terrain edits. Streets connect along foothills and through designated passes, buildings avoid reserved mountain ground, and walls/towers/gates leave mountain openings. Outside ranges remain visible as surrounding landscape. **Fit map** includes their full extent.

Terrain and water have separate editors, controls and undo histories. Project files and browser recovery preserve accepted terrain geometry, ridges, peak heights, passes, selection, pending inputs and unfinished edits. Loading never regenerates or repairs saved geometry. Mountain ranges and water need separated footprints in this version; rivers cutting through mountains, merged ranges, hillside construction and tunnels are future extensions.

See [`TERRAIN.md`](TERRAIN.md) for the separate geometry, guidance, generation, validation, editor, rendering and defense adapters.

### Lakes

Use **Landscape → Add feature → Lake → Create lake** to create an independent lake preview. Repeat to add more; this release supports **up to eight lakes**, alongside a river and coastline. Each lake has its own stable ID, seed and editable closed shoreline.

- Select a lake from the list or map, then **Edit lake shape**. Drag any shoreline handle; sharp or crossing drags stop at a safe bank shape. Double-click any shore edge, including the closing edge, to add a handle. Delete removes a selected handle when the remaining bank stays safe. Up to 32 handles per lake are supported.
- Choose **Move lake** and drag its center marker to move the entire shoreline. Guided movement keeps its banks inside the city outline. Keep lakes away from the main square and river bridges.
- **Lake size** and **Lake seed** control Create lake or **Regenerate selected**. Regeneration keeps the selected lake's identity, center, name and compatible metadata. **Remove selected lake** removes only that lake. Water undo restores additions, edits, regeneration and removal.
- Click **Generate city** to apply the draft. Inland waterfront streets connect to the surrounding street network, buildings keep shore setbacks, and reserved water faces participate in exact map coverage. Generation proposes lakes on available land; if the requested size will not fit, reduce it or enlarge the outline.

Project files and browser recovery retain every lake, unfinished shape edits, active selection, pending inputs and water undo history. Existing saves migrate without adding lakes or changing accepted geometry. Closed shore guidance and geometry live in dedicated modules so future lake types, styling and tools can be added separately.

### Coastlines

**Landscape** lists rivers, coastlines and individual lakes independently. Select one to expose its controls in the inspector. A city can contain all these water types at once. A coastline has open ocean on one side and buildable land on the other. Generating, rerolling, editing or removing a river retains the coast; the same applies in reverse. Each has its own seed and controls. The accepted city stays open until Generate city succeeds. Water undo restores the last water edit.

1. Use **Add feature → Coastline**. Choose a **coast seed** and **Ocean direction**: north, east, south or west. Click **Create coastline** for an editable preview. **New coast seed** rerolls only the coastline using the pending ocean direction.
2. Drag shoreline handles. Handles stay ordered and neighboring handles ease tight bends automatically. Double-click near the shoreline to add a point; select an interior point and Delete or **Remove selected** to remove it. Use **Edit shoreline** for coast handles and **Edit river points** for river handles.
3. **Swap land / water** reverses the current coast's ocean side. Keep the main square on land; move the shore or square if the preview reports it would be submerged. Ocean direction controls the next generated coastline, while Swap edits the existing draft.
4. Click **Generate city** to build around the coast. Waterfront roads follow the land side, properties retain shoreline setbacks, and defenses are removed from submerged portions of the outer perimeter. An invalid shoreline retains the last valid city.

**Tidy shoreline bends** repairs overlapping points and tight bends in older coastal drafts. Generate city also tidies river and coast drafts together, recording one water-undo entry. Double-click insertion snaps onto the shoreline and selects an existing nearby handle rather than duplicating it. Endpoints and the ocean extent adjust when needed to keep covering the city; the chosen ocean side and other water records are preserved.

The shoreline connectivity check prevents unconnected islands, including in concave outlines. River width and bridge tools stay available whenever a river exists, including in a coastal city. Bridges need two dry banks and cannot extend into the ocean. Shoreline edits, side swaps, pending direction and undo history travel with project files and browser recovery. Existing 3E river files load with their exact accepted geometry and drafts.

This release supports **one river and one coast together** per city. Joined water is treated as a union: waterfront roads stop at the river mouth and water draws without an internal shoreline across the opening. Multiple rivers/coasts, islands, docks and custom beach styles are future additions. Course points still progress between endpoints without loops or sharp backtracking. See [`WATER.md`](WATER.md) for the shared shape adapters and independent coastline generator.

### Rivers and editable bridges

River editing now guides handles into valid positions as you drag. Handles stay in order, and neighboring handles adjust when a bend needs more room. Endpoints dragged into city land extend back outside the outline. Double-clicking adds a handle on the course; clicking an existing handle selects it instead of adding a duplicate.

**Tidy river bends** repairs overlapping points and tight bends in older drafts, with water undo available. **Generate city** also tidies river geometry before applying a draft. These adjustments preserve the coast, bridge location records, river identity and compatible metadata. Actual square/shoreline conflicts, unsuitable bridge locations and disconnected streets still receive placement feedback.

New river proposals are checked with the same geometry and bridge rules used when applying them. Unsuitable candidates are tidied or retried before a preview is returned. Existing saved city geometry and unfinished drafts load exactly; loading never tidies or regenerates them.

Water is optional. Existing and fresh cities start on dry land until you choose **Landscape → Add feature → River**. Generation uses the river seed and proposes a river course with bridge locations, keeping any coast intact. When a coast exists, new rivers favor a course toward its ocean and bridge suggestions remain inland. It creates a preview; the current city stays open.

1. Choose a river seed and a river width of **10–90 survey units**, then **Generate river**. **New river seed** proposes another course without changing the street seed.
2. Choose **Edit river points**. Drag the handles, including endpoints; double-click near the course to add an interior point. Select an interior point and press Delete or **Remove selected** to remove it. Endpoints must remain beyond the city.
3. Choose **Move bridges** and drag a bridge marker along the river. The crossing snaps to the course and adjusts its angle to the local river segment. **Add bridge** places a marker near a clicked river location. Select a bridge and Delete or **Remove selected** to remove it.
4. Click **Generate city** to apply the draft. Streets, buildings, neighborhoods and enabled defenses regenerate around the accepted water and crossings. Download a project copy before rebuilding a customized city.

Bridges create actual street connections to both banks. Waterfront streets follow a reserved bank corridor; buildings stay on land. Water boundary edges close the planar arrangement without appearing as roads. Walls leave river openings and keep towers and street gates clear of the water.

Water edits are independent of outline edits. **Undo water edit** keeps up to 20 previous water definitions; **Revert water draft** restores the current city's accepted water. **Remove river** removes only the river and its bridges from the draft; **Remove coastline** removes only the coast. Apply either removal with Generate city. The map's fit control includes river handles while water is being edited. Escape or **Select / Pan** leaves the water tool; Space-drag and middle-button drag pan in every tool.

Invalid bridge locations, overlapping crossings, sharp/backtracking river bends, water at the square and disconnected banks retain the last valid city and show an explanation. A draft may temporarily have no bridges or invalid river geometry and can still be saved for later correction. Saving/loading never applies or regenerates a draft.

River mode supports **one river, up to 32 course points, and 1–8 bridges** in a generated city. The course progresses from source to mouth without doubling back; widths are constant along the cross-stream axis. Generated bridge approaches are straight primary streets clipped to land. Tributaries, islands, variable widths and custom bridge styles remain extensions. See [`WATER.md`](WATER.md).

### Fortifications

New native cities default to an exterior perimeter wall, connected gates and defensive towers. Open the **Fortifications** panel to change them independently of the city. The Fortifications and Neighborhoods panels collapse separately, and their open state is saved.

- **Walls enabled** plus **Update defenses** builds, enables or updates defenses. Uncheck it and apply to disable defenses while retaining their geometry, IDs and metadata. A live summary explains what the update will change.
- Choose **1–8 gates**, **40–200 survey units** of tower spacing and an independent fortification seed, then apply. Changing these settings rebuilds defenses only. Smaller spacing adds towers where clearance allows; corners also receive towers when safe.
- Gates connect to real perimeter street junctions through saved approach paths. Walls have actual openings. If the requested gate count cannot fit safely, Mappo reports the smaller actual count.
- **Layers → Defenses → Fortifications** changes display only. It does not change whether defenses are enabled or erase saved records.
- **Undo defense edit** restores up to 10 previous defense states, including the first build or disabling. History and pending controls travel with project files and browser recovery.

Walls sit outside the perimeter streets. Existing streets, buildings, properties, blocks, neighborhoods and the square remain fixed. Narrow inlets may be bridged by the exterior wall where following them would create an unsafe crossing. Imported older cities stay unchanged and unfortified: enable walls, then choose **Update defenses** to add defenses explicitly.

This milestone supports one outer wall ring, round towers and street gates. Custom wall drawing, inner walls, alternate tower/gate forms and gate editing remain future extensions. See [`FORTIFICATIONS.md`](FORTIFICATIONS.md) for geometry contracts and extension points.

### Buildings and properties

Blocks now contain street-facing properties with seeded variation in width, depth, spacing and occupancy. Larger sites are allocated before small-plot infill. A property can combine two or three neighboring plots, and a building can span their internal divisions.

Generated forms include small houses and shops, broader halls and workshops, L-shaped footprints, courtyard buildings, compounds with separate wings, and attached rows. Footprint types have descriptive uses such as inn, guildhall or temple; these are cartographic categories, not simulated economies or populations.

Open ground remains for yards, gardens, gaps and undeveloped space. Buildings are set back from the full rendered street width and the civic square remains clear. Very small or awkward blocks may remain unbuilt.

Under **Layers → Buildings & land** in the map header:

- **Building footprints** shows or hides roofs.
- **Property boundaries** outlines allocated sites.
- **Plot divisions** shows the smaller plots, including divisions beneath buildings that occupy multiple plots.

The report counts buildings, properties, combined-plot properties and base plots. These layers only change display; they do not regenerate or edit the city. The expandable city report is available in the inspector; Layers remains available in the map header.

### Navigation

- Pan using **Select / Pan**, middle-button drag, or Space + drag in any tool.
- Scroll to zoom; `+` and `−` also zoom.
- Press `0` or use the fit button to fit the current city, including enabled fortifications (or the outline while editing).
- Escape returns to pan mode. Ctrl/Cmd + Z undoes an outline edit when focus is on the map.

Hosted URLs can initialize a preset with `?seed=demo&size=large&shape=organic`. `shape` accepts the four street patterns; custom drawn boundaries are not encoded into URLs.

### Current limits

- One continuous outer boundary; a river or coastline is represented separately. Concave and branching boundaries are supported.
- Crossed or self-touching outlines are rejected. Freehand drawing is simplified before point editing. Boundaries must have enough area for streets and a town center; very narrow necks are rejected with a correction message.
- Project save/load and browser recovery are available. PNG export remains a later milestone. Keep portable project downloads as backups; clearing browser data can remove recovery.
- Green ground includes the open portions of city blocks. Individual building selection, renaming, manual footprint editing, functional district themes, interiors and three-dimensional rendering remain later phases.
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
npm run build  # regenerate index.html and dist/mappo-0.1-dev.ui5d.html
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
- **0.1-dev.3e1:** Generated/editable coastlines, ocean-side control, connected coastal land and schema-6 compatibility.
- **0.1-dev.3e2:** Independent river/coast controls and seeds, joined water geometry, inland bridges and schema-7 compatibility.
- **0.1-dev.3e3:** Guided river handles, snapped point insertion, undoable draft tidying and validated river proposals.
- **0.1-dev.3e4:** Shared river/coast guidance, snapped shoreline insertion, undoable coastline tidying and validated coast proposals.
- **0.1-dev.3e5:** Multiple independently editable lakes, closed shoreline guidance, inland access streets and schema-8 compatibility.
- **0.1-dev.3e6:** Editable mountain ranges around/inside the city, ridge peaks, connected road passes and schema-9 compatibility.
- **0.1-dev.ui1:** UI overhaul Phase 1 — modular workspace shell, section navigation, collapsible panels and extensible selection summaries.
- **0.1-dev.ui2:** UI overhaul Phase 2 — compact City controls, expandable seeds, shared Project/Layers menus and map navigation.
- **0.1-dev.ui3:** UI overhaul Phase 3 — unified landscape list, inline creation/contextual forms, map hits/highlights and portable landscape selection.
- **0.1-dev.ui4a:** UI overhaul Phase 4A — selectable neighborhood inventory, contextual district editing, shared district history and explicit local district rebuild.
- **0.1-dev.ui4b:** UI overhaul Phase 4B — scoped defensive settings, clear Update defenses action, live mutation preview and retained independent defense history.
- **0.1-dev.ui4c:** UI overhaul Phase 4C — district map/list reveal and combined local district/defense validation, save/load and independent history regression tests.
- **UI overhaul, Phase 5 onward:** Draft feedback, readability, full workspace persistence and final browser release checks — [remaining goals](UI_OVERHAUL_PLAN.md).
- **3F:** Building inspector with names, notes and undo — planned.
- Later 0.1 phases: rendering polish, PNG export and release hardening.

Copyright © 2026 Mappo contributors.

### Phase 4 integration verification

The `0.1-dev.ui4c` feature-branch build passed 141 automated tests, including combined district and defense edits, invalid-input atomicity, native save/load with both undo histories, exact geometry restoration, and a reproducible standalone HTML build. [See the passing CI run](https://github.com/xbwtyz/Mappo/actions/runs/44217250343). Native Firefox and the responsive graphical matrix remain scheduled for the final UI phase; this is not yet a merged main-branch release.

### Phase 5A — Pending and rebuild feedback

A live header count distinguishes unapplied city settings, changed outline/main square, water and mountain drafts from local neighborhood and defense edits. The shared **Rebuild city** footer describes actual pending categories and explains that the rebuild can replace streets, buildings, districts and enabled defenses. Current city geometry and the save schema are unchanged. Work on Phase 5B–5D continues in `feature/ui-phase-5`.

### Phase 5B — Contextual undo

The map bar now labels Undo by current editor: outline, water, mountains, district or defenses. Active drawing tools take priority; otherwise the current section and selected landscape feature determine the available scoped history. Ctrl/Cmd+Z uses the same routing when focus is not in an editable form. The original per-editor history boundaries and Undo buttons remain authoritative. Revert outline & street settings restores the last accepted city layout controls without changing water, mountains, districts or defenses.

### Phase 5C — Validation without interruptions

When a city rebuild fails, the editor reports why and explicitly confirms that accepted city geometry was preserved. Unfinished water and terrain drafts surface the same failure near their controls without generating new geometry. Invalid gate/tower fields and district editing inputs receive accessible invalid-field states. Routine updates remain inline; staged project loading and browser recovery retain their deliberate confirmation controls.

### Phase 5D — Navigation and regression hardening

The shared tool scroller now keeps separate scroll positions for City, Landscape, Districts and Defenses as you switch sections, without rebuilding or discarding any selected feature or editor draft. Loading a different project resets these runtime-only scroll positions. The acceptance suite additionally verifies pending and undo selection logic, local validation, compiled HTML, persistence and geometry. File formats remain unchanged. Browser-specific visual checks remain scheduled for UI Phase 7.

### Phase 5 verification

Build `0.1-dev.ui5d` passed **150/150 automated tests** plus the reproducible build parity check in [GitHub Actions](https://github.com/xbwtyz/Mappo/actions/runs/44221461150). The latest Phase 5 preview is committed on `feature/ui-phase-5` and is **not merged into `main`**. Native Firefox and Chrome layout checks, including narrow and ultrawide viewports, remain planned for Phase 7. Existing project, workspace and container schema versions are unchanged.

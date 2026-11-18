# Mappo 0.1-dev.3e4 validation

## Automated checks

**106 automated tests passed**, covering guided shoreline/river editing, combined water, coasts, rivers, bridges, fortifications, districts, persistence and existing city generation.

Run `npm run check` to rebuild and run the complete suite. All road-crossing checks remain enabled.

### Guided coastline editing

- 225 large shoreline gestures retain ordered courses and simple ocean polygons while preserving the ocean side.
- Coast endpoints cover the complete city projection; ocean depth expands within its existing bounds when needed. Cancel restores the full 20-entry history and exact draft.
- 1,000 narrow-city coast seeds pass the shared feature and complete-definition validators.
- Shoreline insertion snaps to the course, selecting an existing nearby handle instead of adding a duplicate.
- Coastal tidying preserves river records, bridges, ocean side and compatible metadata. Combined river/coast tidying creates one undo entry.
- Valid coast geometry stays exact. Old invalid coastline drafts save/load without repair until requested.
- Compiled-app checks guide a shoreline handle past its neighbor, retain the river and bridges, apply an older invalid coastline with auto-tidying, undo, and use Tidy shoreline bends.

### Forgiving river editing

- 225 large handle gestures, including endpoint moves and drags past neighboring points, retain ordered courses and simple bank polygons.
- Endpoint moves into city land extend back outside the boundary; cancelling a gesture restores the exact draft and full 20-entry history.
- 1,000 narrow coastal-city river seeds all pass shared feature and complete water-definition validation. The previous 3E.2 standalone returned 42 bend-invalid courses for the same inputs.
- Off-course double-clicks project onto the course; repeated clicks select an existing handle without adding a duplicate or undo entry.
- Tidy repairs older overlapping/backtracking drafts and remains undoable; coast geometry, bridge records and compatible metadata are preserved.
- Valid river geometry is unchanged by tidying. Invalid unfinished drafts still save/load exactly without auto-repair during loading.
- Compiled-app checks drag a handle beyond its neighbor, retain the accepted city and coast, apply an older invalid draft with automatic tidying, undo the repair and use the explicit Tidy button.

### Independent river/coast composition

- 64 combinations cover eight city outlines, four street/ocean-direction settings and both river-first and coast-first generation orders.
- Dry property setbacks from both features, exact union face coverage, real bridge connectivity and bank edges restricted to exposed union boundaries.
- River mouths merge without internal shoreline edges, including exactly touching water boundaries; wet faces and merged wall openings retain contributor references.
- Regenerating, moving points or removing either feature preserves the other feature and compatible metadata. Coast removal retains river bridges; river removal retains the coast.
- Combined save/load retains accepted geometry, invalid drafts, independent pending seeds, active shoreline selection and undo history.
- Invalid combined face references, ocean bridges, unknown water algorithms, excess features and corrupted merged wall references are rejected.
- A frozen native 3E.1 coast migrates exactly and can gain a river without changing its coastal record.
- Compiled-app tests generate a coast alongside an existing river, drag its handles, apply a combined city, reject a submerged square, remove either feature independently, undo, switch active tools and reload separate pending river/coast seeds.

### Coastline coverage

- 96 combinations of eight outlines, three densities and four street patterns, covering all four requested ocean directions.
- Independent land/wet area coverage, property setback, dry building footprints, dry traversable streets, land-only wall sections and tower clearance.
- Deterministic coast seeds, independent street seeds and explicit checks that ocean lies on the requested north/east/south/west side.
- Shoreline-only region checks reject isolated land; a concave horseshoe regression covers a coast that would cut off a lower arm.
- Shoreline dragging, side swaps, undo and cancelled gestures preserve the accepted city and compatible record metadata.
- Coast files preserve exact ocean geometry, invalid side-swapped drafts, history and pending generator direction.
- Invalid water sides, incompatible versions/algorithms, undersized ocean extents, changed bank geometry and bridges on coasts are rejected.
- A frozen native 3E river file migrates without changing accepted geometry, view or water history.
- Compiled-app checks generate a coast over an existing river draft, drag a shoreline handle, retain river-only controls when a river is present, apply a combined city, reject a submerged square, save/load the invalid draft and undo the side swap.

### River and bridge coverage

- 96 outline × density × street-pattern configurations generate valid river cities with bridge streets, waterfront roads, dry buildings and river openings through defenses.
- Independent area coverage, property shoreline clearance, building exclusion from water and absence of ordinary water-crossing streets.
- Normal bridge spans reach both banks and reference actual street segments; traversable connectivity excludes virtual water-boundary edges.
- River/street seed independence and deterministic city generation; moving bridge locations changes the actual crossing streets.
- Missing bridges, overlapping crossings and outside-city crossings are rejected. A concave small-city linear-street regression checks nearly identical intersection coordinates are joined.
- Three river widths across three rotated custom outlines. An additional diagnostic pass generated and validated 32 varied city/water seed combinations successfully.
- Water-only editing, undo, cancelled gestures and metadata preservation leave the accepted city untouched.
- Saved files retain exact water geometry, bridge metadata, unfinished invalid drafts and history; unknown compatible workspace fields survive later saves.
- Invalid banks, nonnumeric polygon points, unsupported versions, missing water references, ordinary roads across water and removed wall water openings are rejected.
- Frozen native 3D migration preserves all city, district, defense and workspace data while adding dry water state.
- Compiled-app interaction tests generate a water preview, drag a bridge through pointer events, apply it, reject removal of every bridge, download an invalid draft, load it exactly and undo its last bridge removal.

### Fortification coverage

- Exterior walls, real gate connections and safe towers across 96 outline × density × street-pattern configurations, plus eight rotated narrow-neck and narrow-inlet cases.
- Independent checks for simple enclosing rings, boundary clearance, full rendered street widths, unblocked openings, actual outside exits and connected perimeter junctions.
- Gateposts, towers and approaches avoid each other; wrapped gate cuts remove the exact requested opening length.
- Deterministic settings, independent seeds, gate counts and tower density; original city geometry and neighborhoods remain unchanged.
- Disable/re-enable preserves IDs and extension metadata. Disabling still works with unfinished invalid numeric controls. Undo restores prior defense geometry.
- Native file round trips include defense records, layer visibility, pending controls, collapsible panels and defense history.
- Invalid references, duplicate wall points, detached/blocked towers, walls crossing the city, invalid exits and unsupported future tower kinds are rejected.
- Frozen native 3C migration retains original city and district data with defenses unbuilt.
- Compiled-app checks build defenses onto an imported city, hide the layer without altering geometry, download/load, disable with a blank spacing field and undo the first build.

### District coverage

- Connected, complete, unique neighborhood coverage across 96 outlines × density × street-pattern configurations.
- Deterministic district seeds, automatic count and explicit counts of 1, 2, 4, 8 and 12.
- Independent geometry checks: district generation and every editing operation preserve streets, block polygons, properties, roofs, plaza, plots, open spaces and walls.
- Block transfers update all child properties/buildings and reject split sources, non-neighbor targets and empty districts.
- Name/color changes retain IDs and future extension metadata.
- Undo includes rebuilds, renaming and block moves; migrated legacy annotations survive undoing their first district generation.
- Save/load retains district identities, layers, selections, pending inspector text and history. Invalid district coverage, colors, references and history are rejected.
- The embedded app test exercises map selection, rename/recolor, block move, district undo, layer toggles and restored history after recovery.
- A frozen native 3B.1 project migrates to unassigned districts without changing city data. Earlier 3A.2 and 3B fixtures remain supported.

### Persistence coverage

- Exact save/load round trips across 96 outline, density and street-pattern configurations.
- Complete geometry, IDs, renamed metadata, unfinished drafts, undo snapshots, view and layer restoration.
- Unknown compatible extension fields, future type metadata and reserved district/wall records retained.
- Explicit schema-1 migration, including frozen data captured from the actual released 3A.2 and 3B standalone builds.
- Unsupported newer versions, malformed/truncated files, HTML, oversize input, invalid IDs, invalid geometry and excessive nesting rejected.
- Current/previous recovery, unchanged-content deduplication, queued writes, quota failures, corrupt current snapshots, newer-snapshot protection and multi-writer conflict handling.
- IndexedDB transaction completion/abort tested with a simulated adapter, plus localStorage fallback and fully blocked storage.
- File staging/cancellation, asynchronous read ordering, rollback after application failure and captured-revision unload protection.
- The embedded standalone script performs Blob download, preview/open, exact state restoration and a new-runtime reload/recovery using simulated browser APIs.

These tests exercise the persistence code and the compiled app; actual native browser file dialogs and storage policies remain in the manual checklist.

### Building placement

The new placement stress group covers 96 combinations: eight editable outlines × three street densities × four street patterns.

Checks include:

- Properties stay inside their block with clearance from the full rendered street width.
- Property envelopes have no positive-area overlap.
- Each base plot belongs to exactly one property; their combined area matches the property area.
- Each building fits inside its property and references exactly the plots its footprint occupies.
- Multi-plot buildings, courtyard holes, separate compound wings, attached rows and varying footprint areas exist in representative cities.
- Shared walls are allowed for attached rows; overlapping compound or row footprints are rejected.
- Each entrance access segment reaches the referenced frontage street.
- Open space remains and no property is allocated to the civic plaza.
- Populating blocks does not change street nodes, roads, block geometry or plaza geometry.
- Same inputs reproduce the complete project data.
- Runtime validation rejects overlapping properties and invalid references or escaped footprints.

### Existing geometry coverage

The previous 1,024 street configurations are still generated and tested, now with runtime-validated building population:

| Group | Configurations |
| --- | ---: |
| Seeded radial streets across three densities | 360 |
| Four street patterns across sizes and seeds | 480 |
| Eight starting outlines × three densities × four patterns | 96 |
| Former profile extremes and street patterns | 40 |
| Rotated, translated and perturbed concave outlines | 48 |

Additional tests check 1,200 survey configurations, reproducible IDs, invalid inputs, camera behavior, standalone HTML parity, drawing gestures and undo. The compiled app tests also exercise building/property counts, all three display layers and retention of the last good city after invalid generation. These tests use a simulated DOM and Canvas.

## Rendering checks

The production Canvas renderer was used with a native Canvas implementation to inspect full-city views for all four street patterns and a zoomed view of individual roofs. For this milestone it also rendered fortified organic, planned, branching and horseshoe cities, plus a gate closeup; wall gaps, street connections and tower placement were visually inspected. This checks generated geometry, building forms and drawing, not browser layout or native browser pointer delivery. Coastal rendering was inspected for organic, planned, branching and horseshoe cities with west/north/south/east oceans, plus a waterfront closeup. Ocean fill, shoreline roads and dry defenses were checked. Combined river/coast views were also inspected for organic, planned, twin-core and horseshoe cities, including a closeup of an unobstructed river mouth. Water rendering was additionally inspected for organic, planned, branching and horseshoe cities, plus a bridge closeup with actual connected roads, clear banks and wall passages.

## Graphical browser limitation

The host previously denied Chromium's process-singleton socket. No full graphical Chromium or Firefox pass is claimed for this milestone. The remaining Firefox checks are listed below.

## Manual Firefox checklist

Open `dist/mappo-0.1-dev.3e4.html` directly from disk.

- Drag a coastline handle past its neighbor and into a tight bend. Confirm guided movement replaces bend/order errors. Test endpoint dragging, insertion, undo and cancellation.
- Load an older invalid coastline draft. Test Tidy shoreline bends, automatic tidying on Generate city and water undo.
- Confirm the river, bridge records and chosen ocean side survive coastal tidying; real square or disconnected-island conflicts should still explain the placement issue.
- Drag a river handle past its neighbor and into a tight bend. Check handles respond gently without sharp/tangled-draft errors. Test undo and pointer cancellation.
- Double-click near the river and on an existing handle; check insertion snaps and no duplicate appears.
- Load an older invalid river draft. Confirm it loads exactly, then test Tidy river bends, Generate city and water undo.
- Generate a coast in each ocean direction. Drag/add/remove shoreline points, reroll water and confirm only a draft changes until Generate city.
- Swap land/water; check submerged-square feedback and retention of the previous city. Undo and regenerate.
- Generate a river then a coast, and repeat in reverse order. Check each feature and its seed survives changes to the other.
- Move/remove each feature separately, undo, and save/load both with separate pending seeds and selected shoreline handles.
- Inspect river mouths for an open channel and no road across the opening; move a bridge into ocean and check rejection.
- Confirm river width and bridge tools remain available when both features exist. Save/load a coast with an unfinished invalid draft and pending ocean direction.
- Inspect shoreline roads, building setbacks, outer wall termination and absence of streets/towers in ocean. Test a concave outline and a disconnected-island draft.
- Load a native 3E river project; compare its accepted map, unfinished edits and water undo history.
- Generate a river; verify the current city stays intact until Generate city. Drag points, change width and reroll only water.
- Move, add and remove bridges. Generate and inspect both ends; streets should connect to waterfront roads.
- Try overlapping bridges, a crossing outside the city, a sharp/backtracking river bend, a river through the square and removing every bridge. Check useful errors and retention of the prior city.
- Save/reload accepted water and an unfinished invalid water draft; test water undo and Revert water draft.
- Remove the river from the draft and generate dry land. Change only the street seed and confirm the river remains fixed.
- Pan using Space/middle drag while editing water; press Escape, test fit and resize. Inspect wall river openings and nearby towers.
- Adjust gate count, tower spacing and defense seed; Build / update. Confirm only defenses change.
- Disable walls and apply, then re-enable with the same settings; check geometry is retained. Toggle the display layer separately.
- Save/load defenses and their undo history. Load a 3C file and confirm no walls appear until explicitly built.
- Inspect a concave city and each gate at high zoom. Check clear openings, connected approaches, unclipped towers and fit bounds.
- Collapse both editing panels; save/load and confirm their states.
- Generate all four street patterns. Confirm variation in building sizes, shapes, spacing and open ground.
- Zoom in on an L-shaped building, courtyard, compound and attached row. Confirm streets and the main square remain unobstructed.
- Toggle buildings, property boundaries and plot divisions. Find a large building extending across several plot divisions.
- Draw a concave or branching outline; generate buildings inside it.
- Move the town center and regenerate; confirm no building occupies the new square.
- Change seed and density. Confirm the chosen outline and center remain fixed.
- Drag, add and remove outline points; test Undo edit and Revert edits.
- Try a crossed outline and narrow neck. Confirm a useful message and retention of the prior city.
- Pan, zoom, fit and resize. Check layer controls remain reachable by scrolling the left panel on narrow windows.
- Download a `.mappo.json` file. Change the city, load the file, review the preview and confirm Open project. Compare the outline, buildings and view.
- Save an incomplete clicked outline, then reload it and continue editing.
- Reload the HTML. Restore latest recovery, then test previous recovery. Check that the startup default city does not overwrite recovery before a choice.
- Disable browser storage and confirm that a visible warning appears while file download/load still works.
- Click a neighborhood in Pan map mode. Rename/recolor it; move a boundary block to a neighbor; test district undo and all three district layers.
- Try moving a connecting block that would split a district and check the explanation.
- Save a renamed district, an unfinished inspector name and undo history. Reload, then undo the district edit.
- Load a 3B.1 project; confirm its original map remains unassigned until Generate districts is chosen.
- Test Ctrl/Cmd + S and the browser’s JSON file picker. Keep portable files when updating the HTML build.

## Multiple lakes (3E.5)

Automated coverage includes three lakes across 32 outline/street combinations, lake-first and lake-last river/coast generation in four ocean directions, eight independent lakes, closed-edge insertion, safe deletion, guided extreme drags, cancelled whole-lake moves, stable identities/metadata on regeneration, selective removal/undo, exact project/draft round trips, corrupted bank rejection and a native schema-7 migration fixture. The standalone integration workflow exercises Add lake twice, selection, center movement, undo, Generate city, project download/load and pending inputs.

Native Firefox checks pending for this release:

1. Open the standalone HTML, add two lakes, and select each from the list. Edit one shore and confirm the other stays fixed. Drag a handle sharply through the opposite shore; the draft should self-adjust without tangling.
2. Double-click the closing edge to add a handle; select it and Delete. Use Move lake to drag the whole lake, including toward a concave city edge. Escape should exit the tool; pointer cancellation should restore the gesture.
3. Generate city and inspect inland waterfront roads and dry buildings. Add a river and coast, then generate again. Remove only one lake and undo.
4. Download and reload a project with several lakes, an active lake tool and pending lake seed/size. Confirm accepted geometry, all drafts, selection and undo restore exactly. Load a previous build's save and add a lake.

Automated Canvas checks do not replace a native Firefox interaction pass.

## Mountains and passes (3E.6)

Automated coverage includes surrounding, inland and edge-crossing mountains across 96 outline/street/placement combinations; exact total face coverage and property setbacks; a full dividing ridge requiring a real pass; pass movement and undo; multiple ranges combined with lakes, river and coast; guided footprint/ridge edits; individual peak heights; whole-range movement and cancellation; closed-edge insertion/deletion; selected regeneration/removal with metadata retention; six-range and height boundaries; exact save/load of accepted geometry and invalid drafts; corrupt terrain/face/pass rejection; and native schema-8 migration. The compiled app workflow exercises generation, movement, height editing, applying terrain, independent water preservation, portable download/reload, pending settings and tool switching.

Native Firefox checks pending:

1. Add one surrounding range and one inland range. Fit map, select each, reshape foothills and move a range. Drag a sharp footprint bend and a ridge handle beyond its neighbors; the shape should self-adjust.
2. Select each peak and change height. Confirm contour/peak detail changes, undo works and the other range remains fixed. Double-click the closing foothill edge and remove the new handle.
3. Move an inland pass along the ridge, add another crossing, then generate. Inspect road connections, mountain setbacks and perimeter wall/tower gaps. An unsuitable crossing must preserve the last accepted city.
4. Combine mountains and water without overlapping footprints. Save unfinished terrain edits and pending controls; reload and verify accepted geometry, selection, inputs and undo. Load a prior water-only save and add terrain.

Native Canvas renders verify appearance, but do not replace a Firefox interaction pass.

## UI overhaul Phase 1 (`0.1-dev.ui1`)

Automated coverage adds workspace navigation and accessibility state, provider registration and safe text rendering, inspector selection/pin/collapse/clear behavior, automatic clearing of removed records, read-only feature adapters, and compiled application navigation with exact preservation of accepted geometry, completed outline/water/terrain drafts, pending inputs and histories. It exercises original gesture cancellation when leaving a water editing section, existing save/load/recovery workflows and restored active editor modes.

Graphical Chrome checks confirm City opens first, Landscape uses the working feature editors, adding a lake opens its live summary, an empty pinned inspector stays visible, unpinning collapses an empty inspector, and restoring/collapsing panels resizes the actual Canvas. Both collapsed panels give the Canvas the full map width without page overflow. Navigation controls retain visible selected/focus styling.

Native Firefox verification and the wider desktop/ultrawide/narrow-screen matrix remain pending. Full inspector editing, a combined landscape feature list and persisted shell preferences are later phases, not part of this build.

## UI overhaul Phase 2 (`0.1-dev.ui2`)

All 129 automated tests passed. New tests cover shared menu keyboard/focus/dismissal behavior, asynchronous file-result visibility, recovery attention, and actual template ancestry/unique IDs for compact City, shared file/layer/map controls and expandable seeds. The compiled standalone workflow checks revealed load previews, explicit Open project, recovery and invalid-file errors alongside existing exact project/draft/history/input/layer restoration.

Chrome checks verify the actual City layout, Project recovery staging/cancellation, shared Layers access from Defenses and working property/plot/fortification visibility toggles. Native Firefox and the broader responsive/ultrawide matrix remain pending. Schema and generation/geometry modules are unchanged.


## UI overhaul Phase 3 (`0.1-dev.ui3`)

The full suite passes 135 tests. New focused tests cover hit priority and zoom tolerance, no geometry mutation during selection/hover/filtering, keyed rows, creation visibility/limits, pending per-feature controls, missing-record clearing and selection identity through undo. The compiled app additionally exercises actual map pointer selection and matching inspector forms, conflicting filter reset, scoped removal/undo, portable Select/Pan selection, pending seed restoration and safe stale-reference loading. Save validation checks optional selection bounds, compatible fields and older files.

Chrome checks create a river, coastline, two lakes and a mountain range through the new picker and successfully rebuild the city with all five records. List and actual map clicks open the corresponding selected-feature form in Select/Pan. Filters retain records/geometry, blank clicks clear selection, removal hides only the selected lake, and shared water undo restores it. Actual project download → validated preview → explicit Open restores the selected lake and pending seed while loading 297 saved buildings directly. Final layout has no horizontal page overflow at 1363 px. Native Firefox and the full responsive/ultrawide matrix remain pending.

## UI overhaul Phase 4A (`0.1-dev.ui4a`)

Additional focused tests cover the keyed district list, contextual inspector visibility, district selection and editor input preservation. The compiled application tests also assert that map block selection opens Districts and the right-hand district form, and that reselecting a block does not destroy an unfinished district name. Full verification and the native Firefox graphical pass are tracked separately; implementation and test additions are not themselves proof that browser checks passed.

## UI overhaul Phase 4B (`0.1-dev.ui4b`)

The new defense workflow tests cover initial build, no-op, enable-only, disable-only, changed-settings regeneration, invalid enabled settings, disabled walls with temporarily invalid numeric controls, pending-preview input events and geometry immutability during preview. The compiled-app workflow additionally verifies inline preview transitions around an imported unfortified project, first defense update, disabled walls and saved controls. Full suite/CI verification is recorded separately; native Firefox and the responsive graphical matrix remain outstanding.

**Phase 4B verified:** Commit `ba76f4043b844eee4eb62c0598614d8e61bea084` passed the GitHub Actions `npm run check` workflow with **141/141 tests passing** (0 failed). Rebuilding from modular source produced an exact match to committed root `index.html` and `dist/mappo-0.1-dev.ui4b.html` (`git diff --exit-code` succeeded). CI run: https://github.com/xbwtyz/Mappo/actions/runs/44215804436. Native Firefox and the wider responsive/ultrawide graphical matrix have not been completed.

## UI overhaul Phase 4C (`0.1-dev.ui4c`)

The Phase 4C compiled-app integration test exercises invalid district naming and invalid defense spacing (both must be atomic), valid district edits, two defense updates, preservation of unrelated geometry, saving both histories together, staged native project reload, and interleaved district/defense undo back to the original city. Map-driven selection also asserts that the matching neighborhood list row is scrolled into view. The native Firefox/browser-width matrix remains a separate Phase 7 requirement. Results of the final `npm run check` CI run must be recorded after verification.

**Phase 4C verified:** On commit `e7c2a40f505c643fcf0712aad6214f36a278728f`, GitHub Actions [run 44217250343](https://github.com/xbwtyz/Mappo/actions/runs/44217250343) passed **141/141 tests** with zero failures. Rebuilding the checked-in `index.html` and `dist/mappo-0.1-dev.ui4c.html` produced no differences (`git diff --exit-code` passed), confirming the exact standalone build. This includes all earlier generator, geometry, migration, water, mountain, district, defense and save/recovery regressions plus the new combined Phase 4 scenario. Native Firefox and 32:9/narrow responsive graphical checks are still pending Phase 7; automated DOM/Canvas stubs are not a substitute for them.

## Phase 5A (`0.1-dev.ui5a`)

Focused unit tests cover unchanged accepted geometry despite stale dirty flags, changed outline/center, street generation controls, water and terrain drafts, local district input and invalid defense settings. The compiled app test checks pending seed change and post-rebuild clearing. Full regression and generated standalone parity remain required before considering this chunk complete.

## Phase 5B–5D (`0.1-dev.ui5d`)

The new undo selector unit tests cover editor priority, section routing, landscape selection and disabled empty histories. Validation guidance tests cover atomic failure messages and relevant field targeting. Section tool scroll tests verify separate positions for all tabs, selection preservation across navigation and reset on project load. The full regression suite and exact compiled HTML parity must pass in the Phase 5 branch CI before sign-off. Native Firefox and desktop/ultrawide/narrow graphical passes remain Phase 7 tasks.

**Phase 5 verified:** The standalone `0.1-dev.ui5d` build completed [GitHub Actions run 44221461150](https://github.com/xbwtyz/Mappo/actions/runs/44221461150) with **150 of 150 tests passed**, zero failures, and successful `git diff --exit-code` confirming the committed root `index.html` and `dist/mappo-0.1-dev.ui5d.html` exactly match the canonical modular build. Phase 5A pending-model tests, 5B undo scope tests, 5C validation guidance tests and 5D navigation scroll tests are included alongside all previous generation, persistence and geometry regressions. This does not constitute native Firefox or responsive graphical validation, which remain scheduled for Phase 7.

## Phase 6A (`0.1-dev.ui6a`)

Readability stylesheet regression checks cover principal label/control size, focus outlines, selected tool states, and narrow-screen spacing. Full generator, history, project and compiled-app regressions remain required, as does byte-for-byte root/dist parity.

## Phase 6B (`0.1-dev.ui6b`)

Shortcut scope and multi-pointer regressions verify form editing immunity, active map shortcuts, exclusive pointer ownership, cancellation and no double completion. Existing compiled-app Space-drag, Undo, map gestures, generator and save/recovery tests remain authoritative. Browser-specific keyboard QA remains Phase 7.

## Phase 6C (`0.1-dev.ui6c`)

CSS media breakpoints are exercised by a source contract test for desktop/ultrawide/mobile rules, with Camera resizing unit checks for unchanged world center, zoom and screen conversions. Native Firefox and Chrome graphical layout checks remain Phase 7 tasks and are not claimed here.

## Phase 6D (`0.1-dev.ui6d`)

The optional workspace UI state is validated with strict bounded values and safe defaults, including selection resolution and per-feature input caches. Compatibility checks confirm schema-9 saved geometry, legacy no-UI files and retained extension properties survive round trips. Browser recovery uses the same validated document. Full compiled-app and save/load regressions and root/distribution build parity are required before Phase 6 sign-off; native Firefox/Chrome graphical QA remains scheduled for Phase 7.

### Phase 6 final automated verification

The complete `0.1-dev.ui6d` application suite passed **161/161 tests**, including unchanged schema-9 geometry, legacy workspace defaults, optional bounded UI state, unknown compatible key preservation, recoverable stale selections, restored district/landscape drafts, valid section/panel/scroll restoration and intact editor histories. The root/distribution exact-build check is recorded in [GitHub Actions](https://github.com/xbwtyz/Mappo/actions/runs/44227085307). Native Firefox/Chrome graphical and 32:9/narrow-screen checks remain Phase 7 and are not implied by the automated suite.

## Phase 7 final UI overhaul QA (`0.1-dev.ui7d` review candidate)

- Phase 7A: [163/163 automated tests](https://github.com/xbwtyz/Mappo/actions/runs/44236130079). All 93 static interactive controls from `0.1-dev.3e6` remain in the redesigned template.
- Phase 7B: [166/166 tests](https://github.com/xbwtyz/Mappo/actions/runs/44236853696) with explicit schema-9 geometry round trips, optional workspace UI state, browser-recovery previous/current snapshots, scoped Undo and pending-change immutability.
- Phase 7C: [167/167 Node tests and 8/8 real-browser viewports](https://github.com/xbwtyz/Mappo/actions/runs/44238779274). Chromium and Firefox tested at 1440×900, 5120×1440, 768×1024, and 390×844. Test screenshots reviewed and narrow drawer pointer-blocking regression corrected in the CSS stacking model.
- Phase 7D: source/package/distribution version alignment and offline standalone parity checked by `npm run check` and GitHub Actions. The browser suite additionally covers exporting a portable project and reopening it from staged file selection on desktop. Final CI evidence and manual-gesture limitations are maintained in `PHASE7_QA.md`.

The Phase 7 release candidate does not introduce generator changes or a city/workspace/container schema migration. The branch remains unmerged pending explicit approval. Headless browser smoke testing is not a replacement for in-person full drawing, pen/touch gestures, or device-specific usability review.

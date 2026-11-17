# Mappo 0.1-dev.3d validation

## Automated checks

**74 automated tests passed**, covering fortifications, districts, persistence and existing city generation.

Run `npm run check` to rebuild and run the complete suite. All road-crossing checks remain enabled.

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

The production Canvas renderer was used with a native Canvas implementation to inspect full-city views for all four street patterns and a zoomed view of individual roofs. For this milestone it also rendered fortified organic, planned, branching and horseshoe cities, plus a gate closeup; wall gaps, street connections and tower placement were visually inspected. This checks generated geometry, building forms and drawing, not browser layout or native browser pointer delivery.

## Graphical browser limitation

The host previously denied Chromium's process-singleton socket. No full graphical Chromium or Firefox pass is claimed for this milestone. The remaining Firefox checks are listed below.

## Manual Firefox checklist

Open `dist/mappo-0.1-dev.3d.html` directly from disk.

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

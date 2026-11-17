# Mappo 0.1-dev.3b1 validation

## Automated checks

**56 automated tests passed**, including persistence and prior city-generation checks.

Run `npm run check` to rebuild and run the complete suite. All road-crossing checks remain enabled.

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

The production Canvas renderer was used with a native Canvas implementation to inspect full-city views for all four street patterns and a zoomed view of individual roofs. This checks generated geometry, building forms and drawing, not browser layout or native browser pointer delivery.

## Graphical browser limitation

The host previously denied Chromium's process-singleton socket. No full graphical Chromium or Firefox pass is claimed for this milestone. The remaining Firefox checks are listed below.

## Manual Firefox checklist

Open `dist/mappo-0.1-dev.3b1.html` directly from disk.

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
- Test Ctrl/Cmd + S and the browser’s JSON file picker. Keep portable files when updating the HTML build.

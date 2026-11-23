# Mappo User Guide

**Stable release:** [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) · [Standalone HTML](../../dist/mappo-0.2.0.html) · [Hosted Pages (separate deployment)](https://xbwtyz.github.io/Mappo/) · [Docs index](../README.md)

Mappo opens directly from its HTML file with no server. Portable project downloads are the recommended backup.

## 0.2.0 desktop workspace (published)

Some detailed sections below retain historical v0.1.0 control names. The **published v0.2.0** desktop/laptop build uses the three-tab **Generation / Add / Roads** workspace at widths of 1000 CSS pixels and above.

- **Generation:** City outline, main square, street pattern, districts and defenses. Preview a changed city and review the proposal before Apply. Preview alone does not change accepted geometry.
- **Add:** Create a property, place a building after selecting its property, or work with rivers, coastline, lakes and mountain ranges. Landscape changes use their own draft/Undo and a separate city rebuild.
- **Roads:** Select an ordinary road or junction, preview movement and connection changes, review impacts and resolve building placement blockers. Open the impact dock, or a linked accepted/proposed comparison when wide enough. Apply still performs independent validation.
- **Inspector:** Select an existing property to adjust its footprint, split or merge it, modify plots or access buildings. Building edits cover transforms, vertices, edges, wings, courtyard holes and identity/use changes. Undo/Redo remains specific to the active editor.
- **Project / Layers:** Download or open portable `.mappo.json`, recover local snapshots, export visible-map or whole-city PNG, change layers and navigate by keyboard.

The separate `?workspace=legacy` desktop entrypoint is retired. Narrow-window compact controls are retained for compatibility but phone/touch acceptance is **not** a 0.2G release target. Drafts never silently replace the accepted city; supported historical project files migrate without regenerating roads or building geometry. The [G4 acceptance report](../history/0.2/workspace/g4-acceptance-report.md), [H4 release QA](../history/0.2/release/h4-release-qa-report.md) and [0.2.0 release notes](../releases/v0.2.0.md) record the browser, backup and offline release evidence.

**Note:** Some historical reference instructions below may describe v0.1 behavior or limitations superseded by the published v0.2.0 release. The public Pages site is published manually and might not be the latest `main` build.

## 1. Create a city

1. In **City**, choose a starting outline—rounded, organic, long, rectangular, wedge, twin-core, branching or horseshoe—or draw one with **Freehand** or **Click points**. For click points, use **Close outline** or Enter when finished.
2. Choose **Edit outline points** to move corners. Double-click an edge to insert a corner, or Delete to remove a selected one. **Undo outline edit** reverses outline changes.
3. Choose **Place main square** and click inside the boundary, or keep the suggested position.
4. Choose **Organic**, **Planned**, **Radial** or **Linear** streets and set the density and seed. Press **Generate city**.

The draft boundary and street settings are separate from the last accepted city. Failed validation keeps that accepted city instead of replacing it. Changes to street pattern or seed do not secretly reshape the city boundary.

## 2. Navigate the map

- **City**, **Landscape**, **Districts** and **Defenses** switch tool sections. **Layers** toggles building/property/plot/district/defense visibility.
- Choose **Select / Pan** to inspect or move the map; middle-button drag or Space + drag pans from other tools.
- Scroll to zoom; `+`/`-` also adjust zoom. Press `0` or **Fit** to frame the city.
- Escape leaves the current editing tool. Map **Undo** adapts to the active editor/selection. Collapse **Tools** or **Inspector** to expand the map.

## 3. Inspect properties and buildings

In **Select / Pan**, clicking a roof, yard or courtyard selects the owning **property** first. The Inspector shows its generated use, site area, plot/building references, district, block and frontage. Choose a linked building in the Inspector to see that structure's own generated type, shape, net footprint area, occupied plots and parent property. **Back to property** returns to the site.

Properties remain selectable if at least one of **Buildings**, **Properties** or **Plots** is visible. Selecting an individual building requires the Buildings layer. Invalid or hidden saved selections clear safely instead of pointing to another record.

### Names and descriptive uses

Expand **Edit property identity** or **Edit building identity**. Enter a name, choose a descriptive use (or **Other** for custom text), then **Apply identity**. **Discard draft** cancels unapplied changes; blank fields remove overrides and show generated descriptions. Each field allows up to 80 characters.

Properties and buildings have independent identities, including separate compound wings. Applied names/uses survive save/load, but identity drafts and the 20-step **Undo identity** history are **session-only**. Full city regeneration may replace building IDs and discard identities; Mappo warns before this happens. Local district/defense updates retain them.

### Splitting a property — included in v0.2.0

> Property splitting, adjacent merging and plot-count editing are available in published v0.2.0; they were not in historical v0.1.0.

In City / Select, select a property and choose **Split property** in the Inspector. An editable line runs straight from the street frontage to the rear. Drag the highlighted divider on the map or enter **Divider along frontage (%)** for precision. Two shaded resulting parcels and their areas, frontage lengths, plot count and building ownership appear in the preview.

Both parcels must keep usable street frontage and enough valid area. The frontage-start side keeps the original property's ID, name and custom identity; the other gets a new ID. Buildings remain physically unchanged. A building that crosses the dividing line or whose access runs through the other parcel blocks Apply. When moving a protected building's **ownership** to the right-hand parcel is safe, the Inspector requests an explicit approval; nothing is transferred without authorization.

**Reset** returns the line to its middle position, **Cancel** or Escape discards the draft, and **Apply property split** is available only after preview validation. Apply independently verifies the entire schema-9 city and portable save/reopen, creating one coupled edit. **Undo property split** and **Redo property split** are available in City tools during this session; the accepted two-property geometry survives downloads, but edit history and unfinished previews do not.

E2 supports one straight frontage-to-rear division of an existing convex four-corner property. Later 0.2E functionality provides adjacent-property merging and independent plot-count changes under their own validations.

### Building Edit Mode (3G-D, retained in 3H)

In the Property Inspector, choose a linked building, then click **Edit building footprint**. A turquoise preview outline appears, plus a floating **Building Preview** control panel. Choose **Move** and drag inside the active roof; **Rotate** and drag the circular angle handle; or **Resize** and drag a corner/edge square. You can also enter precise **X/Y offsets**, **Angle (degrees)**, **Width** and **Depth** in survey units. The preview transforms courtyard holes, entrances and access paths together but never changes the accepted city. Switch to another roof on the same property to start a fresh preview; clicking elsewhere does not steal focus. Space + drag or middle-button drag still pans, and scrolling zooms.

Choose **Reset preview** to return the ghost to its original footprint, or **Cancel preview** to discard it and leave editing. **Exit building editing**, Escape, Back to property, switching workspaces/tools, hiding Buildings, regeneration and project load also leave editing. The panel warns that an unfinished preview is unsaved; explicit exit/reset or switching building asks for confirmation. Automatic project transitions discard the preview only, not accepted city data. A saved project retains the normal Inspector selection but **never** a preview.

The preview outline turns green for a valid edit and red for a problem. For a building or compound move, Mappo keeps a usable entrance route where possible, then tries other straight paths to the existing street. If those fail, it can try a side street with a verified parcel edge. The map shows the proposed door and route, and the preview identifies any street change or a detected obstruction. **Apply to City** updates the building and its access together after validation. The property's primary frontage stays in place.

Applied edits are part of the accepted project and can be preserved with **Project → Download project** and compatible browser recovery. The transformation preview itself is *never* saved. **3G-D provides Undo building and Redo building** within Building Edit Mode after a validated Apply. One accepted Apply creates one history step for that building, up to 20 accepted steps across the session. History is scoped to the selected building; a different property's history cannot silently replace its footprint. You must Apply or reset an unfinished draft before using history. Keyboard shortcuts: Ctrl/Cmd+Z for scoped building Undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z for building Redo (never while typing into form fields). Undo/Redo validates the full schema-9 project and its portable round trip before accepting any change. The accepted geometry persists in downloads/recovery, **but the session-only Undo/Redo history resets on project load, recovery, and regeneration**.

### Manual building placement and structural edits (3H, expanded in Dev 4e)

From a selected **property**, use **Add building to this property** in the Inspector. The floating placement panel shows a *ghost* footprint. Choose **Rectangle**, **L-shape**, **Courtyard**, or **T-shape**; choose the building use, then drag the ghost, click inside the owning property, or enter numeric frontage/inward position, width, depth, and angle. Invalid placements are red and **Apply to City** is disabled until the preview passes property boundary, collisions, occupied plots, and frontage-road checks. Many generated properties are already largely occupied, so removing/replacing a building or reducing dimensions may be necessary before a new one fits.

From an individual building Inspector, use **Replace building (preview)** to keep its ID and custom identity while replacing its footprint/use after validation. **Delete building…** requires confirmation and removes only the building; the property and plots remain. After any accepted structural change, use **Undo structure** or **Redo structure** when that property is selected. These operations are scoped to the property and are checked against the complete saved-project validator. Session histories may become unavailable if another edit changes related geometry; Undo geometry first or keep a project backup. All committed buildings survive project save/load; placement drafts and structural Undo/Redo history do not. Regeneration and project load clear structural history. This feature does not support moving buildings between properties or editing property boundaries.

### Buildings inside courtyards

Select the enclosing building’s property and choose **Add building to this property**. In **Courtyard access**, select the enclosing building. Position a single-footprint building inside its courtyard. Choose an existing portal, or select **New portal** and set the courtyard wall, exterior wall, opening positions and width. The C and E labels on the map match the courtyard and exterior wall selectors. Angled walls can share a portal if the entire passage clears both openings and the surrounding corners. A valid preview shows the opening strip and the route from the new door to the property’s street. Several buildings can share a portal when each route is clear.

Select **Edit portals only** to add, adjust or remove a portal without placing a building. Before removing a portal in use, select another portal that can serve the buildings using it. **Apply to City** commits the portal, independent buildings and their validated routes in one Undo/Redo step. A building, property or road edit that would block a route reports the conflict before Apply.

Courtyard access supports one level of independent occupancy on the same property. Use this build or a later compatible build to open a project with authored portals. Keep a backup before opening a project in an older standalone.

### Property and plot editing (3I, stable)

Select a property and choose **Edit property geometry**. Mappo displays the parcel boundary, its four draggable corners and its existing plot subdivisions. Tap a corner or use the numeric **Corner X/Y** fields to adjust its position; choose a plot divider and change its percentage along the frontage to distribute space between plots. **Reset preview** restores the last accepted land geometry; **Cancel preview** discards it.

The preview reports exactly why a change is invalid, including nonconvex shapes, illegal subdivision, street setbacks, overlaps with another property, and buildings that would end up outside the parcel. **Apply to City** is enabled only when a changed parcel and every dependent plot and building reference pass complete schema-9 validation and a save/load round trip. Mappo changes the property and its plots atomically; it never silently moves or deletes existing buildings or roads.

After Apply, use **Undo property** or **Redo property** in Property Edit Mode. Accepted edits survive project download and recovery, but the 20-step session-only geometry history does not. Finish or reset any unfinished preview before using history. Ctrl/Cmd+Z undoes an accepted property edit and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes one when map shortcuts are active.

3I does not split or merge plots/properties, change the number of plot IDs, alter roads, or edit arbitrary concave property shapes.

### Dev 4 editing improvements

- Select a **property** and use **Delete property…** to remove it with confirmation. Undo/Redo restores the property and its owned plots/buildings together during the current session.
- Select a property and use **Clear all buildings…** to remove all its buildings in a single confirmed transaction. One **Undo clear** restores them; **Redo clear** removes them again. Clear is unavailable when the Buildings layer is hidden.
- While editing a property corner, building position or building placement preview, use the nudge arrow buttons or **canvas-focused arrow keys**. Choose a movement increment of 0.1, 0.5, 1, or 5 map units.
- Building/property previews show dimensions, positions and area changes. Invalid edits identify affected city objects where possible and offer corrective suggestions.
- Select a property/building and focus the map on that selection; use scoped Delete only outside an active preview. Backspace is reserved for the relevant point-editing tools.
- **Layers** offers Presentation, Planning, Minimal and All-layers presets. Manual checkbox changes become Custom. Visibility changes do not change accepted city geometry.

## 4. Landscape tools

Open **Landscape** to find rivers, coastlines, lakes and mountain ranges. Select one from the list or map, then choose a specific shape/move/edit action in its Inspector; selection alone does not start reshaping.

- **River and coastline:** Adjust course/shoreline points. The editor guides problematic sharp bends to valid positions instead of silently accepting crossing geometry.
- **Lakes:** Create and edit independent closed shorelines; up to eight lakes in this release.
- **Mountain ranges:** Add up to six ranges in surrounding terrain, inside the city or crossing the city edge; edit their footprint/placement.
- **Bridges:** Road-water crossing relationships follow existing water and road editing, rather than arbitrary placement as buildings.

Use the feature-specific apply/commit action to accept valid drafts. Feature editors retain their own supported Undo histories. [Water reference](../reference/WATER.md) · [Terrain reference](../reference/TERRAIN.md).

## 5. Districts and defenses

**Districts:** Set automatic or manual (1–12) neighborhood counts, rebuild connected districts locally, select a neighborhood and edit its name, color or connected-block membership. District rebuilding does not regenerate city buildings or streets. [Reference](../reference/DISTRICTS.md).

**Defenses:** Configure perimeter walls, gates and towers using **Update defenses** without rebuilding the underlying roads. You can disable walls while retaining defense data. [Reference](../reference/FORTIFICATIONS.md).

## 6. Save, open and recover

- **Project → Download project** (or Ctrl/Cmd+S) requests a portable `.mappo.json` file. Confirm the browser actually saved it. Enter an optional **Download filename** in the Project menu to control the JSON filename.
- **Project → Download visible map (PNG)** saves the current canvas, including the visible layers and any editing previews.
- **Project → Whole-city PNG** exports the accepted map with the current layer settings and map background. **Developed city** frames roads, blocks, properties, plots, buildings and built defenses. **Full survey** frames the survey boundary and surrounding terrain within it. Choose **2,048 px** or **4,096 px** on the longest side. The menu shows the exact dimensions. The map stays at your current zoom and selection, and drafts stay out of the image. Both PNG modes use the optional download filename.
- **Project → Load project** reads/validates the file and previews it before **Open project** replaces your workspace; Cancel retains your city.
- **Restore latest recovery** or **Restore previous recovery** uses browser-local snapshots where available. Browser recovery is *not* a durable backup; clearing browser data or blocked storage can remove it.

Portable files retain accepted geometry, applied identities, editor state, camera position and valid optional Inspector selection **without rerunning city generation**. Older supported project formats migrate explicitly; unsupported newer formats are rejected. File limit: **20 MiB**. [Project format](../reference/PROJECT_FORMAT.md).

## 7. Known limits

Accepted Undo/Redo history is session-only and unavailable after reopening a project. Cross-property transfers and 3D visualization remain outside the current editor scope. See [Roadmap](../plans/README.md).

The [archived complete 3F-D README](../history/README-pre-cleanup-3fd.md) includes more extensive feature notes and historical milestone descriptions.

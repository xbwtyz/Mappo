# Mappo User Guide

**Version:** `0.1-dev.3fd` · [Live app](https://xbwtyz.github.io/Mappo/) · [Standalone HTML](../dist/mappo-0.1-dev.3fd.html) · [Docs index](README.md)

Mappo opens directly from its HTML file with no server. Portable project downloads are the recommended backup.

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

## 4. Landscape tools

Open **Landscape** to find rivers, coastlines, lakes and mountain ranges. Select one from the list or map, then choose a specific shape/move/edit action in its Inspector; selection alone does not start reshaping.

- **River and coastline:** Adjust course/shoreline points. The editor guides problematic sharp bends to valid positions instead of silently accepting crossing geometry.
- **Lakes:** Create and edit independent closed shorelines; up to eight lakes in this release.
- **Mountain ranges:** Add up to six ranges in surrounding terrain, inside the city or crossing the city edge; edit their footprint/placement.
- **Bridges:** Road-water crossing relationships follow existing water and road editing, rather than arbitrary placement as buildings.

Use the feature-specific apply/commit action to accept valid drafts. Feature editors retain their own supported Undo histories. [Water reference](reference/WATER.md) · [Terrain reference](reference/TERRAIN.md).

## 5. Districts and defenses

**Districts:** Set automatic or manual (1–12) neighborhood counts, rebuild connected districts locally, select a neighborhood and edit its name, color or connected-block membership. District rebuilding does not regenerate city buildings or streets. [Reference](reference/DISTRICTS.md).

**Defenses:** Configure perimeter walls, gates and towers using **Update defenses** without rebuilding the underlying roads. You can disable walls while retaining defense data. [Reference](reference/FORTIFICATIONS.md).

## 6. Save, open and recover

- **Project → Download project** (or Ctrl/Cmd+S) requests a portable `.mappo.json` file. Confirm the browser actually saved it.
- **Project → Load project** reads/validates the file and previews it before **Open project** replaces your workspace; Cancel retains your city.
- **Restore latest recovery** or **Restore previous recovery** uses browser-local snapshots where available. Browser recovery is *not* a durable backup; clearing browser data or blocked storage can remove it.

Portable files retain accepted geometry, applied identities, editor state, camera position and valid optional Inspector selection **without rerunning city generation**. Older supported project formats migrate explicitly; unsupported newer formats are rejected. File limit: **20 MiB**. [Project format](reference/PROJECT_FORMAT.md).

## 7. Known limits

Freeform building move/rotate/resize, placing/replacing buildings, PNG export and 3D visualization are not implemented yet. See [Roadmap](ROADMAP.md).

The [archived complete 3F-D README](history/README-pre-cleanup-3fd.md) includes more extensive feature notes and historical milestone descriptions.

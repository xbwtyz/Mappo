# Mappo 3F-Aa — Property-first selection

User-approved adjustment after 3F-A, before 3F-B. Branch: `feature/building-inspector-3f`.
Checkpoint version: `0.1-dev.3faa`.

## Goal

Select the property as the enduring site for future building changes. A property can contain one courtyard building, several compound wings, or other independent footprints. Each building remains individually inspectable through its parent's Inspector.

## Implemented steps

1. **Property hits:** test accepted property polygons, including roofs, yards and courtyard interiors. Use zoom-aware three-pixel outer-edge tolerance; interiors outrank nearby edges and equal hits follow property paint order.
2. **Map routing:** eligible Select/Pan clicks route landscape → property → district/block. Drawing tools, dragging, pointer cancellation and independent histories retain their original ownership.
3. **Property Inspector:** show the property ID, generated usage, number of plots and linked buildings. Resolve two-way building/property references and expose individual building buttons. Empty properties show an explicit empty state.
4. **Child navigation:** each structure, including compound wings, opens its existing Building Inspector. Back to property returns to the parent. Native buttons support keyboard use and focus the new heading after navigation.
5. **Visual/lifecycle integration:** hover/selection outline the property boundary; a selected building shows a dashed parent boundary and its own exact footprint outline. Missing references clear safely; project replacement and full rebuild clear both kinds even if IDs are reused. Local record-preserving updates retain valid selection.
6. **Verification and packaging:** test hits, navigation, relationships, layers, gestures, geometry retention, downloads and browser layout/interaction. Compile `dist/mappo-0.1-dev.3faa.html` with exact root `index.html` parity. Commit the checkpoint and QA results without merging or deployment.

## Layer behavior

At least one of Buildings, Properties or Plots must be visible for property selection. The hover/selected overlay reveals the property boundary independently of the normal property-outline layer. With roofs hidden, building buttons remain listed but disabled and guidance explains how to show them. Hiding roofs returns a selected child to its parent when another development layer is visible. Hiding all three layers clears property/building selection and exposes full district-block selection.

## Persistence and future milestones

This checkpoint changes view selection only. Accepted property/building records, usage, plot membership, geometry, generators and histories are unchanged. City schema remains 9 and workspace schema remains 1. Property/building selection stays session-only: captures write a null inspector selection, preserving valid project download/recovery. Portable selection is 3F-D.

3F-B now expands read-only property facts and secondary building facts. Review 3F-C's metadata/customization scope around the property as the primary site and explicit per-building overrides before implementation. Manual footprint editing, replacement, placement and removal remain later milestones.

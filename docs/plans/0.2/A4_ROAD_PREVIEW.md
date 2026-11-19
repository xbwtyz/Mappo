# 0.2A / A4 — Road inspection and temporary junction preview

Implementation branch: `feature/mappo-0.2a-a4-road-preview`, based on merged A3 PR #24 (`1b66ca5`). Version `0.2-dev.a4`; schema remains **9**. A4 merge requires separate owner approval and green CI.

## Controls and behavior

1. In **City**, choose **Pan**, finish/cancel any active property/building/identity edit, then choose **Inspect roads / junctions**. Ordinary property-first map selection remains the default outside this mode.
2. Click/tap a junction or road, or use the **Record type / Record ID** lists. Details show stable IDs, road classes, endpoints/connected junctions, connected-road counts and A1's protected reasons. Endpoint buttons navigate to junctions; **Locate on map** centers the accepted selection.
3. An ordinary junction can be dragged, assigned proposed X/Y, or nudged with the arrow buttons. With the canvas focused, arrow keys use the selected nudge step; Shift multiplies it by ten. Numeric/select controls retain their native keyboard behavior. Protected junctions and roads remain inspection-only.
4. Accepted roads retain their normal appearance. Candidate incident roads are **dashed**. A3 supplies **Safe** (teal), **Needs review** (amber) or **Invalid** (red), counts, typed affected IDs, issue codes, descriptions and related IDs. Preserved blocks receive subtle teal shading; affected accepted objects use the report's severity. The report list pages by 50 entries without limiting map highlights. Unknown/unlocated records remain identified in the report; the renderer does not invent geometry for them.
5. **Reset preview** (or canvas Ctrl/Command+Z) restores the selected junction's accepted coordinates and the entry camera, removes report/highlights and invalidates pending analysis. **Cancel inspection**, Escape (including from a numeric input) or Select/Pan exits and restores entry camera, property selection, panel state and scroll. Navigation/rebuild also exits; project replacement clears the preview before accepting the new document. Canvas Delete/Redo cannot change accepted objects during inspection.
6. On narrow screens the panel docks above the map legend and scrolls independently; its status/header and Reset/Cancel remain accessible. Minimize/Expand frees map space. Keyboard lists/coordinates provide an alternative to dragging, the status is a live region, and focus is not trapped.

There is **no road Apply operation**. Safe is an analysis result; acceptance and reconciliation belong to separately approved 0.2B work. No roads/properties/plots/buildings are deleted, regenerated, relocated or silently reattached.

## Module boundaries and preservation

| Module | Responsibility |
| --- | --- |
| `src/core/road-inspection.js` | Read A1 eligibility/details; deterministic junction/road hit targets; typed highlight IDs from A3 rows |
| `src/editor/road-preview.js` | Temporary selection/coordinates, gestures, debounced A1 proposal + A3 report, revision/city guards and cancellation |
| `src/ui/road-inspection.js` | Explicit mode, accessible controls/report, entry-view capture/restore and pagination |
| `src/renderer/road-inspection.js` | Draw accepted selections, dashed proposed segments and report-driven highlights; no geometry validation/status authority |
| `src/app.js` integration | Route explicit-mode gestures/keyboard; isolate capture/recovery; retain property-first routing elsewhere |

Only coordinate inputs are debounced (180 ms); pointer motion draws a cheap draft and runs full A1/A3 analysis after release. Revision tokens invalidate queued work after reset, selection changes, exit, navigation and project replacement. Drag cancellation restores the previous temporary coordinates. Unexpected exceptions display **Report unavailable** and never fabricate a Safe result.

Accepted project records are never assigned by this feature. Road selection, candidate graph/report, drag state, panel pagination and temporary camera/layout changes remain session-only. While inspection is active, portable and recovery captures use the entry workspace with the actual accepted project. The City controls and accepted-edit inspector/history controls are unavailable until exit. No accepted history entries or file revisions are added. Restored scroll events are ignored only when their positions match the transient reset; later user scrolling still persists normally. Resizing changes non-persisted viewport dimensions without marking the document dirty.

## Verification

- Pure/session and compiled-app tests cover A1 protected eligibility, mouse/touch hit targets, authoritative A3 output, Safe/review/invalid correction, deferred-work cancellation, previous-draft restoration, project identity guards, typed IDs/severity, error handling, property-first selection restoration, keyboard scope and schema-9 portable save equivalence.
- A workspace regression test verifies delayed programmatic scroll restoration does not create a file revision while actual later scrolling does.
- `scripts/road-browser-qa.mjs` exercises compiled standalone HTML in Chromium and Firefox at **1440×900**, **5120×1440**, **768×1024** and **390×844**: map/list/endpoint selection, mouse drag, numeric correction, keyboard nudge/Reset, protected eligibility, Safe/review/invalid display, pagination descriptions/counts, live status, responsive overflow/minimize, Reset/Cancel/Escape, navigation/replacement cancellation, actual portable download and recovery-write comparisons, unchanged accepted history and file revision.
- Chromium touch uses native CDP touch injection. Firefox uses synthetic touch PointerEvents through the real controller, bypassing pointer capture only for that synthetic test pointer; native Firefox mouse and keyboard are tested normally. Physical-device touch/screen-reader review remains a manual follow-up, not a claim of hardware testing.
- The existing navigation/file/layer and property/building browser matrices remain in `npm run test:browser`; A4 adds a third eight-case matrix.
- Root `index.html` and `dist/mappo-0.2-dev.a4.html` are identical and contain all source/styles with no runtime network dependency. Older distributions remain available.

Local verification: all 24 browser/viewport cases pass; final A4/workspace focused tests pass 21/21 on Node 22.23.4. Root and versioned HTML are 802,131 bytes, SHA-256 `c92dc7e3fbeee5ea25b8f009cf3e0c268e911005562ddb9acce8b94c557cc8a3`. Final full-suite totals and CI status are recorded in the A4 PR. This checkpoint does not authorize implementing 0.2B or merging A4 without owner approval.

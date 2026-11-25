import { canEditBuildingComponents, prepareBuildingComponents } from './editor/building-component-application.js';
import { BuildingComponentControls, initialBuildingComponentDraft } from './ui/building-component-controls.js';
import { CourtyardPlacementControls } from './ui/courtyard-placement-controls.js';
// A1 foundation APIs are bundled for the later road inspector; no editor hooks yet.
import { buildRoadGraph, analyzeRoadGraph, proposeJunctionMove } from './core/road-graph.js';
import {
  LandscapeWorkspace
} from './ui/landscape.js';
import { BuildingWorkspace } from './ui/building-workspace.js';
import { BuildingFootprintControls } from './ui/building-footprint-controls.js';
import { polygonSignedArea } from './core/geometry.js';
import { PropertyWorkspace } from './ui/property-workspace.js';
import { renderBuildingUseOptions } from './ui/building-use.js';
import { IdentityWorkspace } from './ui/identity-workspace.js';
import { BuildingEditSession, BUILDING_EDIT_TOOLS, buildingDirectHandles } from './editor/building.js';
import { buildingFrame, lockedBuildingScale } from './core/building-transform.js';
import {
  WorkspaceShell
} from './ui/workspace.js';
import {
  WorkspaceMenus
} from './ui/workspace-menus.js';
import {
  registerWorkspaceInspectors
} from './ui/workspace-inspectors.js';
import {
  terrainPrepare
} from './core/terrain-geometry.js';
import {
  validateTerrainDefinition
} from './core/terrain-model.js';
import {
  TerrainPanel
} from './ui/terrain.js';
import {
  prepareWater
} from './generators/water.js';
import {
  WaterPanel
} from './ui/water.js';
import {
  FortificationPanel, describeDefenseUpdate
} from './ui/fortifications.js';
import {
  fortificationViewPoints
} from './core/fortification-model.js';
import {
  DistrictPanel
} from './ui/districts.js';
import {
  DistrictWorkspace
} from './ui/district-workspace.js';
import {
  describePendingChanges,
  REBUILD_EFFECTS
} from './core/pending-changes.js';
import {
  rebuildFailureMessage
} from './core/validation-feedback.js';
import {
  isMapShortcutEvent, dispatchInputCommandA2
} from './core/shortcut-scope.js';
import {
  WORKSPACE_DISCLOSURE_IDS
} from './core/workspace-presentation.js';
import {
  ProjectFiles
} from './ui/project-files.js';
import { copyJson, projectFilename } from './data/project-format.js';
import { LAYER_KEYS_4F,layerPreset4F,identifyLayerPreset4F } from './core/layer-presets-4f.js';
import { exportFilename4F } from './core/export-filenames-4f.js';
import { downloadMapPNG4F } from './data/png-export-4f.js';
import { downloadWholeCityPNG, planWholeCityPNG } from './data/whole-city-png.js';
import {
  createProject
} from './core/city-model.js';
import {
  Camera
} from './renderer/camera.js';
import {
  renderMap
} from './renderer/canvas.js';
import {
  bindCanvasInteraction, ToolCoordinatorA2
} from './ui/controllers.js';
import {
  OutlineEditor,
  makeStartingOutline
} from './editor/outline.js';
import { inspectBuildingPreview, prepareBuildingApply } from './editor/building-application.js';
import { BuildingGeometryHistory } from './editor/building-history.js';
import { BuildingPlacementSession3H, buildingLocalPoint3H, prepareBuildingStructure3H } from './editor/building-structures.js';
import { BuildingStructureHistory3H } from './editor/building-structure-history.js';
import {prepareCompoundMembership,prepareCompoundTransform,previewCompoundTransform} from './editor/building-compounds-c01.js';
import {drawCompoundPreviewC01} from './renderer/building-compounds-c01.js';
import { PropertyEditSession3I } from './editor/property-edit.js';
import { inspectPropertyEdit3I, preparePropertyApply3I } from './editor/property-application.js';
import { PropertyGeometryHistory3I } from './editor/property-history.js';
import { preparePropertyDeletion4A, PropertyDeletionHistory4A } from './editor/property-deletion.js';
import { PropertyCreationSessionE1,PropertyCreationHistoryE1,propertyFrontagesE1,
  inspectPropertyCreationE1,preparePropertyCreationE1 } from './editor/property-creation-e1.js';
import { drawPropertyCreationE1 } from './renderer/property-creation-e1.js';
import { drawPropertySplitE2 } from './renderer/property-split-e2.js';
import { PropertySplitControlsE2 } from './ui/property-split-e2-controls.js';
import { PropertyMergeControlsE3 } from './ui/property-merge-e3-controls.js';
import { drawPropertyMergeE3 } from './renderer/property-merge-e3.js';
import { preparePropertyBuildingClear4E } from './editor/property-building-clear-4e.js';
import { describeStructureChange4E } from './core/structure-history-feedback-4e.js';
import { pointInPolygon } from './core/geometry.js';
import { focusCameraOnSelection4B, selectionFocusPoints4B } from './core/selection-focus-4b.js';
import { formatEditIssue4D } from './core/inspector-feedback-4d.js';
import { beginPropertyFrontageGestureSFS, proposePropertyFrontageGestureSFS,
  proposePropertyFrontageCoordinateSFS } from './editor/property-frontage-snap.js';
import { frontageMidpointSFS } from './core/property-frontage-constraints.js';
import {
  nudgeBuilding4C, nudgePropertyCorner4C, nudgeStructure4C,
  buildingMeasurements4C, propertyMeasurements4C, placementMeasurements4C,
  formatPrecision4C
} from './core/editing-precision-4c.js';

// A2 face identity APIs remain read-only behind the A4 preview.
import { extractRoadFaces, matchExistingFaces } from './core/road-faces.js';

// A3 owns classification; A4 only presents its reports.
import { analyzeRoadImpact, inspectJunctionImpact } from './core/road-impact.js';

import { DesktopEditLayout } from './ui/desktop-edit-layout.js';
import { DesktopPlaceEditor } from './ui/desktop-place-editor.js';
import { DesktopWorkspace } from './ui/desktop-workspace.js';
import { WaterEditor } from './editor/water.js';
import { DistrictEditor, restoreDistrictSnapshot } from './editor/districts.js';
import { FortificationEditor, restoreFortificationSnapshot } from './editor/fortifications.js';
import { RoadInspectionWorkspace } from './ui/road-inspection.js';
import { createJunctionPreviewWorkerP1 } from './editor/junction-preview-worker-client.js';
import { drawRoadComparison } from './renderer/road-comparison.js';
import { drawRoadInspectionOverlay } from './renderer/road-inspection.js';
// B1 candidate API is compiled for later editor integration; no Apply or UI hooks.
import { prepareRoadReconciliationB1 } from './core/road-reconciliation.js';
// B2 conservative parcel adaptation remains preview-only until B4 Apply.
import { prepareJunctionReflowC7 } from './core/neighborhood-reflow.js';
import { checkRoadApplyC2, prepareRoadApplyC2, validateRoadGroupApplyB1, validateRoadGroupDemolitionApplyB1R } from './editor/road-application.js';
import { RoadGeometryHistoryB4 } from './editor/road-history.js';
import { DraftEngine } from './core/draft-engine.js';
import { renderDraftControls, syncDraftControls } from './ui/draft-controls.js';
import { AcceptedEditHistoryD01, forkAcceptedHistoryD01, stageAcceptedPublicationD01, stageAcceptedReplayD01, stageAcceptedReplacementD01 } from './core/accepted-edit-history-d01.js';
import { HISTORY_EDITOR_KEYS, historyWorkspaceForReplay } from './core/accepted-history-workspace-a5.js';
import { createProjectDocument, encodeProjectDocument } from './data/project-format.js';

const $ = id => document.getElementById(id),
  canvas = $('mapCanvas'),
  viewport = $('mapViewport'),
  camera = new Camera();
const SHAPE_DESCRIPTIONS = {
  organic: 'Curving corridors and irregular blocks.',
  planned: 'Straight streets with seeded grid spacing.',
  radial: 'Rings and spokes centered on your main square.',
  linear: 'Long corridors with cross streets.'
};
const TOOL_HINTS = {
  pan: 'Drag to pan · Click a property to inspect · Scroll to zoom',
  freehand: 'Drag an outline · Release to close · Space + drag to pan',
  points: 'Click corners · Click first point or press Enter to close',
  edit: 'Drag corners · Double-click an edge to add a point · Delete to remove',
  center: 'Click inside the outline to place the main square'
};
let project, drawPending = false;
const drafts = new DraftEngine(() => project?.city);
const confirmDraft = message => () => typeof window.confirm !== 'function' || window.confirm(message);

function placeDraft(domain, panel, apply, details) {
  return syncDraftControls(drafts, domain, details, $(panel), $(apply));
}
function applyPlaceDraft(domain, panel, button, accept) {
  return drafts.apply(domain, accept, {
    onChange: () => renderDraftControls(drafts.read(domain), $(panel), $(button)),
  });
}
let files;
let districtPanel;
let districtWorkspace;
let fortificationPanel;
let waterPanel;
let terrainPanel;
let workspaceShell;
let landscapeWorkspace;
let buildingWorkspace;
let buildingEditSession;
const buildingFootprintControls = new BuildingFootprintControls($, () => ({
  city: project?.city, session: buildingEditSession
}));
const buildingHistory = new BuildingGeometryHistory(20);
const buildingStructureHistory = new BuildingStructureHistory3H(20);
const propertyHistory = new PropertyGeometryHistory3I(20);
const propertyDeletionHistory4A = new PropertyDeletionHistory4A(20);
const propertyCreationHistoryE1 = new PropertyCreationHistoryE1(20);
const roadHistory = new RoadGeometryHistoryB4(6);
const acceptedHistoryD01 = new AcceptedEditHistoryD01({maxEntries:20,maxBytes:64*1024*1024});
let d01ReplayingHistory=false;
let pendingHistoryRefresh = false;
let historyFeedback = null;
const savedHistoryCount = { districts: 0, defenses: 0 };
const localHistoryLabels = {
  districts: { generate: 'Rebuild districts', identity: 'Edit district name or color', move: 'Move block to district', restore: 'Restore saved district edit' },
  defenses: { build: 'Build defenses', rebuild: 'Rebuild defenses', enable: 'Enable defenses', disable: 'Disable defenses', restore: 'Restore saved defense edit' },
};
let buildingPlacementSession;
// C01 panel state is transient and never serialized into accepted city geometry.
let compoundPanelPropertyId=null,compoundGroupId='',compoundMemberIds=[],compoundName='';
let compoundTransform={dx:0,dy:0,angle:0,scaleX:1,scaleY:1};
let compoundResult=null,compoundDrag=null;
let propertyEditSession;
let propertyCreationSessionE1;
let propertySplitE2;
let propertyMergeE3;
let propertyWorkspace;
let identityWorkspace;
let roadWorkspace;
let desktopPlaceEditor;
let desktopWorkspace;
let mainInputA2,comparisonInputA2;
const toolsA2=new ToolCoordinatorA2();
function cancelMapGesturesA2(){
  const main=mainInputA2?.cancel()??false,comparison=comparisonInputA2?.cancel()??false;
  return main||comparison;
}
const workspaceMenus = new WorkspaceMenus({
  getElement: $
});
workspaceMenus.bind();
const layers = {
  buildings: true,
  properties: false,
  plots: false,
  districtColors: true,
  districtBorders: true,
  districtLabels: true,
  fortifications: true
};

function updatePendingFeedback() {
  if (!project || !districtPanel || !fortificationPanel || !waterPanel || !terrainPanel) return;
  const status = describePendingChanges({
    project, outline: editor, water: waterPanel.editor, terrain: terrainPanel.editor,
    controls: {
      seed: $('seedInput').value, size: $('sizeInput').value,
      morphology: $('morphologyInput').value
    },
    districtEditor: districtPanel.editor,
    districtControls: {
      count: $('districtNumberInput').value, seed: $('districtSeedInput').value,
      name: $('districtNameInput').value, color: $('districtColorInput').value,
      target: $('districtTargetInput').value
    },
    defensePreview: fortificationPanel.syncPreview(),
    identityPending: identityWorkspace?.hasPending() ?? false
  });
  if (drafts.interactive().dirty) {
    status.local.push('Active map edit');
    status.count++;
  }
  const rebuild = drafts.sync('landscape-rebuild', { staged: true,
    intent: status.cityPending ? desktopGenerationKey('city') : '', dirty: status.cityPending });
  $('landscapeDraftStatus').setAttribute('data-draft-state', rebuild.status);
  $('workspacePendingCount').textContent = status.count ? status.count + ' pending' : 'Up to date';
  $('workspacePendingCount').classList.toggle('pending', Boolean(status.count));
  $('workspacePendingDetails').textContent = status.count
    ? (status.city.length ? 'Rebuild pending: ' + status.city.join(', ') + '. ' : '')
      + (status.local.length ? 'Local updates: ' + status.local.join(', ') + '.' : '')
    : 'No unapplied city or local changes.';
  $('workspaceRebuildImpact').textContent = REBUILD_EFFECTS;
  $('workspaceRebuildImpact').classList.toggle('pending', status.cityPending);
  updateUndoFeedback();
}

// Legacy per-editor buttons must not advertise history owned by a different
// tool merely because that transaction happens to be next chronologically.
const propertyHistoryOperations = new Map([
  ['property-create', 'create'], ['property-split', 'split'], ['property-merge', 'merge'], ['property-delete', 'delete'],
]);

function d01PropertyStructureKind(entry) {
  return propertyHistoryOperations.get(entry?.operation) ?? null;
}
function d01ScopedPropertyAction(direction,kind) {
  const entry=acceptedHistoryD01.entry(direction);
  return d01PropertyStructureKind(entry)===kind&&acceptedHistoryD01.can(direction,project);
}
function d01TouchesStructureProperty(entry,id){
  if(!entry||!id)return false;
  if(entry.targetIds.includes(id))return true; // Compound metadata transaction.
  const changed=new Set(entry.targetIds);
  return [...entry.from.city.buildings,...entry.to.city.buildings].some(b=>
    changed.has(b.id)&&b.propertyId===id);
}
function d01CompoundMembershipPending(){
  if(!compoundPanelPropertyId||!c01ActiveProperty())return false;
  const group=c01SelectedGroup();
  // Membership is a set: toggling a checkbox off and on again must not
  // leave a false pending draft simply because its array order changed.
  return group
    ?compoundName.trim()!==group.name||
      compoundMemberIds.length!==group.memberBuildingIds.length||
      compoundMemberIds.some(id=>!group.memberBuildingIds.includes(id))
    :Boolean(compoundName.trim()||compoundMemberIds.length);
}
function acceptedHistoryBlocker({ savedRestore = false } = {}) {
  if (roadWorkspace?.active) return 'Finish the road preview and close Roads to use city history.';
  if (propertyCreationSessionE1?.active) return 'Finish or cancel property creation to use city history.';
  if (propertySplitE2?.active) return 'Finish or cancel the property split preview to use city history.';
  if (propertyMergeE3?.active) return 'Finish or cancel the property merge preview to use city history.';
  if (propertyEditSession?.isPending || propertyEditSession?.drag) return 'Apply or reset the property preview to use city history.';
  if (buildingEditSession?.isPending || buildingEditSession?.drag) return 'Apply or reset the building preview to use city history.';
  if (buildingPlacementSession?.isActive) return 'Finish or cancel building placement to use city history.';
  if (desktopWorkspace?.mapPreview()) return 'Close the generation preview to use city history.';
  if (!savedRestore && editor?.dirty && (editor.mode !== 'pan' || !editor.closed))
    return 'Finish or reset the active outline draft to use city history.';
  if (!savedRestore && identityWorkspace?.hasPending()) return 'Apply or discard pending identity changes to use city history.';
  if (d01CompoundMembershipPending()) return 'Save or close the building compound to use city history.';
  if (compoundPanelPropertyId && compoundTransformPending()) return 'Apply or reset the compound transform to use city history.';
  return '';
}
function d01DraftBlocked() {
  return Boolean(acceptedHistoryBlocker());
}
function compoundTransformPending() {
  return Math.abs(compoundTransform.dx) > 1e-9 || Math.abs(compoundTransform.dy) > 1e-9 ||
    Math.abs(compoundTransform.angle) > 1e-9 || Math.abs(compoundTransform.scaleX - 1) > 1e-9 ||
    Math.abs(compoundTransform.scaleY - 1) > 1e-9;
}
function historyLabel(direction, entry) {
  return (direction === 'undo' ? 'Undo' : 'Redo') + (entry ? ' · ' + entry.label : '');
}

function historyCommandState(direction, blocker = acceptedHistoryBlocker()) {
  const entry = acceptedHistoryD01.entry(direction);
  const label = historyLabel(direction, entry);
  if (blocker) return { label, available: false, reason: blocker };
  if (!entry) return { label, available: false, reason: 'No applied city change to ' + direction + '.' };
  const available = acceptedHistoryD01.can(direction, project);
  return { label, available, reason: available ? '' : 'History is out of date. Review the current city before continuing.' };
}

function d01SyncHistoryView() {
  const blocker = acceptedHistoryBlocker();
  for (const [direction, buttonId, tooltipId] of [
    ['undo', 'workspaceUndoButton', 'workspaceUndoTooltipA5'],
    ['redo', 'workspaceRedoButtonD01', 'workspaceRedoTooltipA5'],
  ]) {
    const action = historyCommandState(direction, blocker);
    const button = $(buttonId), tooltip = $(tooltipId);
    const message = action.reason || (historyFeedback?.direction === direction ? historyFeedback.message : '');
    button.textContent = action.label;
    button.setAttribute('aria-disabled', String(!action.available));
    tooltip.textContent = message;
    tooltip.hidden = !message;
  }
  for (const [family, buttonId, restoreId] of [
    ['districts', 'undoDistrictButton', 'restoreDistrictHistoryA5'],
    ['defenses', 'undoFortificationButton', 'restoreDefenseHistoryA5'],
  ]) {
    const entry = acceptedHistoryD01.entry('undo');
    $(buttonId).disabled = !domainUndoAvailableA5(family);
    $(buttonId).textContent = entry?.family === family ? historyLabel('undo', entry)
      : savedDomainHistoryAvailableA5(family) ? localHistoryLabels[family].restore
        : family === 'districts' ? 'Undo district edit' : 'Undo defense edit';
    $(restoreId).hidden = !savedDomainHistoryAvailableA5(family);
    $(restoreId).disabled = Boolean(acceptedHistoryBlocker({ savedRestore: true }));
  }
  const list=$('workspaceHistoryListD01');
  if(list){
    const rows=acceptedHistoryD01.summaries();
    list.replaceChildren(...rows.map(row=>{
      const li=document.createElement('li');
      li.textContent='#'+row.serial+' · '+row.label+' · '+row.family+' · '+
        (row.direction==='undo'?'applied':'undone');
      return li;
    }));
    if(!rows.length){
      const li=document.createElement('li');li.textContent='No accepted edits in this session.';list.replaceChildren(li);
    }
  }
  const status=$('workspaceHistoryStatusD01');
  if (status) {
    const undo = acceptedHistoryD01.entry('undo'), redo = acceptedHistoryD01.entry('redo');
    status.textContent = [undo && historyLabel('undo', undo), redo && historyLabel('redo', redo),
      acceptedHistoryD01.notice].filter(Boolean).join(' · ');
  }
}
function d01MoveHistory(direction) {
  if(!project)return false;
  const action = historyCommandState(direction);
  if (!action.available) return showHistoryFailure(direction, action.reason);
  historyFeedback = null;
  const receipt=acceptedHistoryD01.prepare(direction,project,captureWorkspace().workspace);
  if (!receipt.ok) return showHistoryFailure(direction, receipt.reason);
  // A retired property may return during Undo. Capture it before replacing
  // the accepted city so the existing Inspector can recover a useful target
  // when no other live selection survives.
  const beforeCity = project.city;
  const returningProperties=receipt.candidate.city.properties.filter(p=>
    !project.city.properties.some(old=>old.id===p.id)).map(p=>p.id);
  let staged;
  try{staged=stageAcceptedReplayD01(acceptedHistoryD01,project,direction,receipt);}
  catch(error){return showHistoryFailure(direction,error.message);}
  d01ReplayingHistory=true;
  try{
    publishAcceptedStateD01(receipt.candidate,staged);
    // No old per-editor accepted-history cursor may authorize restoration after
    // the chronological ledger has advanced. Draft editor history is separate.
    roadHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
    propertyCreationHistoryE1.clear();buildingHistory.clear();buildingStructureHistory.clear();
    propertySplitE2?.history.clear();propertyMergeE3?.history.clear();
    identityWorkspace?.editor.reset();
    // The accepted identity can change while the Inspector still displays
    // its previous accepted value. Refresh its mounted baseline before the
    // draft detector mistakes that stale value for an unsaved edit.
    // Actual pending identity drafts are blocked before replay begins.
    if(identityWorkspace) {
      identityWorkspace.mounted=null;
      identityWorkspace.render({reload:true});
    }
    if (receipt.entry.family === 'road') refreshRoadDistrictWorkspace(receipt.workspace);
    if (receipt.entry.editorHistory) restoreDomainHistoryStateA5(receipt, direction, beforeCity);
    // Road/parcel ownership replacement can invalidate a selected property.
    // A building add/delete does not replace its parent property, so retain
    // that Inspector and its scoped structural Undo/Redo controls.
    const resetProperty=receipt.entry.family==='road'||d01PropertyStructureKind(receipt.entry);
    const resetBuilding=resetProperty||receipt.entry.operation==='building-structure';
    // Synchronize live editor baselines before workspace reconciliation.
    if(buildingEditSession?.isActive&&!resetBuilding)buildingEditSession.reset(project.city);
    if(propertyEditSession?.isActive&&!resetProperty)
      propertyEditSession.start(project.city,propertyEditSession.propertyId);
    propertyWorkspace.refresh(resetProperty?{replaced:true}:{});
    buildingWorkspace.refresh(resetBuilding?{replaced:true}:{});
    clearMapHover();
    updateDetails();workspaceShell.refresh();
    if(d01PropertyStructureKind(receipt.entry)&&returningProperties.length===1){
      const selected=workspaceShell?.state.selection;
      const live=selected?.kind==='property'
        ?project.city.properties.some(p=>p.id===selected.id)
        :selected?.kind==='building'
          ?project.city.buildings.some(b=>b.id===selected.id)
          :false;
      if(!live)workspaceShell.select({kind:'property',id:returningProperties[0]},{reveal:true});
    }
    if(receipt.entry.operation==='building-structure'){
      // The pre-D01 structure Undo returned to the owning property and
      // revealed the Inspector, including keyboard-reachable child actions.
      // Keep that behavior even when the property itself was never deleted.
      const targets=new Set(receipt.entry.targetIds??[]);
      const parents=new Set([
        ...receipt.entry.from.city.buildings,
        ...receipt.entry.to.city.buildings
      ].filter(b=>targets.has(b.id)).map(b=>b.propertyId));
      if(parents.size===1){
        const owner=[...parents][0];
        if(project.city.properties.some(p=>p.id===owner))
          workspaceShell.select({kind:'property',id:owner});
      }
    }
    // A validated history replay can add/remove/rename a compound. The
    // membership Inspector's transient form must follow that accepted state;
    // otherwise the prior group becomes a false "unsaved draft" and blocks
    // the next chronological Undo/Redo.
    if(compoundPanelPropertyId){
      if(!c01ActiveProperty()){
        compoundPanelPropertyId=null;compoundResult=null;compoundDrag=null;
        c01SyncPanel();
      }else{
        const site=c01ActiveProperty();
        const group=site.buildingCompounds?.find(g=>g.id===compoundGroupId)
          ??site.buildingCompounds?.[0];
        c01SelectGroup(group?.id??'');
      }
    }
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent=acceptedHistoryD01.notice;
    return true;
  }finally{d01ReplayingHistory=false;updateUndoFeedback();}
}

function showHistoryFailure(direction, message) {
  historyFeedback = { direction, message };
  $('statusMessage').textContent = message;
  updateUndoFeedback();
  return false;
}

function updateUndoFeedback() {
  d01SyncHistoryView();
}

function currentResetPreviewA5() {
  if (roadWorkspace?.active) return 'roadPreviewReset';
  if (propertyMergeE3?.active) return 'propertyMergeResetE3';
  if (propertySplitE2?.active) return 'propertySplitResetE2';
  if (propertyCreationSessionE1?.active) return 'propertyCreateResetE1';
  if (buildingEditSession?.isPending || drafts.read('building').dirty) return 'buildingPreviewReset';
  if (propertyEditSession?.isPending) return 'propertyEditReset3I';
  if (compoundPanelPropertyId && compoundTransformPending()) return 'compoundReset';
  if (desktopWorkspace?.mapPreview()) return 'desktopGenerationCancel';
  return null;
}

function resetCurrentPreviewA5() {
  const id = currentResetPreviewA5();
  const button = id ? $(id) : null;
  if (!button || button.disabled) {
    $('statusMessage').textContent = 'There is no preview ready to reset.';
    return false;
  }
  if (typeof button.click === 'function') button.click();
  else button.handlers?.click?.();
  return true;
}

function domainEditorA5(family) {
  return family === 'districts' ? districtPanel?.editor : fortificationPanel?.editor;
}

function savedDomainHistoryAvailableA5(family) {
  const count = savedHistoryCount[family];
  return count > 0 && domainEditorA5(family)?.history.length === count;
}

function domainUndoAvailableA5(family) {
  return acceptedHistoryD01.entry('undo')?.family === family
    ? historyCommandState('undo').available
    : savedDomainHistoryAvailableA5(family) && !acceptedHistoryBlocker({ savedRestore: true });
}

function undoDomainA5(family) {
  return acceptedHistoryD01.entry('undo')?.family === family
    ? d01MoveHistory('undo') : restoreSavedDomainEditA5(family);
}

function editorHistoryDeltaA5(family, beforeHistory, afterHistory, afterSavedCount) {
  return { key: HISTORY_EDITOR_KEYS[family],
    before: { history: beforeHistory, savedCount: savedHistoryCount[family] },
    after: { history: afterHistory, savedCount: afterSavedCount } };
}

// Publish the fully prepared D01 cursor and city in the same synchronous
// boundary, before UI callbacks, dirty signals or recovery capture.
// Keep the ledger object stable for existing Inspector readers.
function publishAcceptedStateD01(next,staged) {
  Object.assign(acceptedHistoryD01,staged.history);
  project = next;
  if(['recorded','oversize','barrier','replayed','replaced'].includes(staged.status)){
    pendingHistoryRefresh=true;
    historyFeedback=null;
  }
}
function commitAcceptedEdit(candidate, transaction, options) {
  const staged=stageAcceptedPublicationD01(acceptedHistoryD01,project,candidate,transaction,options);
  publishAcceptedStateD01(candidate,staged);
}

function commitDomainEditA5(family, city, { operation, beforeHistory }) {
  if (city === project.city || JSON.stringify(city) === JSON.stringify(project.city)) return false;
  const afterHistory = domainEditorA5(family).history;
  const expired = Math.max(0, beforeHistory.length + 1 - afterHistory.length);
  const editorHistory = editorHistoryDeltaA5(family, beforeHistory, afterHistory,
    Math.max(0, savedHistoryCount[family] - expired));
  savedHistoryCount[family] = editorHistory.after.savedCount;
  let label = localHistoryLabels[family][operation];
  if (family === 'districts' && operation === 'identity') {
    const id = districtPanel.editor.selectedDistrictId;
    const before = project.city.districts.find(record => record.id === id);
    const after = city.districts.find(record => record.id === id);
    if (before && after) label = before.name === after.name ? 'Recolor district'
      : before.color === after.color ? 'Rename district' : 'Rename and recolor district';
  }
  const targetIds = family === 'districts'
    ? (operation === 'generate' ? city.districts.map(record => record.id)
      : [districtPanel.editor.selectedDistrictId, districtPanel.editor.selectedBlockId].filter(Boolean))
    : [...city.walls, ...city.gates, ...city.towers].map(record => record.id);
  commitAcceptedEdit({ ...project, city }, { family, operation, label, targetIds, editorHistory });
  return true;
}

function refreshDomainHistoryA5(family, workspace, beforeCity) {
  const state = workspace[HISTORY_EDITOR_KEYS[family]];
  if (family === 'districts') {
    const mounted = districtPanel.formDistrictId;
    const before = beforeCity.districts.find(record => record.id === mounted);
    if (before && ($('districtNameInput').value !== before.name || $('districtColorInput').value !== before.color)) {
      districtPanel.stashDraft();
    } else if (mounted) districtPanel.formCache.delete(mounted);
    districtPanel.editor.load(state);
    districtPanel.formDistrictId = null;
    districtPanel.formBlockId = null;
    districtPanel.refresh();
    const selected = workspaceShell.state.selection;
    if (selected?.kind === 'district') {
      const restored = workspace.ui?.selection;
      workspaceShell.select(restored?.kind === 'district' ? restored : null, { reveal: false });
    }
  } else {
    fortificationPanel.editor.load(state);
    const pending = describeDefenseUpdate(beforeCity, fortificationPanel.controls()).pending;
    fortificationPanel.refresh(!pending);
  }
}

function restoreDomainHistoryStateA5(receipt, direction, beforeCity) {
  const { family, editorHistory } = receipt.entry;
  const count = editorHistory[direction === 'undo' ? 'before' : 'after'].savedCount;
  if (family === 'road') {
    savedHistoryCount.districts = count;
  } else {
    savedHistoryCount[family] = count;
    refreshDomainHistoryA5(family, receipt.workspace, beforeCity);
  }
}

function restoreSavedDomainEditA5(family) {
  if (!savedDomainHistoryAvailableA5(family)) return false;
  const blocker = acceptedHistoryBlocker({ savedRestore: true });
  if (blocker) return showHistoryFailure('undo', blocker);
  const editor = domainEditorA5(family), beforeHistory = editor.history;
  const restore = family === 'districts' ? restoreDistrictSnapshot : restoreFortificationSnapshot;
  const editorHistory = editorHistoryDeltaA5(family, beforeHistory, beforeHistory.slice(0, -1), savedHistoryCount[family] - 1);
  try {
    const beforeCity = project.city;
    const candidate = { ...project, city: restore(beforeCity, beforeHistory.at(-1)) };
    const workspace = historyWorkspaceForReplay(captureWorkspace().workspace, candidate.city, editorHistory, 'redo');
    encodeProjectDocument(createProjectDocument(candidate, workspace));
    if (JSON.stringify(candidate.city) === JSON.stringify(project.city)) {
      editor.history = editorHistory.after.history;
      savedHistoryCount[family] = editorHistory.after.savedCount;
      workspaceChanged();
      return true;
    }
    const label = localHistoryLabels[family].restore;
    commitAcceptedEdit(candidate, { family, operation: 'restore', label, targetIds: [], editorHistory });
    savedHistoryCount[family] = editorHistory.after.savedCount;
    refreshDomainHistoryA5(family, workspace, beforeCity);
    updateDetails();
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent = acceptedHistoryD01.notice;
    return true;
  } catch (error) {
    return showHistoryFailure('undo', error.message);
  }
}
function workspaceChanged() {
  // Ordinary Apply already published its history. Retain the defensive
  // untracked-change barrier, but never record an accepted edit a second time.
  if(project&&!d01ReplayingHistory&&JSON.stringify(acceptedHistoryD01.baseline)!==JSON.stringify(project)){
    const staged=forkAcceptedHistoryD01(acceptedHistoryD01);
    const observed=staged.observe(project,null);
    publishAcceptedStateD01(project,{history:staged,status:observed.status});
  }
  const refresh=pendingHistoryRefresh;
  pendingHistoryRefresh=false;
  if(refresh||d01ReplayingHistory){
    syncBuildingHistoryUI();
    syncBuildingStructureUI3H();
    // The property Inspector may render before the accepted transaction has
    // been observed. Recompute its accepted-history button states afterward.
    // Do not revalidate every mouse move or visual-only selection change.
    syncPropertyEditUI3I();
    // Identity Apply renders before the shared journal records the accepted
    // transaction. Refresh its buttons after observation, not just before it.
    identityWorkspace?.render();
  }
  desktopWorkspace?.sync();
  if(roadWorkspace?.transient){syncPropertyDeletionControls4A();updateUndoFeedback();return;}
  syncPropertyDeletionControls4A();
  syncPropertyCreationE1();
  propertySplitE2?.refresh();
  propertyMergeE3?.refresh();
  syncRoadHistoryB4UI();
  updatePendingFeedback();
  d01SyncHistoryView();
  files?.changed();
}

function syncRoadHistoryB4UI(){
  const active=Boolean(roadWorkspace?.active);
  for(const [direction,id] of [['undo','roadHistoryUndoB4'],['redo','roadHistoryRedoB4']]){
    const available=Boolean(project && acceptedHistoryD01.entry(direction)?.family==='road' && acceptedHistoryD01.can(direction,project));
    const button=$(id);
    button.disabled=active||d01DraftBlocked()||!available;
    button.title=available?'Restore the complete accepted road and parcel transaction.':
      'No compatible road '+direction+' is available; other accepted changes may have intervened.';
  }
}
function syncPropertyDeletionControls4A() {
  const busy=Boolean(roadWorkspace?.active || propertyEditSession?.isActive || buildingPlacementSession?.isActive || buildingEditSession?.isActive);
  for(const [direction,id] of [['undo','propertyDeletionUndo4A'],['redo','propertyDeletionRedo4A']]) {
    const available=d01ScopedPropertyAction(direction,'delete');
    const button=$(id);
    button.hidden=!available;
    button.disabled=busy||d01DraftBlocked()||!available;
    button.title=direction==='undo'?'Restore the last deleted property, plots and buildings':'Delete the property again';
  }
}
function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (project) {
      if (roadWorkspace?.comparisonOpen) {
        drawRoadComparison({
          acceptedCanvas: canvas, proposedCanvas: $('roadComparisonProposed'), camera, project, layers,
          candidate: roadWorkspace.comparisonCandidate(), target: roadWorkspace.session.selection,
          impact: roadWorkspace.comparisonImpact(),
        });
        return;
      }
      const generationPreview = desktopWorkspace?.mapPreview();
      if (generationPreview) {
        renderMap(canvas, camera, generationPreview, null, layers);
        return;
      }
      const roadMode=roadWorkspace?.active;
      renderMap(canvas, camera, project, roadMode?null:editor, layers, districtPanel?.editor.selectedDistrictId, roadMode?null:waterPanel?.editor, roadMode?null:terrainPanel?.editor, roadMode?null:workspaceShell?.state.selection, roadMode?null:landscapeWorkspace?.hover, roadMode?null:buildingWorkspace?.hover, roadMode?null:propertyWorkspace?.hover, buildingEditSession, buildingPlacementSession, propertyEditSession);
      drawRoadInspectionOverlay(canvas,camera,project.city,roadWorkspace?.session);
      drawPropertyCreationE1(canvas.getContext('2d'),camera,project.city,propertyCreationSessionE1);
      drawPropertySplitE2(canvas.getContext('2d'),camera,project.city,propertySplitE2?.session);
      drawPropertyMergeE3(canvas.getContext('2d'),camera,project.city,propertyMergeE3?.session);
      drawCompoundPreviewC01(canvas.getContext('2d'),camera,compoundResult);
    }
  });
}

// Accepted geometry history is scoped to the selected building and stays out of saves.
function syncBuildingHistoryUI() {
  const session = buildingEditSession;
  const id = session?.isActive ? session.buildingId : null;
  const ready = Boolean(id && !session.isPending && !session.drag && !d01DraftBlocked());
  const belongsToCurrentFootprint = direction => {
    const entry=acceptedHistoryD01.entry(direction);
    return entry?.operation==='building-geometry' && entry.targetIds.includes(id)
      && acceptedHistoryD01.can(direction,project);
  };
  const undo = ready && belongsToCurrentFootprint('undo');
  const redo = ready && belongsToCurrentFootprint('redo');
  $('buildingHistoryUndo').disabled = !undo;
  $('buildingHistoryRedo').disabled = !redo;
  const status = $('buildingHistoryStatus');
  status.hidden = !ready;
  status.textContent = ready
    ? 'Session history · '+buildingHistory.count('undo',id)+' undo / '+buildingHistory.count('redo',id)+' redo available.'
    : '';
  updateUndoFeedback();
}

let editingBuildingTransformField = null;
let invalidBuildingTransformField = null;
// Preview controls show transient geometry; never write into project or its save envelope.
function syncBuildingTransformUI() {
  const session = buildingEditSession;
  const shown = Boolean(session?.isActive && project && session.source(project.city));
  $('buildingTransformPanel').hidden = !shown;
  syncBuildingHistoryUI();
  buildingFootprintControls.sync(project?.city, shown ? session : null);
  if (!shown) { drafts.close('building'); return; }
  const frame = buildingFrame(session.draft ?? session.source(project.city));
  const t = session.transform;
  if (!session.operationError) invalidBuildingTransformField = null;
  $('buildingPreviewTarget').textContent = session.buildingId;
  const measured=buildingMeasurements4C(project.city,session);
  if(measured) $('buildingPreviewMeasurements4C').textContent=
    'Width '+formatPrecision4C(measured.width)+' · Depth '+formatPrecision4C(measured.depth)+
    ' · Area '+formatPrecision4C(measured.area)+' (Δ '+formatPrecision4C(measured.areaDelta)+')'+
    ' · Center '+formatPrecision4C(measured.x)+', '+formatPrecision4C(measured.y)+
    ' · Offset '+formatPrecision4C(measured.dx)+', '+formatPrecision4C(measured.dy);
  for (const [id,value] of Object.entries({
    buildingOffsetX: t.dx, buildingOffsetY: t.dy,
    buildingAngle: t.angle*180/Math.PI, buildingWidth: frame.width*t.scaleX,
    buildingDepth: frame.height*t.scaleY
  })) {
    $(id).readOnly = Boolean(session.drag);
    $(id).setAttribute('aria-invalid', String(id === invalidBuildingTransformField));
    if (id !== editingBuildingTransformField && id !== invalidBuildingTransformField)
      $(id).value = Number(value.toFixed(2)).toString();
  }
  $('buildingLockRatio').checked = session.lockRatio;
  $('buildingLockRatio').disabled = Boolean(session.drag);
  for (const tool of BUILDING_EDIT_TOOLS)
    $('buildingTool'+tool).setAttribute('aria-pressed',String(session.tool===tool.toLowerCase()));
  const result = session.isPending
    ? inspectBuildingPreview(project,session.buildingId,t,Boolean(session.drag),session.draft)
    : {ok:false,status:'idle',issues:[]};
  session.validation = result;
  const proposed = result.candidate?.city.buildings.find(b => b.id === session.buildingId);
  const details = $('buildingFootprintDetails');
  details.hidden = !session.isDirect && !session.draft;
  if (!details.hidden) {
    const footprint = result.preview ?? session.previewFor(project.city);
    const gross = Math.abs(polygonSignedArea(footprint.footprint));
    details.textContent = 'Footprint '+formatPrecision4C(gross)
      +' · Courtyards '+formatPrecision4C(gross-footprint.area)
      +' · Occupied '+formatPrecision4C(footprint.area)
      +(proposed ? ' · Plots '+proposed.plotIds.join(', ') : '')
      +(result.accessChanged ? ' · Entrance and access will move to the route shown on the map.'
        : proposed && session.draft ? ' · Entrance and access retained.' : '');
  }
  const draft = placeDraft('building', 'buildingTransformPanel', 'buildingPreviewApply', {
    key: session.active, baseline: session.acceptedCity,
    intent: JSON.stringify([t, session.draft, session.operationError, Boolean(session.drag)]),
    dirty: session.isPending || Boolean(session.operationError), checking: result.status === 'checking' || Boolean(session.drag),
    ready: !session.operationError && result.status === 'valid',
    target: { kind: 'building', id: session.buildingId },
    issues: session.operationError ? [{ code: 'transform', message: session.operationError }] : result.issues,
  });
  $('buildingTransformPanel').setAttribute('data-validation',result.status);
  const issues = $('buildingPreviewIssues');
  issues.hidden = !result.issues.length;
  issues.replaceChildren(...result.issues.map((issue, index) => renderPlaceDiagnostic(issue, {
    buildingId: session.buildingId, propertyId: session.propertyId,
    frontageRoadId: session.source(project.city)?.frontageRoadId,
  }, 'building', draft, index)));
  $('buildingPreviewStatus').textContent = session.operationError || (
    !session.isPending ? 'Make a footprint change to preview its placement.'
    : result.status==='checking'
      ? 'CHECKING · Fast geometry check complete; road access is verified when the drag ends.'
      : result.ok
        ? result.frontageChanged
          ? 'VALID PLACEMENT · Entrance moves to side street '+proposed.frontageRoadId+'. See proposed route on the map.'
          : 'VALID PLACEMENT · Ready to apply footprint. Project compatibility will be rechecked.'
        : 'INVALID PLACEMENT · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
          buildingId:session.buildingId,propertyId:session.propertyId,
          frontageRoadId:session.source(project.city)?.frontageRoadId
        }));
}
function confirmBuildingPreviewDiscard() {
  return drafts.canLeave('building', confirmDraft('Discard the unsaved building preview? The city remains unchanged.'));
}
function applyBuildingTransform() {
  return applyPlaceDraft('building', 'buildingTransformPanel', 'buildingPreviewApply', commitBuildingTransform);
}
function commitBuildingTransform(current) {
  const session=buildingEditSession;
  if (!project || !session?.isActive || !session.isPending || session.drag || session.operationError
      || workspaceShell.state.selection?.kind !== 'building'
      || workspaceShell.state.selection.id !== session.buildingId
      || project.city !== session.acceptedCity) return false;
  const previous=project;
  const buildingId=session.buildingId, transform={...session.transform};
  let received;
  try {
    // Fresh computation. Never trust stale status from an earlier drag frame.
    received=prepareBuildingApply(previous,captureWorkspace().workspace,buildingId,transform,session.draft);
    if(!received.ok){
      const issues=received.issues??[];
      drafts.reject('building', received.issues);
      session.validation=received;
      $('buildingPreviewApply').disabled=true;
      $('buildingTransformPanel').setAttribute('data-validation','invalid');
      $('buildingPreviewStatus').textContent='CANNOT APPLY · '+formatEditIssue4D(issues[0],{
        buildingId:session.buildingId,propertyId:session.propertyId,
        frontageRoadId:session.source(project.city)?.frontageRoadId
      });
      const list=$('buildingPreviewIssues');
      list.hidden=!issues.length;
      list.replaceChildren(...issues.map(issue=>{
        const li=document.createElement('li');
        li.textContent=formatEditIssue4D(issue,{
          buildingId:session.buildingId,propertyId:session.propertyId,
          frontageRoadId:session.source(project.city)?.frontageRoadId
        });return li;
      }));
      syncMapEditDiagnostic4D();
      requestDraw();
      return false;
    }
    // Commit one already-validated project object, preserving IDs and the
    // existing schema. Record and UI updates cannot affect pre-commit checks.
    if (!current() || project !== previous || session.buildingId !== buildingId) return false;
    const recorded = received.courtyardRoutesChanged.length
      ? buildingStructureHistory.record(previous, received.candidate, session.propertyId, 'courtyard access')
      : buildingHistory.record(previous, received.candidate, buildingId);
    if (!recorded) return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    const label = session.draft ? 'Edit building footprint' : transform.scaleX !== 1 || transform.scaleY !== 1
      ? 'Resize building' : transform.angle ? 'Rotate building' : 'Move building';
    const portalsChanged = received.courtyardRoutesChanged.length ||
      JSON.stringify(session.source(previous.city)?.geometry?.courtyardAccess) !==
      JSON.stringify(received.candidate.city.buildings.find(building => building.id === buildingId)?.geometry?.courtyardAccess);
    commitAcceptedEdit(received.candidate, { family: 'building',
      operation: portalsChanged ? 'building-structure' : 'building-geometry',
      label: portalsChanged ? 'Edit courtyard access' : label, targetIds: [buildingId] });
    session.reset(project.city, { keepCourtyard: true });
    updateDetails();
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged(); // Mark the accepted city dirty for recovery/save.
    $('statusMessage').textContent='Applied validated footprint to '+buildingId+'. Download a project copy to keep this change.';
    return true;
  } catch(error){
    // Once published, a later UI failure cannot roll back only the city.
    if(project!==previous){
      $('statusMessage').textContent='Building edit accepted; interface refresh failed: '+error.message;
      files?.changed();
      return true;
    }
    $('buildingPreviewApply').disabled=true;
    $('buildingPreviewStatus').textContent='APPLY FAILED · Original city preserved. '+error.message;
    requestDraw();
    return false;
  }
}

function moveBuildingHistory(direction) {
  const entry = acceptedHistoryD01.entry(direction);
  return Boolean(entry?.operation === 'building-geometry' && buildingEditSession?.isActive &&
    entry.targetIds.includes(buildingEditSession.buildingId) && d01MoveHistory(direction));
}

// C01 shares the existing property Inspector and property-scoped structure
// history. Draft membership and group transforms never mutate the accepted
// project until the common independent validation and portable save gate.
function c01ActiveProperty() {
  const sel=workspaceShell?.state.selection;
  return sel?.kind==='property'&&sel.id===compoundPanelPropertyId
    ? project?.city.properties.find(p=>p.id===sel.id) : null;
}
function c01SelectedGroup() {
  return c01ActiveProperty()?.buildingCompounds?.find(g=>g.id===compoundGroupId)??null;
}
function c01SelectGroup(id) {
  compoundDrag=null;
  const property=c01ActiveProperty();
  compoundGroupId=id;
  const group=property?.buildingCompounds?.find(g=>g.id===id);
  compoundMemberIds=group?.memberBuildingIds.slice()??[];
  compoundName=group?.name??'';
  compoundTransform={dx:0,dy:0,angle:0,scaleX:1,scaleY:1};
  for(const [input,value] of [['compoundDx',0],['compoundDy',0],['compoundAngle',0],
      ['compoundScaleX',100],['compoundScaleY',100]])$(input).value=String(value);
  compoundResult=null;
  c01SyncPanel(true);
  // A committed membership/transform is a structure history action.
  // Re-evaluate its local buttons after clearing the now-accepted draft.
  syncBuildingStructureUI3H();
  updateUndoFeedback();
  requestDraw();
}
function c01Open(propertyId) {
  const property=project?.city.properties.find(p=>p.id===propertyId);
  if(!property||layers.buildings===false||roadWorkspace?.active||
      buildingEditSession?.isActive||buildingPlacementSession?.isActive||
      propertyEditSession?.isActive||propertySplitE2?.active||propertyMergeE3?.active)return false;
  compoundPanelPropertyId=propertyId;
  compoundGroupId='';
  c01SelectGroup(property.buildingCompounds?.[0]?.id??'');
  $('buildingCompoundPanel').scrollIntoView?.({block:'nearest'});
  return true;
}
function c01SyncPanel(rebuild=false) {
  const property=c01ActiveProperty();
  const panel=$('buildingCompoundPanel');
  panel.hidden=!property||layers.buildings===false;
  if (panel.hidden) { compoundResult = null; drafts.close('compound'); return; }
  const groups=property.buildingCompounds??[];
  const select=$('compoundGroupSelect');
  const ids=['',...groups.map(g=>g.id)];
  const current=Array.from(select.options??[]).map(o=>o.value);
  if(rebuild||JSON.stringify(ids)!==JSON.stringify(current)){
    const options=ids.map(id=>{
      const o=document.createElement('option');o.value=id;
      const g=groups.find(c=>c.id===id);
      o.textContent=g ? g.name+' · '+g.memberBuildingIds.length+' buildings' : 'New compound';
      return o;
    });
    select.replaceChildren(...options);
  }
  select.value=compoundGroupId;
  const group=c01SelectedGroup();
  const name=$('compoundNameInput');
  if(document.activeElement!==name||rebuild)name.value=compoundName;
  if(rebuild){
    const rows=property.buildingIds.map(id=>{
      const building=project.city.buildings.find(b=>b.id===id);
      const label=document.createElement('label');label.className='compound-member-choice';
      const input=document.createElement('input');
      input.type='checkbox';input.value=id;input.checked=compoundMemberIds.includes(id);
      input.addEventListener('change',()=>{
        compoundMemberIds=input.checked
          ? [...compoundMemberIds,id] : compoundMemberIds.filter(x=>x!==id);
        $('compoundStatus').textContent='Membership preview only · Save compound to accept changes.';
        updateUndoFeedback();
      });
      label.append(input,document.createTextNode(' '+(building?.customName||building?.type||'Building')+' · '+id));
      return label;
    });
    $('compoundMemberList').replaceChildren(...rows);
  }
  $('compoundSaveGroup').textContent=group?'Save compound changes':'Create compound';
  $('compoundDissolve').disabled=!group;
  $('compoundTransformControls').hidden=!group;
  if(group){
    try{
      compoundResult=prepareCompoundTransform(project,captureWorkspace().workspace,
        property.id,group.id,compoundTransform);
    }catch(error){compoundResult={ok:false,issues:[{message:error.message}],preview:null};}
  }else compoundResult=null;
  placeDraft('compound', 'buildingCompoundPanel', 'compoundApply', {
    active: Boolean(group) && !buildingEditSession?.isActive && !buildingPlacementSession?.isActive && !propertyEditSession?.isActive,
    key: group?.id, intent: JSON.stringify([compoundTransform, Boolean(compoundDrag)]),
    dirty: compoundTransformPending(), checking: Boolean(compoundDrag), ready: compoundResult?.ok,
    issues: compoundResult?.issues, target: group ? { kind: 'compound', id: group.id } : undefined,
  });
  const msg=compoundResult?.ok
    ? 'VALID · All compound members can be applied together.'+
      (compoundResult.frontageChanges.length
        ? ' Side streets: '+compoundResult.frontageChanges.map(row=>row.buildingId+' → '+row.roadId).join(', ')+'.' : '')
    :compoundResult?.issues?.length
      ? 'CANNOT APPLY · '+(compoundResult.issues[0].buildingId?compoundResult.issues[0].buildingId+': ':'')
        +(compoundResult.issues[0].code==='access'
          ? formatEditIssue4D(compoundResult.issues[0]) : compoundResult.issues[0].message)
      : 'Select 2 or more property buildings to create a compound.';
  $('compoundStatus').textContent=msg;
  $('buildingCompoundPanel').setAttribute('data-validation',compoundResult?.ok?'valid':'idle');
}
function c01SaveMembership(action) {
  const property=c01ActiveProperty();
  if(!property||!project)return false;
  const previous=project;
  const receipt=prepareCompoundMembership(previous,captureWorkspace().workspace,{
    action,propertyId:property.id,groupId:compoundGroupId||null,
    name:compoundName,memberBuildingIds:compoundMemberIds
  });
  if(!receipt.ok){
    $('compoundStatus').textContent='CANNOT SAVE · '+receipt.issues[0].message;
    return false;
  }
  if(project!==previous||c01ActiveProperty()?.id!==property.id)return false;
  if(!buildingStructureHistory.record(previous,receipt.candidate,property.id,'compound-'+action))return false;
  const label = action === 'create' ? 'Create building compound' : action === 'dissolve'
    ? 'Dissolve building compound' : 'Edit building compound';
  commitAcceptedEdit(receipt.candidate, { family: 'compound', operation: 'compound-membership',
    label, targetIds: [property.id] });
  buildingHistory.clear();
  propertyWorkspace.refresh();buildingWorkspace.refresh();
  workspaceShell.refresh();updateDetails();workspaceChanged();
  compoundGroupId=action==='dissolve'?'':receipt.groupId;
  c01SelectGroup(compoundGroupId);
  $('statusMessage').textContent=action==='dissolve'?'Dissolved compound without deleting its buildings.'
    :'Saved validated compound group. Structure Undo restores the previous membership.';
  return true;
}
function c01ApplyTransform() {
  return applyPlaceDraft('compound', 'buildingCompoundPanel', 'compoundApply', commitCompoundTransform);
}
function commitCompoundTransform(current) {
  const property=c01ActiveProperty(),group=c01SelectedGroup();
  if(!property||!group||!project)return false;
  const previous=project;
  const receipt=prepareCompoundTransform(previous,captureWorkspace().workspace,
    property.id,group.id,compoundTransform);
  if (!receipt.ok) {
    drafts.reject('compound', receipt.issues);
    compoundResult = receipt;
    c01SyncPanel();
    return false;
  }
  if (!current() || project !== previous || c01ActiveProperty()?.id !== property.id) return false;
  if(!buildingStructureHistory.record(previous,receipt.candidate,property.id,'compound-transform'))
    return false;
  commitAcceptedEdit(receipt.candidate, { family: 'compound', operation: 'compound-transform',
    label: 'Transform building compound', targetIds: [property.id, ...group.memberBuildingIds] });
  buildingHistory.clear();
  propertyWorkspace.refresh();buildingWorkspace.refresh();
  workspaceShell.refresh();updateDetails();workspaceChanged();
  c01SelectGroup(group.id);
  $('statusMessage').textContent='Applied all compound members in one verified transaction. Structure Undo is available.';
  return true;
}

// 3H manages building records only within a selected parent property.
function structureHistoryProperty3H() {
  if(buildingPlacementSession?.isActive)return buildingPlacementSession.propertyId;
  const selected=workspaceShell?.state.selection;
  if(selected?.kind==='property')return selected.id;
  if(selected?.kind==='building')return project?.city?.buildings.find(b=>b.id===selected.id)?.propertyId??null;
  return null;
}
function confirmStructureDiscard3H() {
  return drafts.canLeave('building-placement', confirmDraft('Discard the unsaved building placement preview? Your accepted city will not change.'));
}
function exitStructurePlacement3H() {
  if(!buildingPlacementSession?.isActive)return true;
  if(!confirmStructureDiscard3H())return false;
  cancelMapGesturesA2();
  drafts.cancel('building-placement', () => buildingPlacementSession.stop());
  // Like footprint editing, leave a clear route back to the Inspector on phones.
  if(Number.isFinite(window.innerWidth) && window.innerWidth<=900
      && workspaceShell?.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:false});
  return true;
}
function startStructurePlacement3H(propertyId,buildingId=null) {
  if(propertySplitE2?.active||propertyMergeE3?.active)return false;
  if(!project || layers.buildings===false || !propertyId)return false;
  if(!exitPropertyEditing3I() || !exitStructurePlacement3H() || !exitBuildingEditing())return false;
  if(workspaceShell.state.section!=='city')workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if(editor.mode!=='pan')editor.setMode('pan');
  try{
    const started=buildingPlacementSession.start(project.city,propertyId,buildingId);
    if(started && Number.isFinite(window.innerWidth) && window.innerWidth<=900)
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    return started;
  }catch(error){$('statusMessage').textContent='Cannot start building placement: '+error.message;return false;}
}
function componentEditorBuilding() {
  return project?.city.buildings.find(b => b.id === buildingPlacementSession?.buildingId);
}

function openBuildingComponentEditor(building) {
  if (!canEditBuildingComponents(building) || !startStructurePlacement3H(building.propertyId)) return false;
  const session = buildingPlacementSession;
  const property = session.property(project.city);
  Object.assign(session.active, {operation:'components', buildingId:building.id,
    componentDraft:initialBuildingComponentDraft(property)});
  updateMapIndicators();
  requestDraw();
  return true;
}

function prepareComponentPlacement(project, workspace, request, options) {
  const draft = request.componentDraft;
  const result = prepareBuildingComponents(project, workspace, request.buildingId, {...draft,
    transform:{dx:draft.dx, dy:draft.dy, angle:draft.angle * Math.PI / 180,
      scaleX:draft.scaleX / 100, scaleY:draft.scaleY / 100}},options);
  if (draft.action === 'join' && result.ok && !acceptedHistoryD01.fits(project,result.candidate))
    return {...result,ok:false,status:'invalid',candidate:null,
      issues:[{message:'This join exceeds the session Undo capacity.'}]};
  return result;
}

const buildingComponentControls = new BuildingComponentControls($, () => buildingPlacementSession,
  componentEditorBuilding, () => {syncBuildingStructureUI3H(); requestDraw();});
const courtyardPlacementControls = new CourtyardPlacementControls($, () => project?.city, () => {
  syncBuildingStructureUI3H();
  requestDraw();
});
function syncBuildingStructureUI3H() {
  const session=buildingPlacementSession;
  const shown=Boolean(project && session?.isActive && session.property(project.city));
  $('buildingStructurePanel').hidden=!shown;
  const propertyId=structureHistoryProperty3H();
  const historyShown=Boolean(project && propertyId && workspaceShell?.state.section==='city'
    && !roadWorkspace?.active && !buildingEditSession?.isActive && !propertyEditSession?.isActive);
  $('buildingStructureHistoryPanel').hidden=!historyShown;
  const idle=Boolean(session?.isActive);
  const canHistory=historyShown && !idle;
  const blockedStructureHistory = [];
  for(const [direction,id] of [['undo','structureUndo'],['redo','structureRedo']]) {
    const entry = buildingStructureHistory.entry(direction, propertyId);
    const next=acceptedHistoryD01.entry(direction);
    const available = canHistory && !d01DraftBlocked() &&
      (next?.operation==='building-structure'||next?.family==='compound') &&
      d01TouchesStructureProperty(next,propertyId) && acceptedHistoryD01.can(direction,project);
    const action = describeStructureChange4E(entry, direction);
    const blocked = canHistory && entry && !available;
    const label = direction === 'undo' ? 'Undo' : 'Redo';
    if (blocked) blockedStructureHistory.push(label);
    $(id).disabled = !available;
    $(id).textContent = action?.label ?? label + ' structure';
    $(id).title = blocked ? 'A later edit changed this property or its buildings.'
      : action?.description ?? 'No structural edit to '+direction+'.';
  }
  const next=describeStructureChange4E(buildingStructureHistory.entry('undo',propertyId),'undo')
    ??describeStructureChange4E(buildingStructureHistory.entry('redo',propertyId),'redo');
  $('structureHistoryStatus').textContent=historyShown
    ? 'Property structure history · '+buildingStructureHistory.count('undo',propertyId)+' undo / '
      +buildingStructureHistory.count('redo',propertyId)+' redo (session only).'
      +(blockedStructureHistory.length
        ? ' '+blockedStructureHistory.join(' and ')+' blocked because a later edit changed this property or its buildings.'
        : next?' Next: '+next.description:'')
    : '';
  if (!shown) { drafts.close('building-placement'); return; }
  courtyardPlacementControls.sync(project.city, session);
  const componentMode = session.operation === 'components';
  $('structureComponentEditor').hidden = !componentMode;
  const portalOnly = Boolean(session.active.courtyard?.only && session.active.courtyard.hostId);
  for (const id of ['structureFootprintFields', 'structurePreviewMeasurements4C', 'structurePlacementNudges', 'structurePlacementKeys'])
    $(id).hidden = portalOnly || componentMode;
  if (componentMode) buildingComponentControls.sync(componentEditorBuilding());
  $('structurePlacementHint').hidden = componentMode || portalOnly;
  const joining = componentMode && session.active.componentDraft.action === 'join';
  const spec=session.spec;
  const structureMeasure=placementMeasurements4C(project.city,session);
  $('structurePreviewMeasurements4C').textContent=structureMeasure
    ? 'Width '+formatPrecision4C(structureMeasure.width)+' · Depth '+formatPrecision4C(structureMeasure.depth)+
      ' · Area '+formatPrecision4C(structureMeasure.area)+' · Position '+formatPrecision4C(structureMeasure.u)+
      ', '+formatPrecision4C(structureMeasure.v) : 'Adjust your draft to preview its measurements.';
  const replacing = session.operation === 'replace';
  $('structureModeTitle').textContent = componentMode ? 'EDIT BUILDING COMPONENTS' : portalOnly ? 'EDIT COURTYARD PORTALS' : replacing ? 'REPLACE BUILDING' : 'PLACE NEW BUILDING';
  $('structureReplaceConsent').hidden = !replacing || !spec.preset;
  $('structureReplaceGeometry').checked = Boolean(session.active.replaceGeometry);
  $('structureReplaceGeometry').disabled = Boolean(session.drag);
  $('structurePropertyLabel').textContent=session.propertyId;
  const currentType = replacing ? project.city.buildings.find(b => b.id === session.buildingId)?.type : undefined;
  renderBuildingUseOptions($('structureType'), currentType);
  for(const [id,value] of Object.entries({
    structureU:spec.u,structureV:spec.v,structureWidth:spec.width,
    structureDepth:spec.depth,structureAngle:spec.angle,
    structurePreset:spec.preset,structureType:spec.type
  })) $(id).value=typeof value==='number'?String(Number(value.toFixed(2))):value;
  const result = session.drag ? {ok:false,status:'checking',issues:[]}
    : componentMode ? prepareComponentPlacement(project,captureWorkspace().workspace,session.active,{previewOnly:true})
    : !portalOnly && !spec.preset ? {ok:false,status:'idle',issues:[]}
    : prepareBuildingStructure3H(project,captureWorkspace().workspace,session.active);
  session.validation=result;
  const consentNeeded = replacing && !session.active.replaceGeometry;
  const joinConsentNeeded = joining && result.preview?.join?.retiredName && !session.active.componentDraft.confirmJoin;
  const consentIssue = consentNeeded ? 'Confirm the replacement footprint.'
    : joinConsentNeeded ? 'Confirm the incoming part before applying the joined outline.' : null;
  placeDraft('building-placement', 'buildingStructurePanel', 'structureApply', {
    key: session.active, baseline: session.acceptedCity,
    intent: JSON.stringify([session.active, Boolean(session.drag)]), dirty: true,
    checking: result.status === 'checking', ready: result.ok && result.status === 'valid',
    target: { kind: 'building', id: session.buildingId },
    issues: [...(result.issues ?? []), ...(result.ok && consentIssue
      ? [{ code: 'building-consent-required', message: consentIssue, severity: 'decision' }] : [])],
  });
  $('buildingStructurePanel').setAttribute('data-validation',result.status);
  const issues=$('structureIssues');
  issues.hidden=!result.issues?.length;
  issues.replaceChildren(...(result.issues??[]).map(issue=>{
    const el=document.createElement('li');
    el.textContent=formatEditIssue4D(issue,{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.property(project.city)?.frontageRoadId
    });return el;
  }));
  $('structureStatus').textContent = result.status === 'idle'
    ? componentMode ? 'Choose a component and make a change.' : 'Choose a footprint preset to preview it against the existing outline.'
    : result.status==='checking'
    ? 'CHECKING · Complete placement validation runs when movement ends.'
    : result.ok ? (consentNeeded
      ? 'Review the proposed footprint on the map and confirm the replacement.'
      : joinConsentNeeded ? 'Confirm the incoming part before applying the joined outline.'
      : joining ? 'VALID · Apply the joined outline.'
      : componentMode ? 'VALID · Apply the component changes to this building.'
      : portalOnly ? 'VALID · Apply the portal changes to the selected property.'
        : 'VALID · This building can be applied to the selected property.')
    : 'INVALID · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.property(project.city)?.frontageRoadId
    });
}
function applyStructurePlacement3H() {
  return applyPlaceDraft('building-placement', 'buildingStructurePanel', 'structureApply', commitStructurePlacement3H);
}
function commitStructurePlacement3H(current) {
  const session=buildingPlacementSession;
  if (!project || !session?.isActive || session.drag
      || session.acceptedCity !== project.city
      || (session.operation === 'replace' && !session.active.replaceGeometry)) return false;
  const selection=workspaceShell?.state.selection;
  if(!selection || (selection.kind==='property' && selection.id!==session.propertyId)
    || (selection.kind==='building' && selection.id!==session.buildingId)
    || !['property','building'].includes(selection.kind))return false;
  const previous=project,request={...session.active,spec:{...session.spec}};
  const workspace = captureWorkspace().workspace;
  const result = request.operation === 'components' ? prepareComponentPlacement(previous,workspace,request)
    : prepareBuildingStructure3H(previous,workspace,request);
  if(!result.ok){
    session.validation = result;
    drafts.reject('building-placement', result.issues);
    syncBuildingStructureUI3H();
    return false;
  }
  if (!current() || project !== previous || session.active?.buildingId !== request.buildingId) return false;
  try{
    const action = request.courtyard?.only && request.courtyard.hostId ? 'courtyard portal changes' : request.operation;
    if(!buildingStructureHistory.record(previous,result.candidate,request.propertyId,action))return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    const label = action === 'components' ? 'Edit building components' : action === 'courtyard portal changes'
      ? 'Edit courtyard access' : action === 'replace' ? 'Replace building' : 'Place building';
    commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',
      label, targetIds: [request.buildingId] });
    buildingHistory.clear();
    session.stop();
    updateDetails();
    workspaceShell.select(request.operation === 'components' ? {kind:'building',id:request.buildingId}
      : {kind:'property',id:request.propertyId});
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent = action === 'components' ? 'Applied building component changes.'
      : action === 'courtyard portal changes'
      ? 'Applied courtyard portal changes. Download a project to keep them.'
      : 'Applied '+request.operation+' for '+request.buildingId+'. Download a project to keep it.';
    return true;
  }catch(error){$('statusMessage').textContent='Building Apply rejected: '+error.message;return false;}
}
// Dev 4e: one confirmation, one validated transaction and one structural Undo.
function clearPropertyBuildings4E(propertyId) {
  if(propertySplitE2?.active||propertyMergeE3?.active)return false;
  const selected=workspaceShell?.state.selection;
  const site=project?.city?.properties.find(p=>p.id===propertyId);
  if(!site||layers.buildings===false||selected?.kind!=='property'||selected.id!==propertyId)return false;
  const count=site.buildingIds?.length??0;
  if(count===0){
    $('statusMessage').textContent='This property has no buildings to clear.';
    return false;
  }
  const name=site.customName||propertyId;
  if(typeof window.confirm==='function'&&!window.confirm(
    'Clear all '+count+' building(s) from property "'+name+'"? The property, plots and roads stay unchanged. '+
    'You can undo this entire action in one step during this session.'
  ))return false;
  if(!exitPropertyEditing3I()||!exitStructurePlacement3H()||!exitBuildingEditing())return false;
  const previous=project;
  const result=preparePropertyBuildingClear4E(previous,captureWorkspace().workspace,propertyId);
  if(!result.ok){$('statusMessage').textContent=result.reason;return false;}
  if(project!==previous||workspaceShell?.state.selection?.id!==propertyId)return false;
  try {
    if(!buildingStructureHistory.record(previous,result.candidate,propertyId,'clear'))return false;
    commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',
      label: 'Clear property buildings', targetIds: site.buildingIds });
    buildingHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
    identityWorkspace.reset();
    updateDetails();
    workspaceShell.select({kind:'property',id:propertyId});
    workspaceShell.refresh();
    requestDraw();workspaceChanged();
    $('statusMessage').textContent='Cleared '+result.count+' buildings from '+name+
      '. Undo clear restores every building in one step this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Clear buildings failed: '+error.message;return false;}
}
function deleteStructureBuilding3H(propertyId,buildingId) {
  if(!project||!propertyId||!buildingId)return false;
  if(typeof window.confirm==='function' && !window.confirm('Delete '+buildingId+' from this property? You can Undo this deletion during the session.'))return false;
  if(!exitStructurePlacement3H() || !exitBuildingEditing())return false;
  const previous=project;
  const result=prepareBuildingStructure3H(previous,captureWorkspace().workspace,
    {operation:'delete',propertyId,buildingId});
  if(!result.ok){$('statusMessage').textContent='Deletion rejected: '+result.issues[0]?.message;return false;}
  try{
    if(!buildingStructureHistory.record(previous,result.candidate,propertyId,'delete'))return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    commitAcceptedEdit(result.candidate, { family: 'building', operation: 'building-structure',
      label: 'Delete building', targetIds: [buildingId] });
    buildingHistory.clear();
    updateDetails();
    workspaceShell.select({kind:'property',id:propertyId});
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent='Deleted '+buildingId+'; Undo structure can restore it this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Deletion failed: '+error.message;return false;}
}
function exitBuildingEditing() {
  if (!buildingEditSession?.isActive) return true;
  if (!confirmBuildingPreviewDiscard()) return false;
  cancelMapGesturesA2();
  drafts.cancel('building', () => buildingEditSession.stop());
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900 && workspaceShell?.state.selection?.kind === 'building'
    && workspaceShell.state.inspectorCollapsed) workspaceShell.dispatch({ type: 'inspector', collapsed: false });
  return true;
}
function exitPropertyEditing3I() {
  if (!propertyEditSession?.isActive) return true;
  const confirm = confirmDraft('Discard your unsaved property boundary and plot preview?');
  if (!drafts.cancel('property', () => {
    cancelMapGesturesA2();
    propertyEditSession.stop();
    return true;
  }, confirm)) return false;
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900
      && workspaceShell?.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:false});
  return true;
}
function syncPropertyEditUI3I() {
  const session = propertyEditSession;
  const active = Boolean(project && session?.isActive && session.source(project.city));
  $('propertyEditPanel3I').hidden = !active;
  if (!active) { drafts.close('property'); return; }
  $('propertyEditTarget3I').textContent = session.propertyId;
  const measured=propertyMeasurements4C(project.city,session);
  if(measured) $('propertyPreviewMeasurements4C').textContent=
    'Width '+formatPrecision4C(measured.width)+' · Depth '+formatPrecision4C(measured.depth)+
    ' · Area '+formatPrecision4C(measured.area)+' (Δ '+formatPrecision4C(measured.areaDelta)+')'+
    ' · Center '+formatPrecision4C(measured.x)+', '+formatPrecision4C(measured.y)+
    ' · Offset '+formatPrecision4C(measured.dx)+', '+formatPrecision4C(measured.dy);
  for(const id of ['propertyNudgeLeft4C','propertyNudgeRight4C','propertyNudgeUp4C','propertyNudgeDown4C'])
    $(id).disabled=session.selectedCorner===null || Boolean(session.drag);
  $('propertyEditCorner3I').textContent = session.drag?.kind==='frontage-sfs' && session.drag.clamped
    ? 'Frontage stopped at the nearest valid boundary. Move back to continue.'
    : session.drag?.kind==='frontage-sfs' && session.drag.handle==='edge'
      ? 'Moving street frontage · both endpoints stay parallel to the assigned road.'
      : session.selectedCorner === null
        ? 'Click or drag a highlighted corner; drag the frontage midpoint to move the edge.'
        : 'Corner '+(session.selectedCorner + 1)+' selected. Drag or enter coordinates to preview changes.';
  const corner = session.selectedCorner === null ? null : session.boundary[session.selectedCorner];
  for(const [id,value] of [['propertyCornerX3I',corner?.x],['propertyCornerY3I',corner?.y]]){
    $(id).disabled = !corner || session.flexibleMode;
    $(id).value = corner ? String(Number(value.toFixed(2))) : '';
  }
  const dividerIndex=$('propertyDividerIndex3I'), dividerInput=$('propertyDividerPercent3I');
  const dividers=session.dividers;
  const previous=dividerIndex.options?.length??-1;
  if(previous!==dividers.length){
    const options=dividers.map((_,i)=>{
      const option=document.createElement('option');
      option.value=String(i);option.textContent='Divider '+(i+1);return option;
    });
    dividerIndex.replaceChildren(...options);
  }
  dividerIndex.disabled=dividers.length===0||session.flexibleMode;
  dividerIndex.value=String(session.selectedDivider);
  dividerInput.disabled=dividers.length===0||session.flexibleMode;
  dividerInput.value=dividers.length?String(Number((dividers[session.selectedDivider]*100).toFixed(2))):'';
  $('propertyAddVertex024').disabled=Boolean(session.flexibleMode||session.drag||session.countChange||session.boundary.length>=12);
  $('propertyRemoveVertex024').disabled=Boolean(session.flexibleMode||session.drag||session.countChange||session.boundary.length<=3
    ||session.selectedCorner===null||session.selectedCorner<2);
  $('propertyRestoreFrontage024').disabled=Boolean(session.flexibleMode||session.drag||!session.frontageChanged);
  $('propertyAddDividerE4').disabled=Boolean(session.flexibleMode||session.polygonMode||session.countChange||session.drag);
  $('propertyRemoveDividerE4').disabled=Boolean(session.flexibleMode||session.polygonMode||session.countChange||session.drag||!dividers.length);
  const countChange=session.countChange;
  $('propertyCountSummaryE4').textContent=session.flexibleMode?'Flexible plot operations are drafted below. Existing property geometry is unchanged.':countChange
    ? (countChange.kind==='split'
      ?'Split plot '+countChange.sourceId+' · keep original ID; new plot '+countChange.newId+'.'
      :'Merge two plots · retain '+countChange.retainedId+'; retire '+countChange.retiredId+'.')+
      ' Building memberships will be recalculated; geometry never moves.'
    :session.polygonMode?'Polygon boundaries · convex plot cells are reviewed on Apply. Existing custom plots are protected.'
    :'Plots: '+session.plotIds.length+'. Select a divider to merge neighboring plots, or split the plot after it.';
  const protectedPlot=countChange&&project.city.plots.find(p=>p.id===
    (countChange.kind==='split'?countChange.sourceId:countChange.retiredId));
  const annotated=Boolean(protectedPlot&&Object.keys(protectedPlot).some(key=>
    !['id','blockId','propertyId','frontageRoadId','boundary'].includes(key)));
  $('propertyCountConsentWrapE4').hidden=!annotated;
  $('propertyCountConsentE4').checked=session.approved;
  $('propertyCountConsentTextE4').textContent=countChange?.kind==='split'
    ?'I authorize the original plot metadata to remain on the retained plot only; the full source record is saved in plot history.'
    :'I authorize retiring the second plot; its full authored record is saved in plot history.';
  const f=session.flexible;
  $('plot027Controls').hidden=!f;
  $('plot027Start').disabled=Boolean(f||session.isPending||session.drag);
  if(f){
    const choices=(id,values,selected)=>{
      const element=$(id),sig=JSON.stringify(values);
      if(element.dataset.items!==sig){
        element.replaceChildren(...values.map(({id,label})=>{
          const o=document.createElement('option');o.value=String(id);o.textContent=label;return o;
        }));
        element.dataset.items=sig;
      }
      element.value=selected??'';
    };
    choices('plot027Selected',f.plots.map(p=>({id:p.id,label:p.id+' · '+p.boundary.length+' edges'})),f.selectedId);
    choices('plot027Other',[{id:'',label:'Choose adjacent plot'},...f.plots.filter(p=>p.id!==f.selectedId).map(p=>({id:p.id,label:p.id}))],f.otherId);
    choices('plot027EdgeA',(f.selected?.boundary??[]).map((_,i)=>({id:i,label:'Edge '+(i+1)})),String(f.edgeA));
    choices('plot027EdgeB',(f.selected?.boundary??[]).map((_,i)=>({id:i,label:'Edge '+(i+1)})),String(f.edgeB));
    $('plot027RatioA').value=String(Number((f.ratioA*100).toFixed(2)));
    $('plot027RatioB').value=String(Number((f.ratioB*100).toFixed(2)));
    $('plot027Endpoint').value=f.endpoint??'A';
    $('plot027Retain').value=f.retain;
    $('plot027Undo').disabled=!f.pending;
    $('plot027Split').disabled=Boolean(session.drag||f.operations.length>=12);
    $('plot027Merge').disabled=Boolean(session.drag||!f.otherId||f.operations.length>=12);
    const protectedIds=f.authorizations(project.city);
    $('plot027ConsentWrap').hidden=!protectedIds.length;
    $('plot027Consent').checked=f.approved;
    $('plot027ConsentText').textContent='Approve authored metadata scope/retirement for '+protectedIds.join(', ')+'. Original records will be retained in plot history.';
    $('plot027Summary').textContent=f.operations.length+' pending operation(s) · '+f.plots.length+
      ' resulting plots. One Apply and one accepted Undo. '+(f.error||'Choose a plot and edit cut endpoints on the map or numerically.');
  }
  const canHistory=!session.isPending&&!session.drag&&!d01DraftBlocked();
  const propertyHistoryMatches=direction=>{
    const entry=acceptedHistoryD01.entry(direction);
    return entry?.family==='property' &&
      ['property-geometry','property-and-plot'].includes(entry.operation) &&
      acceptedHistoryD01.can(direction,project);
  };
  $('propertyHistoryUndo3I').disabled=!(canHistory&&propertyHistoryMatches('undo'));
  $('propertyHistoryRedo3I').disabled=!(canHistory&&propertyHistoryMatches('redo'));
  $('propertyHistoryStatus3I').textContent='Property history · '+propertyHistory.count('undo',session.propertyId)
    +' undo / '+propertyHistory.count('redo',session.propertyId)+' redo (session only).';
  const result=session.drag ? {ok:false,status:'checking',issues:[]} : inspectPropertyEdit3I(project,session);
  session.validation=result;
  $('propertyEditPanel3I').setAttribute('data-validation',result.status);
  const draft = placeDraft('property', 'propertyEditPanel3I', 'propertyEditApply3I', {
    key: session.active, intent: JSON.stringify([session.active, f?.operations, f?.approved, Boolean(session.drag)]),
    dirty: session.isPending, checking: Boolean(session.drag), ready: result.ok,
    target: { kind: 'property', id: session.propertyId }, issues: result.issues,
  });
  $('propertyEditStatus3I').textContent = result.status==='checking'
    ? 'CHECKING · Release the handle to validate the new property and plots.'
    : !result.ok
      ? 'INVALID · '+formatEditIssue4D(result.issues?.[0],{propertyId:session.propertyId})
      : session.isPending
        ? 'VALID · Property and plot edits can be applied together.'
        : 'NO PENDING CHANGES · Property and plots match the accepted city.';
  const issues=$('propertyEditIssues3I');
  issues.hidden=!result.issues?.length;
  issues.replaceChildren(...(result.issues ?? []).map((issue, index) => renderPlaceDiagnostic(issue,
    { propertyId: session.propertyId }, 'property', draft, index)));
}
function renderPlaceDiagnostic(issue, context, domain, draft, index) {
  const item = document.createElement('li');
  item.textContent = formatEditIssue4D(issue, context);
  const target = draft.diagnostics[index]?.target;
  if (issue.targetId && selectionFocusPoints4B(project?.city, target)) {
    const locate = document.createElement('button');
    locate.type = 'button';
    locate.className = 'minor-button';
    locate.textContent = 'Locate ' + target.kind;
    locate.setAttribute('aria-label', 'Locate ' + target.kind + ' ' + target.id);
    locate.addEventListener('click', () => {
      if (!drafts.isCurrent(domain, draft) || !focusCameraOnSelection4B(camera, project.city, target)) return;
      $('zoomValue').textContent = `${Math.round(camera.zoom * 100)}%`;
      requestDraw();
    });
    item.append(locate);
  }
  return item;
}
function syncMapEditDiagnostic4D() {
  // Active city edit previews only; dragging, idle and valid drafts hide stale errors.
  const session=propertyEditSession?.isActive?propertyEditSession
    :buildingEditSession?.isActive?buildingEditSession
    :buildingPlacementSession?.isActive?buildingPlacementSession:null;
  const result=session?.validation;
  const issue=result?.status==='invalid'?result.issues?.[0]:null;
  const box=$('mapEditDiagnostic4D');
  box.hidden=!issue;
  if(!issue){box.textContent='';return;}
  const context={propertyId:session.propertyId,buildingId:session.buildingId,
    frontageRoadId:session.source?.(project?.city)?.frontageRoadId
      ?? session.property?.(project?.city)?.frontageRoadId};
  box.textContent='EDIT BLOCKED · '+formatEditIssue4D(issue,context);
}
function updateMapIndicators() {
  if(roadWorkspace?.active){
    $('toolHint').textContent='ROAD INSPECTION · Select a junction or road · Space/middle drag pans · Escape cancels';
    $('draftBadge').textContent='● ROAD PREVIEW ONLY';
    return;
  }
  clearMapHover();
  syncBuildingTransformUI();
  syncBuildingStructureUI3H();
  c01SyncPanel();
  syncPropertyEditUI3I();
  syncPropertyCreationE1();
  propertySplitE2?.refresh();
  propertyMergeE3?.refresh();
  syncMapEditDiagnostic4D();
  syncPropertyDeletionControls4A();
  desktopPlaceEditor?.sync();
  desktopWorkspace?.sync();
  updatePendingFeedback();
  const creationActive = Boolean(propertyCreationSessionE1?.active);
  const splitActive=Boolean(propertySplitE2?.active);
  const mergeActive=Boolean(propertyMergeE3?.active);
  const terrainActive = terrainPanel && terrainPanel.editor.mode !== 'pan',
    waterActive = waterPanel && waterPanel.editor.mode !== 'pan',
    buildingActive = buildingEditSession?.isActive ?? false,
    structureActive = buildingPlacementSession?.isActive ?? false,
    propertyActive = propertyEditSession?.isActive ?? false;
  canvas.classList.toggle('building-edit-mode', buildingActive);
  canvas.classList.toggle('drawing', Boolean(terrainActive || waterActive || editor.mode !== 'pan'));
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(!terrainActive && !waterActive && editor.mode === mode));
  $('toolHint').textContent = mergeActive ? 'MERGE PROPERTIES · Choose adjacent neighbor on map or list · Review identity and Apply' : splitActive ? 'SPLIT PROPERTY · Drag divider or set its percentage · Review owners · Apply once verified' : creationActive ? 'CREATE PROPERTY · Click open land inside a block · Adjust the footprint · Apply once verified' : propertyActive ? 'PROPERTY PREVIEW · Drag corners or edit coordinates and plot dividers · Apply unlocks after validation' : structureActive ? 'BUILDING PLACEMENT · Click property ground or drag the ghost · Use numeric controls for exact size and rotation' : buildingActive ? 'BUILDING EDIT · Move, Rotate, Resize · Space/middle drag pans · No geometry changes until validated Apply' : terrainActive ? (terrainPanel.editor.mode === 'move' ? 'Drag the mountain center marker' : terrainPanel.editor.mode === 'ridge' ? 'Drag peaks · Change selected peak height' : terrainPanel.editor.mode === 'shape' ? 'Drag foothills · Double-click to add · Delete to remove' : 'Click or drag a pass along the ridge') : waterActive ? (waterPanel.editor.mode === 'river' ? 'Drag water points · Double-click to add · Delete to remove' : waterPanel.editor.mode === 'lake-move' ? 'Drag the lake center marker' : waterPanel.editor.mode === 'bridge' ? 'Drag bridge markers · Delete to remove' : 'Click near the river to add a bridge') : TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = mergeActive ? '● PROPERTY MERGE PREVIEW' : splitActive ? '● PROPERTY SPLIT PREVIEW' : creationActive ? '● PROPERTY CREATION PREVIEW' : propertyActive ? '● PROPERTY PREVIEW ONLY' : structureActive ? '● BUILDING PLACEMENT PREVIEW' : buildingActive ? '● BUILDING EDIT MODE' : editor.dirty ? '● OUTLINE PREVIEW' : terrainPanel?.editor.dirty ? '● TERRAIN PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
}

function updateViewport() {
  clearMapHover();
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
  workspaceChanged();
}

function editorChanged() {
  if(editor.mode!=='pan')roadWorkspace?.exit();
  if (editor.mode !== 'pan') {buildingEditSession?.stop();buildingPlacementSession?.stop();propertyEditSession?.stop();propertyCreationSessionE1?.stop();propertySplitE2?.stop();propertyMergeE3?.stop();}
  clearMapHover();
  for (const mode of ['freehand', 'points', 'edit', 'pan', 'center']) $(mode + 'Button').setAttribute('aria-pressed', String(editor.mode === mode));
  if (editor.mode !== 'pan' && workspaceShell?.state.section !== 'city') workspaceShell?.navigate('city');
  if (editor.mode !== 'pan' && terrainPanel) terrainPanel.editor.setMode('pan');
  if (editor.mode !== 'pan' && waterPanel) waterPanel.editor.setMode('pan');
  $('toolHint').textContent = TOOL_HINTS[editor.mode];
  $('draftBadge').textContent = editor.dirty ? '● OUTLINE PREVIEW' : terrainPanel?.editor.dirty ? '● TERRAIN PREVIEW' : waterPanel?.editor.dirty ? '● WATER PREVIEW' : '● CITY PLAN';
  canvas.classList.toggle('drawing', editor.mode !== 'pan');
  $('undoButton').disabled = editor.history.length === 0;
  $('finishButton').disabled = editor.closed || editor.boundary.length < 3;
  requestDraw();
  workspaceChanged();
}
const editor = new OutlineEditor(editorChanged, (message, error) => {
  $('draftMessage').textContent = message;
  $('draftMessage').classList.toggle('error', error);
});

// View-only framing: selection and accepted geometry remain unchanged.
function zoomToSelection4B(ref) {
  if(!project||!focusCameraOnSelection4B(camera,project.city,ref))return false;
  if(workspaceShell?.state.section!=='city')workspaceShell.navigate('city');
  if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900
      && workspaceShell?.state.inspectorCollapsed===false)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  updateViewport();
  requestDraw();
  $('statusMessage').textContent='Focused map on '+ref.kind+' '+ref.id+'. No city geometry was changed.';
  return true;
}
function fitMap() {
  const points = [...(!editor.dirty && project ? fortificationViewPoints(project.city) : editor.boundary.length > 2 ? editor.boundary : project?.city.survey.boundary) ?? []];
  const terrainPoints = terrainPanel?.editor.features.flatMap(f => f.path) ?? project?.city.terrainFeatures?.flatMap(f => f.path) ?? [];
  if (points) points.push(...terrainPoints);
  if (points) camera.fit(waterPanel?.editor.features.length && (waterPanel.editor.dirty || waterPanel.editor.mode !== 'pan') ? [...points, ...waterPanel.editor.features.flatMap(f => f.path)] : points);
  requestDraw();
  updateViewport();
}

function updateDetails() {
  const c = project.city;
  if ($('wholeCityPNGOptions').open) updateWholeCityPNGDimensions();
  for (const [id, value] of Object.entries({
      cityName: c.name,
      reportCityName: c.name,
      citySeed: project.seed,
      citySize: project.options.size,
      cityMorphology: project.options.morphology,
      boundaryCount: c.survey.boundary.length,
      junctionCount: new Set(c.roads.filter(r => !r.waterBoundary && !r.terrainBoundary).flatMap(r => [r.a, r.b])).size,
      roadCount: c.roads.filter(r => !r.waterBoundary && !r.terrainBoundary).length,
      blockCount: c.blocks.length,
      laneCount: c.roads.filter(r => r.kind === 'lane').length,
      buildingCount: c.buildings.length,
      propertyCount: c.properties.length,
      mergedCount: c.properties.filter(p => p.plotIds.length > 1).length,
      plotCount: c.plots.length
    })) $(id).textContent = value;
}

function cityGenerationOptions(outline = editor, waterDraft = waterPanel?.editor.definition()) {
  return {
    seed: $('seedInput').value,
    size: $('sizeInput').value,
    morphology: $('morphologyInput').value,
    boundary: outline.boundary,
    center: outline.center,
    water: waterDraft,
    terrain: terrainPanel?.editor.definition(),
    districtCount: $('districtNumberInput').value || 'auto',
    fortifications: {
      enabled: $('wallsEnabledInput').checked,
      gateCount: $('gateCountInput').value || 4,
      towerSpacing: $('towerSpacingInput').value || 100,
      seed: $('fortificationSeedInput').value || $('seedInput').value
    }
  };
}

function prepareDesktopGeneration(tool) {
  if (tool === 'districts') {
    const city = new DistrictEditor().generate(project.city, {
      count: $('districtNumberInput').value,
      seed: $('districtSeedInput').value,
    });
    return { ...project, city };
  }
  if (tool === 'defenses') {
    const city = new FortificationEditor().apply(project.city, fortificationPanel.controls());
    return { ...project, city };
  }
  return prepareCityGeneration().project;
}

function prepareCityGeneration() {
  const outline = new OutlineEditor(() => {}, () => {});
  Object.assign(outline, { boundary: editor.boundary, center: editor.center, closed: editor.closed });
  outline.validate();
  const water = new WaterEditor();
  water.restore(waterPanel.editor.definition());
  if (water.features.some(feature => feature.kind === 'river')) water.width($('riverWidthInput').value);
  const tidied = water.tidyWater(outline.boundary);
  const prepared = createProject({ ...cityGenerationOptions(outline, water.definition()), irregularProperties: true });
  return { project: prepared, tidied };
}

function desktopGenerationKey(tool) {
  if (tool === 'districts') return JSON.stringify([$('districtNumberInput').value, $('districtSeedInput').value]);
  if (tool === 'defenses') return JSON.stringify(fortificationPanel.controls());
  return JSON.stringify([editor.closed, $('riverWidthInput').value, cityGenerationOptions()]);
}

function generate({ discardIdentities = false } = {}) {
  cancelMapGesturesA2();
  roadWorkspace?.exit();
  const intent = desktopGenerationKey('city');
  if (!discardIdentities && identityWorkspace) {
    const baseline = project;
    return identityWorkspace.requestRebuild(() => {
      if (project !== baseline || intent !== desktopGenerationKey('city')) {
        $('statusMessage').textContent = 'Rebuild inputs changed. Review the current changes and try again.';
        return false;
      }
      return generate({ discardIdentities: true });
    });
  }
  drafts.sync('city-rebuild', { staged: true, intent, dirty: true });
  return drafts.apply('city-rebuild', commitCityGeneration, { validateOnApply: true });
}

function commitCityGeneration(current) {
  try {
    const { project: next, tidied: tidiedWater } = prepareCityGeneration();
    if (!current()) return false;
    // Preserve the existing water Undo entry when successful generation tidies handles.
    if (waterPanel.editor.features.some(feature => feature.kind === 'river')) waterPanel.editor.width($('riverWidthInput').value);
    if (tidiedWater.length) waterPanel.editor.tidyWater(editor.boundary);
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
    propertyCreationSessionE1?.stop();
    propertyCreationHistoryE1.clear();
    propertySplitE2?.clear();
    propertyMergeE3?.clear();
    buildingStructureHistory.clear();
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    identityWorkspace?.reset();
    propertyWorkspace?.refresh({ replaced: true });
    buildingWorkspace?.refresh({ replaced: true });
    clearMapHover();
    drafts.clear();
    publishAcceptedStateD01(next,stageAcceptedReplacementD01(acceptedHistoryD01,next,
      'City generation started a new session history.'));
    desktopWorkspace?.cancelPreview();
    buildingHistory.clear(); // Rebuilding invalidates every accepted-building history entry.
    roadHistory.clear();
    if (waterPanel) {
      waterPanel.editor.loadCity(next.city);
      waterPanel.editor.setMode('pan');
      waterPanel.refresh(true);
      waterPanel.message(tidiedWater.length ? `${tidiedWater.map(kind=>kind==='coast'?'Coastline':kind==='lake'?'Lake':'River').join(' and ')} handles were tidied automatically before generation. Undo water edit restores that draft.` : next.city.waterFeatures.length ? 'City generated around the saved water. Editing its shoreline or crossings creates a new draft.' : 'Dry city generated. Choose Add lake, Generate river or Generate coastline to preview water.');
    }
    if (terrainPanel) {
      terrainPanel.editor.loadCity(next.city);
      terrainPanel.editor.setMode('pan');
      terrainPanel.refresh(true);
      terrainPanel.message('City generated with saved mountain footprints, ridges and road passes.');
    }
    savedHistoryCount.districts = savedHistoryCount.defenses = 0;
    districtPanel?.editor.load();
    districtPanel?.refresh(true);
    fortificationPanel?.editor.load();
    fortificationPanel?.refresh(true);
    $('seedInput').value = project.seed;
    editor.load(project.city.survey.boundary, project.options.center, false);
    updateDetails();
    workspaceShell?.refresh();
    updateViewport();
    $('statusMessage').textContent = `${project.city.buildings.length} buildings · ${project.city.properties.length} properties · ${project.city.properties.filter(p=>p.plotIds.length>1).length} merged sites`;
    updatePendingFeedback();
    return true;
  } catch (error) {
    const guidance = rebuildFailureMessage(error.message);
    drafts.sync('city-rebuild', { staged: true, intent: desktopGenerationKey('city'), dirty: true,
      issues: [{ code: 'city-rebuild', message: error.message }] });
    editor.notify(guidance, true);
    if (waterPanel?.editor.dirty) waterPanel.message(guidance, true);
    if (terrainPanel?.editor.dirty) terrainPanel.message(guidance, true);
    $('statusMessage').textContent = 'Rebuild blocked — existing city unchanged.';
    updatePendingFeedback();
    return false;
  }
}

function loadPreset() {
  try {
    editor.remember();
    editor.load(makeStartingOutline($('presetInput').value, $('seedInput').value, $('sizeInput').value));
    fitMap();
  } catch (error) {
    editor.notify(error.message, true);
  }
}

function updatePattern() {
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[$('morphologyInput').value];
  editor.dirty = true;
  editor.notify('Street settings changed. Rebuild city to apply them to this outline.');
  workspaceChanged();
}
// Dev 4f: preset selection affects only the already-persisted layer flags.
function syncLayerPreset4F() {
  $('layerPreset4F').value=identifyLayerPreset4F(layers);
}
function applyLayerPreset4F(name) {
  const preset=layerPreset4F(name);
  if(!preset)return false;
  for(const key of LAYER_KEYS_4F){
    layers[key]=preset[key];
    $(key+'Layer').checked=preset[key];
  }
  if(!layers.buildings){
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
  }
  clearMapHover();
  propertyWorkspace?.refresh();
  buildingWorkspace?.refresh();
  syncLayerPreset4F();
  requestDraw();
  workspaceChanged();
  return true;
}
$('layerPreset4F').addEventListener('change',e=>{
  if(!applyLayerPreset4F(e.target.value))syncLayerPreset4F();
});
for (const key of LAYER_KEYS_4F) {
  $(key + 'Layer').addEventListener('change', event => {
    layers[key] = event.target.checked;
    if (key === 'buildings' && layers.buildings === false) buildingEditSession?.stop();
    if (['buildings', 'properties', 'plots'].includes(key)) {
      clearMapHover();
      propertyWorkspace?.refresh();
      buildingWorkspace?.refresh();
    }
    syncLayerPreset4F();
    requestDraw();
    workspaceChanged();
  });
}
$('freehandButton').addEventListener('click', () => editor.start('freehand'));
$('pointsButton').addEventListener('click', () => editor.start('points'));
$('editButton').addEventListener('click', () => {
  editor.setMode('edit');
  editor.notify('Drag outline points. Double-click an edge to add a point.');
});
$('panButton').addEventListener('click', () => {
  if(roadWorkspace?.active){roadWorkspace.exit({focus:true});return;}
  if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return;
  terrainPanel?.editor.setMode('pan');
  waterPanel?.editor.setMode('pan');
  editor.setMode('pan');
});
$('centerButton').addEventListener('click', () => editor.setMode('center'));
$('finishButton').addEventListener('click', () => editor.finish());
$('undoButton').addEventListener('click', () => editor.undo());
$('workspaceUndoButton').addEventListener('click', () => d01MoveHistory('undo'));
$('restoreDistrictHistoryA5').addEventListener('click', () => restoreSavedDomainEditA5('districts'));
$('restoreDefenseHistoryA5').addEventListener('click', () => restoreSavedDomainEditA5('defenses'));
$('workspaceRedoButtonD01').addEventListener('click',()=>d01MoveHistory('redo'));
$('cancelButton').addEventListener('click', () => drafts.reset('landscape-rebuild', () => {
  if (!project) return;
  editor.remember();
  editor.load(project.city.survey.boundary, project.options.center, false);
  $('seedInput').value = project.seed;
  $('sizeInput').value = project.options.size;
  $('morphologyInput').value = project.options.morphology;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[project.options.morphology];
  workspaceChanged();
}));
$('presetButton').addEventListener('click', loadPreset);
$('presetInput').addEventListener('change', () => files?.changed());
$('generateButton').addEventListener('click', generate);
$('newSeedButton').addEventListener('click', () => {
  const rebuild = () => {
  const v = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(v);
  else {
    v[0] = Date.now() >>> 0;
    v[1] = Math.random() * 2 ** 32;
  }
  $('seedInput').value = `${v[0].toString(36)}-${v[1].toString(36)}`;
  if (desktopWorkspace?.usesGeneration) workspaceChanged();
  else generate({ discardIdentities: true });
  };
  if (identityWorkspace && !desktopWorkspace?.usesGeneration) identityWorkspace.requestRebuild(rebuild);
  else rebuild();
});
$('fitButton').addEventListener('click', fitMap);
$('zoomInButton').addEventListener('click', () => {
  camera.zoomAt(1.25);
  requestDraw();
  updateViewport();
});
$('zoomOutButton').addEventListener('click', () => {
  camera.zoomAt(.8);
  requestDraw();
  updateViewport();
});
$('morphologyInput').addEventListener('change', updatePattern);
$('sizeInput').addEventListener('change', updatePattern);
$('seedInput').addEventListener('input', updatePattern);
$('seedInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (desktopWorkspace?.usesGeneration) desktopWorkspace.preview();
    else generate();
  }
});
function handleMapCommandA2(e) {
  if(e.key==='Escape'&&(mainInputA2?.active||comparisonInputA2?.active)){
    const vertex=buildingEditSession?.drag?.handle.kind==='vertex';
    cancelMapGesturesA2();
    if(vertex)$('buildingDirectHandle').focus();
    e.preventDefault();return;
  }
  if(propertyMergeE3?.active && e.key==='Escape'){propertyMergeE3.cancel();e.preventDefault();return;}
  if(propertySplitE2?.active && e.key==='Escape'){propertySplitE2.cancel();e.preventDefault();return;}
  if(propertyCreationSessionE1?.active && e.key==='Escape'){
    cancelPropertyCreation();e.preventDefault();return;
  }
  if(roadWorkspace?.active && e.key==='Escape'){
    if (drafts.read('road').status === 'applying') { e.preventDefault(); return; }
    if (roadWorkspace.comparisonOpen) roadWorkspace.setComparison(false);
    else if (roadWorkspace.session.cancelMergeMode()) { /* Escape cancels the two-click tool first. */ }
    else if (roadWorkspace.session.selectionSet.items.length>1 && !roadWorkspace.session.selectionDraftLockedA1 && isMapShortcutEvent(e,document.activeElement))
      roadWorkspace.session.requestSelectionA1(null);
    else roadWorkspace.cancel();
    e.preventDefault();return;
  }
  if (e.key === 'Escape' && buildingEditSession?.drag?.handle.kind === 'vertex') {
    buildingEditSession.endGesture(true);
    $('buildingDirectHandle').focus();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape' && desktopPlaceEditor?.current) {
    if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return;
    stopWorkspaceTools();
    e.preventDefault();return;
  }
  if (!isMapShortcutEvent(e, document.activeElement)) return;
  if (e.key === 'Escape' && desktopWorkspace?.mapPreview()) {
    desktopWorkspace.cancelPreview();
    e.preventDefault();
    return;
  }
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.altKey && ['z', 'y'].includes(key)) {
    if (key === 'z' && e.shiftKey) resetCurrentPreviewA5();
    else d01MoveHistory(key === 'z' ? 'undo' : 'redo');
    e.preventDefault();
    return;
  }
  if(roadWorkspace?.active){
    if(['Delete','Backspace'].includes(e.key)){e.preventDefault();return;}
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)
      && (e.target === canvas || document.activeElement === canvas ||
        (roadWorkspace.comparisonOpen && document.activeElement === $('roadComparisonProposed')))) {
      if (roadWorkspace.comparisonOpen) {
        const pan = {ArrowLeft:[32,0],ArrowRight:[-32,0],ArrowUp:[0,32],ArrowDown:[0,-32]};
        camera.pan(...pan[e.key]);
        requestDraw();
        updateViewport();
      } else roadWorkspace.nudge(e.key.slice(5),e.shiftKey?10:1);
      e.preventDefault();
      return;
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Arrow nudges only when the map canvas has focus, never in text inputs.
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)
      && (e.target===canvas || document.activeElement===canvas)) {
    const direction=e.key.slice(5), target=propertyEditSession?.isActive?'property'
      :buildingEditSession?.isActive?'building':buildingPlacementSession?.isActive?'structure':null;
    if(target){
      const step = target === 'building' ? .5
        : Number($(target === 'property' ? 'propertyNudgeStep4C' : 'structureNudgeStep4C').value);
      if (precisionNudge4C(target,direction,step)) e.preventDefault();
      return;
    }
  }
  if (e.key === 'Enter' && workspaceShell?.state.section === 'city' && editor.mode === 'points') {
    e.preventDefault();
    editor.finish();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const previewActive=propertyMergeE3?.active||propertySplitE2?.active||propertyCreationSessionE1?.active||propertyEditSession?.isActive||buildingEditSession?.isActive||buildingPlacementSession?.isActive;
    if (workspaceShell?.state.section==='city' && editor.mode==='pan') {
      // Delete never removes a record behind an active uncommitted preview.
      if (previewActive)return;
      if(e.key!=='Delete')return;
      const selected=workspaceShell.state.selection;
      if(selected?.kind==='property' && project?.city.properties.some(p=>p.id===selected.id)){
        e.preventDefault();deleteProperty4A(selected.id);return;
      }
      if(selected?.kind==='building'){
        const building=project?.city.buildings.find(b=>b.id===selected.id);
        if(building){e.preventDefault();deleteStructureBuilding3H(building.propertyId,building.id);return;}
      }
      return;
    }
    e.preventDefault();
    if (workspaceShell?.state.section === 'landscape' && terrainPanel?.editor.mode !== 'pan') terrainPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'landscape' && waterPanel?.editor.mode !== 'pan') waterPanel.editor.removePoint();
    else if (workspaceShell?.state.section === 'city') editor.removePoint();
  }
  if (e.key === 'Escape') {
    if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return;
    stopWorkspaceTools();
    e.preventDefault();
  }
  if (e.key === '0') {
    fitMap();
    e.preventDefault();
  }
  if (e.key === '+' || e.key === '=') {
    camera.zoomAt(1.25);
    requestDraw();
    updateViewport();
    e.preventDefault();
  }
  if (e.key === '-') {
    camera.zoomAt(.8);
    requestDraw();
    updateViewport();
    e.preventDefault();
  }
}
const mapCommandsA2=[
  {match:e=>(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s',run:e=>{e.preventDefault();files.saveDownload();}},
  {scope:'map',match:e=>e.code==='Space',run:e=>{
    const comparison=$('roadComparisonProposed'),focused=document.activeElement;
    if(focused===comparison&&!comparison.hidden)comparisonInputA2?.setSpace(true);
    else if(focused?.tagName!=='CANVAS'||focused===canvas)mainInputA2?.setSpace(true);
    else return false;
    e.preventDefault();
  }},
  {match:e=>e.key==='Escape',run:handleMapCommandA2},
  {scope:'map',match:()=>true,run:handleMapCommandA2},
];
window.addEventListener('keydown',e=>dispatchInputCommandA2(e,document.activeElement,mapCommandsA2));
window.addEventListener('keyup',e=>{
  if(e.code==='Space'){mainInputA2?.setSpace(false);comparisonInputA2?.setSpace(false);}
});

function resize() {
  const rect = canvas.getBoundingClientRect();
  camera.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
  clearMapHover();
  requestDraw();
  // Viewport dimensions are not persisted. A layout/ResizeObserver callback
  // must not create a file revision after a transient inspection is cancelled.
  $('zoomValue').textContent = `${Math.round(camera.zoom*100)}%`;
}
districtPanel = new DistrictPanel({
  drafts, getElement: $,
  getCity: () => project.city,
  activateLayers: () => {
    for (const key of ['districtColors', 'districtBorders', 'districtLabels']) {
      layers[key] = true;
      $(key + 'Layer').checked = true;
    }
    requestDraw();
    workspaceChanged();
  },
  undoHistory: () => undoDomainA5('districts'),
  historyAvailable: () => domainUndoAvailableA5('districts'),
  commit: (city, detail) => {
    if (!commitDomainEditA5('districts', city, detail)) return;
    // Rebuilding/undoing districts is a local update. Keep a valid property or
    // building in the Inspector rather than adopting the editor's default ward.
    if (['property', 'building'].includes(workspaceShell?.state.selection?.kind)) {
      districtPanel.editor.selectedDistrictId = null;
      districtPanel.editor.selectedBlockId = null;
    }
    updateDetails();
    workspaceShell?.refresh();
    requestDraw();
    workspaceChanged();
  },
  changed: () => {
    syncWorkspaceDistrictSelection();
    requestDraw();
    workspaceChanged();
  }
});
districtPanel.bind();
districtWorkspace = new DistrictWorkspace({
  getElement: $,
  getCity: () => project?.city,
  panel: districtPanel,
  getShell: () => workspaceShell
});
districtPanel.onRefresh = () => districtWorkspace.render();
districtPanel.onMapSelect = () => districtWorkspace.reveal();
fortificationPanel = new FortificationPanel({
  drafts, getElement: $,
  getCity: () => project.city,
  undoHistory: () => undoDomainA5('defenses'),
  historyAvailable: () => domainUndoAvailableA5('defenses'),
  commit: (city, detail) => {
    if (!commitDomainEditA5('defenses', city, detail)) return;
    workspaceShell?.refresh();
    requestDraw();
    workspaceChanged();
  },
  changed: () => files?.changed(),
  activateLayer: () => {
    layers.fortifications = true;
    $('fortificationsLayer').checked = true;
    fitMap();
    workspaceChanged();
  }
});
fortificationPanel.bind();
for (const id of ['districtPanel', 'fortificationPanel', 'waterPanel', 'terrainPanel']) $(id).addEventListener('toggle', () => files?.changed());

waterPanel = new WaterPanel({
  getElement: $,
  getCity: () => project.city,
  getBoundary: () => {
    editor.validate();
    return editor.boundary;
  },
  getCenter: () => editor.center,
  validateComposition: water => {
    const terrain = terrainPrepare(terrainPanel?.editor.definition());
    if (terrain.features.length) validateTerrainDefinition(terrain.features, terrain.passes, editor.boundary, editor.center, water);
  },
  activate: () => {
    editor.setMode('pan');
    terrainPanel?.editor.setMode('pan');
    workspaceShell?.navigate('landscape');
    if (waterPanel.editor.activeFeature()) workspaceShell?.select({
      kind: 'water',
      id: waterPanel.editor.activeFeature().id
    });
    $('waterPanel').open = true;
  },
  changed: () => {
    landscapeWorkspace?.editorChanged('water');
    workspaceShell?.refresh();
    updateMapIndicators();
    requestDraw();
    workspaceChanged();
  }
});
waterPanel.bind();
waterPanel.refresh(true);
terrainPanel = new TerrainPanel({
  getElement: $,
  getCity: () => project?.city,
  getBoundary: () => {
    editor.validate();
    return editor.boundary;
  },
  getCenter: () => editor.center,
  getWater: () => prepareWater(waterPanel.editor.definition()),
  activate: () => {
    editor.setMode('pan');
    waterPanel.editor.setMode('pan');
    workspaceShell?.navigate('landscape');
    if (terrainPanel.editor.activeFeature()) workspaceShell?.select({
      kind: 'terrain',
      id: terrainPanel.editor.activeFeature().id
    });
    $('terrainPanel').open = true;
  },
  changed: () => {
    landscapeWorkspace?.editorChanged('terrain');
    workspaceShell?.refresh();
    updateMapIndicators();
    requestDraw();
    workspaceChanged();
  }
});
terrainPanel.bind();
terrainPanel.refresh(true);

function syncWorkspaceDistrictSelection() {
  const id = districtPanel?.editor.selectedDistrictId;
  if (id) {
    if (workspaceShell && workspaceShell.state.section !== 'districts') workspaceShell.navigate('districts');
    workspaceShell?.select({ kind: 'district', id });
  } else if (workspaceShell?.state.selection?.kind === 'district') workspaceShell.select(null, {
    reveal: false
  });
  districtWorkspace?.render();
}

function stopWorkspaceTools(targetSection = null) {
  cancelMapGesturesA2();
  roadWorkspace?.exit();
  if (targetSection !== 'city') {buildingEditSession?.stop();buildingPlacementSession?.stop();propertyEditSession?.stop();propertyCreationSessionE1?.stop();propertySplitE2?.stop();propertyMergeE3?.stop();compoundPanelPropertyId=null;compoundResult=null;}
  clearMapHover();
  // Cancel only a tool whose controls are leaving the visible section.
  // Completed drafts and their histories stay with the original editors.
  if (targetSection !== 'landscape') {
    if (terrainPanel?.editor.dragging) terrainPanel.editor.up(camera.zoom, true);
    if (waterPanel?.editor.dragging) waterPanel.editor.up(camera.zoom, true);
    if (terrainPanel?.editor.mode !== 'pan') terrainPanel?.editor.setMode('pan');
    if (waterPanel?.editor.mode !== 'pan') waterPanel?.editor.setMode('pan');
  }
  if (targetSection !== 'city') {
    if (editor.stroke || editor.dragging >= 0) editor.up(camera.zoom, true);
    if (editor.mode !== 'pan') editor.setMode('pan');
  }
  updateMapIndicators();
}
workspaceShell = registerWorkspaceInspectors(new WorkspaceShell({
  getElement: $,
  onNavigate: (previous, next) => stopWorkspaceTools(next),
  onLayout: () => resize(),
  changed: () => {
    workspaceChanged();
    requestDraw();
  },
  onInspect: () => {
    syncBuildingStructureUI3H();
    c01SyncPanel();
    syncPropertyEditUI3I();
    clearMapHover();
    landscapeWorkspace?.render();
    districtWorkspace?.render();
    identityWorkspace?.render();
    desktopWorkspace?.sync();
  },
  clearSelection: () => {
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
    propertySplitE2?.stop();
    propertyMergeE3?.stop();
    stopWorkspaceTools();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
    requestDraw();
  }
}), {
  getCity: () => project?.city,
  getDistrictPanel: () => districtPanel,
  getWaterPanel: () => waterPanel,
  getTerrainPanel: () => terrainPanel
});
landscapeWorkspace = new LandscapeWorkspace({
  getElement: $,
  shell: workspaceShell,
  water: waterPanel,
  terrain: terrainPanel,
  stopTools: stopWorkspaceTools,
  onSelect: () => {
    buildingEditSession?.stop();
    buildingPlacementSession?.stop();
    propertyEditSession?.stop();
    propertyMergeE3?.stop();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  changed: () => files?.changed(),
  draw: requestDraw,
  revealGeneration: () => desktopWorkspace?.revealGeneration(),
});
propertyEditSession = new PropertyEditSession3I(() => {updateMapIndicators();requestDraw();});
propertyCreationSessionE1 = new PropertyCreationSessionE1(() => {updateMapIndicators();updateUndoFeedback();requestDraw();});
propertySplitE2 = new PropertySplitControlsE2({
  drafts, getElement:$,getProject:()=>project,getWorkspace:()=>captureWorkspace().workspace,
  getRevision:()=>files?.revision??0,
  canEnter:()=>Boolean(project&&workspaceShell?.state.section==='city'&&editor.mode==='pan'
    &&!roadWorkspace?.active&&!propertyCreationSessionE1?.active&&!buildingEditSession?.isActive
    &&!buildingPlacementSession?.isActive&&!propertyEditSession?.isActive
    &&!identityWorkspace?.hasPending()&&!propertyMergeE3?.active),
  historyMove:direction=>d01MoveHistory(direction),
  historyCan:direction=>Boolean(!d01DraftBlocked()&&d01ScopedPropertyAction(direction,'split')),
  onCommit:(candidate,propertyId,direction,receipt)=>{
    const revisionBeforeCommit=files?.revision??0;
    commitAcceptedEdit(candidate, { family: 'property', operation: 'property-split',
      label: 'Split property', targetIds: [propertyId, receipt.newPropertyId] });
    roadHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
    propertyCreationHistoryE1.clear();buildingHistory.clear();buildingStructureHistory.clear();
    propertyMergeE3?.history.clear();identityWorkspace.reset();
    // The retained parent property ID remains selected. Replaced:true would
    // clear it and trigger multiple workspace revisions for a single Apply.
    propertyWorkspace.refresh();buildingWorkspace.refresh();
    updateDetails();workspaceShell.select({kind:'property',id:propertyId},{reveal:false});
    workspaceShell.refresh();requestDraw();
    // Selection dispatch may already have marked the accepted project dirty.
    // Signal exactly once rather than treating a second UI event as another edit.
    if((files?.revision??0)===revisionBeforeCommit)workspaceChanged();
    // The phone Inspector and Tools drawers were collapsed on entering E2.

    $('statusMessage').textContent=direction==='apply'
      ?'Split '+propertyId+' into two verified frontage properties. Undo split is available.'
      :(direction==='undo'?'Undid':'Redid')+' the complete property split.';
  },
  changed:()=>{updateMapIndicators();updateUndoFeedback();requestDraw();}
});
propertyMergeE3 = new PropertyMergeControlsE3({
  drafts, getElement:$,getProject:()=>project,getWorkspace:()=>captureWorkspace().workspace,
  getRevision:()=>files?.revision??0,
  canEnter:()=>Boolean(project&&workspaceShell?.state.section==='city'&&editor.mode==='pan'
    &&!roadWorkspace?.active&&!propertyCreationSessionE1?.active&&!buildingEditSession?.isActive
    &&!buildingPlacementSession?.isActive&&!propertyEditSession?.isActive
    &&!propertySplitE2?.active&&!identityWorkspace?.hasPending()),
  historyMove:direction=>d01MoveHistory(direction),
  historyCan:direction=>Boolean(!d01DraftBlocked()&&d01ScopedPropertyAction(direction,'merge')),
  onCommit:(candidate,propertyId,direction,receipt)=>{
    const revisionBefore=files?.revision??0;
    commitAcceptedEdit(candidate, { family: 'property', operation: 'property-merge',
      label: 'Merge properties', targetIds: [propertyId, receipt.retiredId] });
    roadHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
    propertyCreationHistoryE1.clear();propertySplitE2.history.clear();
    buildingHistory.clear();buildingStructureHistory.clear();identityWorkspace.reset();
    propertyWorkspace.refresh();buildingWorkspace.refresh();
    updateDetails();workspaceShell.select({kind:'property',id:propertyId},{reveal:false});
    workspaceShell.refresh();requestDraw();
    if((files?.revision??0)===revisionBefore)workspaceChanged();
    $('statusMessage').textContent=direction==='apply'
      ?'Merged two verified properties. Undo merge is available.'
      :(direction==='undo'?'Undid':'Redid')+' the property merge.';
  },
  changed:()=>{updateMapIndicators();updateUndoFeedback();requestDraw();}
});
buildingPlacementSession = new BuildingPlacementSession3H(() => {updateMapIndicators();requestDraw();});
buildingEditSession = new BuildingEditSession(() => {
  updateMapIndicators();
  workspaceShell?.refresh();
  requestDraw();
});
// E1 creates only new vacant parcels. Open-space records carry areas, not
// polygons; geometry comes from verified block edges, setbacks and neighbors.
function syncPropertyCreationE1(){
  const session=propertyCreationSessionE1,active=Boolean(session?.active);
  $('propertyCreatePanelE1').hidden=!active;
  $('propertyCreateStartE1').setAttribute('aria-pressed',String(active));
  const busy=active||Boolean(roadWorkspace?.active||propertyEditSession?.isActive||
    buildingPlacementSession?.isActive||buildingEditSession?.isActive);
  $('propertyCreateUndoE1').disabled=busy||d01DraftBlocked()||!d01ScopedPropertyAction('undo','create');
  $('propertyCreateRedoE1').disabled=busy||d01DraftBlocked()||!d01ScopedPropertyAction('redo','create');
  if (!active) { drafts.close('property-creation'); return; }
  const draft=session.draft;
  $('propertyCreateBlockE1').textContent=draft?.blockId??'Click empty land to select a street block.';
  const roads=draft?propertyFrontagesE1(project.city,draft.blockId):[];
  const dropdown=$('propertyCreateRoadE1');
  const names=roads.map(r=>r.roadId);
  const current=Array.from(dropdown.options??[],o=>o.value);
  if(JSON.stringify(names)!==JSON.stringify(current)){
    dropdown.replaceChildren(...names.map(id=>{
      const option=document.createElement('option');option.value=id;option.textContent=id;return option;
    }));
  }
  dropdown.disabled=!draft;
  if(draft)dropdown.value=draft.roadId;
  for(const [id,value] of [['propertyCreateUE1',draft?.u],
     ['propertyCreateWidthE1',draft?.width],['propertyCreateDepthE1',draft?.depth]]){
    const input=$(id);input.disabled=!draft;
    input.value=draft?String(Number(value.toFixed(2))):'';
  }
  const inspected=inspectPropertyCreationE1(project,draft);
  session.validation=inspected;
  placeDraft('property-creation', 'propertyCreatePanelE1', 'propertyCreateApplyE1', {
    intent: JSON.stringify([draft, Boolean(session.drag)]), dirty: Boolean(draft),
    checking: Boolean(session.drag), ready: inspected.ok, issues: inspected.issues,
    target: draft ? { kind: 'block', id: draft.blockId } : undefined,
  });
  $('propertyCreateResetE1').disabled=!draft;
  $('propertyCreatePanelE1').setAttribute('data-validation',inspected.status);
  $('propertyCreateStatusE1').textContent=inspected.ok
    ?'VALID · New property and one plot · '+Number(inspected.preview.area.toFixed(1))+
      ' sq units · Roads, neighbors, and buildings unchanged until Apply.'
    :inspected.issues[0]?.message??'Choose eligible land to start.';
}
function startPropertyCreationE1(){
  if(!project||workspaceShell.state.section!=='city'||roadWorkspace?.active||
    buildingPlacementSession?.isActive||buildingEditSession?.isActive||
    propertyEditSession?.isActive||propertySplitE2?.active||identityWorkspace?.hasPending()){
    $('statusMessage').textContent='Finish the active edit and use City / Pan before creating land.';
    return false;
  }
  if(editor.mode!=='pan')editor.setMode('pan');
  stopWorkspaceTools('city');workspaceMenus.close();
  propertyCreationSessionE1.enter();
  if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900
     &&!workspaceShell.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  $('propertyCreateStatusE1').textContent='Click unoccupied land inside a block to preview a new property.';
  return true;
}
function applyPropertyCreationE1() {
  return applyPlaceDraft('property-creation', 'propertyCreatePanelE1', 'propertyCreateApplyE1', commitPropertyCreationE1);
}
function commitPropertyCreationE1(current) {
  const session=propertyCreationSessionE1;
  if(!session?.active||!session.draft||session.drag||!project)return false;
  const before=project,rev=files?.revision??0,draft=copyJson(session.draft);
  const receipt=preparePropertyCreationE1(before,captureWorkspace().workspace,draft);
  if(!receipt.ok){
    session.validation = receipt;
    drafts.reject('property-creation', receipt.issues);
    syncPropertyCreationE1();
    return false;
  }
  if (!current() || project !== before || (files?.revision ?? 0) !== rev ||
      JSON.stringify(session.draft) !== JSON.stringify(draft)) return false;
  if(!propertyCreationHistoryE1.record(before,receipt.candidate,receipt.propertyId))return false;
  commitAcceptedEdit(receipt.candidate, { family: 'property', operation: 'property-create',
    label: 'Create property', targetIds: [receipt.propertyId] });
  roadHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
  buildingHistory.clear();buildingStructureHistory.clear();identityWorkspace.reset();
  session.stop();
  propertyWorkspace.refresh({replaced:true});buildingWorkspace.refresh({replaced:true});
  updateDetails();
  // Selection is the one recorded workspace change for this Apply.
  workspaceShell.select({kind:'property',id:receipt.propertyId},{reveal:false});
  workspaceShell.refresh();requestDraw();syncPropertyCreationE1();updateUndoFeedback();
  $('statusMessage').textContent='Created '+receipt.propertyId+' with plot '+receipt.plotId+
    '. Undo property creation is available this session; download a project to preserve it.';
  return true;
}
$('propertyCreateStartE1').addEventListener('click',()=>propertyCreationSessionE1?.active
  ? cancelPropertyCreation() : startPropertyCreationE1());
function cancelPropertyCreation() {
  return drafts.cancel('property-creation', () => propertyCreationSessionE1.stop());
}
$('propertyCreateResetE1').addEventListener('click', () => drafts.reset('property-creation', () => propertyCreationSessionE1.reset()));
$('propertyCreateCancelE1').addEventListener('click', cancelPropertyCreation);
$('propertyCreateApplyE1').addEventListener('click',applyPropertyCreationE1);
$('propertyCreateUndoE1').addEventListener('click',()=>d01MoveHistory('undo'));
$('propertyCreateRedoE1').addEventListener('click',()=>d01MoveHistory('redo'));
$('propertyCreateRoadE1').addEventListener('change',()=>{
  if(propertyCreationSessionE1?.draft)propertyCreationSessionE1.update({roadId:$('propertyCreateRoadE1').value});
});
for(const [id,key] of [['propertyCreateUE1','u'],['propertyCreateWidthE1','width'],
  ['propertyCreateDepthE1','depth']]){
  $(id).addEventListener('change',()=>{
    if(!propertyCreationSessionE1?.draft)return;
    const value=Number($(id).value);
    if($(id).value.trim()!==''&&Number.isFinite(value))
      propertyCreationSessionE1.update({[key]:value});
    else syncPropertyCreationE1();
  });
}

function enterPropertyEditing3I(propertyId) {
  if(propertyCreationSessionE1?.active||propertySplitE2?.active||propertyMergeE3?.active)return false;
  if(!project || workspaceShell?.state.selection?.kind!=='property'
      || workspaceShell.state.selection.id!==propertyId)return false;
  if(!exitBuildingEditing() || !exitStructurePlacement3H())return false;
  if(workspaceShell.state.section!=='city')workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if(editor.mode!=='pan')editor.setMode('pan');
  const started=propertyEditSession.start(project.city,propertyId);
  if(started && Number.isFinite(window.innerWidth) && window.innerWidth<=900){
    // The City Tools drawer can intercept taps on the floating property editor.
    // Close both drawers while editing, matching the E2/E3 map-preview pattern.
    workspaceShell.dispatch({type:'tools',collapsed:true});
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  }
  return started;
}
function enterBuildingEditing(id, tool) {
  if(propertyCreationSessionE1?.active||propertySplitE2?.active||propertyMergeE3?.active)return false;
  if (!project || !exitPropertyEditing3I() || !exitStructurePlacement3H()) return false;
  if (workspaceShell.state.section !== 'city') workspaceShell.navigate('city');
  stopWorkspaceTools('city');
  if (editor.mode !== 'pan') editor.setMode('pan');
  const started = buildingEditSession.start(project.city, layers, id);
  if (started && tool) buildingEditSession.setTool(tool);
  // On narrow screens the Inspector is a map-covering drawer. Clear the map
  // before showing draggable controls, then reopen the Inspector on exit.
  if (started && Number.isFinite(window.innerWidth) && window.innerWidth <= 900) {
    workspaceShell.dispatch({ type: 'tools', collapsed: true });
    workspaceShell.dispatch({ type: 'inspector', collapsed: true });
  }
  return started;
}
buildingWorkspace = new BuildingWorkspace({
  shell: workspaceShell,
  getCity: () => project?.city,
  getLayers: () => layers,
  getProperties: () => propertyWorkspace,
  getEditSession: () => buildingEditSession,
  enterEditing: enterBuildingEditing,
  openComponents: openBuildingComponentEditor,
  showCourtyardShortcut: () => Boolean(desktopPlaceEditor?.media?.matches),
  exitEditing: exitBuildingEditing,
  startReplacement: (propertyId,id) => startStructurePlacement3H(propertyId,id),
  deleteBuilding: (propertyId,id) => deleteStructureBuilding3H(propertyId,id),
  focusSelection: zoomToSelection4B,
  confirmPreviewDiscard: () => confirmBuildingPreviewDiscard() && confirmStructureDiscard3H(),
  onSelect: () => {
    buildingPlacementSession?.stop();
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  draw: requestDraw
});
propertyWorkspace = new PropertyWorkspace({
  shell: workspaceShell,
  getCity: () => project?.city,
  getLayers: () => layers,
  buildings: buildingWorkspace,
  openCompounds: c01Open,
  exitEditing: () => !propertyMergeE3?.active&&!propertySplitE2?.active&&exitBuildingEditing() && exitStructurePlacement3H() && exitPropertyEditing3I(),
  startBuilding: propertyId => startStructurePlacement3H(propertyId),
  startPropertyEdit: enterPropertyEditing3I,
  startPropertySplit: id=>{
    if(workspaceShell.state.selection?.kind!=='property'||workspaceShell.state.selection.id!==id)return false;
    const started=propertySplitE2.start(id);
    if(started&&Number.isFinite(window.innerWidth)&&window.innerWidth<=900){
      workspaceShell.dispatch({type:'tools',collapsed:true});
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    }
    return started;
  },
  startPropertyMerge: id=>{
    if(workspaceShell.state.selection?.kind!=='property'||workspaceShell.state.selection.id!==id)return false;
    const started=propertyMergeE3.start(id);
    if(started&&Number.isFinite(window.innerWidth)&&window.innerWidth<=900){
      workspaceShell.dispatch({type:'tools',collapsed:true});
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    }
    return started;
  },
  deleteProperty: deleteProperty4A,
  clearBuildings: clearPropertyBuildings4E,
  focusSelection: zoomToSelection4B,
  onSelect: () => {
    districtPanel.editor.selectedDistrictId = null;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  },
  draw: requestDraw
});
identityWorkspace = new IdentityWorkspace({
  drafts, getElement: $, shell: workspaceShell, getCity: () => project?.city,
  canChangeBuildingUse: () => !(
    roadWorkspace?.active || buildingEditSession?.isActive || buildingPlacementSession?.isActive
    || propertyEditSession?.isActive || propertyCreationSessionE1?.active
    || propertySplitE2?.active || propertyMergeE3?.active
  ),
  historyMove: direction => identityWorkspace.historyCan(direction) && d01MoveHistory(direction),
  historyCan: direction => {
    const entry=acceptedHistoryD01.entry(direction),ref=identityWorkspace?.ref();
    return Boolean(!d01DraftBlocked()&&entry?.family==='identity'&&ref?.id&&
      entry.targetIds.includes(ref.id)&&acceptedHistoryD01.can(direction,project));
  },
  commit: (city, { ref, fields }) => {
    const label = fields.includes('type') ? 'Change building use'
      : fields.includes('customName') ? 'Rename ' + ref.kind : 'Edit ' + ref.kind + ' identity';
    commitAcceptedEdit({ ...project, city }, { family: 'identity', operation: 'identity-change',
      label, targetIds: [ref.id] });
    updateDetails(); workspaceShell.refresh(); requestDraw();
  },
  changed: workspaceChanged
});
identityWorkspace.bind();
const desktopEditLayout = new DesktopEditLayout({
  viewport, divider: $('desktopEditDivider'), dockDivider: $('desktopImpactDivider'), onLayout: resize,
});
desktopPlaceEditor = new DesktopPlaceEditor({
  getElement: $, layout: desktopEditLayout, shell: workspaceShell,
  getContext: panelId => {
    const ref = workspaceShell.state.selection;
    if (panelId === 'propertyCreatePanelE1' || !ref) return '';
    if (ref.kind === 'building') {
      const building = buildingWorkspace.record(ref);
      const parent = propertyWorkspace.propertyForBuilding(building);
      if (building && parent)
        return (parent.customName || parent.id) + ' / ' + (building.customName || building.id);
    }
    if (ref.kind === 'property') {
      const property = propertyWorkspace.record(ref);
      if (property) return property.customName ? property.customName + ' · ' + property.id : property.id;
    }
    return '';
  },
  getTitle: (panelId, fallback) => {
    if (panelId === 'buildingTransformPanel' && buildingEditSession.tool === 'courtyard')
      return 'Edit courtyard';
    if (panelId === 'buildingStructurePanel' && buildingPlacementSession.operation === 'components')
      return 'Edit building components';
    if (panelId === 'buildingStructurePanel' && buildingPlacementSession.active?.courtyard?.only)
      return 'Edit courtyard portals';
    if (panelId === 'buildingStructurePanel' && buildingPlacementSession.operation === 'replace')
      return 'Replace building';
    return fallback;
  },
});
roadWorkspace = new RoadInspectionWorkspace({
  drafts, getElement:$,getProject:()=>project,camera,shell:workspaceShell,capture:captureWorkspace,
  desktopLayout: desktopEditLayout,
  desktopEntry: () => desktopWorkspace?.roadEntry(),
  reconcile:prepareJunctionReflowC7,reconcileRoad:prepareRoadReconciliationB1,
  computeJunctionAsync:createJunctionPreviewWorkerP1(),
  getRevision:()=>files?.revision??0,applyEdit:applyRoadEditB4,
  canEnter:()=>!project?.city?'Generate a city before inspecting roads.':
    workspaceShell.state.section!=='city'||editor.mode!=='pan'||buildingEditSession?.isActive
      ||propertyEditSession?.isActive||propertyCreationSessionE1?.active||propertySplitE2?.active||propertyMergeE3?.active||buildingPlacementSession?.isActive||identityWorkspace?.hasPending()
      ?'Finish or cancel the current edit, then choose Pan in City to inspect roads.':'',
  beforeEnter:()=>{cancelMapGesturesA2();workspaceMenus.close();clearMapHover();},
  beforeExit:cancelMapGesturesA2,
  draw:()=>{$('zoomValue').textContent=`${Math.round(camera.zoom*100)}%`;updateMapIndicators();updatePendingFeedback();syncPropertyDeletionControls4A();requestDraw();},
  afterExit:()=>{updateMapIndicators();updateUndoFeedback();syncPropertyDeletionControls4A();}
});

function applyRoadEditB4(session,baselineRevision,current){
  const previous=project,revision=files?.revision??0;
  if(!previous||!session?.current())
    return {ok:false,message:'The road preview is stale. Reopen it before Apply.'};
  const workspace = captureWorkspace().workspace;
  const draftRevision = session.revision;
  const group=session.roadGroupB1;
  const junctionId = session.selection?.id ?? group?.selectedRoadIds[0];
  const connection = session.roadConnectionEdit?.kind;
  const label = connection === 'remove' ? 'Delete road' : connection === 'shape' ? 'Reshape road'
    : connection === 'add' ? 'Add road connection' : connection === 'reconnect' ? 'Reconnect road'
    : session.targetJunctionId ? 'Merge junctions' : session.selection?.kind === 'junction' ? 'Move road junction' : 'Move road';
  const transaction = { family: 'road', operation: 'road-reflow', label,
    targetIds: [junctionId, session.targetJunctionId].filter(Boolean) };
  const commit = receipt => {
    if (!receipt.ok) return {ok:false,message:receipt.issues?.[0]?.message??'Road Apply blocked.'};
    if (!current() || project !== previous || revision !== (files?.revision ?? 0) || !session.current() ||
        session.revision !== draftRevision || session.settledRevision !== draftRevision)
      return {ok:false,message:'Accepted project or preview changed during Apply.'};
    return commitRoadEditB4(previous, revision, receipt, junctionId, receipt.transaction??transaction);
  };
  if(group) {
    if(!group.eligible || !session.pending || session.drag || session.checking ||
      session.error || session.roadIntentInputError || session.reconciliationError ||
      session.settledRevision!==draftRevision || baselineRevision!==revision ||
      session.acceptedFingerprint!==JSON.stringify(previous) ||
      (!session.demolition?.candidate && !session.previewGeometry?.verified))
      return {ok:false,message:'The connected-road preview is not complete and current.'};
    const demolition = session.demolition;
    if (demolition?.candidate) {
      const draft = { selectedRoadIds: group.selectedRoadIds, offset: session.roadIntentOffset,
        parcelChoices: session.parcelChoices, revision };
      return commit(validateRoadGroupDemolitionApplyB1R(previous, workspace, draft, demolition.candidate, demolition.authorization));
    }
    return commit(validateRoadGroupApplyB1(previous,workspace,
      {selectedRoadIds:group.selectedRoadIds,offset:session.roadIntentOffset,parcelChoices:session.parcelChoices,acceptedRevision:revision},
      session.reconciliation));
  }
  if (session.selection?.kind !== 'junction' || !session.computeJunctionAsync)
    return commit(prepareRoadApplyC2(previous, workspace, session, baselineRevision, revision));

  const projectJson = JSON.stringify(previous);
  const check = checkRoadApplyC2(previous, session, baselineRevision, revision, projectJson);
  if (!check.ok) return commit(check);
  const { candidateJson, ledger } = session.reconciliation;
  return session.computeJunctionAsync({
    operation: 'apply', projectJson, junctionId, workspace,
    point: { ...session.point }, targetJunctionId: session.targetJunctionId,
    decisions: [...session.buildingDecisions], ownershipChoices:[...session.ownershipChoices],
    parcelChoices:[...session.parcelChoices],
    inspected: { candidateJson, ledger },
  }).then(receipt => {
    if (project !== previous || JSON.stringify(project) !== projectJson)
      return {ok:false,message:'The accepted project changed during Apply.'};
    return commit(receipt);
  }, error => ({ok:false,message:'Road Apply failed: ' + error.message}));
}

function refreshRoadDistrictWorkspace(workspace) {
  if (workspace.districtEditor) {
    const olderHistory = districtPanel.editor.history.length;
    districtPanel.editor.load(workspace.districtEditor);
    const dropped = Math.max(0, olderHistory - districtPanel.editor.history.length);
    savedHistoryCount.districts = Math.max(0, savedHistoryCount.districts - dropped);
  }
  districtPanel.refresh();
}

function commitRoadEditB4(previous, revision, { candidate, workspace }, junctionId, transaction) {
  const group=transaction.operation==='translate-road-group';
  if(group){
    // B1 preserves all IDs and protected data. No saved restore point may
    // be pruned or rewritten by this operation.
    const beforeWorkspace=captureWorkspace().workspace;
    for(const key of ['districtEditor','fortificationEditor'])
      if(JSON.stringify(beforeWorkspace[key]?.history??[])!==JSON.stringify(workspace[key]?.history??[]))
        return {ok:false,message:'Connected road movement would alter saved restore points.'};
    if(!acceptedHistoryD01.canRecord(previous,candidate,transaction.editorHistory))
      return {ok:false,message:'The complete reversible road-group transaction cannot fit the current history or the history is stale.'};
  }
  // Exit only transient UI state before accepted data is replaced. No file or
  // history writes occur until the candidate passes the entire B4 gate.
  roadWorkspace.exit({restore:true,focus:roadWorkspace.usesDesktopPanel});
  if(project!==previous||revision!==(files?.revision??0))
    return {ok:false,message:'The accepted project changed before commit.'};
  if(!group&&!roadHistory.record(previous,candidate,junctionId))
    return {ok:false,message:'Nothing was changed.'};
  const beforeHistory = districtPanel.editor.history;
  const afterHistory = workspace.districtEditor?.history ?? beforeHistory;
  if (afterHistory.length < beforeHistory.length) {
    const removed = beforeHistory.length - afterHistory.length;
    transaction = { ...transaction, editorHistory: editorHistoryDeltaA5('districts', beforeHistory, afterHistory,
      Math.max(0, savedHistoryCount.districts - removed)) };
  }
  if(group){
    if(!acceptedHistoryD01.canRecord(previous,candidate,transaction.editorHistory))
      return {ok:false,message:'The reversible history changed before group Apply.'};
  }
  try{commitAcceptedEdit(candidate, transaction, {requireRecorded:group});}
  catch(error){return {ok:false,message:error.message};}
  refreshRoadDistrictWorkspace(workspace);
  buildingHistory.clear();
  buildingStructureHistory.clear();
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  clearMapHover();
  propertyWorkspace.refresh({replaced:true});
  buildingWorkspace.refresh({replaced:true});
  updateDetails();
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged(); // exactly one file revision / normal recovery notification
  $('statusMessage').textContent=group?transaction.label+' applied. Undo restores all validated changes.':'Applied road '+junctionId+' and all validated neighborhood changes. Undo road is available.';
  $('roadHistoryStatusB4').textContent=group?transaction.label+' applied. Undo restores the complete previous city.':'Road '+junctionId+' applied. Undo restores the complete previous city.';
  return {ok:true};
}
function moveRoadHistoryB4(direction) {
  if (acceptedHistoryD01.entry(direction)?.family !== 'road') return false;
  return d01MoveHistory(direction);
}
$('roadHistoryUndoB4').addEventListener('click',()=>d01MoveHistory('undo'));
$('roadHistoryRedoB4').addEventListener('click',()=>d01MoveHistory('redo'));

workspaceShell.bind();
landscapeWorkspace.bind();
buildingFootprintControls.bind();
for (const tool of BUILDING_EDIT_TOOLS)
  $('buildingTool'+tool).addEventListener('click',()=>buildingEditSession.setTool(tool.toLowerCase()));
const buildingPreviewInputs = {
  buildingOffsetX: { key: 'dx', units: () => 1 },
  buildingOffsetY: { key: 'dy', units: () => 1 },
  buildingAngle: { key: 'angle', units: () => 180 / Math.PI },
  buildingWidth: { key: 'scaleX', units: frame => frame.width, dimension: true },
  buildingDepth: { key: 'scaleY', units: frame => frame.height, dimension: true }
};
for (const [id, { key, units, dimension }] of Object.entries(buildingPreviewInputs)) {
  const input = $(id);
  const previewInput = () => {
    const session = buildingEditSession;
    if (!session?.isActive || session.isDirect || session.drag || !project) return;
    const frame = buildingFrame(session.draft ?? session.source(project.city));
    const value = input.value === '' ? NaN : Number(input.value) / units(frame);
    if (value === session.transform[key] && !session.operationError) return;
    const values = dimension && session.lockRatio
      ? lockedBuildingScale(session.transform, value / session.transform[key])
      : { [key]: value };
    // Keep the text being typed while the dependent dimensions and map update.
    editingBuildingTransformField = id;
    try {
      if (!session.setTransform(values)) {
        invalidBuildingTransformField = id;
        session.operationError = dimension
          ? 'Enter a size that keeps width and depth within 20–400% of the base footprint.'
          : 'Enter a valid position or angle.';
        syncBuildingTransformUI();
      }
    } finally {
      editingBuildingTransformField = null;
    }
  };
  input.addEventListener('input', previewInput);
  input.addEventListener('change', previewInput);
}
$('buildingLockRatio').addEventListener('change', () => {
  if (buildingEditSession?.isActive && !buildingEditSession.drag)
    buildingEditSession.lockRatio = $('buildingLockRatio').checked;
});
// Dev 4c: buttons and numeric/drag inputs share the exact same preview APIs.
const precisionDirections4C = Object.freeze({
  Left:['x',-1],Right:['x',1],Up:['y',-1],Down:['y',1]
});
function precisionNudge4C(target,direction,step) {
  const [axis,sign]=precisionDirections4C[direction]??[];
  if(!axis || !project || workspaceShell?.state.section!=='city')return false;
  if (target === 'building') {
    const session = buildingEditSession;
    if (!session?.isDirect) return nudgeBuilding4C(session,axis==='x'?'dx':'dy',sign,step);
    if (session.tool !== 'vertices' || ![.1,.5,1,5].includes(step)) return false;
    const vertex = buildingDirectHandles(session.previewFor(project.city), 'vertices', session.holeIndex)[session.handleIndex];
    return Boolean(vertex && session.editDirectGeometry(project.city, 'move', {
      ...vertex, [axis]: vertex[axis] + sign * step
    }));
  }
  if(target==='property'){
    const session=propertyEditSession,index=session?.selectedCorner;
    if(session?.polygonMode && !session.drag && (index===0||index===1) && [.1,.5,1,5].includes(step)){
      const current=session.boundary[index][axis];
      return updateSnappedFrontageCoordinateSFS(index,axis,Math.round((current+sign*step)*1e8)/1e8);
    }
    return nudgePropertyCorner4C(session,axis,sign,step);
  }
  if(target==='structure')return nudgeStructure4C(buildingPlacementSession,axis==='x'?'u':'v',sign,step);
  return false;
}
for(const [target,idPrefix,stepId] of [
  ['property','propertyNudge','propertyNudgeStep4C'],
  ['structure','structureNudge','structureNudgeStep4C']
]) for(const direction of Object.keys(precisionDirections4C))
  $(idPrefix+direction+'4C').addEventListener('click',()=>{
    if(!precisionNudge4C(target,direction,Number($(stepId).value)))
      $('statusMessage').textContent='Choose a valid preview and nudge increment first.';
  });
$('buildingPreviewReset').addEventListener('click',()=>{
  if (confirmBuildingPreviewDiscard()) drafts.reset('building', () => buildingEditSession.reset());
});
$('buildingPreviewCancel').addEventListener('click',exitBuildingEditing);
$('buildingPreviewApply').addEventListener('click',applyBuildingTransform);
$('buildingHistoryUndo').addEventListener('click',()=>d01MoveHistory('undo'));
$('buildingHistoryRedo').addEventListener('click',()=>d01MoveHistory('redo'));
for (const [id,key] of Object.entries({structureU:'u',structureV:'v',structureWidth:'width',structureDepth:'depth',structureAngle:'angle'}))
  $(id).addEventListener('change',()=>{
    if(!buildingPlacementSession?.isActive)return;
    const num=Number($(id).value);
    if($(id).value==='' || !Number.isFinite(num)) {syncBuildingStructureUI3H();return;}
    buildingPlacementSession.update({[key]:num});
  });
for(const [id,key] of Object.entries({structurePreset:'preset',structureType:'type'}))
  $(id).addEventListener('change',()=>buildingPlacementSession?.update({[key]:$(id).value}));
$('structureReplaceGeometry').addEventListener('change', () => {
  if (buildingPlacementSession.operation !== 'replace') return;
  buildingPlacementSession.active.replaceGeometry = $('structureReplaceGeometry').checked;
  syncBuildingStructureUI3H();
});
$('structureApply').addEventListener('click',applyStructurePlacement3H);
$('structureCancel').addEventListener('click',exitStructurePlacement3H);
$('structureUndo').addEventListener('click',()=>d01MoveHistory('undo'));
$('structureRedo').addEventListener('click',()=>d01MoveHistory('redo'));
// C01 controls sit beside existing property/building tools; no modal workflow.
$('compoundGroupSelect').addEventListener('change',()=>c01SelectGroup($('compoundGroupSelect').value));
$('compoundNameInput').addEventListener('input',()=>{
  compoundName=$('compoundNameInput').value;updateUndoFeedback();
});
$('compoundSaveGroup').addEventListener('click',()=>c01SaveMembership(compoundGroupId?'update':'create'));
$('compoundDissolve').addEventListener('click',()=>{
  if(typeof window.confirm==='function'&&!window.confirm('Dissolve this compound? Buildings and their geometry will be preserved.'))return;
  c01SaveMembership('dissolve');
});
for(const [id,key,scale] of [
  ['compoundDx','dx',1],['compoundDy','dy',1],['compoundAngle','angle',Math.PI/180],
  ['compoundScaleX','scaleX',.01],['compoundScaleY','scaleY',.01]]) {
  $(id).addEventListener('input',()=>{
    const value=Number($(id).value);
    if(!Number.isFinite(value))return;
    compoundTransform[key]=value*scale;
    c01SyncPanel();updateUndoFeedback();requestDraw();
  });
}
$('compoundApply').addEventListener('click',c01ApplyTransform);
$('compoundReset').addEventListener('click', () => drafts.reset('compound', () => {
  compoundTransform={dx:0,dy:0,angle:0,scaleX:1,scaleY:1};
  for(const [id,value] of [['compoundDx',0],['compoundDy',0],['compoundAngle',0],
       ['compoundScaleX',100],['compoundScaleY',100]])$(id).value=String(value);
  c01SyncPanel();updateUndoFeedback();requestDraw();
}));
$('compoundCancel').addEventListener('click', () => drafts.cancel('compound', () => {
  compoundPanelPropertyId=null;compoundResult=null;compoundDrag=null;c01SyncPanel();updateUndoFeedback();requestDraw();
}));
// Dev 4a: deleting a parcel removes its dependent records, never neighboring land.
function deleteProperty4A(propertyId) {
  if(propertyCreationSessionE1?.active||propertySplitE2?.active||propertyMergeE3?.active)return false;
  const selected=workspaceShell?.state.selection;
  const property=project?.city?.properties.find(p=>p.id===propertyId);
  if(!property || selected?.kind!=='property' || selected.id!==propertyId)return false;
  const plots=project.city.plots.filter(p=>p.propertyId===propertyId).length;
  const buildings=project.city.buildings.filter(b=>b.propertyId===propertyId).length;
  const name=property.customName || property.id;
  if(typeof window.confirm==='function' && !window.confirm(
    'Delete property "'+name+'"? This also deletes '+plots+' plot(s) and '+buildings+
    ' building(s). Neighboring properties and streets are untouched. Undo is available in this session.'
  ))return false;
  if(!exitPropertyEditing3I() || !exitStructurePlacement3H() || !exitBuildingEditing())return false;
  const previous=project;
  const receipt=preparePropertyDeletion4A(previous,captureWorkspace().workspace,propertyId);
  if(!receipt.ok){$('statusMessage').textContent=receipt.reason;return false;}
  if(project!==previous || workspaceShell.state.selection?.id!==propertyId)return false;
  try{
    propertyDeletionHistory4A.record(previous,receipt.candidate,propertyId);
    commitAcceptedEdit(receipt.candidate, { family: 'property', operation: 'property-delete',
      label: 'Delete property', targetIds: [propertyId] });
    buildingHistory.clear();buildingStructureHistory.clear();propertyHistory.clear();
    identityWorkspace.reset();
    workspaceShell.select(null,{reveal:false});
    // On narrow layouts the Inspector overlays map controls; reveal the global Undo.
    if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900 && !workspaceShell.state.inspectorCollapsed)
      workspaceShell.dispatch({type:'inspector',collapsed:true});
    propertyWorkspace.refresh();buildingWorkspace.refresh();
    updateDetails();workspaceShell.refresh();requestDraw();workspaceChanged();
    $('statusMessage').textContent='Deleted '+name+' and its '+plots+' plots / '+buildings+
      ' buildings. Use Undo deletion to restore them during this session.';
    return true;
  }catch(error){$('statusMessage').textContent='Deletion failed: '+error.message;return false;}
}
$('propertyDeletionUndo4A').addEventListener('click',()=>d01MoveHistory('undo'));
$('propertyDeletionRedo4A').addEventListener('click',()=>d01MoveHistory('redo'));
function keepPropertyEditorVisible3I() {
  // Refreshing the selected property can reopen the narrow-screen Inspector.
  // Keep the floating edit tools accessible through Apply and Undo/Redo.
  if (propertyEditSession?.isActive && Number.isFinite(window.innerWidth)
      && window.innerWidth <= 900 && workspaceShell?.state.inspectorCollapsed === false)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
}
function applyPropertyEdit3I() {
  return applyPlaceDraft('property', 'propertyEditPanel3I', 'propertyEditApply3I', commitPropertyEdit3I);
}
function commitPropertyEdit3I(current) {
  const session=propertyEditSession;
  if(!project||!session?.isActive||!session.isPending||session.drag
    ||workspaceShell?.state.selection?.kind!=='property'
    ||workspaceShell.state.selection.id!==session.propertyId)return false;
  const before=project,propertyId=session.propertyId;
  const received=preparePropertyApply3I(before,captureWorkspace().workspace,session);
  if(!received.ok) {
    drafts.reject('property', received.issues);
    session.validation=received;
    $('statusMessage').textContent='Property Apply blocked: '+(received.issues[0]?.message??'Invalid geometry.');
    syncPropertyEditUI3I();requestDraw();return false;
  }
  if (!current() || project !== before || session.propertyId !== propertyId) return false;
  if(!propertyHistory.record(before,received.candidate,propertyId))return false;
  const label = session.flexible?.pending || session.active?.countChange ? 'Edit plot partitions' : 'Edit property and plots';
  commitAcceptedEdit(received.candidate, { family: 'property', operation: 'property-and-plot', label,
    targetIds: [propertyId] });
  buildingHistory.clear();
  buildingStructureHistory.clear();
  propertyDeletionHistory4A.clear();
  session.start(project.city,propertyId);
  updateDetails();
  workspaceShell.select({kind:'property',id:propertyId});
  workspaceShell.refresh();keepPropertyEditorVisible3I();requestDraw();workspaceChanged();
  $('statusMessage').textContent='Applied validated property and plot edits to '+propertyId+'. Download a project to preserve your change.';
  return true;
}
$('propertyEditReset3I').addEventListener('click', () => drafts.reset('property', () => propertyEditSession.reset()));
$('propertyRestoreFrontage024').addEventListener('click',()=>propertyEditSession?.restoreFrontage());
$('propertyEditCancel3I').addEventListener('click',exitPropertyEditing3I);
$('propertyEditApply3I').addEventListener('click',applyPropertyEdit3I);
$('propertyAddVertex024').addEventListener('click',()=>{
  if(!propertyEditSession?.addVertex())
    $('statusMessage').textContent='Choose a side or rear corner; property frontage cannot be subdivided.';
});
$('propertyRemoveVertex024').addEventListener('click',()=>{
  if(!propertyEditSession?.removeVertex())
    $('statusMessage').textContent='Choose a removable side or rear corner (at least three must remain).';
});
$('propertyAddDividerE4').addEventListener('click',()=>{
  const session=propertyEditSession;
  if(!session?.isActive||!session.addDivider(project?.city,
      Math.min(Math.max(0,session.selectedDivider),session.plotIds.length-1)))
    $('statusMessage').textContent='Plot split unavailable; reset this structural draft or choose a valid plot.';
});
$('propertyRemoveDividerE4').addEventListener('click',()=>{
  const session=propertyEditSession;
  if(!session?.isActive||!session.removeDivider(session.selectedDivider))
    $('statusMessage').textContent='Plot merge unavailable; select an existing divider or reset this draft.';
});
$('propertyCountConsentE4').addEventListener('change',()=>propertyEditSession?.approvePlotCount(
  $('propertyCountConsentE4').checked));
$('plot027Start').addEventListener('click',()=>{
  if(!propertyEditSession?.beginFlexible(project?.city))
    $('statusMessage').textContent='Apply or reset the existing edit before starting flexible plots.';
});
for(const [id,key,convert] of [
  ['plot027Selected','selectedId',String],['plot027Other','otherId',String],
  ['plot027EdgeA','edgeA',Number],['plot027EdgeB','edgeB',Number],
  ['plot027RatioA','ratioA',v=>Number(v)/100],['plot027RatioB','ratioB',v=>Number(v)/100],
  ['plot027Endpoint','endpoint',String],['plot027Retain','retain',String]
]){
  $(id).addEventListener('change',()=>{
    const s=propertyEditSession,f=s?.flexible;if(!f)return;
    const value=convert($(id).value);
    if(key.startsWith('ratio')&&(!Number.isFinite(value)||value<=.0001||value>=.9999)){
      syncPropertyEditUI3I();return;
    }
    if(key==='selectedId'){
      const chosen=f.plots.find(p=>p.id===value);
      if(!chosen)return;
      s.updateFlexible({selectedId:value,otherId:'',edgeA:0,edgeB:Math.min(2,chosen.boundary.length-1)});
    }else s.updateFlexible({[key]:value});
  });
}
$('plot027Split').addEventListener('click',()=>{
  if(!propertyEditSession?.splitFlexible(project?.city))
    $('statusMessage').textContent='Flexible plot split blocked: '+(propertyEditSession?.flexible?.error??'Invalid divider.');
});
$('plot027Merge').addEventListener('click',()=>{
  if(!propertyEditSession?.mergeFlexible())
    $('statusMessage').textContent='Flexible plot merge blocked: '+(propertyEditSession?.flexible?.error??'Invalid neighbors.');
});
$('plot027Undo').addEventListener('click',()=>propertyEditSession?.undoFlexible());
$('plot027Consent').addEventListener('change',()=>propertyEditSession?.approveFlexible($('plot027Consent').checked));
function plot027NearestEdge(f,point,zoom){
  const ring=f?.selected?.boundary;if(!ring)return null;
  let nearest=null,best=12/Math.max(.18,zoom);
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(.01,Math.min(.99,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    const x=a.x+dx*t,y=a.y+dy*t,dist=Math.hypot(point.x-x,point.y-y);
    if(dist<best){best=dist;nearest={edge:i,ratio:t};}
  }
  return nearest;
}
function plot027EndpointPosition(f,which){
  const ring=f?.selected?.boundary;if(!ring)return null;
  const edge=which==='A'?f.edgeA:f.edgeB,t=which==='A'?f.ratioA:f.ratioB;
  const a=ring[edge],b=ring[(edge+1)%ring.length];
  return a&&b?{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}:null;
}
$('propertyHistoryUndo3I').addEventListener('click',()=>d01MoveHistory('undo'));
$('propertyHistoryRedo3I').addEventListener('click',()=>d01MoveHistory('redo'));
function updateSnappedFrontageCoordinateSFS(index,axis,value){
  const session=propertyEditSession;
  const result=proposePropertyFrontageCoordinateSFS(project,session,index,axis,value);
  if(result.ok && result.frontage && session.setFrontage(result.frontage)){
    if(result.clamped)$('statusMessage').textContent=result.reason;
    return true;
  }
  $('statusMessage').textContent=result.reason||'This frontage coordinate cannot be changed safely.';
  syncPropertyEditUI3I();return false;
}
for(const [id,axis] of [['propertyCornerX3I','x'],['propertyCornerY3I','y']])
  $(id).addEventListener('change',()=>{
    const session=propertyEditSession;
    if(!session?.isActive||session.selectedCorner===null)return;
    const value=Number($(id).value);
    if($(id).value===''||!Number.isFinite(value)){syncPropertyEditUI3I();return;}
    if(session.polygonMode && session.selectedCorner<2)
      updateSnappedFrontageCoordinateSFS(session.selectedCorner,axis,value);
    else session.setCorner(session.selectedCorner,{...session.boundary[session.selectedCorner],[axis]:value});
  });
$('propertyDividerIndex3I').addEventListener('change',()=>{
  if(!propertyEditSession?.isActive)return;
  const index=Number($('propertyDividerIndex3I').value);
  if(Number.isInteger(index)&&index>=0&&index<propertyEditSession.dividers.length){
    propertyEditSession.selectedDivider=index;
    updateMapIndicators();
  }
});
$('propertyDividerPercent3I').addEventListener('change',()=>{
  const session=propertyEditSession;
  if(!session?.isActive)return;
  const value=Number($('propertyDividerPercent3I').value);
  if($('propertyDividerPercent3I').value===''||!Number.isFinite(value)
      ||!session.setDivider(session.selectedDivider,value/100))syncPropertyEditUI3I();
});

const mapPanEditor = { mode:'pan',down(){},move(){},up(){},addPoint(){} };
const visibleMapA2=()=>!desktopWorkspace?.mapPreview()&&!roadWorkspace?.comparisonOpen;
const cityMapA2=()=>visibleMapA2()&&workspaceShell.state.section==='city';
const landscapeMapA2=()=>visibleMapA2()&&workspaceShell.state.section==='landscape';
for(const tool of [
  {id:'generation.preview',group:'passive',active:()=>Boolean(desktopWorkspace?.mapPreview())},
  {id:'road.compare',group:'passive',active:()=>Boolean(roadWorkspace?.comparisonOpen)},
  {id:'compound.transform',group:'transform',active:()=>cityMapA2()&&Boolean(c01SelectedGroup())&&
    !buildingEditSession?.isActive&&!buildingPlacementSession?.isActive&&!propertyEditSession?.isActive&&
    !propertyMergeE3?.active&&!propertySplitE2?.active&&!roadWorkspace?.active&&!propertyCreationSessionE1?.active},
  {id:'property.merge',group:'transform',active:()=>cityMapA2()&&Boolean(propertyMergeE3?.active)},
  {id:'property.split',group:'transform',active:()=>cityMapA2()&&Boolean(propertySplitE2?.active)},
  {id:'property.create',group:'transform',active:()=>cityMapA2()&&Boolean(propertyCreationSessionE1?.active)},
  {id:'road.edit',group:'transform',active:()=>visibleMapA2()&&Boolean(roadWorkspace?.active)},
  {id:'property.edit',group:'transform',active:()=>cityMapA2()&&Boolean(propertyEditSession?.isActive)},
  {id:'building.place',group:'transform',active:()=>cityMapA2()&&Boolean(buildingPlacementSession?.isActive)},
  {id:'building.edit',group:'transform',active:()=>cityMapA2()&&Boolean(buildingEditSession?.isActive)},
  {id:'terrain.edit',group:'direct',active:()=>landscapeMapA2()&&terrainPanel.editor.mode!=='pan',
    editor:()=>terrainPanel.editor,run:fn=>terrainPanel.run(fn)},
  {id:'water.edit',group:'direct',active:()=>landscapeMapA2()&&waterPanel.editor.mode!=='pan',
    editor:()=>waterPanel.editor,run:fn=>waterPanel.run(fn)},
  {id:'outline.edit',group:'direct',active:()=>cityMapA2()&&editor.mode!=='pan',editor:()=>editor},
  {id:'map.select',group:'passive',active:()=>visibleMapA2()},
])toolsA2.register({...tool,canActivate:tool.active});
const captureMapEditorA2=()=>{
  const tool=toolsA2.resolve(null,'direct');
  if(!tool)return mapPanEditor;
  const target=tool.editor(),run=tool.run??(fn=>fn());
  return {mode:target.mode,down:(...args)=>run(()=>target.down(...args)),
    move:(...args)=>run(()=>target.move(...args)),up:(...args)=>target.up(...args),
    addPoint:(...args)=>target.addPoint(...args)};
};
const mapEditor={get mode(){return captureMapEditorA2().mode;},capture:captureMapEditorA2};
comparisonInputA2=bindCanvasInteraction($('roadComparisonProposed'), camera, requestDraw, updateViewport, mapPanEditor);
mainInputA2=bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, mapEditor, (point,modifiers={}) => {
  if (roadWorkspace?.comparisonOpen || desktopWorkspace?.mapPreview()) return;
  if (desktopWorkspace?.awaitingProperty &&
      desktopWorkspace.chooseBuildingProperty(propertyWorkspace.hit(point, camera.zoom)?.id)) return;
  if(propertyMergeE3?.active){
    const neighbor=propertyWorkspace.hit(point,camera.zoom);
    if(neighbor&&neighbor.id!==propertyMergeE3.session.primaryId)propertyMergeE3.choose(neighbor.id);
    return;
  }
  if(propertySplitE2?.active)return;
  if(propertyCreationSessionE1?.active){
    if(!propertyCreationSessionE1.choose(project.city,point))
      $('statusMessage').textContent='Choose ground inside a street block, then move or resize the preview to find a valid vacant site.';
    return;
  }
  if(roadWorkspace?.active){
    if (drafts.read('road').status === 'applying' || roadWorkspace.session.mergeMode) return; // Two-click selection is owned by pointer begin/end.
    const hit=roadWorkspace.session.hit(point,camera.zoom);
    if(hit || !modifiers.shiftKey)roadWorkspace.session.requestSelectionA1(hit,{toggle:modifiers.shiftKey});
    return;
  }
  if (propertyEditSession?.flexibleMode) {
    const f=propertyEditSession.flexible,near=plot027NearestEdge(f,point,camera.zoom);
    if(near){
      const which=f.endpoint==='B'?'B':'A';
      propertyEditSession.updateFlexible({[which==='A'?'edgeA':'edgeB']:near.edge,
        [which==='A'?'ratioA':'ratioB']:near.ratio});
    }else{
      const hit=f.plots.find(p=>pointInPolygon(point,p.boundary));
      if(hit)propertyEditSession.updateFlexible({selectedId:hit.id,otherId:'',
        edgeA:0,edgeB:Math.min(2,hit.boundary.length-1)});
    }
    return;
  }
  if (propertyEditSession?.isActive) {
    const corner=propertyEditSession.hitCorner(project?.city,point,camera.zoom);
    if(corner!==null)propertyEditSession.selectCorner(corner);
    return; // Never switch selection or commit geometry while previewing land.
  }
  if (buildingPlacementSession?.isActive) {
    if (buildingPlacementSession.operation === 'components') {
      buildingComponentControls.choosePoint(point);
      return;
    }
    const property=buildingPlacementSession.property(project?.city);
    if(property && !buildingPlacementSession.active.courtyard?.only && pointInPolygon(point,property.boundary)) {
      const local=buildingLocalPoint3H(property,point);
      if(local)buildingPlacementSession.update(local);
    }
    return;
  }
  if (buildingEditSession?.isActive) {
    const building = buildingWorkspace.hit(point, camera.zoom);
    if (building && buildingEditSession.allows(project?.city, layers, building.id)) buildingWorkspace.select(building);
    return; // Other properties and non-roof land do not steal the active edit context.
  }
  const hit = landscapeWorkspace.hit(point, camera.zoom);
  const selected = workspaceShell.state.selection;
  if (!hit && desktopPlaceEditor?.media?.matches && workspaceShell.state.section === 'city'
    && selected?.kind === 'property') {
    const building = buildingWorkspace.hit(point, camera.zoom);
    if (building && propertyWorkspace.selectBuilding(selected.id, building.id)) return;
  }
  if (hit) {
    landscapeWorkspace.select(hit, {
      fromMap: true
    });
  } else if (!propertyWorkspace.select(propertyWorkspace.hit(point, camera.zoom))) {
    districtPanel.selectAt(point);
    if (!districtPanel.editor.selectedDistrictId) workspaceShell.clear();
  }
}, point => {
  if(propertyMergeE3?.active){clearMapHover();return;}
  if(propertySplitE2?.active){clearMapHover();return;}
  if(propertyCreationSessionE1?.active){clearMapHover();return;}
  if(roadWorkspace?.active){
    roadWorkspace.session.hoverMerge(point,camera.zoom);
    clearMapHover();return;
  }
  if (propertyEditSession?.isActive) {clearMapHover();return;}
  if (buildingPlacementSession?.isActive) {clearMapHover();return;}
  if (buildingEditSession?.isActive) {
    landscapeWorkspace.setHover(null);
    propertyWorkspace.setHover(null);
    const building = buildingWorkspace.hit(point, camera.zoom);
    const allowed = building && buildingEditSession.allows(project?.city, layers, building.id);
    buildingWorkspace.setHover(allowed ? building : null);
    canvas.classList.toggle('feature-hover', Boolean(allowed));
    return;
  }
  const hit = landscapeWorkspace.hit(point, camera.zoom);
  landscapeWorkspace.setHover(hit);
  const propertyHit = hit ? null : propertyWorkspace.hit(point, camera.zoom);
  propertyWorkspace.setHover(propertyHit);
  canvas.classList.toggle('feature-hover', Boolean(hit || propertyHit));
}, {
  begin: (point,zoom,event) => {
    const tool=toolsA2.resolve(null,'transform');
    if(!tool)return false;
    const id=tool.id,group=id==='compound.transform'?c01SelectedGroup():null;
    if(group&&project?.city.buildings.some(b=>group.memberBuildingIds.includes(b.id)&&
          pointInPolygon(point,b.footprint))) {
      compoundDrag={start:{...point},transform:{...compoundTransform}};
      return id;
    }
    if(id==='property.merge')return false;
    if(id==='property.split')return propertySplitE2.begin(point,zoom)?id:false;
    if(id==='property.create'){
      const draft=propertyCreationSessionE1.draft;
      const outline=propertyCreationSessionE1.preview(project.city);
      if(!draft||!outline||!pointInPolygon(point,outline))return false;
      const edge=propertyFrontagesE1(project.city,draft.blockId).find(x=>x.roadId===draft.roadId);
      if(!edge)return false;
      const u=(point.x-edge.frame.origin.x)*edge.frame.tangent.x+
        (point.y-edge.frame.origin.y)*edge.frame.tangent.y;
      propertyCreationSessionE1.drag={startU:u,originalU:draft.u};return id;
    }
    if(id==='road.edit'){
      if (drafts.read('road').status === 'applying') return false;
      const s=roadWorkspace.session;
      if(event?.shiftKey && !s.mergeMode && !s.bendEditor)return false;
      return s.begin(point,zoom,event?.pointerType)?id:false;
    }
    if(id==='property.edit'&&propertyEditSession?.flexibleMode){
      const f=propertyEditSession.flexible;
      for(const which of ['A','B']){
        const p=plot027EndpointPosition(f,which);
        if(p&&Math.hypot(point.x-p.x,point.y-p.y)<12/Math.max(.18,zoom)){
          propertyEditSession.drag={kind:'plot027',which,original:{edgeA:f.edgeA,edgeB:f.edgeB,
            ratioA:f.ratioA,ratioB:f.ratioB}};
          propertyEditSession.updateFlexible({endpoint:which});
          return id;
        }
      }
      return false;
    }
    if(id==='property.edit'){
      const session=propertyEditSession,index=session.hitCorner(project?.city,point,zoom);
      if(session.polygonMode && index===null){
        const center=frontageMidpointSFS(session.boundary),radius=10/Math.max(.18,zoom);
        if(center && Math.hypot(center.x-point.x,center.y-point.y)<=radius){
          const drag=beginPropertyFrontageGestureSFS(project,session,'edge',null,point);
          if(!drag){$('statusMessage').textContent='Frontage road cannot be snapped safely.';return false;}
          session.drag=drag;syncPropertyEditUI3I();return id;
        }
      }
      if(index===null)return false;
      if(session.polygonMode && index<2){
        const drag=beginPropertyFrontageGestureSFS(project,session,'corner',index,point);
        if(!drag){$('statusMessage').textContent='Frontage road cannot be snapped safely.';return false;}
        session.drag=drag;
      }else session.drag={index,original:{...session.boundary[index]}};
      session.selectCorner(index);
      return id;
    }
    if(id==='building.place'){
      const polygon=buildingPlacementSession.active.courtyard?.only ? null
        : buildingPlacementSession.previewFor(project?.city)?.footprint;
      if(polygon?.length && pointInPolygon(point,polygon)){
        const property=buildingPlacementSession.property(project.city);
        buildingPlacementSession.drag={start:buildingLocalPoint3H(property,point),spec:{...buildingPlacementSession.spec}};
        return id;
      }
      return false;
    }
    return id==='building.edit'&&buildingEditSession.beginGesture(project?.city,layers,point,zoom,event?.pointerType)?id:false;
  },
  move: (point,event,id) => {
    if(id==='compound.transform'&&compoundDrag){
      compoundTransform.dx=compoundDrag.transform.dx+point.x-compoundDrag.start.x;
      compoundTransform.dy=compoundDrag.transform.dy+point.y-compoundDrag.start.y;
      $('compoundDx').value=String(Number(compoundTransform.dx.toFixed(4)));
      $('compoundDy').value=String(Number(compoundTransform.dy.toFixed(4)));
      c01SyncPanel();requestDraw();return;
    }
    if(id==='property.merge')return;
    if(id==='property.split'&&propertySplitE2?.session.drag){propertySplitE2.move(point);return;}
    if(id==='property.create'&&propertyCreationSessionE1?.drag){
      const state=propertyCreationSessionE1,draft=state.draft;
      const edge=propertyFrontagesE1(project.city,draft.blockId).find(x=>x.roadId===draft.roadId);
      if(edge){
        const u=(point.x-edge.frame.origin.x)*edge.frame.tangent.x+
          (point.y-edge.frame.origin.y)*edge.frame.tangent.y;
        state.update({u:state.drag.originalU+u-state.drag.startU});
      }
      return;
    }
    if(id==='road.edit'){roadWorkspace.session.move(point,event);return;}
    if(id==='property.edit'&&propertyEditSession?.drag?.kind==='plot027'){
      const f=propertyEditSession.flexible,near=plot027NearestEdge(f,point,camera.zoom);
      if(near){
        const which=propertyEditSession.drag.which;
        propertyEditSession.updateFlexible({[which==='A'?'edgeA':'edgeB']:near.edge,
          [which==='A'?'ratioA':'ratioB']:near.ratio});
      }
    }else if(id==='property.edit'&&propertyEditSession?.drag?.kind==='frontage-sfs'){
      const drag=propertyEditSession.drag;
      const result=proposePropertyFrontageGestureSFS(project,propertyEditSession,drag,point);
      if(result.ok&&result.frontage){
        drag.clamped=result.clamped;
        // Candidate checked independently without modifying accepted geometry.
        if(JSON.stringify(result.frontage)!==JSON.stringify(propertyEditSession.boundary.slice(0,2)))
          propertyEditSession.setFrontage(result.frontage);
        if(result.clamped)$('statusMessage').textContent=result.reason;
        syncPropertyEditUI3I();
      }else if(result.reason)$('statusMessage').textContent=result.reason;
    }else if(id==='property.edit'&&propertyEditSession?.drag){
      propertyEditSession.setCorner(propertyEditSession.drag.index,point);
    }else if(id==='building.place'&&buildingPlacementSession?.drag){
      const property=buildingPlacementSession.property(project.city);
      const now=buildingLocalPoint3H(property,point),drag=buildingPlacementSession.drag;
      if(now && drag.start)buildingPlacementSession.update({
        u:drag.spec.u+now.u-drag.start.u,v:drag.spec.v+now.v-drag.start.v
      });
    }else if(id==='building.edit')buildingEditSession?.moveGesture(point);
  },
  end: (cancelled,event,id) => {
    if(id==='compound.transform'&&compoundDrag){
      if(cancelled)compoundTransform={...compoundDrag.transform};
      compoundDrag=null;
      $('compoundDx').value=String(Number(compoundTransform.dx.toFixed(4)));
      $('compoundDy').value=String(Number(compoundTransform.dy.toFixed(4)));
      c01SyncPanel();requestDraw();return;
    }
    if(id==='property.split'&&propertySplitE2?.session.drag){propertySplitE2.end(cancelled);return;}
    if(id==='property.create'&&propertyCreationSessionE1?.drag){
      const state=propertyCreationSessionE1,drag=state.drag;state.drag=null;
      if(cancelled)state.update({u:drag.originalU});
      syncPropertyCreationE1();return;
    }
    if(id==='road.edit'){roadWorkspace.session.end(cancelled,event);return;}
    if(id==='property.edit'&&propertyEditSession?.drag){
      const drag=propertyEditSession.drag;
      propertyEditSession.drag=null;
      if(cancelled){
        if(drag.kind==='plot027')propertyEditSession.updateFlexible(drag.original);
        else if(drag.kind==='frontage-sfs')propertyEditSession.setFrontage(drag.original);
        else propertyEditSession.setCorner(drag.index,drag.original);
      }
      syncPropertyEditUI3I();
    }else if(id==='building.place'&&buildingPlacementSession?.drag){
      const drag=buildingPlacementSession.drag;
      buildingPlacementSession.drag=null;
      if(cancelled)buildingPlacementSession.update(drag.spec);
      syncBuildingStructureUI3H();
    }else if(id==='building.edit')buildingEditSession?.endGesture(cancelled);
  }
});
function clearMapHover() {
  landscapeWorkspace?.setHover(null);
  buildingWorkspace?.setHover(null);
  propertyWorkspace?.setHover(null);
  canvas.classList.toggle('feature-hover', false);
}
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewport);
else window.addEventListener('resize', resize);
resize();
const url = new URL(window.location.href);
$('seedInput').value = url.searchParams.get('seed') || 'mappo-001';
const size = url.searchParams.get('size');
if (['small', 'medium', 'large'].includes(size)) $('sizeInput').value = size;
const shape = url.searchParams.get('shape') || url.searchParams.get('morphology');
if (Object.hasOwn(SHAPE_DESCRIPTIONS, shape)) {
  $('morphologyInput').value = shape;
  $('presetInput').value = shape;
}
$('shapeDescription').textContent = SHAPE_DESCRIPTIONS[$('morphologyInput').value];
loadPreset();
generate();
fitMap();

function captureWorkspace() {
  const roadBaseline=roadWorkspace?.savedWorkspace();
  if(roadBaseline)return {project,workspace:copyJson(roadBaseline)};
  return {
    project,
    workspace: {
      schemaVersion: 1,
      ui: {
        ...workspaceShell.snapshot(),
        disclosures: Object.fromEntries(WORKSPACE_DISCLOSURE_IDS.map(id => [id, Boolean($(id).open)])),
        landscape: landscapeWorkspace.snapshotUI(),
        districts: districtPanel.snapshotUI()
      },
      panels: {
        districts: Boolean($('districtPanel').open),
        fortifications: Boolean($('fortificationPanel').open),
        water: Boolean($('waterPanel').open),
        terrain: Boolean($('terrainPanel').open)
      },
      terrainEditor: {
        ...terrainPanel.editor.snapshot(),
        controls: terrainPanel.controls()
      },
      waterEditor: {
        ...waterPanel.editor.snapshot(),
        controls: {
          seed: String($('waterSeedInput').value),
          width: String($('riverWidthInput').value),
          coastDirection: $('coastDirectionInput').value || 'east',
          coastSeed: String($('coastSeedInput').value),
          lakeSeed: String($('lakeSeedInput').value),
          lakeId: waterPanel.selectedLakeId || '',
          lakeRadius: String($('lakeRadiusInput').value)
        }
      },
      fortificationEditor: {
        ...fortificationPanel.editor.snapshot(),
        controls: {
          ...fortificationPanel.controls(),
          gateCount: String($('gateCountInput').value),
          towerSpacing: String($('towerSpacingInput').value)
        }
      },
      districtEditor: {
        ...districtPanel.editor.snapshot(),
        controls: {
          count: $('districtNumberInput').value,
          seed: $('districtSeedInput').value,
          name: $('districtNameInput').value,
          color: $('districtColorInput').value,
          target: $('districtTargetInput').value
        }
      },
      editor: {
        ...editor.snapshot(),
        history: copyJson(editor.history),
        mode: editor.closed ? editor.mode : 'points',
        error: editor.error
      },
      controls: {
        seed: $('seedInput').value,
        size: $('sizeInput').value,
        morphology: $('morphologyInput').value,
        preset: $('presetInput').value
      },
      view: {
        landscapeSelection: ['water', 'terrain'].includes(workspaceShell.state.selection?.kind) ? {
          ...workspaceShell.state.selection
        } : null,
        camera: {
          x: camera.x,
          y: camera.y,
          zoom: camera.zoom
        },
        layers: {
          ...layers
        },
        fitOnLoad: false
      }
    }
  };
}

function applyProjectDocument(document) {
  cancelMapGesturesA2();
  drafts.clear();
  roadWorkspace?.exit({restore:false});
  propertyEditSession?.stop();
  propertyCreationSessionE1?.stop();
  propertyCreationHistoryE1.clear();
  propertySplitE2?.clear();
  propertyMergeE3?.clear();
  landscapeWorkspace.restoring = true;
  const next = copyJson(document.project),
    workspace = copyJson(document.workspace),
    draft = workspace.editor;
  buildingEditSession?.stop();
  buildingPlacementSession?.stop();
  buildingStructureHistory.clear();
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  roadHistory.clear();
  identityWorkspace.reset();
  propertyWorkspace.refresh({ replaced: true });
  buildingWorkspace.refresh({ replaced: true });
  clearMapHover();
  publishAcceptedStateD01(next,stageAcceptedReplacementD01(acceptedHistoryD01,next,
    'Opening or recovering a project cleared session history.'));
  buildingHistory.clear(); // History does not travel with portable or recovery files.
  editor.boundary = draft.boundary;
  editor.center = draft.center;
  editor.closed = draft.closed;
  editor.dirty = draft.dirty;
  editor.history = draft.history;
  editor.mode = !draft.closed ? 'points' : (['pan', 'edit', 'center'].includes(draft.mode) ? draft.mode : 'pan');
  editor.stroke = false;
  editor.dragging = -1;
  editor.selected = -1;
  for (const [id, value] of Object.entries({
      seedInput: workspace.controls.seed,
      sizeInput: workspace.controls.size,
      morphologyInput: workspace.controls.morphology,
      presetInput: workspace.controls.preset
    })) $(id).value = value;
  for (const key of LAYER_KEYS_4F) {
    layers[key] = workspace.view.layers[key] ?? false;
    $(key + 'Layer').checked = layers[key];
  }
  syncLayerPreset4F();
  camera.x = workspace.view.camera.x;
  camera.y = workspace.view.camera.y;
  camera.zoom = workspace.view.camera.zoom;
  $('lakeSeedInput').value = 'lake';
  $('lakeRadiusInput').value = '28';
  $('waterSeedInput').value = 'river';
  $('coastSeedInput').value = 'coast';
  $('riverWidthInput').value = '28';
  $('coastDirectionInput').value = 'east';
  waterPanel.editor.load(workspace.waterEditor, next.city);
  waterPanel.selectedLakeId = workspace.waterEditor?.controls?.lakeId ?? null;
  waterPanel.refresh(true);
  if (workspace.waterEditor?.controls) {
    if (workspace.waterEditor.controls.coastSeed === undefined && next.city.waterFeatures.length === 1 && next.city.waterFeatures[0].kind === 'coast') $('coastSeedInput').value = workspace.waterEditor.controls.seed;
    else $('waterSeedInput').value = workspace.waterEditor.controls.seed;
    if (workspace.waterEditor.controls.coastSeed !== undefined) $('coastSeedInput').value = workspace.waterEditor.controls.coastSeed;
    if (workspace.waterEditor.controls.lakeSeed !== undefined) $('lakeSeedInput').value = workspace.waterEditor.controls.lakeSeed;
    if (workspace.waterEditor.controls.lakeRadius !== undefined) $('lakeRadiusInput').value = workspace.waterEditor.controls.lakeRadius;
    $('riverWidthInput').value = workspace.waterEditor.controls.width;
    $('coastDirectionInput').value = workspace.waterEditor.controls.coastDirection ?? 'east';
  }
  terrainPanel.editor.load(workspace.terrainEditor, next.city);
  terrainPanel.refresh(true);
  if (workspace.terrainEditor?.controls)
    for (const [key, id] of [
        ['seed', 'terrainSeedInput'],
        ['size', 'terrainSizeInput'],
        ['height', 'terrainHeightInput'],
        ['placement', 'terrainPlacementInput']
      ]) $(id).value = workspace.terrainEditor.controls[key];
  $('terrainPanel').open = workspace.panels?.terrain ?? false;
  terrainPanel.message(terrainPanel.editor.dirty ? 'Loaded unfinished mountain edits. Generate city to apply.' : 'Saved mountain geometry loaded exactly.');
  $('waterPanel').open = workspace.panels?.water ?? false;
  waterPanel.message(waterPanel.editor.dirty ? 'Loaded unfinished water edits. Generate city when ready to apply.' : 'Saved water and bridge geometry loaded exactly.');
  districtPanel.editor.load(workspace.districtEditor);
  savedHistoryCount.districts = districtPanel.editor.history.length;
  districtPanel.refresh(true);
  const districtControls = workspace.districtEditor?.controls;
  if (districtControls)
    for (const [id, value] of Object.entries({
        districtNumberInput: districtControls.count,
        districtSeedInput: districtControls.seed,
        districtNameInput: districtControls.name,
        districtColorInput: districtControls.color,
        districtTargetInput: districtControls.target
      })) $(id).value = value;
  fortificationPanel.editor.load(workspace.fortificationEditor);
  savedHistoryCount.defenses = fortificationPanel.editor.history.length;
  fortificationPanel.refresh(true);
  const fortControls = workspace.fortificationEditor?.controls;
  if (fortControls) {
    $('wallsEnabledInput').checked = fortControls.enabled;
    $('gateCountInput').value = fortControls.gateCount;
    $('towerSpacingInput').value = fortControls.towerSpacing;
    $('fortificationSeedInput').value = fortControls.seed;
  }
  fortificationPanel.syncPreview();
  $('districtPanel').open = workspace.panels?.districts ?? Boolean(districtPanel.editor.selectedDistrictId);
  $('fortificationPanel').open = workspace.panels?.fortifications ?? true;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[workspace.controls.morphology];
  const legacySelection = terrainPanel.editor.mode !== 'pan' && terrainPanel.editor.activeFeature() ? {
    kind: 'terrain',
    id: terrainPanel.editor.activeFeature().id
  } : waterPanel.editor.mode !== 'pan' && waterPanel.editor.activeFeature() ? {
    kind: 'water',
    id: waterPanel.editor.activeFeature().id
  } : districtPanel.editor.selectedDistrictId ? {
    kind: 'district',
    id: districtPanel.editor.selectedDistrictId
  } : null;
  const savedSelection = workspace.view.landscapeSelection;
  if (savedSelection && !landscapeWorkspace.record(savedSelection)) {
    // A stale reference must not leave a restored tool editing a different,
    // hidden feature. Definitions and pending fields remain loaded exactly.
    waterPanel.editor.setMode('pan');
    terrainPanel.editor.setMode('pan');
  }
  const restoredSelection = savedSelection !== undefined ? (landscapeWorkspace.record(savedSelection) ? savedSelection : districtPanel.editor.selectedDistrictId ? {
    kind: 'district',
    id: districtPanel.editor.selectedDistrictId
  } : null) : legacySelection;
  if (restoredSelection?.kind === 'water') {
    waterPanel.editor.selectFeature(restoredSelection.id);
    if (waterPanel.editor.activeFeature()?.kind === 'lake') waterPanel.selectedLakeId = restoredSelection.id;
    waterPanel.refresh();
  }
  if (restoredSelection?.kind === 'terrain') {
    terrainPanel.editor.select(restoredSelection.id);
    terrainPanel.refresh();
  }
  landscapeWorkspace.restoreUI(workspace.ui?.landscape);
  districtPanel.restoreUI(workspace.ui?.districts);
  const savedUISelection = workspace.ui?.selection;
  // A stale legacy landscape reference invalidates any conflicting saved
  // presentation selection; never resurrect a different feature by accident.
  const staleLegacySelection = Boolean(savedSelection && !landscapeWorkspace.record(savedSelection));
  const isValidSelection = ref => {
    if (ref?.kind === 'district') return next.city.districts.some(d => d.id === ref.id);
    if (ref?.kind === 'property') return Boolean(propertyWorkspace.record(ref));
    if (ref?.kind === 'building') {
      const building = buildingWorkspace.record(ref);
      return Boolean(building && propertyWorkspace.propertyForBuilding(building));
    }
    if (['water', 'terrain'].includes(ref?.kind)) return Boolean(landscapeWorkspace.record(ref));
    return ref?.kind === 'landscape-add' && landscapeWorkspace.available(ref.id);
  };
  const selectedUIRef = staleLegacySelection ? null
    : workspace.ui && Object.hasOwn(workspace.ui, 'selection')
      ? (savedUISelection && isValidSelection(savedUISelection) ? savedUISelection : null)
      : restoredSelection;
  if (selectedUIRef?.kind === 'district' && districtPanel.editor.selectedDistrictId !== selectedUIRef.id) {
    districtPanel.editor.selectedDistrictId = selectedUIRef.id;
    districtPanel.editor.selectedBlockId = null;
    districtPanel.refresh();
  }
  if (selectedUIRef?.kind === 'water') {
    waterPanel.editor.selectFeature(selectedUIRef.id);
    waterPanel.refresh();
  }
  if (selectedUIRef?.kind === 'terrain') {
    terrainPanel.editor.select(selectedUIRef.id);
    terrainPanel.refresh();
  }
  workspaceShell.reset({
    section: selectedUIRef?.kind === 'district' ? 'districts' : ['property', 'building'].includes(selectedUIRef?.kind) || !selectedUIRef ? 'city' : 'landscape',
    selection: selectedUIRef,
    ui: workspace.ui
  });
  if (['water', 'terrain', 'landscape-add'].includes(selectedUIRef?.kind))
    landscapeWorkspace.loadControls(selectedUIRef);
  landscapeWorkspace.render();
  for (const id of WORKSPACE_DISCLOSURE_IDS)
    if (workspace.ui?.disclosures?.[id] !== undefined)
      $(id).open = workspace.ui.disclosures[id];
  editor.notify(draft.dirty ? 'Loaded city and unfinished outline edits. Generate only when ready to rebuild.' : 'Loaded city. Its exact saved geometry is ready to use.', Boolean(draft.error));
  updateDetails();
  updateViewport();
  requestDraw();
  if (workspace.view.fitOnLoad) fitMap();
  $('statusMessage').textContent = `Loaded ${next.city.buildings.length} buildings · ${next.city.properties.length} properties`;
  updatePendingFeedback();
}
// The map PNG reflects the current on-screen view, including visible previews.
$('downloadMapPNG4F').addEventListener('click', async()=>{
  const message=$('mapExportStatus4F');
  try{
    if(!project)throw new Error('Generate or load a city first.');
    const defaultName=projectFilename({project,savedAt:new Date().toISOString()});
    const name=exportFilename4F($('exportFilename4F').value,defaultName,'png');
    const snapshot=await downloadMapPNG4F(canvas,name);
    message.textContent='PNG download requested: '+name+' ('+snapshot.width+' × '+snapshot.height+
      ' pixels). The image uses current visible layers and any editing previews.';
  }catch(error){message.textContent='PNG export failed: '+error.message;}
});

function updateWholeCityPNGDimensions() {
  const dimensions = $('wholeCityPNGDimensions');
  if (!project) {
    dimensions.textContent = 'Generate or load a city first.';
    return;
  }
  const framing = $('wholeCityPNGFraming').value;
  try {
    const plan = planWholeCityPNG(project.city, framing, Number($('wholeCityPNGSize').value));
    dimensions.textContent = `${plan.width} × ${plan.height} pixels` +
      (framing === 'developed' && plan.usedSurvey ? ' · Full survey used' : '');
  } catch (error) {
    dimensions.textContent = error.message;
  }
}

$('wholeCityPNGOptions').addEventListener('toggle', () => {
  if ($('wholeCityPNGOptions').open) updateWholeCityPNGDimensions();
});
$('wholeCityPNGFraming').addEventListener('change', updateWholeCityPNGDimensions);
$('wholeCityPNGSize').addEventListener('change', updateWholeCityPNGDimensions);
$('downloadWholeCityPNG').addEventListener('click', async () => {
  const button = $('downloadWholeCityPNG');
  const message = $('mapExportStatus4F');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (!project) throw new Error('Generate or load a city first.');
    message.textContent = 'Preparing whole-city PNG…';
    const defaultName = projectFilename({ project, savedAt: new Date().toISOString() });
    const name = exportFilename4F($('exportFilename4F').value, defaultName, 'png');
    const result = await downloadWholeCityPNG(project.city, layers, $('wholeCityPNGFraming').value,
      Number($('wholeCityPNGSize').value), name);
    message.textContent = `PNG download requested: ${name} (${result.width} × ${result.height} pixels).`;
  } catch (error) {
    message.textContent = 'PNG export failed: ' + error.message;
  } finally {
    button.disabled = false;
  }
});
syncLayerPreset4F();
files = new ProjectFiles({
  getElement: $,
  capture: captureWorkspace,
  apply: applyProjectDocument,
  onStatus: state => workspaceMenus.projectStatus(state)
});
files.bind();
files.start();
desktopWorkspace = new DesktopWorkspace({
  drafts, getElement: $, layout: desktopEditLayout, shell: workspaceShell, road: roadWorkspace,
  landscape: landscapeWorkspace,
  leaveTools: () => toolsA2.requestLeave(null,()=>{
    if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return false;
    stopWorkspaceTools();return true;
  },cancelMapGesturesA2),
  addProperty: startPropertyCreationE1,
  addBuilding: startStructurePlacement3H,
  prepareGeneration: prepareDesktopGeneration,
  generationKey: desktopGenerationKey,
  acceptedProject: () => project,
  redraw: requestDraw,
  enabled: true,
});
desktopWorkspace.bind();
window.addEventListener('beforeunload', event => {
  if (files.needsUnloadWarning) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  files.flush().catch(() => {});
});
if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') files.flush().catch(() => {});
});


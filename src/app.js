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
  FortificationPanel
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
  describeUndoContext
} from './core/undo-context.js';
import {
  rebuildFailureMessage
} from './core/validation-feedback.js';
import {
  isMapShortcutEvent
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
  bindCanvasInteraction
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
import { focusCameraOnSelection4B } from './core/selection-focus-4b.js';
import { formatEditIssue4D } from './core/inspector-feedback-4d.js';
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
import { DistrictEditor } from './editor/districts.js';
import { FortificationEditor } from './editor/fortifications.js';
import { RoadInspectionWorkspace } from './ui/road-inspection.js';
import { createJunctionPreviewWorkerP1 } from './editor/junction-preview-worker-client.js';
import { drawRoadComparison } from './renderer/road-comparison.js';
import { drawRoadInspectionOverlay } from './renderer/road-inspection.js';
// B1 candidate API is compiled for later editor integration; no Apply or UI hooks.
import { prepareRoadReconciliationB1 } from './core/road-reconciliation.js';
// B2 conservative parcel adaptation remains preview-only until B4 Apply.
import { prepareJunctionReflowC7 } from './core/neighborhood-reflow.js';
import { checkRoadApplyC2, prepareRoadApplyC2 } from './editor/road-application.js';
import { RoadGeometryHistoryB4 } from './editor/road-history.js';
import { AcceptedEditHistoryD01 } from './core/accepted-edit-history-d01.js';

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

function d01DraftBlocked() {
  if(roadWorkspace?.active||propertyEditSession?.isPending||propertyEditSession?.drag||propertyCreationSessionE1?.active||
    propertySplitE2?.active||propertyMergeE3?.active||buildingEditSession?.isPending||
    buildingEditSession?.drag||buildingPlacementSession?.isActive||desktopWorkspace?.mapPreview()||
    editor?.dirty||identityWorkspace?.hasPending()) return true;
  if(compoundPanelPropertyId && (Math.abs(compoundTransform.dx)>1e-9||
      Math.abs(compoundTransform.dy)>1e-9||Math.abs(compoundTransform.angle)>1e-9||
      Math.abs(compoundTransform.scaleX-1)>1e-9||Math.abs(compoundTransform.scaleY-1)>1e-9))
    return true;
  return false;
}
function d01SyncHistoryView() {
  const blocked=d01DraftBlocked();
  const lastUndo=acceptedHistoryD01.entry('undo'),lastRedo=acceptedHistoryD01.entry('redo');
  const redo=$('workspaceRedoButtonD01');
  if(redo){
    redo.disabled=blocked||!lastRedo||!acceptedHistoryD01.can('redo',project);
    redo.textContent=lastRedo?'Redo · '+lastRedo.label:'Redo';
    redo.title=blocked?'Finish or cancel the current draft before redoing accepted work.'
      :lastRedo?'Redo the last reversed transaction.':'No accepted Redo available.';
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
  if(status)status.textContent=acceptedHistoryD01.notice+
    ' · '+acceptedHistoryD01.length+'/20 entries · '+
    (acceptedHistoryD01.bytes/1048576).toFixed(1)+'/64 MiB estimated. Not saved in project files.';
}
function d01MoveHistory(direction) {
  if(!project)return false;
  if(d01DraftBlocked()){
    $('statusMessage').textContent='History blocked: finish or cancel the active preview or identity draft.';
    updateUndoFeedback();return false;
  }
  const receipt=acceptedHistoryD01.prepare(direction,project,captureWorkspace().workspace);
  if(!receipt.ok){
    $('statusMessage').textContent=receipt.reason;
    acceptedHistoryD01.notice=receipt.reason;
    updateUndoFeedback();return false;
  }
  d01ReplayingHistory=true;
  try{
    project=receipt.candidate;
    acceptedHistoryD01.accept(direction,receipt.entry,project);
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
    if(receipt.entry.family==='road')refreshRoadDistrictWorkspace(receipt.workspace);
    // Road/parcel ownership replacement can invalidate a selected property.
    // A building add/delete does not replace its parent property, so retain
    // that Inspector and its scoped structural Undo/Redo controls.
    const resetProperty=receipt.entry.family==='road'||receipt.entry.operation==='property-structure';
    const resetBuilding=resetProperty||receipt.entry.operation==='building-structure';
    // Synchronize live editor baselines before workspace reconciliation.
    if(buildingEditSession?.isActive&&!resetBuilding)buildingEditSession.reset(project.city);
    if(propertyEditSession?.isActive&&!resetProperty)
      propertyEditSession.start(project.city,propertyEditSession.propertyId);
    propertyWorkspace.refresh(resetProperty?{replaced:true}:{});
    buildingWorkspace.refresh(resetBuilding?{replaced:true}:{});
    clearMapHover();
    updateDetails();workspaceShell.refresh();requestDraw();
    workspaceChanged();
    $('statusMessage').textContent=acceptedHistoryD01.notice;
    return true;
  }finally{d01ReplayingHistory=false;updateUndoFeedback();}
}

function currentUndoContext() {
  if(propertyMergeE3?.active)return {kind:'property-merge-preview',controlId:'propertyMergeResetE3',
    label:'Reset merge preview',available:Boolean(propertyMergeE3.session.secondaryId),
    description:'Clear the uncommitted neighboring property selection.'};
  if(propertySplitE2?.active)return {kind:'property-split-preview',controlId:'propertySplitResetE2',
    label:'Reset split line',available:Math.abs(propertySplitE2.session.t-.5)>1e-9||
      (propertySplitE2.session.flexible&&(Math.abs(propertySplitE2.session.exitT-.5)>1e-9||
      propertySplitE2.session.exitEdge!==Math.max(1,Math.floor(propertySplitE2.session.vertexCount/2)))),
    description:'Reset the uncommitted split line without changing accepted land.'};
  if(propertyCreationSessionE1?.active)return {kind:'property-create-preview',controlId:'propertyCreateResetE1',
    label:'Reset property preview',available:Boolean(propertyCreationSessionE1.draft),
    description:'Clear the uncommitted property preview without changing accepted land.'};
  if(roadWorkspace?.active)return {kind:'road-preview',controlId:'roadPreviewReset',label:'Reset roads',
    available:roadWorkspace.session.pending,description:'Reset temporary junction coordinates; accepted roads have no edits to undo.'};
  // Shared accepted-history commands are chronological, not selection scoped.
  // Uncommitted previews above retain their own safe Reset/Cancel behavior.
  if(project){
    const blocked=d01DraftBlocked(),entry=acceptedHistoryD01.entry('undo');
    if(blocked)return {kind:'d01-blocked',controlId:'workspaceUndoButton',
      label:'Undo accepted',available:false,
      description:'Finish or cancel the active editor/draft before accepted Undo.'};
    if(entry)return {kind:'d01',controlId:'workspaceUndoButton',
      label:'Undo · '+entry.label,
      available:acceptedHistoryD01.can('undo',project),
      description:'Undo the latest accepted change across all editing tools.'};
    if(workspaceShell?.state.section==='landscape'||editor?.dirty)
      return describeUndoContext({section:workspaceShell?.state.section??'city',
        selection:workspaceShell?.state.selection??null,outline:editor,
        water:waterPanel?.editor,terrain:terrainPanel?.editor,
        district:districtPanel?.editor,defense:fortificationPanel?.editor,
        identity:identityWorkspace?.editor});
    return {kind:'d01-empty',controlId:'workspaceUndoButton',
      label:'Undo accepted',available:false,
      description:acceptedHistoryD01.notice};
  }
  if(propertyEditSession?.isActive){
    const id=propertyEditSession.propertyId;
    const available=!propertyEditSession.isPending&&!propertyEditSession.drag&&propertyHistory.can('undo',project,id);
    return {kind:'property',controlId:'propertyHistoryUndo3I',label:'Undo property',available,
      description:propertyEditSession.isPending
        ? 'Apply or reset your parcel draft before Undo.'
        : available?'Undo the last accepted property and plot edit.':'No accepted property edit to undo.'};
  }
  const structuralProperty=structureHistoryProperty3H();
  if (!buildingEditSession?.isActive && !buildingPlacementSession?.isActive
      && structuralProperty && buildingStructureHistory.can('undo',project,structuralProperty)) {
    const action=describeStructureChange4E(buildingStructureHistory.entry('undo',structuralProperty),'undo');
    return {kind:'structure',controlId:'structureUndo',
      label:action?.label??'Undo structure',available:true,
      description:action?.description??'Undo the last structural edit on this property.'};
  }
  if (buildingEditSession?.isActive && workspaceShell?.state.selection?.kind === 'building') {
    const id = buildingEditSession.buildingId;
    const available = !buildingEditSession.isPending && !buildingEditSession.drag && buildingHistory.can('undo',project,id);
    return {kind:'building',controlId:'buildingHistoryUndo',label:'Undo building',available,
      description: buildingEditSession.isPending ? 'Reset or Apply the preview before undoing accepted geometry.'
        : available ? 'Undo the last accepted edit to this building.' : 'No accepted building edit to undo.'};
  }
  if(propertyMergeE3?.history.can('undo',project) && !propertyMergeE3.active)
    return {kind:'property-merge',controlId:'propertyMergeUndoE3',label:'Undo property merge',
      available:true,description:'Restore both accepted properties and all associated records.'};
  if(propertySplitE2?.history.can('undo',project) && !propertySplitE2.active)
    return {kind:'property-split',controlId:'propertySplitUndoE2',label:'Undo property split',
      available:true,description:'Restore the original property and all owned plots/buildings in one revision.'};
  if(propertyCreationHistoryE1.can('undo',project) && !propertyCreationSessionE1?.active)
    return {kind:'property-creation',controlId:'propertyCreateUndoE1',
      label:'Undo property creation',available:true,
      description:'Remove the newly created property and its plot in one reversible action.'};
  if (propertyDeletionHistory4A.can('undo',project)
      && !propertyEditSession?.isActive && !buildingPlacementSession?.isActive && !buildingEditSession?.isActive)
    return {kind:'property-deletion',controlId:'propertyDeletionUndo4A',label:'Undo deletion',available:true,
      description:'Restore the last deleted property, its plots and buildings.'};
  if(!roadWorkspace?.active && !propertyEditSession?.isActive &&
     !buildingEditSession?.isActive && !buildingPlacementSession?.isActive &&
     roadHistory.can('undo',project))
    return {kind:'road-edit',controlId:'roadHistoryUndoB4',label:'Undo road',
      available:true,description:'Undo the entire last accepted road and neighborhood edit.'};
  return describeUndoContext({
    section: workspaceShell?.state.section ?? 'city',
    selection: workspaceShell?.state.selection ?? null,
    outline: editor,
    water: waterPanel?.editor, terrain: terrainPanel?.editor,
    district: districtPanel?.editor, defense: fortificationPanel?.editor,
    identity: identityWorkspace?.editor
  });
}
function updateUndoFeedback() {
  const scope = currentUndoContext();
  $('workspaceUndoButton').textContent = scope.label;
  $('workspaceUndoButton').disabled = !scope.available;
  $('workspaceUndoButton').setAttribute('title', scope.description);
  $('workspaceUndoDescription').textContent = scope.description;
  d01SyncHistoryView();
}
function undoCurrentScope() {
  const scope = currentUndoContext();
  if (!scope.available) return false;
  if(scope.kind==='d01')return d01MoveHistory('undo');
  const button = $(scope.controlId);
  if (typeof button.click === 'function') button.click();
  else button.handlers?.click?.(); // test DOM shim
  updateUndoFeedback();
  return true;
}
function workspaceChanged() {
  // This is the common accepted-project observation boundary. Visual-only
  // changes do not touch the ledger. Unsupported accepted-city changes become
  // explicit barriers, never silently replayed with a stale project.
  const observed=project&&!d01ReplayingHistory ? acceptedHistoryD01.observe(project) : null;
  // Journal observation follows other component callbacks; refresh the
  // actionable local controls after a newly accepted transaction.
  if(observed?.status==='recorded'||observed?.status==='barrier'||d01ReplayingHistory){
    syncBuildingHistoryUI();
    syncBuildingStructureUI3H();
    // The property Inspector may render before the accepted transaction has
    // been observed. Recompute its accepted-history button states afterward.
    // Do not revalidate every mouse move or visual-only selection change.
    syncPropertyEditUI3I();
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
    button.disabled=active||!available;
    button.title=available?'Restore the complete accepted road and parcel transaction.':
      'No compatible road '+direction+' is available; other accepted changes may have intervened.';
  }
}
function syncPropertyDeletionControls4A() {
  const busy=Boolean(roadWorkspace?.active || propertyEditSession?.isActive || buildingPlacementSession?.isActive || buildingEditSession?.isActive);
  for(const [direction,id] of [['undo','propertyDeletionUndo4A'],['redo','propertyDeletionRedo4A']]) {
    const available=acceptedHistoryD01.entry(direction)?.operation==='property-structure' && acceptedHistoryD01.can(direction,project);
    const button=$(id);
    button.hidden=!available;
    button.disabled=busy||!available;
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
  const ready = Boolean(id && !session.isPending && !session.drag);
  const undo = ready && acceptedHistoryD01.entry('undo')?.family==='building' && acceptedHistoryD01.can('undo',project);
  const redo = ready && acceptedHistoryD01.entry('redo')?.family==='building' && acceptedHistoryD01.can('redo',project);
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
  if (!shown) return;
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
  const details = $('buildingFootprintDetails');
  details.hidden = !session.isDirect && !session.draft;
  if (!details.hidden) {
    const footprint = result.preview ?? session.previewFor(project.city);
    const gross = Math.abs(polygonSignedArea(footprint.footprint));
    const proposed = result.candidate?.city.buildings.find(b => b.id === session.buildingId);
    details.textContent = 'Footprint '+formatPrecision4C(gross)
      +' · Courtyards '+formatPrecision4C(gross-footprint.area)
      +' · Occupied '+formatPrecision4C(footprint.area)
      +(proposed ? ' · Plots '+proposed.plotIds.join(', ') : '')
      +(result.accessChanged ? ' · Entrance and access will move to the route shown on the map.'
        : proposed && session.draft ? ' · Entrance and access retained.' : '');
  }
  const eligible = session.isPending && !session.drag && !session.operationError && result.status==='valid';
  $('buildingPreviewApply').disabled = !eligible;
  $('buildingTransformPanel').setAttribute('data-validation',result.status);
  const issues = $('buildingPreviewIssues');
  issues.hidden = !result.issues.length;
  issues.replaceChildren(...result.issues.map(issue=>{
    const li=document.createElement('li');
    li.textContent=formatEditIssue4D(issue,{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.source(project.city)?.frontageRoadId
    });
    return li;
  }));
  $('buildingPreviewStatus').textContent = session.operationError || (
    !session.isPending ? 'Make a footprint change to preview its placement.'
    : result.status==='checking'
      ? 'CHECKING · Fast geometry check complete; road access is verified when the drag ends.'
      : result.ok
        ? 'VALID PLACEMENT · Ready to apply footprint. Project compatibility will be rechecked.'
        : 'INVALID PLACEMENT · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
          buildingId:session.buildingId,propertyId:session.propertyId,
          frontageRoadId:session.source(project.city)?.frontageRoadId
        }));
}
function confirmBuildingPreviewDiscard() {
  if (!buildingEditSession?.isPending) return true;
  return typeof window.confirm !== 'function' || window.confirm('Discard the unsaved building preview? The city remains unchanged.');
}
function applyBuildingTransform() {
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
    if(project!==previous || session.buildingId!==buildingId) return false;
    if (!buildingHistory.record(previous,received.candidate,buildingId)) return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    project=received.candidate;
    session.reset(project.city, { keepCourtyard: true });
    updateDetails();
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged(); // Mark the accepted city dirty for recovery/save.
    $('statusMessage').textContent='Applied validated footprint to '+buildingId+'. Download a project copy to keep this change.';
    return true;
  } catch(error){
    project=previous;
    $('buildingPreviewApply').disabled=true;
    $('buildingPreviewStatus').textContent='APPLY FAILED · Original city preserved. '+error.message;
    requestDraw();
    return false;
  }
}

function moveBuildingHistory(direction) {
  const session=buildingEditSession;
  if (!project || !session?.isActive || session.isPending || session.drag
      || workspaceShell?.state.selection?.kind !== 'building'
      || workspaceShell.state.selection.id !== session.buildingId) return false;
  const id=session.buildingId;
  const receipt=buildingHistory.prepare(project,captureWorkspace().workspace,id,direction);
  if (!receipt.ok) {
    $('buildingHistoryStatus').textContent=receipt.reason;
    syncBuildingHistoryUI();
    return false;
  }
  buildingHistory.accept(receipt.entry,direction);
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  project=receipt.candidate;
  session.reset(project.city);
  updateDetails();
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' accepted footprint edit for '+id+'. Download a project copy to keep it.';
  return true;
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
  if(!property){compoundResult=null;return;}
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
  $('compoundApply').disabled=!group||!compoundResult?.ok;
  const msg=compoundResult?.ok?'VALID · All compound members can be applied together.'
    :compoundResult?.issues?.length
      ? 'CANNOT APPLY · '+(compoundResult.issues[0].buildingId?compoundResult.issues[0].buildingId+': ':'')
        +compoundResult.issues[0].message
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
  project=receipt.candidate;
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
  const property=c01ActiveProperty(),group=c01SelectedGroup();
  if(!property||!group||!project)return false;
  const previous=project;
  const receipt=prepareCompoundTransform(previous,captureWorkspace().workspace,
    property.id,group.id,compoundTransform);
  if(!receipt.ok){compoundResult=receipt;c01SyncPanel();return false;}
  if(project!==previous||c01ActiveProperty()?.id!==property.id)return false;
  if(!buildingStructureHistory.record(previous,receipt.candidate,property.id,'compound-transform'))
    return false;
  project=receipt.candidate;
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
  if(!buildingPlacementSession?.isActive)return true;
  return typeof window.confirm!=='function'||window.confirm('Discard the unsaved building placement preview? Your accepted city will not change.');
}
function exitStructurePlacement3H() {
  if(!buildingPlacementSession?.isActive)return true;
  if(!confirmStructureDiscard3H())return false;
  buildingPlacementSession.stop();
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
    const available = canHistory && ['building','compound'].includes(acceptedHistoryD01.entry(direction)?.family) && acceptedHistoryD01.can(direction,project);
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
  if(!shown)return;
  const spec=session.spec;
  const structureMeasure=placementMeasurements4C(project.city,session);
  $('structurePreviewMeasurements4C').textContent=structureMeasure
    ? 'Width '+formatPrecision4C(structureMeasure.width)+' · Depth '+formatPrecision4C(structureMeasure.depth)+
      ' · Area '+formatPrecision4C(structureMeasure.area)+' · Position '+formatPrecision4C(structureMeasure.u)+
      ', '+formatPrecision4C(structureMeasure.v) : 'Adjust your draft to preview its measurements.';
  const replacing = session.operation === 'replace';
  $('structureModeTitle').textContent = replacing ? 'REPLACE BUILDING' : 'PLACE NEW BUILDING';
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
    : !spec.preset ? {ok:false,status:'idle',issues:[]}
    : prepareBuildingStructure3H(project,captureWorkspace().workspace,session.active);
  session.validation=result;
  const consentNeeded = replacing && !session.active.replaceGeometry;
  $('structureApply').disabled = !(result.ok && result.status === 'valid' && !session.drag && !consentNeeded);
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
    ? 'Choose a footprint preset to preview it against the existing outline.'
    : result.status==='checking'
    ? 'CHECKING · Complete placement validation runs when movement ends.'
    : result.ok ? (consentNeeded
      ? 'Review the proposed footprint on the map and confirm the replacement.'
      : 'VALID · This building can be applied to the selected property.')
    : 'INVALID · Apply disabled. '+formatEditIssue4D(result.issues?.[0],{
      buildingId:session.buildingId,propertyId:session.propertyId,
      frontageRoadId:session.property(project.city)?.frontageRoadId
    });
}
function applyStructurePlacement3H() {
  const session=buildingPlacementSession;
  if (!project || !session?.isActive || session.drag
      || (session.operation === 'replace' && !session.active.replaceGeometry)) return false;
  const selection=workspaceShell?.state.selection;
  if(!selection || (selection.kind==='property' && selection.id!==session.propertyId)
    || (selection.kind==='building' && selection.id!==session.buildingId)
    || !['property','building'].includes(selection.kind))return false;
  const previous=project,request={...session.active,spec:{...session.spec}};
  const result=prepareBuildingStructure3H(previous,captureWorkspace().workspace,request);
  if(!result.ok){
    session.validation=result;syncBuildingStructureUI3H();return false;
  }
  if(project!==previous || session.active?.buildingId!==request.buildingId)return false;
  try{
    if(!buildingStructureHistory.record(previous,result.candidate,request.propertyId,request.operation))return false;
    propertyHistory.clear();
    propertyDeletionHistory4A.clear();
    project=result.candidate;
    buildingHistory.clear();
    session.stop();
    updateDetails();
    workspaceShell.select({kind:'property',id:request.propertyId});
    workspaceShell.refresh();
    requestDraw();
    workspaceChanged();
    $('statusMessage').textContent='Applied '+request.operation+' for '+request.buildingId+'. Download a project to keep it.';
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
    project=result.candidate;
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
    project=result.candidate;
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
function moveStructureHistory3H(direction) {
  if(!project || buildingPlacementSession?.isActive || buildingEditSession?.isActive)return false;
  const propertyId=structureHistoryProperty3H();
  if(!propertyId || !buildingStructureHistory.can(direction,project,propertyId))return false;
  const result=buildingStructureHistory.prepare(project,captureWorkspace().workspace,propertyId,direction);
  if(!result.ok){$('statusMessage').textContent='Cannot '+direction+' structure: '+result.issues[0]?.message;return false;}
  const action=describeStructureChange4E(result.entry,direction);
  buildingStructureHistory.accept(result.entry,direction);
  propertyHistory.clear();
  propertyDeletionHistory4A.clear();
  project=result.candidate;
  buildingHistory.clear();
  updateDetails();
  workspaceShell.select({kind:'property',id:propertyId});
  workspaceShell.refresh();
  requestDraw();
  workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid: ':'Redid: ')+
    (action?.description??'Structural edit on '+propertyId+'.');
  return true;
}

function exitBuildingEditing() {
  if (!buildingEditSession?.isActive) return true;
  if (!confirmBuildingPreviewDiscard()) return false;
  buildingEditSession.stop();
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900 && workspaceShell?.state.selection?.kind === 'building'
    && workspaceShell.state.inspectorCollapsed) workspaceShell.dispatch({ type: 'inspector', collapsed: false });
  return true;
}
function exitPropertyEditing3I() {
  if (!propertyEditSession?.isActive) return true;
  if (propertyEditSession.isPending && typeof window.confirm === 'function'
      && !window.confirm('Discard your unsaved property boundary and plot preview?'))return false;
  propertyEditSession.stop();
  if (Number.isFinite(window.innerWidth) && window.innerWidth <= 900
      && workspaceShell?.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:false});
  return true;
}
function syncPropertyEditUI3I() {
  const session = propertyEditSession;
  const active = Boolean(project && session?.isActive && session.source(project.city));
  $('propertyEditPanel3I').hidden = !active;
  if (!active) return;
  $('propertyEditTarget3I').textContent = session.propertyId;
  const measured=propertyMeasurements4C(project.city,session);
  if(measured) $('propertyPreviewMeasurements4C').textContent=
    'Width '+formatPrecision4C(measured.width)+' · Depth '+formatPrecision4C(measured.depth)+
    ' · Area '+formatPrecision4C(measured.area)+' (Δ '+formatPrecision4C(measured.areaDelta)+')'+
    ' · Center '+formatPrecision4C(measured.x)+', '+formatPrecision4C(measured.y)+
    ' · Offset '+formatPrecision4C(measured.dx)+', '+formatPrecision4C(measured.dy);
  for(const id of ['propertyNudgeLeft4C','propertyNudgeRight4C','propertyNudgeUp4C','propertyNudgeDown4C'])
    $(id).disabled=session.selectedCorner===null || Boolean(session.drag);
  $('propertyEditCorner3I').textContent = session.selectedCorner === null
    ? 'Click or drag a highlighted corner to select it.'
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
  const canHistory=!session.isPending&&!session.drag;
  $('propertyHistoryUndo3I').disabled=!(canHistory&&acceptedHistoryD01.entry('undo')?.family==='property'&&acceptedHistoryD01.can('undo',project));
  $('propertyHistoryRedo3I').disabled=!(canHistory&&acceptedHistoryD01.entry('redo')?.family==='property'&&acceptedHistoryD01.can('redo',project));
  $('propertyHistoryStatus3I').textContent='Property history · '+propertyHistory.count('undo',session.propertyId)
    +' undo / '+propertyHistory.count('redo',session.propertyId)+' redo (session only).';
  const result=session.drag ? {ok:false,status:'checking',issues:[]} : inspectPropertyEdit3I(project,session);
  session.validation=result;
  $('propertyEditPanel3I').setAttribute('data-validation',result.status);
  $('propertyEditApply3I').disabled=!(session.isPending&&result.ok&&!session.drag);
  $('propertyEditStatus3I').textContent = result.status==='checking'
    ? 'CHECKING · Release the handle to validate the new property and plots.'
    : !result.ok
      ? 'INVALID · '+formatEditIssue4D(result.issues?.[0],{propertyId:session.propertyId})
      : session.isPending
        ? 'VALID · Property and plot edits can be applied together.'
        : 'NO PENDING CHANGES · Property and plots match the accepted city.';
  const issues=$('propertyEditIssues3I');
  issues.hidden=!result.issues?.length;
  issues.replaceChildren(...(result.issues??[]).map(issue=>{
    const item=document.createElement('li');
    item.textContent=formatEditIssue4D(issue,{propertyId:session.propertyId});
    return item;
  }));
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
  const outline = new OutlineEditor(() => {}, () => {});
  Object.assign(outline, { boundary: editor.boundary, center: editor.center, closed: editor.closed });
  outline.validate();
  const water = new WaterEditor();
  water.restore(waterPanel.editor.definition());
  if (water.features.some(feature => feature.kind === 'river')) water.width($('riverWidthInput').value);
  water.tidyWater(outline.boundary);
  return createProject({...cityGenerationOptions(outline, water.definition()),irregularProperties:true});
}

function desktopGenerationKey(tool) {
  if (tool === 'districts') return JSON.stringify([$('districtNumberInput').value, $('districtSeedInput').value]);
  if (tool === 'defenses') return JSON.stringify(fortificationPanel.controls());
  return JSON.stringify([editor.closed, $('riverWidthInput').value, cityGenerationOptions()]);
}

function generate({ discardIdentities = false } = {}) {
  roadWorkspace?.exit();
  if (!discardIdentities && identityWorkspace)
    return identityWorkspace.requestRebuild(() => generate({ discardIdentities: true }));
  try {
    editor.validate();
    if (waterPanel?.editor.features.some(f => f.kind === 'river')) waterPanel.editor.width($('riverWidthInput').value);
    const tidiedWater = waterPanel?.editor.tidyWater(editor.boundary) ?? [];
    const next = createProject({...cityGenerationOptions(),irregularProperties:true});
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
    project = next;
    acceptedHistoryD01.clear(project,'City generation started a new session history.');
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
  } catch (error) {
    const guidance = rebuildFailureMessage(error.message);
    editor.notify(guidance, true);
    if (waterPanel?.editor.dirty) waterPanel.message(guidance, true);
    if (terrainPanel?.editor.dirty) terrainPanel.message(guidance, true);
    $('statusMessage').textContent = 'Rebuild blocked — existing city unchanged.';
    updatePendingFeedback();
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
$('workspaceUndoButton').addEventListener('click', undoCurrentScope);
$('workspaceRedoButtonD01').addEventListener('click',()=>d01MoveHistory('redo'));
$('cancelButton').addEventListener('click', () => {
  if (!project) return;
  editor.remember();
  editor.load(project.city.survey.boundary, project.options.center, false);
  $('seedInput').value = project.seed;
  $('sizeInput').value = project.options.size;
  $('morphologyInput').value = project.options.morphology;
  $('shapeDescription').textContent = SHAPE_DESCRIPTIONS[project.options.morphology];
  workspaceChanged();
});
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
window.addEventListener('keydown', e => {
  if(propertyMergeE3?.active && e.key==='Escape'){propertyMergeE3.stop();e.preventDefault();return;}
  if(propertySplitE2?.active && e.key==='Escape'){propertySplitE2.stop();e.preventDefault();return;}
  if(propertyCreationSessionE1?.active && e.key==='Escape'){
    propertyCreationSessionE1.stop();e.preventDefault();return;
  }
  if(roadWorkspace?.active && e.key==='Escape'){
    if (roadWorkspace.comparisonOpen) roadWorkspace.setComparison(false);
    else if (roadWorkspace.session.cancelMergeMode()) { /* Escape cancels the two-click tool first. */ }
    else roadWorkspace.exit({focus:true});
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
  if(roadWorkspace?.active){
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
      if(e.key.toLowerCase()==='z'&&!e.shiftKey)roadWorkspace.reset();
      e.preventDefault();return;
    }
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
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    if(d01MoveHistory('redo'))e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
    if (undoCurrentScope()) e.preventDefault();
    return;
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
  getElement: $,
  getCity: () => project.city,
  activateLayers: () => {
    for (const key of ['districtColors', 'districtBorders', 'districtLabels']) {
      layers[key] = true;
      $(key + 'Layer').checked = true;
    }
    requestDraw();
    workspaceChanged();
  },
  commit: city => {
    // District generation/Undo can also rewrite road or block metadata.
    // This is outside the approved D01 history scope: clear the accepted
    // journal explicitly rather than misclassifying it as road topology.
    acceptedHistoryD01.clear({...project,city},
      'District editing cleared accepted session Undo/Redo.');
    // Rebuilding/undoing districts is a local update. Keep a valid property or
    // building in the Inspector rather than adopting the editor's default ward.
    if (['property', 'building'].includes(workspaceShell?.state.selection?.kind)) {
      districtPanel.editor.selectedDistrictId = null;
      districtPanel.editor.selectedBlockId = null;
    }
    project = {
      ...project,
      city
    };
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
  getElement: $,
  getCity: () => project.city,
  commit: city => {
    project = {
      ...project,
      city
    };
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
  getElement:$,getProject:()=>project,getWorkspace:()=>captureWorkspace().workspace,
  getRevision:()=>files?.revision??0,
  canEnter:()=>Boolean(project&&workspaceShell?.state.section==='city'&&editor.mode==='pan'
    &&!roadWorkspace?.active&&!propertyCreationSessionE1?.active&&!buildingEditSession?.isActive
    &&!buildingPlacementSession?.isActive&&!propertyEditSession?.isActive
    &&!identityWorkspace?.hasPending()&&!propertyMergeE3?.active),
  historyMove:direction=>d01MoveHistory(direction),
  historyCan:direction=>Boolean(!d01DraftBlocked()&&acceptedHistoryD01.can(direction,project)),
  onCommit:(candidate,propertyId,direction,receipt)=>{
    const revisionBeforeCommit=files?.revision??0;
    project=candidate;
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
  getElement:$,getProject:()=>project,getWorkspace:()=>captureWorkspace().workspace,
  getRevision:()=>files?.revision??0,
  canEnter:()=>Boolean(project&&workspaceShell?.state.section==='city'&&editor.mode==='pan'
    &&!roadWorkspace?.active&&!propertyCreationSessionE1?.active&&!buildingEditSession?.isActive
    &&!buildingPlacementSession?.isActive&&!propertyEditSession?.isActive
    &&!propertySplitE2?.active&&!identityWorkspace?.hasPending()),
  historyMove:direction=>d01MoveHistory(direction),
  historyCan:direction=>Boolean(!d01DraftBlocked()&&acceptedHistoryD01.can(direction,project)),
  onCommit:(candidate,propertyId,direction)=>{
    const revisionBefore=files?.revision??0;
    project=candidate;
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
  $('propertyCreateUndoE1').disabled=busy||acceptedHistoryD01.entry('undo')?.operation!=='property-structure'||!acceptedHistoryD01.can('undo',project);
  $('propertyCreateRedoE1').disabled=busy||acceptedHistoryD01.entry('redo')?.operation!=='property-structure'||!acceptedHistoryD01.can('redo',project);
  if(!active)return;
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
  $('propertyCreateApplyE1').disabled=!inspected.ok||Boolean(session.drag);
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
function applyPropertyCreationE1(){
  const session=propertyCreationSessionE1;
  if(!session?.active||!session.draft||session.drag||!project)return false;
  const before=project,rev=files?.revision??0,draft=copyJson(session.draft);
  const receipt=preparePropertyCreationE1(before,captureWorkspace().workspace,draft);
  if(!receipt.ok){
    session.validation=receipt;syncPropertyCreationE1();return false;
  }
  if(project!==before||(files?.revision??0)!==rev||
      JSON.stringify(session.draft)!==JSON.stringify(draft))return false;
  if(!propertyCreationHistoryE1.record(before,receipt.candidate,receipt.propertyId))return false;
  project=receipt.candidate;
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
function movePropertyCreationE1(direction){
  if(!project||propertyCreationSessionE1?.active||roadWorkspace?.active||
      buildingPlacementSession?.isActive||buildingEditSession?.isActive||propertyEditSession?.isActive)
    return false;
  const receipt=propertyCreationHistoryE1.prepare(direction,project,captureWorkspace().workspace);
  if(!receipt.ok){$('statusMessage').textContent=receipt.reason;return false;}
  const id=receipt.entry.id;
  project=receipt.candidate;
  propertyCreationHistoryE1.accept(direction,receipt.entry);
  roadHistory.clear();propertyHistory.clear();propertyDeletionHistory4A.clear();
  buildingHistory.clear();buildingStructureHistory.clear();identityWorkspace.reset();
  propertyWorkspace.refresh({replaced:true});buildingWorkspace.refresh({replaced:true});
  updateDetails();
  workspaceShell.select(direction==='undo'?null:{kind:'property',id},{reveal:false});
  workspaceShell.refresh();requestDraw();syncPropertyCreationE1();updateUndoFeedback();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' creation of '+id+'.';
  return true;
}
$('propertyCreateStartE1').addEventListener('click',()=>propertyCreationSessionE1?.active
  ?propertyCreationSessionE1.stop():startPropertyCreationE1());
$('propertyCreateResetE1').addEventListener('click',()=>propertyCreationSessionE1?.reset());
$('propertyCreateCancelE1').addEventListener('click',()=>propertyCreationSessionE1?.stop());
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
  getElement: $, shell: workspaceShell, getCity: () => project?.city,
  canChangeBuildingUse: () => !(
    roadWorkspace?.active || buildingEditSession?.isActive || buildingPlacementSession?.isActive
    || propertyEditSession?.isActive || propertyCreationSessionE1?.active
    || propertySplitE2?.active || propertyMergeE3?.active
  ),
  historyMove: direction => d01MoveHistory(direction),
  historyCan: direction => Boolean(!d01DraftBlocked()&&acceptedHistoryD01.can(direction,project)),
  commit: city => {
    project = { ...project, city };
    updateDetails(); workspaceShell.refresh(); requestDraw();
  },
  changed: workspaceChanged
});
identityWorkspace.bind();
const desktopEditLayout = new DesktopEditLayout({
  viewport, divider: $('desktopEditDivider'), dockDivider: $('desktopImpactDivider'), onLayout: resize,
});
desktopPlaceEditor = new DesktopPlaceEditor({
  getElement: $, layout: desktopEditLayout,
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
    if (panelId === 'buildingStructurePanel' && buildingPlacementSession.operation === 'replace')
      return 'Replace building';
    return fallback;
  },
});
roadWorkspace = new RoadInspectionWorkspace({
  getElement:$,getProject:()=>project,camera,shell:workspaceShell,capture:captureWorkspace,
  desktopLayout: desktopEditLayout,
  desktopEntry: () => desktopWorkspace?.roadEntry(),
  reconcile:prepareJunctionReflowC7,reconcileRoad:prepareRoadReconciliationB1,
  computeJunctionAsync:createJunctionPreviewWorkerP1(),
  getRevision:()=>files?.revision??0,applyEdit:applyRoadEditB4,
  canEnter:()=>!project?.city?'Generate a city before inspecting roads.':
    workspaceShell.state.section!=='city'||editor.mode!=='pan'||buildingEditSession?.isActive
      ||propertyEditSession?.isActive||propertyCreationSessionE1?.active||propertySplitE2?.active||propertyMergeE3?.active||buildingPlacementSession?.isActive||identityWorkspace?.hasPending()
      ?'Finish or cancel the current edit, then choose Pan in City to inspect roads.':'',
  beforeEnter:()=>{workspaceMenus.close();clearMapHover();},
  draw:()=>{$('zoomValue').textContent=`${Math.round(camera.zoom*100)}%`;updateMapIndicators();updateUndoFeedback();syncPropertyDeletionControls4A();requestDraw();},
  afterExit:()=>{updateMapIndicators();updateUndoFeedback();syncPropertyDeletionControls4A();}
});

function applyRoadEditB4(session,baselineRevision){
  const previous=project,revision=files?.revision??0;
  if(!previous||!session?.current())
    return {ok:false,message:'The road preview is stale. Reopen it before Apply.'};
  const workspace = captureWorkspace().workspace;
  const draftRevision = session.revision;
  const junctionId = session.selection?.id;
  const commit = receipt => {
    if (!receipt.ok) return {ok:false,message:receipt.issues?.[0]?.message??'Road Apply blocked.'};
    if (project !== previous || revision !== (files?.revision ?? 0) || !session.current() ||
        session.revision !== draftRevision || session.settledRevision !== draftRevision)
      return {ok:false,message:'Accepted project or preview changed during Apply.'};
    return commitRoadEditB4(previous, revision, receipt, junctionId);
  };
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
  if (workspace.districtEditor) districtPanel.editor.load(workspace.districtEditor);
  districtPanel.refresh();
}

function commitRoadEditB4(previous, revision, { candidate, workspace }, junctionId) {
  // Exit only transient UI state before accepted data is replaced. No file or
  // history writes occur until the candidate passes the entire B4 gate.
  roadWorkspace.exit({restore:true,focus:roadWorkspace.usesDesktopPanel});
  if(project!==previous||revision!==(files?.revision??0))
    return {ok:false,message:'The accepted project changed before commit.'};
  if(!roadHistory.record(previous,candidate,junctionId))
    return {ok:false,message:'Nothing was changed.'};
  project=candidate; // one atomic accepted-state replacement
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
  $('statusMessage').textContent='Applied road '+junctionId+' and all validated neighborhood changes. Undo road is available.';
  $('roadHistoryStatusB4').textContent='Road '+junctionId+' applied. Undo restores the complete previous city.';
  return {ok:true};
}
function moveRoadHistoryB4(direction){
  if(!project || roadWorkspace?.active || propertyEditSession?.isActive ||
     buildingEditSession?.isActive || buildingPlacementSession?.isActive)return false;
  const receipt=roadHistory.prepare(project,captureWorkspace().workspace,direction);
  if(!receipt.ok){
    $('roadHistoryStatusB4').textContent=receipt.reason;
    syncRoadHistoryB4UI();
    return false;
  }
  project=receipt.candidate;
  roadHistory.accept(receipt.entry,direction);
  refreshRoadDistrictWorkspace(receipt.workspace);
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
  workspaceChanged();
  $('roadHistoryStatusB4').textContent=(direction==='undo'?'Undid':'Redid')+
    ' the complete road and neighborhood transaction.';
  return true;
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
  if(target==='property')return nudgePropertyCorner4C(propertyEditSession,axis,sign,step);
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
  if (confirmBuildingPreviewDiscard()) buildingEditSession.reset();
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
$('compoundNameInput').addEventListener('input',()=>{compoundName=$('compoundNameInput').value;});
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
    c01SyncPanel();requestDraw();
  });
}
$('compoundApply').addEventListener('click',c01ApplyTransform);
$('compoundReset').addEventListener('click',()=>{
  compoundTransform={dx:0,dy:0,angle:0,scaleX:1,scaleY:1};
  for(const [id,value] of [['compoundDx',0],['compoundDy',0],['compoundAngle',0],
       ['compoundScaleX',100],['compoundScaleY',100]])$(id).value=String(value);
  c01SyncPanel();requestDraw();
});
$('compoundCancel').addEventListener('click',()=>{
  compoundPanelPropertyId=null;compoundResult=null;compoundDrag=null;c01SyncPanel();requestDraw();
});
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
    project=receipt.candidate;
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
function movePropertyDeletion4A(direction) {
  if(!project||propertyEditSession?.isActive||buildingPlacementSession?.isActive||buildingEditSession?.isActive)return false;
  const receipt=propertyDeletionHistory4A.prepare(project,captureWorkspace().workspace,direction);
  if(!receipt.ok){$('statusMessage').textContent=receipt.reason;return false;}
  const id=receipt.entry.snapshot.propertyId;
  project=receipt.candidate;
  propertyDeletionHistory4A.accept(receipt.entry,direction);
  buildingHistory.clear();buildingStructureHistory.clear();propertyHistory.clear();
  identityWorkspace.reset();
  workspaceShell.select(direction==='undo'?{kind:'property',id}:null,{reveal:false});
  // Restoring selection can reopen the mobile Inspector over Redo Delete.
  // Keep map-level deletion history controls reachable after both directions.
  if(Number.isFinite(window.innerWidth)&&window.innerWidth<=900 && !workspaceShell.state.inspectorCollapsed)
    workspaceShell.dispatch({type:'inspector',collapsed:true});
  propertyWorkspace.refresh();buildingWorkspace.refresh();
  updateDetails();workspaceShell.refresh();requestDraw();workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Restored ':'Deleted again: ')+id+
    ' (property, plots and buildings).';
  return true;
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
  const session=propertyEditSession;
  if(!project||!session?.isActive||!session.isPending||session.drag
    ||workspaceShell?.state.selection?.kind!=='property'
    ||workspaceShell.state.selection.id!==session.propertyId)return false;
  const before=project,propertyId=session.propertyId;
  const received=preparePropertyApply3I(before,captureWorkspace().workspace,session);
  if(!received.ok) {
    session.validation=received;
    $('statusMessage').textContent='Property Apply blocked: '+(received.issues[0]?.message??'Invalid geometry.');
    syncPropertyEditUI3I();requestDraw();return false;
  }
  if(project!==before||session.propertyId!==propertyId)return false;
  if(!propertyHistory.record(before,received.candidate,propertyId))return false;
  project=received.candidate;
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
$('propertyEditReset3I').addEventListener('click',()=>propertyEditSession?.reset());
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
function movePropertyHistory3I(direction){
  const session=propertyEditSession;
  if(!project||!session?.isActive||session.isPending||session.drag)return false;
  const id=session.propertyId;
  const receipt=propertyHistory.prepare(project,captureWorkspace().workspace,id,direction);
  if(!receipt.ok){
    $('statusMessage').textContent=receipt.reason;return false;
  }
  project=receipt.candidate;
  propertyHistory.accept(receipt.entry,direction);
  propertyDeletionHistory4A.clear();
  session.start(project.city,id);
  updateDetails();workspaceShell.refresh();keepPropertyEditorVisible3I();requestDraw();workspaceChanged();
  $('statusMessage').textContent=(direction==='undo'?'Undid':'Redid')+' property and plot edit for '+id+'.';
  return true;
}
$('propertyHistoryUndo3I').addEventListener('click',()=>d01MoveHistory('undo'));
$('propertyHistoryRedo3I').addEventListener('click',()=>d01MoveHistory('redo'));
for(const [id,axis] of [['propertyCornerX3I','x'],['propertyCornerY3I','y']])
  $(id).addEventListener('change',()=>{
    const session=propertyEditSession;
    if(!session?.isActive||session.selectedCorner===null)return;
    const value=Number($(id).value);
    if($(id).value===''||!Number.isFinite(value)){syncPropertyEditUI3I();return;}
    session.setCorner(session.selectedCorner,{...session.boundary[session.selectedCorner],[axis]:value});
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

const mapPanEditor = { mode: 'pan', down() {}, move() {}, up() {}, addPoint() {} };
// An editor cannot receive map input unless its section is visible.
// Even corrupted/older saved modes cannot activate hidden draft tools.
const activeMapEditor = () => desktopWorkspace?.mapPreview() ? mapPanEditor : workspaceShell.state.section === 'landscape'
  ? (terrainPanel.editor.mode !== 'pan' ? terrainPanel.editor : waterPanel.editor.mode !== 'pan' ? waterPanel.editor : mapPanEditor)
  : workspaceShell.state.section === 'city' ? editor : mapPanEditor;
const runMapEdit = (method, args) => {
  const active = activeMapEditor();
  return active === waterPanel.editor ? waterPanel.run(() => active[method](...args)) : active === terrainPanel.editor ? terrainPanel.run(() => active[method](...args)) : active[method](...args);
};
const mapEditor = {
  get mode() {
    return activeMapEditor().mode;
  },
  down: (...args) => runMapEdit('down', args),
  move: (...args) => runMapEdit('move', args),
  up: (...args) => (workspaceShell.state.section === 'landscape' && terrainPanel.editor.dragging ? terrainPanel.editor
    : workspaceShell.state.section === 'landscape' && waterPanel.editor.dragging ? waterPanel.editor : activeMapEditor()).up(...args),
  addPoint: (...args) => activeMapEditor().addPoint(...args)
};

bindCanvasInteraction($('roadComparisonProposed'), camera, requestDraw, updateViewport, mapPanEditor);
bindCanvasInteraction(canvas, camera, requestDraw, updateViewport, mapEditor, point => {
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
    if (roadWorkspace.session.mergeMode) return; // Two-click selection is owned by pointer begin/end.
    const hit=roadWorkspace.session.hit(point,camera.zoom);
    if(hit)roadWorkspace.session.select(hit);
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
    const property=buildingPlacementSession.property(project?.city);
    if(property && pointInPolygon(point,property.boundary)) {
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
    const group=c01SelectedGroup();
    if(group&&!buildingEditSession?.isActive&&!buildingPlacementSession?.isActive&&
        !propertyEditSession?.isActive&&!propertyMergeE3?.active&&!propertySplitE2?.active&&
        project?.city.buildings.some(b=>group.memberBuildingIds.includes(b.id)&&
          pointInPolygon(point,b.footprint))) {
      compoundDrag={start:{...point},transform:{...compoundTransform}};
      return true;
    }
    if(propertyMergeE3?.active)return false;
    if(propertySplitE2?.active)return propertySplitE2.begin(point,zoom);
    if(propertyCreationSessionE1?.active){
      const draft=propertyCreationSessionE1.draft;
      const outline=propertyCreationSessionE1.preview(project.city);
      if(!draft||!outline||!pointInPolygon(point,outline))return false;
      const edge=propertyFrontagesE1(project.city,draft.blockId).find(x=>x.roadId===draft.roadId);
      if(!edge)return false;
      const u=(point.x-edge.frame.origin.x)*edge.frame.tangent.x+
        (point.y-edge.frame.origin.y)*edge.frame.tangent.y;
      propertyCreationSessionE1.drag={startU:u,originalU:draft.u};return true;
    }
    if(roadWorkspace?.active)return !roadWorkspace.comparisonOpen && roadWorkspace.session.begin(point,zoom,event?.pointerType);
    if(propertyEditSession?.flexibleMode){
      const f=propertyEditSession.flexible;
      for(const which of ['A','B']){
        const p=plot027EndpointPosition(f,which);
        if(p&&Math.hypot(point.x-p.x,point.y-p.y)<12/Math.max(.18,zoom)){
          propertyEditSession.drag={kind:'plot027',which,original:{edgeA:f.edgeA,edgeB:f.edgeB,
            ratioA:f.ratioA,ratioB:f.ratioB}};
          propertyEditSession.updateFlexible({endpoint:which});
          return true;
        }
      }
      return false;
    }
    if(propertyEditSession?.isActive){
      const index=propertyEditSession.hitCorner(project?.city,point,zoom);
      if(index===null)return false;
      propertyEditSession.drag={index,original:{...propertyEditSession.boundary[index]}};
      propertyEditSession.selectCorner(index);
      return true;
    }
    if(buildingPlacementSession?.isActive){
      const polygon=buildingPlacementSession.previewFor(project?.city)?.footprint;
      if(polygon?.length && pointInPolygon(point,polygon)){
        const property=buildingPlacementSession.property(project.city);
        buildingPlacementSession.drag={start:buildingLocalPoint3H(property,point),spec:{...buildingPlacementSession.spec}};
        return true;
      }
      return false;
    }
    return Boolean(buildingEditSession?.isActive && buildingEditSession.beginGesture(project?.city,layers,point,zoom,event?.pointerType));
  },
  move: (point,event) => {
    if(compoundDrag){
      compoundTransform.dx=compoundDrag.transform.dx+point.x-compoundDrag.start.x;
      compoundTransform.dy=compoundDrag.transform.dy+point.y-compoundDrag.start.y;
      $('compoundDx').value=String(Number(compoundTransform.dx.toFixed(4)));
      $('compoundDy').value=String(Number(compoundTransform.dy.toFixed(4)));
      c01SyncPanel();requestDraw();return;
    }
    if(propertyMergeE3?.active)return;
    if(propertySplitE2?.session.drag){propertySplitE2.move(point);return;}
    if(propertyCreationSessionE1?.drag){
      const state=propertyCreationSessionE1,draft=state.draft;
      const edge=propertyFrontagesE1(project.city,draft.blockId).find(x=>x.roadId===draft.roadId);
      if(edge){
        const u=(point.x-edge.frame.origin.x)*edge.frame.tangent.x+
          (point.y-edge.frame.origin.y)*edge.frame.tangent.y;
        state.update({u:state.drag.originalU+u-state.drag.startU});
      }
      return;
    }
    if(roadWorkspace?.active){roadWorkspace.session.move(point,event);return;}
    if(propertyEditSession?.drag?.kind==='plot027'){
      const f=propertyEditSession.flexible,near=plot027NearestEdge(f,point,camera.zoom);
      if(near){
        const which=propertyEditSession.drag.which;
        propertyEditSession.updateFlexible({[which==='A'?'edgeA':'edgeB']:near.edge,
          [which==='A'?'ratioA':'ratioB']:near.ratio});
      }
    }else if(propertyEditSession?.drag){
      propertyEditSession.setCorner(propertyEditSession.drag.index,point);
    }else if(buildingPlacementSession?.drag){
      const property=buildingPlacementSession.property(project.city);
      const now=buildingLocalPoint3H(property,point),drag=buildingPlacementSession.drag;
      if(now && drag.start)buildingPlacementSession.update({
        u:drag.spec.u+now.u-drag.start.u,v:drag.spec.v+now.v-drag.start.v
      });
    }else buildingEditSession?.moveGesture(point);
  },
  end: (cancelled,event) => {
    if(compoundDrag){
      if(cancelled)compoundTransform={...compoundDrag.transform};
      compoundDrag=null;
      $('compoundDx').value=String(Number(compoundTransform.dx.toFixed(4)));
      $('compoundDy').value=String(Number(compoundTransform.dy.toFixed(4)));
      c01SyncPanel();requestDraw();return;
    }
    if(propertySplitE2?.session.drag){propertySplitE2.end(cancelled);return;}
    if(propertyCreationSessionE1?.drag){
      const state=propertyCreationSessionE1,drag=state.drag;state.drag=null;
      if(cancelled)state.update({u:drag.originalU});
      syncPropertyCreationE1();return;
    }
    if(roadWorkspace?.active){roadWorkspace.session.end(cancelled,event);return;}
    if(propertyEditSession?.drag){
      const drag=propertyEditSession.drag;
      propertyEditSession.drag=null;
      if(cancelled){
        if(drag.kind==='plot027')propertyEditSession.updateFlexible(drag.original);
        else propertyEditSession.setCorner(drag.index,drag.original);
      }
      syncPropertyEditUI3I();
    }else if(buildingPlacementSession?.drag){
      const drag=buildingPlacementSession.drag;
      buildingPlacementSession.drag=null;
      if(cancelled)buildingPlacementSession.update(drag.spec);
      syncBuildingStructureUI3H();
    }else buildingEditSession?.endGesture(cancelled);
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
  project = next;
  acceptedHistoryD01.clear(project,'Opening or recovering a project cleared session history.');
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
  getElement: $, layout: desktopEditLayout, shell: workspaceShell, road: roadWorkspace,
  landscape: landscapeWorkspace,
  leaveTools: () => {
    if (!exitPropertyEditing3I() || !exitBuildingEditing() || !exitStructurePlacement3H()) return false;
    stopWorkspaceTools();
    return true;
  },
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
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    files.saveDownload();
  }
});

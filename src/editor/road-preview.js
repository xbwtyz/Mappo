import { editableRoadPath, ROAD_BEND_LIMIT } from '../core/road-shape.js';
import { prepareRoadTopologyReflowC3 } from '../core/road-topology-reflow.js';
import { prepareNeighborhoodReflowC3 } from '../core/neighborhood-reflow.js';
import { buildRoadGraph, proposeJunctionMove } from '../core/road-graph.js';
import { analyzeRoadImpact } from '../core/road-impact.js';
import { hitRoadInspection, roadInspectionDetails } from '../core/road-inspection.js';
import { prepareRoadIntentC1 } from '../core/road-intent-c1.js';
import { distanceToSegment } from '../core/boundary.js';
import { findEligibleJunctionTarget } from '../core/junction-targeting.js';
import { makeSelectionSetA1, selectionSingletonA1, selectionTransitionA1, sameSelectionRefA1 } from '../core/workspace-state.js';

// No commit, history or serialization interface. Revisions invalidate every
// deferred callback, including callbacks already queued when cancellation occurs.
export class RoadPreviewSession {
  constructor({
    getProject,
    changed = () => {},
    schedule = (fn, ms) => setTimeout(fn, ms),
    unschedule = (id) => clearTimeout(id),
    analyze = analyzeRoadImpact,
    reconcile = null,
    reconcileRoad = null,
    computeJunctionAsync = null,
    selectionAuthority = null,
  }) {
    Object.assign(this, { getProject, changed, schedule, unschedule, analyze, reconcile, reconcileRoad, computeJunctionAsync });
    this.selectionAuthority = selectionAuthority;
    this.localSelectionA1 = makeSelectionSetA1();
    this.active = false;
    this.snapEnabled = true;
    this.revision = 0;
    this.previewVisible = true;
    this.focusKey = null;
    this.recoveryFocusD3 = null;
  }
  get selectionSet() {
    return this.selectionAuthority?.read() ?? this.localSelectionA1;
  }
  set selectionSet(set) {
    if(this.selectionAuthority)this.selectionAuthority.write(set);
    else this.localSelectionA1=set;
  }
  get selection() { return selectionSingletonA1(this.selectionSet); }
  set selection(ref) { this.selectionSet=makeSelectionSetA1(ref?[ref]:[]); }
  get selectionDraftLockedA1() {
    return Boolean(this.pending || this.checking || this.drag || this.mergeMode || this.bendEditor ||
      this.roadIntentInputError || this.error);
  }
  requestSelectionA1(ref,{toggle=false}={}) {
    if(!this.current())return false;
    if(!toggle && this.selection && sameSelectionRefA1(this.selection,ref))return true;
    if(this.selectionDraftLockedA1){
      this.selectionNoticeA1='Finish or reset the road draft before changing selection.';
      this.changed();return false;
    }
    const result=selectionTransitionA1(this.selectionSet,{type:toggle?'toggle':'replace',ref},{
      canGroup:kind=>kind==='road',
      exists:item=>item.kind==='road'?this.graph.roadsById.has(item.id):
        item.kind==='junction'&&this.graph.nodesById.has(item.id)
    });
    if(!result.ok){this.selectionNoticeA1=result.reason;this.changed();return false;}
    this.selectionSet=result.selection;this.reset();return true;
  }
  start() {
    this.stop();
    this.project = this.getProject();
    if (!this.project?.city) return false;
    this.city = this.project.city;
    this.graph = buildRoadGraph(this.city);
    this.active = true;
    const id =
      [...this.graph.nodesById.keys()].find(
        (id) => roadInspectionDetails(this.graph, { kind: 'junction', id }).movable,
      ) ?? this.graph.nodesById.keys().next().value;
    this.select(id ? { kind: 'junction', id } : null);
    return true;
  }
  current() {
    return this.active && this.getProject() === this.project && this.getProject()?.city === this.city;
  }
  invalidate() {
    this.revision++;
    this.recoveryFocusD3 = null;
    this.workerPreviewGeometry = null;
    if (this.timer !== undefined) this.unschedule(this.timer);
    this.timer = undefined;
    // Cancel the actual old worker calculation, not just its UI callback.
    // Ordinary street/bend edits and drag movement also invalidate a pending
    // junction preview, so no stale calculation remains queued.
    this.computeJunctionAsync?.cancel?.();
  }
  stop() {
    this.invalidate();
    // Release the idle worker while the road editor is closed. The controller
    // will create a clean worker on the next preview.
    this.computeJunctionAsync?.suspend?.();
    this.active = false;
    this.selection = this.point = this.proposal = this.report = this.drag = null;
    this.mergeMode = false;
    this.mergeSourceId = this.mergeTargetId = this.mergeHoverId = null;
    this.targetJunctionId = this.snapTargetId = null;
    this.reconciliation = this.topology = this.previewGeometry = null;
    this.buildingDecisions = new Map();
    this.ownershipChoices = new Map();
    this.parcelChoices = new Map();
    this.ownershipFocusKey023 = null;
    this.roadConnectionEdit = null;
    this.bendEditor = null;
    this.roadIntentOffset = null;
    this.roadIntentAnalysis = null;
    this.roadIntentInputError = '';
    this.reconciliationError = '';
    this.settledRevision = null;
    this.acceptedFingerprint = null;
    this.focusKey = null;
    this.checking = false;
    this.error = '';
    this.project = this.city = this.graph = null;
  }
  get details() {
    return this.active ? roadInspectionDetails(this.graph, this.selection) : null;
  }
  get hasApplyCandidate() {
    return Boolean(this.reconciliation?.candidateJson || this.reconciliation?.candidateProject);
  }
  get pending() {
    const d = this.details;
    if(d?.kind==='road')
      return Boolean(this.roadConnectionEdit || (this.roadIntentOffset &&
        (this.roadIntentOffset.x!==0 || this.roadIntentOffset.y!==0)));
    return Boolean(
      d?.kind === 'junction' && this.point && (this.point.x !== d.record.x || this.point.y !== d.record.y),
    );
  }
  get roadIntentEligible(){
    const d=this.details;
    return Boolean(this.current() && this.graph?.valid && d?.kind==='road' &&
      d.endpoints.every(id=>this.graph.incidentRoads.get(id).every(roadId=>
        !this.graph.roadClasses.get(roadId)?.protected)));
  }
  get roadIntentNodes(){
    if(!this.roadIntentEligible || !this.roadIntentOffset || this.roadConnectionEdit)return null;
    const d=this.details,coords=new Map();
    for(const id of d.endpoints){
      const accepted=this.graph.nodesById.get(id);
      coords.set(id,{id,x:accepted.x+this.roadIntentOffset.x,
        y:accepted.y+this.roadIntentOffset.y});
    }
    return coords;
  }
  updateRoadIntent(offset,{defer=true,dragging=false}={}){
    if(!this.roadIntentEligible)return false;
    this.invalidate();
    this.buildingDecisions = new Map();
    this.ownershipChoices = new Map();
    this.parcelChoices = new Map();
    this.ownershipFocusKey023 = null;
    this.roadConnectionEdit = null;
    this.bendEditor = null;
    // Never present NaN, Infinity or a blank field as a real road draft.
    // Drop the previous preview, rather than keeping an outdated ghost while
    // displaying a new invalid displacement in the input.
    const finite=offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) &&
      Math.abs(offset.x)<=100000 && Math.abs(offset.y)<=100000;
    this.roadIntentOffset=finite ? {x:offset.x,y:offset.y} : null;
    this.roadIntentInputError=finite?'':'Enter finite X/Y street offsets within ±100000.';
    this.roadIntentAnalysis=null;
    this.report=this.proposal=null;
    this.reconciliation=this.topology=this.previewGeometry=null;
    this.settledRevision=null;this.acceptedFingerprint=null;
    this.reconciliationError='';this.error='';
    this.checking=Boolean(finite && this.pending && !dragging);
    this.changed();
    if(!finite)return false;
    if(!this.pending || dragging)return true;
    this.evaluateRoadDraft(defer);
    return true;
  }
  startBendEditor() {
    if (!this.roadIntentEligible || this.drag) return false;
    const path = editableRoadPath(this.graph, this.selection.id);
    if (!path) return false;
    this.reset();
    const original = path.points.slice(1,-1).map(({id,x,y})=>({id,x,y}));
    this.bendEditor = { path, original, points:original, selected:original.length ? 0 : -1,
      insertAt:path.segments.indexOf(this.selection.id) };
    this.changed();
    return true;
  }
  get bendPathPoints() {
    const state = this.bendEditor;
    return state ? [state.path.points[0],...state.points,state.path.points.at(-1)] : null;
  }
  selectBend(index) {
    if (!this.bendEditor?.points[index]) return;
    this.bendEditor.selected = index;
    this.changed();
  }
  insertBend() {
    const state = this.bendEditor;
    if (!state || state.points.length >= ROAD_BEND_LIMIT || this.drag) return false;
    const index = Math.min(state.points.length, state.selected >= 0 ? state.selected+1 : state.insertAt);
    const [a,b] = this.bendPathPoints.slice(index,index+2);
    const points = [...state.points];
    points.splice(index,0,{id:null,x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    state.selected = index;
    return this.updateBends(points);
  }
  removeBend() {
    const state = this.bendEditor;
    if (!state?.points[state.selected] || this.drag) return false;
    const points = state.points.filter((_,index)=>index!==state.selected);
    state.selected = Math.min(state.selected,points.length-1);
    return this.updateBends(points);
  }
  moveBend(point, dragging = false) {
    const state = this.bendEditor;
    if (!state?.points[state.selected]) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      this.invalidate();
      this.reconciliation = this.previewGeometry = null;
      this.roadIntentInputError = 'Enter finite bend coordinates.';
      this.checking = false;
      this.changed();
      return false;
    }
    const points = state.points.map((old,index)=>index === state.selected ? {...old,x:point.x,y:point.y} : old);
    return this.updateBends(points,dragging);
  }
  updateBends(points, dragging = false) {
    this.invalidate();
    this.buildingDecisions.clear();
    this.ownershipChoices.clear();
    this.parcelChoices.clear();
    this.ownershipFocusKey023 = null;
    const state = this.bendEditor;
    state.points = points;
    this.roadIntentInputError = this.error = '';
    this.roadIntentAnalysis = this.reconciliation = this.previewGeometry = null;
    this.settledRevision = this.acceptedFingerprint = null;
    const original = state.original;
    const changed = points.length !== original.length ||
      points.some((point,index)=>point.id !== original[index].id || point.x !== original[index].x || point.y !== original[index].y);
    this.roadConnectionEdit = changed ? {kind:'shape',points} : null;
    this.checking = changed && !dragging;
    this.changed();
    if (this.checking) this.evaluateRoadDraft(true);
    return true;
  }
  previewRoadConnection(edit) {
    if (!this.roadIntentEligible || this.drag) return false;
    this.reset();
    this.roadConnectionEdit = { ...edit };
    this.checking = true;
    this.changed();
    this.evaluateRoadDraft(true);
    return true;
  }
  decideOwnership(candidateKey,field,value) {
    if(!this.current() || !this.pending || this.drag || this.checking ||
       this.settledRevision !== this.revision || !['districtId','usage'].includes(field))
      return false;
    const row=this.reconciliation?.ownershipReview?.find(r=>r.candidateKey===candidateKey);
    const eligible=field==='districtId' ? row?.eligibleDistrictIds : row?.eligibleUsages;
    if(!row || !row.choiceRequired[field==='districtId'?'district':'usage'] ||
       !eligible?.includes(value)) return false;
    this.invalidate();
    this.ownershipChoices.set(candidateKey,{...(this.ownershipChoices.get(candidateKey)??{}),[field]:value});
    this.checking=true;
    this.changed();
    if(this.selection.kind==='junction')this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  decideParcel(id,choice) {
    if(!this.current()||!this.pending||this.drag||this.checking ||
       this.settledRevision!==this.revision)return false;
    const row=this.reconciliation?.parcelReview?.find(p=>p.id===id);
    const allowed=row?.options?.some(o=>o.kind===choice?.kind && (o.targetId??null)===(choice.targetId??null));
    if(!allowed && !(this.parcelChoices.has(id) &&
       this.reconciliation?.unresolved.some(p=>p.kind==='property'&&p.id===id)))return false;
    this.invalidate();
    this.parcelChoices.set(id,{kind:choice.kind,targetId:choice.targetId??null});
    this.checking=true;this.changed();
    if(this.selection.kind==='junction')this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  clearParcelDecision(id) {
    if(!this.current()||!this.pending||this.drag||this.checking||!this.parcelChoices.has(id))return false;
    this.invalidate();this.parcelChoices.delete(id);
    this.checking=true;this.changed();
    if(this.selection.kind==='junction')this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  decideBuilding(id,choice) {
    if (!this.current() || this.drag || this.checking || !this.pending ||
        !(this.buildingDecisions.has(id) ||
          this.reconciliation?.unresolved.some(row=>row.kind==='building' && row.id===id &&
            ['building-decision-required','building-placement-blocked'].includes(row.code)))) return false;
    this.invalidate();
    this.buildingDecisions.set(id,{...choice});
    this.checking = true;
    this.changed();
    if (this.selection.kind==='junction') this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  clearBuildingDecision(id) {
    if (!this.current() || !this.pending || this.drag || this.checking || !this.buildingDecisions.has(id))
      return false;
    this.invalidate();
    this.buildingDecisions.delete(id);
    this.checking = true;
    this.changed();
    if (this.selection.kind === 'junction') this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  clearBuildingDecisions() {
    if (!this.current() || this.checking || !this.buildingDecisions.size || !this.pending || this.drag) return false;
    this.invalidate();
    this.buildingDecisions.clear();
    this.checking = true;
    this.changed();
    if (this.selection.kind==='junction') this.evaluateJunctionDraft(true);
    else this.evaluateRoadDraft(true);
    return true;
  }
  evaluateRoadDraft(defer) {
    const revision = this.revision;
    const run = () => {
      if (!this.current() || revision !== this.revision) return;
      this.timer = undefined;
      try {
        if (this.roadConnectionEdit) {
          this.reconciliation = prepareRoadTopologyReflowC3(this.project, this.selection.id, null,
            this.roadConnectionEdit,this.buildingDecisions,{ownershipChoices:this.ownershipChoices,parcelChoices:this.parcelChoices});
        } else {
          this.roadIntentAnalysis = prepareRoadIntentC1(this.project, this.selection.id, this.roadIntentOffset);
          this.reconciliation = prepareNeighborhoodReflowC3(
            this.project, this.selection.id, this.roadIntentOffset, this.roadIntentAnalysis,
            this.buildingDecisions,{ownershipChoices:this.ownershipChoices,parcelChoices:this.parcelChoices});
        }
        this.settledRevision = revision;
        this.acceptedFingerprint = JSON.stringify(this.project);
      } catch (error) {
        this.error = 'Road adaptation preview unavailable: ' + error.message;
      }
      this.checking = false;
      this.changed();
    };
    if (defer) this.timer = this.schedule(run, 180);
    else run();
  }
  select(selection) {
    this.invalidate();
    this.selection = selection ? { ...selection } : null;
    this.reset();
  }
  reset() {
    this.selectionNoticeA1='';
    this.invalidate();
    const d = this.details;
    this.point = d?.kind === 'junction' ? { x: d.record.x, y: d.record.y } : null;
    this.targetJunctionId = this.snapTargetId = null;
    this.mergeMode = false;
    this.mergeSourceId = this.mergeTargetId = this.mergeHoverId = null;
    this.buildingDecisions = new Map();
    this.ownershipChoices = new Map();
    this.parcelChoices = new Map();
    this.ownershipFocusKey023 = null;
    this.roadConnectionEdit = null;
    this.bendEditor = null;
    this.roadIntentOffset = d?.kind === 'road' ? {x:0,y:0} : null;
    this.roadIntentAnalysis = null;
    this.roadIntentInputError = '';
    this.proposal = this.report = this.drag = null;
    this.reconciliation = this.topology = this.previewGeometry = null;
    this.reconciliationError = '';
    this.settledRevision = null;
    this.acceptedFingerprint = null;
    this.focusKey = null;
    this.checking = false;
    this.error = '';
    this.changed();
  }
  update(point, { defer = true, dragging = false, targetId = null } = {}) {
    if (!this.current() || !this.details?.movable) return false;
    this.invalidate();
    this.buildingDecisions.clear();
    this.ownershipChoices.clear();
    this.parcelChoices.clear();
    this.ownershipFocusKey023 = null;
    this.point = { x: point.x, y: point.y };
    this.targetJunctionId = targetId;
    this.snapTargetId = targetId;
    if (!targetId) this.mergeTargetId = null;
    this.report = this.proposal = null;
    this.reconciliation = this.topology = this.previewGeometry = null;
    this.reconciliationError = '';
    this.settledRevision = null;
    this.acceptedFingerprint = null;
    this.focusKey = null;
    this.error = '';
    this.checking = this.pending;
    this.changed();
    if (this.checking && !dragging) this.evaluateJunctionDraft(defer);
    return true;
  }

  evaluateJunctionDraft(defer) {
    const revision = this.revision;
    const run = () => {
      if (!this.current() || revision !== this.revision) return;
      this.timer = undefined;
      if (this.computeJunctionAsync && this.reconcile) {
        // The accepted snapshot, selection and revision are immutable inputs
        // to this worker request. No result is allowed to authorize Apply
        // after another edit, project replacement or in-place project change.
        const project = this.project, fingerprint = JSON.stringify(project);
        const input = {
          projectJson: fingerprint, junctionId: this.selection.id, point: { ...this.point },
          targetJunctionId: this.targetJunctionId,
          decisions: [...this.buildingDecisions].map(([id, choice]) => [id, { ...choice }]),
          ownershipChoices: [...this.ownershipChoices].map(([key, choice])=>[key,{...choice}]),
          parcelChoices: [...this.parcelChoices].map(([key,choice])=>[key,{...choice}]),
        };
        const current = () => this.current() && revision === this.revision;
        const settle = () => {
          if (!current()) return;
          this.checking = false;
          this.changed();
        };
        Promise.resolve().then(() => {
          // Invalidation can happen before the first queued microtask.
          // Never enqueue a worker request for a superseded revision.
          if (!current()) return null;
          return this.computeJunctionAsync(input);
        }).then(result => {
          if (!current() || result === null) return;
          if (fingerprint !== JSON.stringify(project)) {
            this.error = 'Accepted project changed during background preview. Start a new draft.';
            settle();
            return;
          }
          this.proposal = result.proposal;
          this.report = result.report;
          this.reconciliation = result.reconciliation;
          this.topology = result.topology ?? null;
          this.workerPreviewGeometry = result.previewGeometry ?? null;
          this.reconciliationError = result.reconciliationError ?? '';
          if (this.reconciliation && !this.reconciliationError) {
            this.settledRevision = revision;
            this.acceptedFingerprint = fingerprint;
          }
          settle();
        }).catch(error => {
          if (!current()) return;
          this.error = error.message?.startsWith('Report unavailable:')
            ? error.message : 'Report unavailable: ' + error.message;
          settle();
        });
        return;
      }
      try {
        this.proposal = proposeJunctionMove(this.city, this.selection.id, this.point);
        this.report = this.analyze(this.project, this.proposal);
        if(this.reconcile){
          try {
            this.reconciliation = this.reconcile(this.project, this.selection.id, this.point,this.buildingDecisions,
              {targetJunctionId: this.targetJunctionId,ownershipChoices:this.ownershipChoices,parcelChoices:this.parcelChoices});
            this.settledRevision = revision;
            this.acceptedFingerprint = JSON.stringify(this.project);
            if(!this.reconciliation.candidateProject && this.reconcileRoad && this.proposal.graphValid)
              this.topology = this.reconcileRoad(this.project, this.selection.id, this.point);
          } catch(error) {
            this.reconciliationError = 'Adaptation preview unavailable: '+error.message;
          }
        }
      } catch (error) {
        this.error = 'Report unavailable: ' + error.message;
      }
      this.checking = false;
      this.changed();
    };
    if (defer) this.timer = this.schedule(run, 180);
    else run();
    return true;
  }
  nudge(dx, dy) {
    if (this.bendEditor) {
      const point = this.bendEditor.points[this.bendEditor.selected];
      return point ? this.moveBend({x:point.x+dx,y:point.y+dy}) : false;
    }
    if(this.details?.kind==='road'){
      const offset=this.roadIntentOffset??{x:0,y:0};
      return this.updateRoadIntent({x:offset.x+dx,y:offset.y+dy});
    }
    return this.point && this.update({ x: this.point.x + dx, y: this.point.y + dy });
  }
  setSnapEnabled(enabled) {
    this.snapEnabled = Boolean(enabled);
    if (!this.snapEnabled && this.snapTargetId && !this.drag) this.snapTargetId = null;
    this.changed();
  }
  startMergeMode() {
    if (!this.current() || this.drag) return false;
    this.reset();
    this.mergeMode = true;
    this.changed();
    return true;
  }
  cancelMergeMode() {
    if (!this.mergeMode) return false;
    this.reset();
    return true;
  }
  mergeHit(point, zoom, pointerType = 'mouse') {
    if (!this.current() || !Number.isFinite(zoom) || zoom <= 0) return null;
    const hit = hitRoadInspection(this.graph,point,zoom,pointerType);
    if (hit?.kind !== 'junction' || !roadInspectionDetails(this.graph,hit)?.movable) return null;
    return hit;
  }
  hoverMerge(point, zoom) {
    if (!this.mergeMode) return false;
    const id = point ? this.mergeHit(point,zoom)?.id ?? null : null;
    const next = id === this.mergeSourceId ? null : id;
    if (next === this.mergeHoverId) return false;
    this.mergeHoverId = next;
    this.changed();
    return true;
  }
  pickMerge(point,zoom,pointerType) {
    if (!this.mergeMode || !this.current()) return false;
    const hit = this.mergeHit(point,zoom,pointerType);
    if (!hit) return false;
    if (!this.mergeSourceId) {
      this.select(hit);
      this.mergeMode = true;
      this.mergeSourceId = hit.id;
      this.changed();
      return true;
    }
    if (hit.id === this.mergeSourceId) return false;
    const node = this.graph.nodesById.get(hit.id);
    // The selected target is a *specific accepted ID*, not a mere coordinate.
    this.mergeTargetId = hit.id;
    this.mergeHoverId = hit.id;
    this.update({x:node.x,y:node.y},{defer:false,targetId:hit.id});
    return true;
  }
  hit(point, zoom, pointerType) {
    // A displaced road should remain draggable at its *proposed* position.
    // The legacy hit test uses accepted nodes only; relying on it would make
    // subsequent drags unexpectedly select a different object or pan.
    if(this.current() && this.pending && this.details?.kind==='road' &&
      this.roadIntentNodes && Number.isFinite(zoom) && zoom>0){
      const road=this.details.record,nodes=this.roadIntentNodes;
      const a=nodes.get(road.a),b=nodes.get(road.b);
      const threshold=(pointerType==='touch'?22:7)/zoom;
      if(Number.isFinite(point?.x) && Number.isFinite(point?.y) &&
        distanceToSegment(point,a,b)<=threshold)
        return {kind:'road',id:road.id};
    }
    return this.current()
      ? hitRoadInspection(
          this.graph,
          point,
          zoom,
          pointerType,
          this.selection?.kind === 'junction' ? { id: this.selection.id, point: this.point } : null,
        )
      : null;
  }
  begin(point, zoom, pointerType) {
    if (this.mergeMode && this.current()) {
      this.drag = {kind:'merge-click',movable:true,start:{...point},last:{...point},
        travelPx:0,zoom,pointerType};
      return true;
    }
    if (this.bendEditor && !this.drag) {
      const radius = (pointerType === 'touch' ? 20 : 10) / zoom;
      const nearest = this.bendEditor.points.reduce((best,bend,index)=>{
        const distance = Math.hypot(bend.x-point.x,bend.y-point.y);
        return distance <= radius && (!best || distance < best.distance) ? {index,distance} : best;
      }, null);
      if (nearest) {
        const original = this.bendEditor.points;
        this.drag = {kind:'bend',movable:true,start:{...point},point:original[nearest.index],original};
        this.invalidate();
        this.selectBend(nearest.index);
        return true;
      }
    }
    const hit = this.hit(point, zoom, pointerType);
    if (!hit || this.selectionSet.items.length>1) return false;
    if (!sameSelectionRefA1(hit,this.selection)) {
      if(this.selectionDraftLockedA1)return false;
      this.select(hit);
    }
    this.drag = {
      point: this.point ? { ...this.point } : null,
      offset: {...(this.roadIntentOffset ?? {x:0,y:0})},
      kind: this.details.kind,
      start: { ...point },
      movable: this.details.movable || this.roadIntentEligible,
      zoom, snapTargetId:null, lastRaw:null, lastAlt:false,
    };
    this.invalidate();
    return true;
  }
  move(point, event = {}) {
    const drag = this.drag;
    if (drag?.kind === 'merge-click') {
      drag.last = {...point};
      drag.travelPx = Math.max(drag.travelPx,
        Math.hypot(point.x-drag.start.x,point.y-drag.start.y)*drag.zoom);
      return;
    }
    if (!drag?.movable) return;
    drag.last = {...point};
    if (drag.kind === 'bend') {
      const x = drag.point.x + point.x - drag.start.x, y = drag.point.y + point.y - drag.start.y;
      this.moveBend(this.snapBends ? {x:Math.round(x),y:Math.round(y)} : {x,y}, true);
    } else if (drag.kind === 'road') {
      this.updateRoadIntent({
        x:drag.offset.x+point.x-drag.start.x,
        y:drag.offset.y+point.y-drag.start.y,
      },{dragging:true});
    } else {
      const raw = {x:drag.point.x+point.x-drag.start.x,y:drag.point.y+point.y-drag.start.y};
      drag.lastRaw = raw;
      drag.lastAlt = Boolean(event?.altKey);
      const snap = this.snapEnabled && !drag.lastAlt
        ? findEligibleJunctionTarget(this.graph,this.selection.id,raw,drag.zoom,drag.snapTargetId)
        : null;
      drag.snapTargetId = snap?.id ?? null;
      this.update(snap ? {x:snap.x,y:snap.y} : raw,
        {dragging:true,targetId:drag.snapTargetId});
    }
  }
  end(cancelled, event = {}) {
    const drag = this.drag;
    if (drag?.kind === 'junction' && !cancelled && drag.lastRaw &&
        Boolean(event?.altKey) !== drag.lastAlt)
      this.move(drag.last,{altKey:Boolean(event?.altKey)});
    this.drag = null;
    if (!drag) return;
    if (drag.kind === 'merge-click') {
      if (!cancelled && drag.travelPx <= 4) this.pickMerge(drag.last,drag.zoom,drag.pointerType);
      return;
    }
    if (!drag.movable) return;
    if (drag.kind === 'bend')
      this.updateBends(cancelled ? drag.original : this.bendEditor.points);
    else if (drag.kind === 'road')
      this.updateRoadIntent(cancelled ? drag.offset : this.roadIntentOffset);
    else this.update(cancelled ? drag.point : this.point,
      {targetId:cancelled ? null : drag.snapTargetId});
  }
}

import { prepareNeighborhoodReflowC3 } from '../core/neighborhood-reflow.js';
import { buildRoadGraph, proposeJunctionMove } from '../core/road-graph.js';
import { analyzeRoadImpact } from '../core/road-impact.js';
import { hitRoadInspection, roadInspectionDetails } from '../core/road-inspection.js';
import { prepareRoadIntentC1 } from '../core/road-intent-c1.js';
import { distanceToSegment } from '../core/boundary.js';

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
  }) {
    Object.assign(this, { getProject, changed, schedule, unschedule, analyze, reconcile, reconcileRoad });
    this.active = false;
    this.revision = 0;
    this.previewVisible = true;
    this.focusKey = null;
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
    if (this.timer !== undefined) this.unschedule(this.timer);
    this.timer = undefined;
  }
  stop() {
    this.invalidate();
    this.active = false;
    this.selection = this.point = this.proposal = this.report = this.drag = null;
    this.reconciliation = this.topology = this.previewGeometry = null;
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
  get pending() {
    const d = this.details;
    if(d?.kind==='road')
      return Boolean(this.roadIntentOffset &&
        (this.roadIntentOffset.x!==0 || this.roadIntentOffset.y!==0));
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
    if(!this.roadIntentEligible || !this.roadIntentOffset)return null;
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
    const revision=this.revision;
    const run=()=>{
      if(!this.current() || revision!==this.revision)return;
      this.timer=undefined;
      try {
        this.roadIntentAnalysis = prepareRoadIntentC1(this.project, this.selection.id, this.roadIntentOffset);
        this.reconciliation = prepareNeighborhoodReflowC3(
          this.project, this.selection.id, this.roadIntentOffset, this.roadIntentAnalysis);
        this.settledRevision = revision;
        this.acceptedFingerprint = JSON.stringify(this.project);
      } catch (error) {
        this.error = 'Road adaptation preview unavailable: ' + error.message;
      }
      this.checking=false;this.changed();
    };
    if(defer)this.timer=this.schedule(run,180);
    else run();
    return true;
  }
  select(selection) {
    this.invalidate();
    this.selection = selection ? { ...selection } : null;
    this.reset();
  }
  reset() {
    this.invalidate();
    const d = this.details;
    this.point = d?.kind === 'junction' ? { x: d.record.x, y: d.record.y } : null;
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
  update(point, { defer = true, dragging = false } = {}) {
    if (!this.current() || !this.details?.movable) return false;
    this.invalidate();
    this.point = { x: point.x, y: point.y };
    this.report = this.proposal = null;
    this.reconciliation = this.topology = this.previewGeometry = null;
    this.reconciliationError = '';
    this.settledRevision = null;
    this.acceptedFingerprint = null;
    this.focusKey = null;
    this.error = '';
    this.checking = this.pending;
    this.changed();
    if (!this.pending || dragging) return true;
    const revision = this.revision;
    const run = () => {
      if (!this.current() || revision !== this.revision) return;
      this.timer = undefined;
      try {
        this.proposal = proposeJunctionMove(this.city, this.selection.id, this.point);
        this.report = this.analyze(this.project, this.proposal);
        if(this.reconcile){
          try {
            this.reconciliation = this.reconcile(this.project, this.selection.id, this.point);
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
    if(this.details?.kind==='road'){
      const offset=this.roadIntentOffset??{x:0,y:0};
      return this.updateRoadIntent({x:offset.x+dx,y:offset.y+dy});
    }
    return this.point && this.update({ x: this.point.x + dx, y: this.point.y + dy });
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
    const hit = this.hit(point, zoom, pointerType);
    if (!hit) return false;
    if (hit.kind !== this.selection?.kind || hit.id !== this.selection?.id) this.select(hit);
    this.drag = {
      point: this.point ? { ...this.point } : null,
      offset: this.roadIntentOffset ? {...this.roadIntentOffset} : null,
      kind: this.details.kind,
      start: { ...point },
      movable: this.details.movable || this.roadIntentEligible,
    };
    this.invalidate();
    return true;
  }
  move(point) {
    const drag = this.drag;
    if (!drag?.movable) return;
    if(drag.kind==='road'){
      this.updateRoadIntent({
        x:drag.offset.x+point.x-drag.start.x,
        y:drag.offset.y+point.y-drag.start.y,
      },{dragging:true});
    }else this.update(
      { x: drag.point.x + point.x - drag.start.x, y: drag.point.y + point.y - drag.start.y },
      { dragging: true },
    );
  }
  end(cancelled) {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.movable) return;
    if(drag.kind==='road')
      this.updateRoadIntent(cancelled?drag.offset:this.roadIntentOffset);
    else this.update(cancelled ? drag.point : this.point);
  }
}

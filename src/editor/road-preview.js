import { buildRoadGraph, proposeJunctionMove } from '../core/road-graph.js';
import { analyzeRoadImpact } from '../core/road-impact.js';
import { hitRoadInspection, roadInspectionDetails } from '../core/road-inspection.js';

// No commit, history or serialization interface. Revisions invalidate every
// deferred callback, including callbacks already queued when cancellation occurs.
export class RoadPreviewSession {
  constructor({
    getProject,
    changed = () => {},
    schedule = (fn, ms) => setTimeout(fn, ms),
    unschedule = (id) => clearTimeout(id),
    analyze = analyzeRoadImpact,
  }) {
    Object.assign(this, { getProject, changed, schedule, unschedule, analyze });
    this.active = false;
    this.revision = 0;
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
    this.checking = false;
    this.error = '';
    this.project = this.city = this.graph = null;
  }
  get details() {
    return this.active ? roadInspectionDetails(this.graph, this.selection) : null;
  }
  get pending() {
    const d = this.details;
    return Boolean(
      d?.kind === 'junction' && this.point && (this.point.x !== d.record.x || this.point.y !== d.record.y),
    );
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
    this.proposal = this.report = this.drag = null;
    this.checking = false;
    this.error = '';
    this.changed();
  }
  update(point, { defer = true, dragging = false } = {}) {
    if (!this.current() || !this.details?.movable) return false;
    this.invalidate();
    this.point = { x: point.x, y: point.y };
    this.report = this.proposal = null;
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
    return this.point && this.update({ x: this.point.x + dx, y: this.point.y + dy });
  }
  hit(point, zoom, pointerType) {
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
      start: { ...point },
      movable: this.details.movable,
    };
    this.invalidate();
    return true;
  }
  move(point) {
    const drag = this.drag;
    if (!drag?.movable) return;
    this.update(
      { x: drag.point.x + point.x - drag.start.x, y: drag.point.y + point.y - drag.start.y },
      { dragging: true },
    );
  }
  end(cancelled) {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.movable) return;
    this.update(cancelled ? drag.point : this.point);
  }
}

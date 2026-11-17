import {
  generateCoast
} from '../generators/coast.js';
import {
  waterAt,
  waterNearestT,
  waterDryState
} from '../core/water-geometry.js';
import {
  generateRiver
} from '../generators/water.js';
import {
  distanceToSegment
} from '../core/boundary.js';

export const WATER_HISTORY_LIMIT = 20;
export function waterCopy(value) {
  return JSON.parse(JSON.stringify(value));
}
export class WaterEditor {
  constructor(changed = () => {}, notify = () => {}) {
    this.changed = changed;
    this.notify = notify;
    this.mode = 'pan';
    this.history = [];
    this.selectedPoint = -1;
    this.selectedBridge = null;
    this.dragging = null;
    this.loadCity();
  }
  definition() {
    return waterCopy({
      features: this.features,
      bridges: this.bridges,
      state: this.state
    });
  }
  loadCity(city = {}) {
    this.features = waterCopy(city.waterFeatures ?? []);
    this.bridges = waterCopy(city.bridges ?? []);
    this.state = waterCopy(city.waterState ?? waterDryState());
    this.dirty = false;
    this.dragging = null;
    this.selectedPoint = -1;
    this.selectedBridge = null;
  }
  remember() {
    this.history.push(this.definition());
    if (this.history.length > WATER_HISTORY_LIMIT) this.history.shift();
  }
  restore(value) {
    this.features = waterCopy(value.features);
    this.bridges = waterCopy(value.bridges);
    this.state = waterCopy(value.state);
    this.selectedPoint = -1;
    this.selectedBridge = null;
    this.dragging = null;
  }
  mark() {
    this.dirty = true;
    this.changed();
  }
  setMode(mode) {
    this.mode = mode;
    this.selectedPoint = -1;
    this.selectedBridge = null;
    this.changed();
  }
  generate(boundary, center, options) {
    const next = generateRiver(boundary, center, options);
    this.remember();
    this.restore(next);
    this.mode = 'river';
    this.mark();
    this.notify('River preview ready. Move its points or bridges, then Generate city to apply.');
  }
  generateCoastline(boundary, center, options) {
    const next = generateCoast(boundary, center, options);
    this.remember();
    this.restore(next);
    this.mode = 'river';
    this.mark();
    this.notify('Coast preview ready. Drag shoreline points, then Generate city to apply.');
  }
  flipCoast() {
    if (this.features[0]?.kind !== 'coast') throw new Error('Generate a coast first.');
    this.remember();
    const f = this.features[0];
    f.waterSide = f.waterSide === 'left' ? 'right' : 'left';
    delete f.direction;
    this.mark();
    this.notify('Ocean side swapped in the draft. Keep the main square on land before generating.');
  }
  clear() {
    this.remember();
    this.restore({
      features: [],
      bridges: [],
      state: waterDryState()
    });
    this.mark();
    this.notify('Dry-land preview. Generate city to remove water and rebuild streets.');
  }
  revert(city) {
    this.remember();
    this.loadCity(city);
    this.changed();
    this.notify('Restored the city’s saved water.');
  }
  undo() {
    if (!this.history.length) return;
    const next = this.history.pop();
    this.restore(next);
    this.mark();
    this.notify('Water edit undone in the draft. Generate city to apply.');
  }
  width(value) {
    if (this.features[0]?.kind !== 'river') throw new Error('Generate a river before adjusting river width.');
    const n = Number(value);
    if (!Number.isFinite(n) || n < 10 || n > 90) throw new Error('River width must be 10–90 survey units.');
    if (this.features[0].width === n) return;
    this.remember();
    this.features[0].width = n;
    this.mark();
    this.notify('River width changed in the draft. Generate city to apply.');
  }
  down(p, zoom) {
    const f = this.features[0];
    if (!f) return;
    if (this.mode === 'river') {
      const i = f.path.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 12 / zoom);
      this.selectedPoint = i;
      if (i >= 0) {
        this.gesture = this.definition();
        this.gestureDirty = this.dirty;
        this.remember();
        this.dragging = {
          kind: 'point',
          index: i
        };
      }
    } else if (this.mode === 'bridge' && f.kind === 'river') {
      const bridge = this.bridges.find(b => {
        const q = waterAt(f, b.t);
        return Math.hypot(p.x - q.x, p.y - q.y) < 15 / zoom;
      });
      this.selectedBridge = bridge?.id ?? null;
      if (bridge) {
        this.gesture = this.definition();
        this.gestureDirty = this.dirty;
        this.remember();
        this.dragging = {
          kind: 'bridge',
          id: bridge.id
        };
      }
    } else if (this.mode === 'addbridge' && f.kind === 'river') {
      if (this.bridges.length >= 8) {
        this.notify('This build supports up to eight bridges.', true);
        return;
      }
      const t = waterNearestT(f, p),
        q = waterAt(f, t);
      if (Math.hypot(q.x - p.x, q.y - p.y) > Math.max(f.width, 24 / zoom)) {
        this.notify('Click near the river to add a bridge.', true);
        return;
      }
      this.remember();
      let i = 1;
      while (this.bridges.some(b => b.id === `BRIDGE-${String(i).padStart(3,'0')}`)) i++;
      const id = `BRIDGE-${String(i).padStart(3,'0')}`;
      this.bridges.push({
        id,
        dataVersion: 1,
        kind: 'bridge',
        waterId: f.id,
        t,
        width: 9,
        extensions: {}
      });
      this.selectedBridge = id;
      this.mode = 'bridge';
      this.mark();
      this.notify('Bridge added to the draft. Generate city to check its approaches.');
    }
    this.changed();
  }
  move(p) {
    if (!this.dragging) return;
    if (this.dragging.kind === 'point') this.features[0].path[this.dragging.index] = {
      x: p.x,
      y: p.y
    };
    else this.bridges.find(b => b.id === this.dragging.id).t = waterNearestT(this.features[0], p);
    this.mark();
  }
  up(zoom, cancelled = false) {
    if (!this.dragging) return;
    if (cancelled) {
      this.restore(this.gesture);
      this.dirty = this.gestureDirty;
      this.history.pop();
    } else this.notify('Water draft changed. Generate city to validate and connect streets.');
    this.dragging = null;
    this.changed();
  }
  addPoint(p, zoom) {
    if (this.mode !== 'river' || !this.features.length) return;
    const path = this.features[0].path;
    if (path.length >= 32) return;
    let best = -1,
      d = 18 / zoom;
    for (let i = 0; i < path.length - 1; i++) {
      const n = distanceToSegment(p, path[i], path[i + 1]);
      if (n < d) {
        d = n;
        best = i;
      }
    }
    if (best < 0) return;
    this.remember();
    path.splice(best + 1, 0, {
      x: p.x,
      y: p.y
    });
    this.selectedPoint = best + 1;
    this.mark();
  }
  removePoint() {
    if (this.mode === 'bridge' && this.selectedBridge) {
      this.remember();
      this.bridges = this.bridges.filter(b => b.id !== this.selectedBridge);
      this.selectedBridge = null;
      this.mark();
      this.notify('Bridge removed from the draft. A valid city needs connected banks.');
    } else if (this.mode === 'river' && this.selectedPoint > 0 && this.selectedPoint < this.features[0].path.length - 1 && this.features[0].path.length > 3) {
      this.remember();
      this.features[0].path.splice(this.selectedPoint, 1);
      this.selectedPoint = -1;
      this.mark();
    }
  }
  snapshot() {
    return {
      ...this.definition(),
      dirty: this.dirty,
      history: waterCopy(this.history),
      mode: this.mode,
      selectedPoint: this.selectedPoint,
      selectedBridge: this.selectedBridge
    };
  }
  load(snapshot, city) {
    this.history = [];
    this.loadCity(city);
    this.mode = 'pan';
    if (snapshot) {
      this.restore(snapshot);
      this.history = waterCopy(snapshot.history);
      this.dirty = snapshot.dirty;
      this.mode = snapshot.mode;
      this.selectedPoint = snapshot.selectedPoint;
      this.selectedBridge = snapshot.selectedBridge;
    }
  }
}
export function validateWaterEditor(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.dirty !== 'boolean' || !['pan', 'river', 'bridge', 'addbridge'].includes(snapshot.mode) || !Number.isInteger(snapshot.selectedPoint) || snapshot.selectedPoint < -1 || snapshot.selectedPoint > 31 || (snapshot.selectedBridge !== null && typeof snapshot.selectedBridge !== 'string') || !Array.isArray(snapshot.history) || snapshot.history.length > WATER_HISTORY_LIMIT) throw new Error('Invalid water editor state.');
  for (const d of [snapshot, ...snapshot.history]) {
    if (!d.state || d.state.version !== 1 || !['ribbon-v1', 'shore-v1'].includes(d.state.algorithm) || !['dry', 'river', 'coast'].includes(d.state.status)) throw new Error('Unsupported water draft version.');
    if (typeof d.state.seed !== 'string' || d.state.seed.length > 64 || !Array.isArray(d.features) || d.features.length > 1 || !Array.isArray(d.bridges) || d.bridges.length > 8) throw new Error('Invalid water draft.');
    for (const f of d.features)
      if (f.dataVersion !== 1 || !['river', 'coast'].includes(f.kind) || typeof f.id !== 'string' || f.id.length > 128 || (f.kind === 'river' && (!Number.isFinite(f.width) || f.width < 10 || f.width > 90)) || (f.kind === 'coast' && (!['left', 'right'].includes(f.waterSide) || !Number.isFinite(f.seaDepth) || f.seaDepth < 100 || f.seaDepth > 20000)) || !Array.isArray(f.path) || f.path.length < 3 || f.path.length > 32 || f.path.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000)) throw new Error('Invalid water draft.');
    for (const b of d.bridges)
      if (b.dataVersion !== 1 || b.kind !== 'bridge' || typeof b.id !== 'string' || b.id.length > 128 || b.waterId !== d.features[0]?.id || !Number.isFinite(b.t) || b.t < 0 || b.t > 1 || b.width !== 9) throw new Error('Invalid bridge draft.');
  }
  if (snapshot.controls?.coastDirection !== undefined && !['north', 'east', 'south', 'west'].includes(snapshot.controls.coastDirection)) throw new Error('Invalid saved coast direction.');
  if (snapshot.controls !== undefined && (typeof snapshot.controls.seed !== 'string' || snapshot.controls.seed.length > 64 || typeof snapshot.controls.width !== 'string' || snapshot.controls.width.length > 16)) throw new Error('Invalid water controls.');
}

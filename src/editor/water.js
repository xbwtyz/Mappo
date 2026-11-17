import {
  guideWaterPath
} from '../core/water-editing.js';
import {
  clamp
} from '../core/geometry.js';
import {
  generateCoast
} from '../generators/coast.js';
import {
  waterAt,
  waterNearestT,
  waterDryState,
  waterCompositionState
} from '../core/water-geometry.js';
import {
  generateRiver,
  prepareWater
} from '../generators/water.js';
import {
  distanceToSegment
} from '../core/boundary.js';

export const WATER_HISTORY_LIMIT = 20;
export function waterCopy(value) {
  return JSON.parse(JSON.stringify(value));
}
export class WaterEditor {
  constructor(changed = () => {}, notify = () => {}, getBoundary = () => []) {
    this.getBoundary = getBoundary;
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
      state: this.state,
      activeWaterId: this.activeWaterId
    });
  }
  loadCity(city = {}) {
    this.features = waterCopy(city.waterFeatures ?? []);
    this.bridges = waterCopy(city.bridges ?? []);
    this.state = waterCopy(city.waterState ?? waterDryState());
    this.activeWaterId = this.features[0]?.id ?? null;
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
    this.activeWaterId = value.activeWaterId ?? this.features[0]?.id ?? null;
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
  activeFeature() {
    return this.features.find(f => f.id === this.activeWaterId) ?? this.features[0];
  }
  selectFeature(kind) {
    const f = this.features.find(f => f.kind === kind);
    if (!f) {
      this.notify(`Generate a ${kind} first.`, true);
      return false;
    }
    this.activeWaterId = f.id;
    this.selectedPoint = -1;
    this.selectedBridge = null;
    return true;
  }
  upsert(next) {
    const fresh = next.features[0],
      existing = this.features.find(f => f.kind === fresh.kind);
    let id = existing?.id ?? fresh.id,
      index = 2;
    while (!existing && this.features.some(f => f.id === id)) id = `${fresh.id}-${index++}`;
    this.remember();
    const feature = {
      ...(existing ?? {}),
      ...fresh,
      id,
      generation: {
        ...(existing?.generation ?? {}),
        ...fresh.generation
      },
      extensions: waterCopy(existing?.extensions ?? fresh.extensions ?? {})
    };
    this.features = existing ? this.features.map(f => f === existing ? feature : f) : [...this.features, feature];
    if (feature.kind === 'river') this.bridges = [...this.bridges.filter(b => b.waterId !== existing?.id), ...next.bridges.map(b => ({
      ...b,
      waterId: id
    }))];
    this.state = waterCompositionState(this.features, {
      ...this.state,
      seed: next.state.seed
    });
    this.activeWaterId = id;
    this.selectedPoint = -1;
    this.selectedBridge = null;
    this.dragging = null;
    this.mode = 'river';
    this.mark();
  }
  generate(boundary, center, options = {}) {
    const next = generateRiver(boundary, center, {
      ...options,
      otherFeatures: prepareWater({
        features: this.features.filter(f => f.kind !== 'river')
      }).features
    });
    this.upsert(next);
    this.notify('River preview updated. The coastline was retained. Generate city to apply.');
  }
  generateCoastline(boundary, center, options = {}) {
    const next = generateCoast(boundary, center, {
      ...options,
      otherFeatures: prepareWater({
        features: this.features.filter(f => f.kind !== 'coast')
      }).features,
      bridges: this.bridges
    });
    this.upsert(next);
    this.notify('Coast preview updated. The river and bridges were retained. Generate city to apply.');
  }
  removeFeature(kind) {
    const feature = this.features.find(f => f.kind === kind);
    if (!feature) return;
    this.remember();
    this.features = this.features.filter(f => f !== feature);
    this.bridges = this.bridges.filter(b => b.waterId !== feature.id);
    this.state = waterCompositionState(this.features, this.state);
    this.activeWaterId = this.features[0]?.id ?? null;
    this.selectedPoint = -1;
    this.selectedBridge = null;
    this.mark();
    this.notify(`${kind==='coast'?'Coastline':'River'} removed from the draft. Other water features were retained.`);
  }
  flipCoast() {
    const f = this.features.find(f => f.kind === 'coast');
    if (!f) throw new Error('Generate a coast first.');
    this.remember();
    this.selectFeature('coast');
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
    const river = this.features.find(f => f.kind === 'river');
    if (!river) throw new Error('Generate a river before adjusting river width.');
    const n = Number(value);
    if (!Number.isFinite(n) || n < 10 || n > 90) throw new Error('River width must be 10–90 survey units.');
    if (river.width === n) return;
    this.remember();
    river.width = n;
    this.mark();
    this.notify('River width changed in the draft. Generate city to apply.');
  }
  applyGuidedFeature(feature, result) {
    feature.path = result.path;
    if (feature.kind === 'coast') feature.seaDepth = result.seaDepth;
  }
  tidyFeature(kind, boundary = this.getBoundary(), notify = true) {
    const feature = this.features.find(f => f.kind === kind);
    if (!feature) return false;
    const result = guideWaterPath(feature, {
      boundary
    });
    if (result.changed) {
      this.remember();
      this.applyGuidedFeature(feature, result);
      this.mark();
    }
    if (notify) this.notify(result.changed ? `${kind==='coast'?'Coastline':'River'} bends tidied automatically. Other water features and bridge locations were retained. Generate city to apply.` : `${kind==='coast'?'Shoreline':'River'} handles are already in order; no adjustment was needed.`);
    return result.changed;
  }
  tidyRiver(boundary = this.getBoundary(), notify = true) {
    return this.tidyFeature('river', boundary, notify);
  }
  tidyCoast(boundary = this.getBoundary(), notify = true) {
    return this.tidyFeature('coast', boundary, notify);
  }
  tidyWater(boundary = this.getBoundary()) {
    const updates = this.features.map(feature => ({
      feature,
      result: guideWaterPath(feature, {
        boundary
      })
    })).filter(update => update.result.changed);
    if (updates.length) {
      this.remember();
      for (const {
          feature,
          result
        }
        of updates) this.applyGuidedFeature(feature, result);
      this.mark();
    }
    return updates.map(update => update.feature.kind);
  }
  down(p, zoom) {
    const f = this.activeFeature();
    if (!f) return;
    if (this.mode === 'river') {
      const i = f.path.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 12 / zoom);
      this.selectedPoint = i;
      if (i >= 0) {
        this.gestureBoundary = this.getBoundary();
        this.gestureHistory = this.history.slice();
        this.dragGuided = false;
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
        this.gestureBoundary = this.getBoundary();
        this.gestureHistory = this.history.slice();
        this.dragGuided = false;
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
    if (this.dragging.kind === 'point') {
      const feature = this.activeFeature();
      const baseline = this.gesture?.features.find(f => f.id === feature.id) ?? feature;
      const result = guideWaterPath(baseline, {
        index: this.dragging.index,
        point: p,
        boundary: this.gestureBoundary ?? this.getBoundary()
      });
      this.applyGuidedFeature(feature, result);
      this.dragGuided = result.adjusted;
    } else this.bridges.find(b => b.id === this.dragging.id).t = waterNearestT(this.features.find(f => f.id === this.bridges.find(b => b.id === this.dragging.id).waterId), p);
    this.mark();
  }
  up(zoom, cancelled = false) {
    if (!this.dragging) return;
    if (cancelled) {
      this.restore(this.gesture);
      this.dirty = this.gestureDirty;
      this.history = this.gestureHistory ?? this.history.slice(0, -1);
    } else this.notify(this.dragGuided ? 'Water handles adjusted gently to keep their order and ease the bend. Generate city to apply.' : 'Water draft changed. Generate city to validate and connect streets.');
    this.dragging = null;
    this.gestureHistory = null;
    this.gestureBoundary = null;
    this.changed();
  }
  addPoint(p, zoom) {
    if (this.mode !== 'river' || !this.features.length) return;
    const path = this.activeFeature().path;
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
    let inserted = {
      x: p.x,
      y: p.y
    };
    if (['river', 'coast'].includes(this.activeFeature().kind)) {
      const a = path[best],
        b = path[best + 1],
        dx = b.x - a.x,
        dy = b.y - a.y,
        length2 = dx * dx + dy * dy,
        t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (length2 || 1), 0, 1);
      inserted = {
        x: a.x + dx * t,
        y: a.y + dy * t
      };
      if (Math.hypot(inserted.x - a.x, inserted.y - a.y) < 2 || Math.hypot(inserted.x - b.x, inserted.y - b.y) < 2) {
        this.selectedPoint = t < .5 ? best : best + 1;
        this.changed();
        return;
      }
    }
    this.remember();
    path.splice(best + 1, 0, inserted);
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
    } else if (this.mode === 'river' && this.selectedPoint > 0 && this.selectedPoint < this.activeFeature().path.length - 1 && this.activeFeature().path.length > 3) {
      this.remember();
      this.activeFeature().path.splice(this.selectedPoint, 1);
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
    if (!d.state || d.state.version !== 1 || !['ribbon-v1', 'shore-v1', 'union-v1'].includes(d.state.algorithm) || !['dry', 'river', 'coast', 'mixed'].includes(d.state.status)) throw new Error('Unsupported water draft version.');
    if (typeof d.state.seed !== 'string' || d.state.seed.length > 64 || !Array.isArray(d.features) || d.features.length > 2 || !Array.isArray(d.bridges) || d.bridges.length > 8) throw new Error('Invalid water draft.');
    for (const f of d.features)
      if (f.dataVersion !== 1 || !['river', 'coast'].includes(f.kind) || typeof f.id !== 'string' || f.id.length > 128 || (f.kind === 'river' && (!Number.isFinite(f.width) || f.width < 10 || f.width > 90)) || (f.kind === 'coast' && (!['left', 'right'].includes(f.waterSide) || !Number.isFinite(f.seaDepth) || f.seaDepth < 100 || f.seaDepth > 20000)) || !Array.isArray(f.path) || f.path.length < 3 || f.path.length > 32 || f.path.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000)) throw new Error('Invalid water draft.');
    for (const b of d.bridges)
      if (b.dataVersion !== 1 || b.kind !== 'bridge' || typeof b.id !== 'string' || b.id.length > 128 || !d.features.some(f => f.kind === 'river' && f.id === b.waterId) || !Number.isFinite(b.t) || b.t < 0 || b.t > 1 || b.width !== 9) throw new Error('Invalid bridge draft.');
  }
  if (snapshot.activeWaterId !== undefined && snapshot.activeWaterId !== null && !snapshot.features.some(f => f.id === snapshot.activeWaterId)) throw new Error('Invalid selected water feature.');
  if (snapshot.controls?.coastSeed !== undefined && (typeof snapshot.controls.coastSeed !== 'string' || snapshot.controls.coastSeed.length > 64)) throw new Error('Invalid saved coast seed.');
  if (snapshot.controls?.coastDirection !== undefined && !['north', 'east', 'south', 'west'].includes(snapshot.controls.coastDirection)) throw new Error('Invalid saved coast direction.');
  if (snapshot.controls !== undefined && (typeof snapshot.controls.seed !== 'string' || snapshot.controls.seed.length > 64 || typeof snapshot.controls.width !== 'string' || snapshot.controls.width.length > 16)) throw new Error('Invalid water controls.');
}

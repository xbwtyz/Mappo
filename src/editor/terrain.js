import {
  terrainCopy,
  terrainPrepare,
  terrainPoint,
  terrainShapeSafe,
  terrainRidgeSafe,
  terrainPassAt,
  terrainNearestT,
  TERRAIN_LIMIT,
  TERRAIN_HISTORY_LIMIT
} from '../core/terrain-geometry.js';
import {
  guideTerrainFeature
} from '../core/terrain-editing.js';
import {
  generateMountain
} from '../generators/terrain.js';
import {
  distanceToSegment
} from '../core/boundary.js';
export class TerrainEditor {
  constructor(changed = () => {}, notify = () => {}) {
    this.changed = changed;
    this.notify = notify;
    this.history = [];
    this.mode = 'pan';
    this.loadCity();
  }
  definition() {
    return terrainCopy({
      features: this.features,
      passes: this.passes,
      activeTerrainId: this.activeTerrainId
    });
  }
  loadCity(city = {}) {
    this.features = terrainCopy(city.terrainFeatures ?? []);
    this.passes = terrainCopy(city.terrainPasses ?? []);
    this.activeTerrainId = this.features.some(f => f.id === this.activeTerrainId) ? this.activeTerrainId : this.features[0]?.id ?? null;
    this.dirty = false;
    this.dragging = null;
    this.selectedPoint = -1;
    this.selectedPass = null;
  }
  activeFeature() {
    return this.features.find(f => f.id === this.activeTerrainId);
  }
  remember() {
    this.history.push(this.definition());
    if (this.history.length > TERRAIN_HISTORY_LIMIT) this.history.shift();
  }
  restore(d) {
    this.features = terrainCopy(d.features);
    this.passes = terrainCopy(d.passes);
    this.activeTerrainId = d.activeTerrainId ?? this.features[0]?.id ?? null;
    this.dragging = null;
    this.selectedPoint = -1;
    this.selectedPass = null;
  }
  mark() {
    this.dirty = true;
    this.changed();
  }
  setMode(mode) {
    this.mode = mode;
    this.selectedPoint = mode === 'ridge' ? 1 : -1;
    this.selectedPass = null;
    this.changed();
  }
  select(id) {
    if (!this.features.some(f => f.id === id)) return false;
    this.activeTerrainId = id;
    this.selectedPoint = -1;
    this.selectedPass = null;
    return true;
  }
  generate(boundary, center, options = {}, targetId = null) {
    const old = this.features.find(f => f.id === targetId),
      next = generateMountain(boundary, center, {
        ...options,
        id: old?.id,
        center: old?.center,
        otherFeatures: terrainPrepare({
          features: this.features.filter(f => f !== old)
        }).features,
        passes: this.passes.filter(p => p.terrainId !== old?.id)
      });
    const fresh = next.features[0],
      f = {
        ...old,
        ...fresh,
        name: old?.name ?? fresh.name,
        generation: {
          ...old?.generation,
          ...fresh.generation
        },
        extensions: terrainCopy(old?.extensions ?? {})
      };
    this.remember();
    this.features = old ? this.features.map(o => o === old ? f : o) : [...this.features, f];
    this.passes = [...this.passes.filter(p => p.terrainId !== old?.id), ...next.passes];
    this.activeTerrainId = f.id;
    this.mode = 'shape';
    this.selectedPoint = -1;
    this.selectedPass = null;
    this.mark();
    this.notify('Mountain preview ready. Generate city to rebuild around its foothills and passes.');
  }
  remove() {
    const f = this.activeFeature();
    if (!f) return;
    this.remember();
    this.features = this.features.filter(o => o !== f);
    this.passes = this.passes.filter(p => p.terrainId !== f.id);
    this.activeTerrainId = this.features[0]?.id ?? null;
    this.selectedPoint = -1;
    this.selectedPass = null;
    this.mark();
    this.notify('Selected mountain range removed from the draft.');
  }
  undo() {
    if (!this.history.length) return;
    this.restore(this.history.pop());
    this.mark();
    this.notify('Terrain edit undone in the draft. Generate city to apply.');
  }
  revert(city) {
    this.remember();
    this.loadCity(city);
    this.changed();
    this.notify('Restored the city’s saved mountains.');
  }
  height(value) {
    const f = this.activeFeature(),
      n = Number(value);
    if (!f || this.mode !== 'ridge' || this.selectedPoint < 0) return;
    if (!Number.isFinite(n) || n < 50 || n > 3000) throw new Error('Peak height must be 50–3000 elevation units.');
    if (f.ridge[this.selectedPoint].height === n) return;
    this.remember();
    f.ridge[this.selectedPoint].height = n;
    this.mark();
    this.notify('Peak height updated in the draft. Generate city to apply.');
  }
  down(p, zoom) {
    const f = this.activeFeature();
    if (!f) return;
    if (this.mode === 'addpass') {
      if (this.passes.length >= 12) throw new Error('This build supports twelve passes.');
      const t = terrainNearestT(f, p),
        at = terrainPassAt(f, t);
      if (Math.hypot(at.x - p.x, at.y - p.y) > 24 / zoom) throw new Error('Click near the ridge to add a pass.');
      let n = 1;
      while (this.passes.some(p => p.id === `PASS-${String(n).padStart(3,'0')}`)) n++;
      const id = `PASS-${String(n).padStart(3,'0')}`;
      this.remember();
      this.passes.push({
        id,
        dataVersion: 1,
        kind: 'pass',
        terrainId: f.id,
        t,
        width: 12,
        extensions: {}
      });
      this.selectedPass = id;
      this.mode = 'pass';
      this.mark();
      this.notify('Pass added. Keep both foothills inside the city before applying.');
      return;
    }
    let drag = null;
    if (this.mode === 'move') {
      if (Math.hypot(f.center.x - p.x, f.center.y - p.y) < 16 / zoom) drag = {
        kind: 'move'
      };
    } else if (this.mode === 'pass') {
      const pass = this.passes.find(pass => {
        if (pass.terrainId !== f.id) return false;
        const at = terrainPassAt(f, pass.t);
        return Math.hypot(at.x - p.x, at.y - p.y) < 16 / zoom;
      });
      this.selectedPass = pass?.id ?? null;
      if (pass) drag = {
        kind: 'pass',
        id: pass.id
      };
    } else if (['shape', 'ridge'].includes(this.mode)) {
      const key = this.mode === 'ridge' ? 'ridge' : 'path',
        index = f[key].findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 12 / zoom);
      this.selectedPoint = index;
      if (index >= 0) drag = {
        kind: this.mode,
        index
      };
    }
    if (drag) {
      this.gesture = this.definition();
      this.gestureHistory = this.history.slice();
      this.gestureDirty = this.dirty;
      this.remember();
      this.dragging = drag;
      this.adjusted = false;
    }
    this.changed();
  }
  move(p) {
    if (!this.dragging) return;
    const f = this.activeFeature(),
      base = this.gesture.features.find(o => o.id === f.id),
      d = this.dragging;
    if (d.kind === 'pass') this.passes.find(p => p.id === d.id).t = terrainNearestT(f, p);
    else {
      const result = guideTerrainFeature(base, {
        index: d.index,
        point: p,
        moveCenter: d.kind === 'move' ? p : null,
        ridge: d.kind === 'ridge'
      });
      this.features = this.features.map(o => o === f ? result.feature : o);
      this.adjusted = result.adjusted;
    }
    this.mark();
  }
  up(zoom, cancelled = false) {
    if (!this.dragging) return;
    if (cancelled) {
      this.restore(this.gesture);
      this.history = this.gestureHistory;
      this.dirty = this.gestureDirty;
    } else this.notify(this.adjusted ? 'Mountain handles adjusted to keep a safe footprint and ridge. Generate city to apply.' : 'Terrain draft changed. Generate city to connect streets around it.');
    this.dragging = null;
    this.gesture = null;
    this.gestureHistory = null;
    this.changed();
  }
  addPoint(p, zoom) {
    const f = this.activeFeature();
    if (this.mode !== 'shape' || !f || f.path.length >= 32) return;
    let best = -1,
      d = 18 / zoom;
    for (let i = 0; i < f.path.length; i++) {
      const n = distanceToSegment(p, f.path[i], f.path[(i + 1) % f.path.length]);
      if (n < d) {
        d = n;
        best = i;
      }
    }
    if (best < 0) return;
    const a = f.path[best],
      b = f.path[(best + 1) % f.path.length],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))),
      q = {
        x: a.x + dx * t,
        y: a.y + dy * t
      };
    if (Math.min(Math.hypot(q.x - a.x, q.y - a.y), Math.hypot(q.x - b.x, q.y - b.y)) < 2) {
      this.selectedPoint = t < .5 ? best : (best + 1) % f.path.length;
      this.changed();
      return;
    }
    const next = {
      ...f,
      path: f.path.toSpliced(best + 1, 0, q)
    };
    if (!terrainShapeSafe(next) || !terrainRidgeSafe(next)) return;
    this.remember();
    f.path = next.path;
    this.selectedPoint = best + 1;
    this.mark();
  }
  removePoint() {
    const f = this.activeFeature();
    if (this.mode === 'pass' && this.selectedPass) {
      this.remember();
      this.passes = this.passes.filter(p => p.id !== this.selectedPass);
      this.selectedPass = null;
      this.mark();
      this.notify('Pass removed from the draft. Keep every neighborhood connected.');
    } else if (this.mode === 'shape' && f && this.selectedPoint >= 0 && f.path.length > 4) {
      const next = {
        ...f,
        path: f.path.toSpliced(this.selectedPoint, 1)
      };
      if (!terrainShapeSafe(next) || !terrainRidgeSafe(next)) {
        this.notify('Keep this foothill handle to preserve a safe ridge and footprint.');
        return;
      }
      this.remember();
      f.path = next.path;
      this.selectedPoint = -1;
      this.mark();
    }
  }
  snapshot() {
    return {
      ...this.definition(),
      history: terrainCopy(this.history),
      dirty: this.dirty,
      mode: this.mode,
      selectedPoint: this.selectedPoint,
      selectedPass: this.selectedPass
    };
  }
  load(snapshot, city) {
    this.history = [];
    this.loadCity(city);
    this.mode = 'pan';
    if (snapshot) {
      this.restore(snapshot);
      this.history = terrainCopy(snapshot.history);
      this.dirty = snapshot.dirty;
      this.mode = snapshot.mode;
      this.selectedPoint = snapshot.selectedPoint;
      this.selectedPass = snapshot.selectedPass;
    }
  }
}
export function validateTerrainEditor(snapshot) {
  if (!snapshot || typeof snapshot.dirty !== 'boolean' || !['pan', 'shape', 'ridge', 'move', 'pass', 'addpass'].includes(snapshot.mode) || !Number.isInteger(snapshot.selectedPoint) || snapshot.selectedPoint < -1 || snapshot.selectedPoint > 31 || (snapshot.selectedPass !== null && typeof snapshot.selectedPass !== 'string') || !Array.isArray(snapshot.history) || snapshot.history.length > TERRAIN_HISTORY_LIMIT) throw new Error('Invalid terrain editor state.');
  for (const d of [snapshot, ...snapshot.history]) {
    if (!Array.isArray(d.features) || d.features.length > TERRAIN_LIMIT || !Array.isArray(d.passes) || d.passes.length > 12) throw new Error('Invalid terrain draft.');
    const ids = new Set();
    for (const f of [...d.features, ...d.passes]) {
      if (!f || typeof f.id !== 'string' || !f.id || f.id.length > 128 || ids.has(f.id) || f.dataVersion !== 1) throw new Error('Invalid terrain draft identity.');
      ids.add(f.id);
    }
    for (const f of d.features)
      if (f.kind !== 'mountain' || typeof f.name !== 'string' || !f.name || f.name.length > 80 || !terrainPoint(f.center) || !Array.isArray(f.path) || f.path.length < 4 || f.path.length > 32 || !f.path.every(terrainPoint) || !Array.isArray(f.ridge) || f.ridge.length !== 3 || f.ridge.some(p => !terrainPoint(p) || !Number.isFinite(p.height) || p.height < 50 || p.height > 3000)) throw new Error('Invalid mountain draft structure.');
    for (const p of d.passes)
      if (p.kind !== 'pass' || !d.features.some(f => f.id === p.terrainId) || !Number.isFinite(p.t) || p.t < 0 || p.t > 1 || p.width !== 12) throw new Error('Invalid mountain pass draft.');
    if (d.activeTerrainId !== null && !d.features.some(f => f.id === d.activeTerrainId)) throw new Error('Invalid selected mountain range.');
  }
  if (snapshot.controls !== undefined) {
    const c = snapshot.controls;
    if (!c || ['seed', 'size', 'height', 'placement'].some(key => typeof c[key] !== 'string' || c[key].length > 64) || !['inside', 'surrounding', 'crossing'].includes(c.placement)) throw new Error('Invalid mountain controls.');
  }
}

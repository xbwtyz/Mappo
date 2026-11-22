import {
  EMPTY_BUILDING_TRANSFORM, normalizeBuildingTransform, buildingTransformDirty,
  previewBuildingGeometry, buildingFrame, buildingPreviewHit, buildingPreviewPivot,
  BUILDING_TRANSFORM_LIMITS, lockedBuildingScale
} from '../core/building-transform.js';

import {
  insertFootprintVertexF1, moveFootprintVertexF1, deleteFootprintVertexF1, attachBuildingWingF1,
  addRectangularCourtyardF1, removeBuildingCourtyardF1, rectangularCourtyardFrame, validateFootprintF1
} from '../core/building-footprint-f1.js';

export const BUILDING_EDIT_TOOLS = Object.freeze(['Transform', 'Vertices', 'Edges', 'Courtyard']);

export function buildingDirectHandles(preview, tool, holeIndex) {
  const ring = holeIndex === null ? preview?.footprint : preview?.holes[holeIndex];
  if (!ring || !['vertices', 'edges'].includes(tool)) return [];
  return ring.map((point, index) => {
    if (tool === 'vertices') return { ...point, index, kind: 'vertex' };
    const next = ring[(index + 1) % ring.length];
    return { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2, index, kind: 'edge' };
  });
}

// All edits live in this session until the existing project Apply succeeds.
export class BuildingEditSession {
  constructor(changed = () => {}) {
    this.active = null;
    this.changed = changed;
    this.tool = 'transform';
    this.lockRatio = true;
    this.clearDraft();
  }
  get isActive() { return this.active !== null; }
  get buildingId() { return this.active?.buildingId ?? null; }
  get propertyId() { return this.active?.propertyId ?? null; }
  get isPending() { return this.isActive && (this.draft !== null || buildingTransformDirty(this.transform)); }
  get isDirect() { return ['vertices', 'edges', 'courtyard'].includes(this.tool); }
  clearDraft() {
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    this.draft = null;
    this.topologyChanged = false;
    this.structuralOperationCount = 0;
    this.holeIndex = null;
    this.handleIndex = 0;
    this.operationError = '';
    this.drag = null;
  }
  isEditing(id) { return Boolean(this.active && this.active.buildingId === id); }
  resolve(city, layers, id, propertyId = null) {
    if (!city || layers?.buildings === false || typeof id !== 'string') return null;
    const building = city.buildings?.find(item => item.id === id);
    const property = city.properties?.find(item => item.id === building?.propertyId);
    if (!building || !property || !(property.buildingIds ?? []).includes(id)) return null;
    if (propertyId !== null && property.id !== propertyId) return null;
    return { buildingId: id, propertyId: property.id };
  }
  source(city) {
    return this.isActive ? city?.buildings?.find(b => b.id === this.buildingId && b.propertyId === this.propertyId) ?? null : null;
  }
  previewFor(city) {
    const base = this.draft ?? this.source(city);
    return base ? previewBuildingGeometry(base, this.transform) : null;
  }
  start(city, layers, id) {
    const target = this.resolve(city, layers, id);
    if (!target) return false;
    if (this.isEditing(id)) return true;
    this.active = target;
    this.acceptedCity = city;
    this.tool = 'transform';
    this.clearDraft();
    this.changed();
    return true;
  }
  allows(city, layers, id) {
    return Boolean(this.active && this.resolve(city, layers, id, this.active.propertyId));
  }
  focus(city, layers, id) {
    if (!this.allows(city, layers, id)) return false;
    if (this.isEditing(id)) return true;
    this.active = this.resolve(city, layers, id, this.active.propertyId);
    this.acceptedCity = city;
    this.clearDraft();
    this.tool = 'transform';
    this.changed();
    return true;
  }
  setTool(tool) {
    if (!this.isActive || !BUILDING_EDIT_TOOLS.some(name => name.toLowerCase() === tool)) return false;
    if (this.drag) this.endGesture(true);
    if (this.tool === tool) return true;
    this.tool = tool;
    if (tool === 'courtyard' && this.holeIndex === null &&
        this.previewFor(this.acceptedCity)?.holes.length === 1) this.holeIndex = 0;
    this.operationError = '';
    this.changed();
    return true;
  }
  setTransform(values) {
    if (!this.isActive) return false;
    let next;
    try { next = normalizeBuildingTransform({ ...this.transform, ...values }); }
    catch { return false; }
    this.operationError = '';
    this.transform = next;
    this.changed();
    return true;
  }
  reset(city = this.acceptedCity, { keepCourtyard = false } = {}) {
    if (!this.isActive) return false;
    const index = keepCourtyard && this.tool === 'courtyard' ? this.holeIndex : null;
    this.acceptedCity = city;
    this.clearDraft();
    if (index !== null && this.source(city)?.holes?.[index]) this.holeIndex = index;
    this.changed();
    return true;
  }
  stop() {
    if (!this.active) return false;
    this.active = null;
    this.acceptedCity = null;
    this.clearDraft();
    this.tool = 'transform';
    this.changed();
    return true;
  }
  reconcile(city, layers, selection) {
    if (!this.active) return true;
    const live = this.resolve(city, layers, this.active.buildingId, this.active.propertyId);
    if (city !== this.acceptedCity || !live || selection?.kind !== 'building' || selection.id !== live.buildingId) {
      this.stop(); return false;
    }
    return true;
  }
  selectDirectRing(city, holeIndex) {
    if (!this.isDirect || this.drag || (holeIndex !== null && !this.previewFor(city)?.holes[holeIndex])) return false;
    this.holeIndex = holeIndex;
    this.handleIndex = 0;
    this.operationError = '';
    this.changed();
    return true;
  }
  selectDirectHandle(city, index) {
    if (!this.isDirect || this.drag ||
        !buildingDirectHandles(this.previewFor(city), this.tool, this.holeIndex)[index]) return false;
    this.handleIndex = index;
    this.operationError = '';
    this.changed();
    return true;
  }
  editDirectGeometry(city, operation, values = {}) {
    if (!this.isActive || !this.isDirect || this.drag || city !== this.acceptedCity) return false;
    const topology = !['move', 'adjust courtyard'].includes(operation);
    if (topology && this.structuralOperationCount >= 16) {
      this.operationError = 'This draft has reached 16 structural edits. Apply or Reset to continue.';
      this.changed();
      return false;
    }
    const preview = this.previewFor(city);
    const index = this.handleIndex;
    const target = { holeIndex: this.holeIndex };
    let next;
    try {
      // Discrete structural steps require locally sound geometry, even when
      // broader property or access conflicts remain to be resolved in the draft.
      if (topology) validateFootprintF1(preview);
      switch (operation) {
        case 'move': next = moveFootprintVertexF1(preview, index, values, target); break;
        case 'insert': next = insertFootprintVertexF1(preview, index, .5, target); break;
        case 'delete': next = deleteFootprintVertexF1(preview, index, target); break;
        case 'wing':
          if (this.holeIndex !== null) throw new Error('Select an exterior edge to attach a wing.');
          next = attachBuildingWingF1(preview, index, values); break;
        case 'add courtyard': next = addRectangularCourtyardF1(preview, values); break;
        case 'adjust courtyard': {
          const frame = rectangularCourtyardFrame(preview.holes[this.holeIndex]);
          if (!frame) throw new Error('Use Vertices to adjust a nonrectangular courtyard.');
          next = addRectangularCourtyardF1(preview, { ...values, angle: frame.angle }, this.holeIndex);
          break;
        }
        case 'remove courtyard': next = removeBuildingCourtyardF1(preview, this.holeIndex); break;
        default: return false;
      }
    } catch (error) {
      this.operationError = error.message;
      this.changed();
      return false;
    }
    // A true no-op does not consume the structural-edit budget.
    if (JSON.stringify([preview.footprint, preview.holes]) ===
        JSON.stringify([next.footprint, next.holes])) {
      this.operationError = '';
      this.changed();
      return true;
    }
    // Indices belong to the current polygon and hole rings, not persistent
    // vertex identities. Map known operations, clear removed rings and never
    // leave a handle referring to an out-of-range vertex.
    let nextHole = this.holeIndex, nextHandle = index;
    if (operation === 'add courtyard') {
      nextHole = next.holes.length - 1;
      nextHandle = 0;
    } else if (operation === 'remove courtyard') {
      nextHole = null;
      nextHandle = 0;
    } else if (operation === 'insert') {
      nextHandle = index + 1;
    } else if (operation === 'wing') {
      nextHandle = index + 2;
    }
    const ring = nextHole === null ? next.footprint : next.holes[nextHole];
    if (!ring?.length) {
      nextHole = null;
      nextHandle = 0;
    } else if (operation === 'delete' && index >= ring.length) {
      nextHandle = 0;
    } else {
      nextHandle = Math.min(nextHandle, ring.length - 1);
    }
    this.holeIndex = nextHole;
    this.handleIndex = nextHandle;
    this.operationError = '';
    if (topology) {
      this.structuralOperationCount++;
      this.topologyChanged = true;
    }
    // Fold the transformed preview into the detached draft exactly once.
    this.setGeometryDraft(preview, next);
    return true;
  }
  setGeometryDraft(preview, geometry) {
    if (JSON.stringify([preview.footprint, preview.holes]) !== JSON.stringify([geometry.footprint, geometry.holes])) {
      this.draft = { footprint: geometry.footprint, holes: geometry.holes, orientation: preview.orientation };
      this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    }
    this.changed();
  }
  beginGesture(city, layers, point, zoom = 1, pointerType = 'mouse') {
    if (!this.isActive || this.drag || !this.resolve(city, layers, this.buildingId, this.propertyId)) return false;
    if (city !== this.acceptedCity) return false;
    if (this.isDirect) {
      const preview = this.previewFor(city);
      const radius = pointerType === 'touch' ? 22 : 13;
      const handle = buildingDirectHandles(preview, this.tool, this.holeIndex)
        .map(item => ({ item, distance: Math.hypot(point.x - item.x, point.y - item.y) * zoom }))
        .filter(hit => hit.distance <= radius)
        .sort((a, b) => a.distance - b.distance)[0]?.item;
      if (!handle) return false;
      this.handleIndex = handle.index;
      this.operationError = '';
      if (handle.kind === 'vertex') {
        this.drag = { handle, preview, start: { ...point }, draft: this.draft, initial: this.transform };
      }
      this.changed();
      return true;
    }
    const source = this.draft ?? this.source(city);
    const handle = buildingPreviewHit(source, this.transform, point, zoom, pointerType === 'touch' ? 22 : 13);
    if (!handle) return false;
    const initial = { ...this.transform };
    const pivot = buildingPreviewPivot(source, initial);
    this.drag = { handle, start: { ...point }, initial, pivot, lockRatio: this.lockRatio,
      frame: buildingFrame(source), startAngle: Math.atan2(point.y-pivot.y,point.x-pivot.x) };
    this.changed();
    return true;
  }
  moveGesture(point) {
    if (!this.drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
    const { handle, initial, start, pivot, frame, startAngle } = this.drag;
    const dx = point.x - start.x, dy = point.y - start.y;
    if (handle.kind === 'vertex') {
      const { preview, draft } = this.drag;
      this.draft = draft;
      this.transform = initial;
      const vertex = { x: handle.x + dx, y: handle.y + dy };
      // Display the actual drag, including invalid candidates. Shared preview
      // validation blocks Apply until the polygon and its relationships are legal.
      const geometry = moveFootprintVertexF1(preview, handle.index, vertex, {
        holeIndex: this.holeIndex, validate: false
      });
      this.setGeometryDraft(preview, geometry);
      return true;
    }
    if (handle.kind === 'move') return this.setTransform({ dx: initial.dx + dx, dy: initial.dy + dy });
    if (handle.kind === 'rotate') {
      const angle = Math.atan2(point.y-pivot.y,point.x-pivot.x);
      let delta = angle - startAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      return this.setTransform({ angle: initial.angle + delta });
    }
    const c = Math.cos(initial.angle), s = Math.sin(initial.angle);
    const localDX = dx*c + dy*s, localDY = -dx*s + dy*c;
    const { minimumScale, maximumScale } = BUILDING_TRANSFORM_LIMITS;
    const clampScale = scale => Math.min(maximumScale, Math.max(minimumScale, scale));
    if (this.drag.lockRatio) {
      const halfWidth = frame.width * initial.scaleX / 2 * handle.sx;
      const halfDepth = frame.height * initial.scaleY / 2 * handle.sy;
      const factor = 1 + (localDX * halfWidth + localDY * halfDepth) / (halfWidth ** 2 + halfDepth ** 2);
      const min = minimumScale / Math.min(initial.scaleX, initial.scaleY);
      const max = maximumScale / Math.max(initial.scaleX, initial.scaleY);
      const { scaleX, scaleY } = lockedBuildingScale(initial, Math.min(max, Math.max(min, factor)));
      return this.setTransform({ scaleX: clampScale(scaleX), scaleY: clampScale(scaleY) });
    }
    const scaleX = clampScale(initial.scaleX + localDX * 2 * handle.sx / frame.width);
    const scaleY = clampScale(initial.scaleY + localDY * 2 * handle.sy / frame.height);
    return this.setTransform({ scaleX, scaleY });
  }
  endGesture(cancelled = false) {
    if (!this.drag) return false;
    const old = this.drag;
    this.drag = null;
    if (cancelled) {
      if (old.handle.kind === 'vertex') this.draft = old.draft;
      this.setTransform(old.initial);
    }
    else this.changed(); // Recheck full project/road validation when a gesture ends.
    return true;
  }
}

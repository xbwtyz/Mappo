import {
  EMPTY_BUILDING_TRANSFORM, normalizeBuildingTransform, buildingTransformDirty,
  previewBuildingGeometry, buildingFrame, buildingPreviewHit, buildingPreviewPivot
} from '../core/building-transform.js';

// All 3G-B transforms are ephemeral preview state, never accepted city geometry.
export class BuildingEditSession {
  constructor(changed = () => {}) {
    this.active = null;
    this.changed = changed;
    this.tool = 'move';
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    this.drag = null;
  }
  get isActive() { return this.active !== null; }
  get buildingId() { return this.active?.buildingId ?? null; }
  get propertyId() { return this.active?.propertyId ?? null; }
  get isPending() { return this.isActive && buildingTransformDirty(this.transform); }
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
    const source = this.source(city);
    return source ? previewBuildingGeometry(source, this.transform) : null;
  }
  start(city, layers, id) {
    const target = this.resolve(city, layers, id);
    if (!target) return false;
    if (this.isEditing(id)) return true;
    this.active = target;
    this.drag = null;
    this.tool = 'move';
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
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
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    this.drag = null;
    this.tool = 'move';
    this.changed();
    return true;
  }
  setTool(tool) {
    if (!this.isActive || !['move','rotate','resize'].includes(tool)) return false;
    if (this.drag) this.endGesture(true);
    if (this.tool === tool) return true;
    this.tool = tool;
    this.changed();
    return true;
  }
  setTransform(values) {
    if (!this.isActive) return false;
    let next;
    try { next = normalizeBuildingTransform({ ...this.transform, ...values }); }
    catch { return false; }
    this.transform = next;
    this.changed();
    return true;
  }
  reset() {
    if (!this.isActive) return false;
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    this.drag = null;
    this.changed();
    return true;
  }
  stop() {
    if (!this.active) return false;
    this.active = null;
    this.transform = { ...EMPTY_BUILDING_TRANSFORM };
    this.drag = null;
    this.tool = 'move';
    this.changed();
    return true;
  }
  reconcile(city, layers, selection) {
    if (!this.active) return true;
    const live = this.resolve(city, layers, this.active.buildingId, this.active.propertyId);
    if (!live || selection?.kind !== 'building' || selection.id !== live.buildingId) {
      this.stop(); return false;
    }
    return true;
  }
  beginGesture(city, layers, point, zoom = 1) {
    if (!this.isActive || this.drag || !this.resolve(city, layers, this.buildingId, this.propertyId)) return false;
    const source = this.source(city);
    const handle = buildingPreviewHit(source, this.transform, point, this.tool, zoom);
    if (!handle) return false;
    const initial = { ...this.transform };
    const pivot = buildingPreviewPivot(source, initial);
    this.drag = { handle, start: { ...point }, initial, pivot,
      frame: buildingFrame(source), startAngle: Math.atan2(point.y-pivot.y,point.x-pivot.x) };
    return true;
  }
  moveGesture(point) {
    if (!this.drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
    const { handle, initial, start, pivot, frame, startAngle } = this.drag;
    const dx = point.x - start.x, dy = point.y - start.y;
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
    const scaleX = handle.sx ? Math.min(4,Math.max(.2,initial.scaleX + localDX*2*handle.sx/frame.width)) : initial.scaleX;
    const scaleY = handle.sy ? Math.min(4,Math.max(.2,initial.scaleY + localDY*2*handle.sy/frame.height)) : initial.scaleY;
    return this.setTransform({ scaleX, scaleY });
  }
  endGesture(cancelled = false) {
    if (!this.drag) return false;
    const old = this.drag;
    this.drag = null;
    if (cancelled) this.setTransform(old.initial);
    else this.changed(); // Recheck full project/road validation when a gesture ends.
    return true;
  }
}

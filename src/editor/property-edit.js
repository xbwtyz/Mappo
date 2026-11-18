import { copyJson } from '../data/project-format.js';

// 3I-A deliberately keeps every preview in memory. No city/project mutation,
// project document field, or accepted edit is possible at this checkpoint.
export class PropertyEditSession3I {
  constructor(changed = () => {}) {
    this.changed = changed;
    this.active = null;
    this.selectedCorner = null;
  }
  get isActive() { return Boolean(this.active); }
  get propertyId() { return this.active?.propertyId ?? null; }
  get isPending() { return false; } // Editable geometry arrives in 3I-B.
  source(city) {
    return city?.properties?.find(property => property.id === this.propertyId) ?? null;
  }
  previewFor(city) {
    return this.isActive && this.source(city) ? copyJson(this.active.boundary) : null;
  }
  start(city, propertyId) {
    const property = city?.properties?.find(item => item.id === propertyId);
    if (!property || !Array.isArray(property.boundary) || property.boundary.length !== 4) return false;
    this.active = { propertyId, boundary: copyJson(property.boundary) };
    this.selectedCorner = null;
    this.changed();
    return true;
  }
  selectCorner(index) {
    if (!this.isActive || !Number.isInteger(index) || index < 0 || index > 3) return false;
    this.selectedCorner = index;
    this.changed();
    return true;
  }
  hitCorner(city, point, zoom = 1) {
    const preview = this.previewFor(city);
    if (!preview || !point) return null;
    const radius = 12 / Math.max(0.18, zoom);
    let closest = null, distance = radius;
    preview.forEach((corner, i) => {
      const d = Math.hypot(corner.x - point.x, corner.y - point.y);
      if (d <= distance) { closest = i; distance = d; }
    });
    return closest;
  }
  reset() {
    if (!this.isActive) return false;
    this.selectedCorner = null;
    this.changed();
    return true;
  }
  stop() {
    if (!this.isActive) return false;
    this.active = null;
    this.selectedCorner = null;
    this.changed();
    return true;
  }
}

// Transient building edit context: no mutations to city records or saved projects.
export class BuildingEditSession {
  constructor(changed = () => {}) { this.active = null; this.changed = changed; }
  get isActive() { return this.active !== null; }
  get buildingId() { return this.active?.buildingId ?? null; }
  get propertyId() { return this.active?.propertyId ?? null; }
  isEditing(id) { return Boolean(this.active && this.active.buildingId === id); }
  resolve(city, layers, id, propertyId = null) {
    if (!city || layers?.buildings === false || typeof id !== 'string') return null;
    const building = city.buildings?.find(item => item.id === id);
    const property = city.properties?.find(item => item.id === building?.propertyId);
    if (!building || !property || !(property.buildingIds ?? []).includes(id)) return null;
    if (propertyId !== null && property.id !== propertyId) return null;
    return { buildingId: id, propertyId: property.id };
  }
  start(city, layers, id) {
    const target = this.resolve(city, layers, id);
    if (!target) return false;
    if (this.isEditing(id)) return true;
    this.active = target; this.changed(); return true;
  }
  allows(city, layers, id) {
    return Boolean(this.active && this.resolve(city, layers, id, this.active.propertyId));
  }
  focus(city, layers, id) {
    if (!this.allows(city, layers, id)) return false;
    if (this.isEditing(id)) return true;
    this.active = this.resolve(city, layers, id, this.active.propertyId);
    this.changed(); return true;
  }
  stop() {
    if (!this.active) return false;
    this.active = null; this.changed(); return true;
  }
  reconcile(city, layers, selection) {
    if (!this.active) return true;
    const live = this.resolve(city, layers, this.active.buildingId, this.active.propertyId);
    if (!live || selection?.kind !== 'building' || selection.id !== live.buildingId) {
      this.stop(); return false;
    }
    return true;
  }
}

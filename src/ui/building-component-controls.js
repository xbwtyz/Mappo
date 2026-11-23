import { boundsOf, pointInPolygon } from '../core/geometry.js';

const componentFields = {
  dx:'componentOffsetX', dy:'componentOffsetY', angle:'componentAngle',
  scaleX:'componentScaleX', scaleY:'componentScaleY', x:'componentCenterX', y:'componentCenterY',
  width:'componentWidth', depth:'componentDepth'
};

export function initialBuildingComponentDraft(property) {
  const box = boundsOf(property.boundary);
  return {action:'transform', componentId:'', parentId:'', name:'', dx:0, dy:0, angle:0,
    scaleX:100, scaleY:100, x:(box.minX + box.maxX) / 2, y:(box.minY + box.maxY) / 2, width:3, depth:3};
}

export class BuildingComponentControls {
  constructor(get, getSession, getBuilding, changed) {
    Object.assign(this, {get, getSession, getBuilding, changed});
    for (const [key, id] of Object.entries(componentFields)) get(id).addEventListener('change', () => {
      const draft = this.draft();
      if (!draft) return;
      const input = get(id);
      draft[key] = input.value === '' ? NaN : Number(input.value);
      changed();
    });
    for (const [key, id] of Object.entries({action:'componentAction', parentId:'componentParent',
      name:'componentName'})) get(id).addEventListener('change', () => {
      const draft = this.draft();
      if (!draft) return;
      draft[key] = get(id).value;
      changed();
    });
    get('componentTarget').addEventListener('change', () => this.select(get('componentTarget').value));
  }

  draft() { return this.getSession()?.active?.componentDraft; }

  select(id) {
    const draft = this.draft();
    const building = this.getBuilding();
    if (!draft || !building) return;
    const component = building.components.find(c => c.id === id);
    Object.assign(draft, {componentId: id, parentId: component?.parentId ?? '', name: component?.name ?? '',
      dx:0, dy:0, angle:0, scaleX:100, scaleY:100});
    if (!component && ['organize','remove'].includes(draft.action)) draft.action = 'transform';
    this.changed();
  }

  choosePoint(point) {
    const draft = this.draft();
    if (!draft) return;
    if (draft.action === 'add') {
      Object.assign(draft, point);
      this.changed();
      return;
    }
    const building = this.getBuilding();
    const region = building?.geometry.regions.find(r => r.kind === 'solid' && pointInPolygon(point, r.ring) &&
      !building.geometry.regions.some(h => h.parentId === r.id && pointInPolygon(point, h.ring)));
    if (region) this.select(region.componentId);
  }

  options(id, rows, value) {
    const select = this.get(id);
    const current = select.options ?? [];
    if (current.length !== rows.length || rows.some(([key, label], i) =>
      current[i].value !== key || current[i].textContent !== label))
      select.replaceChildren(...rows.map(([key, label]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = label;
        return option;
      }));
    if (select.value !== value) select.value = value;
  }

  sync(building) {
    const draft = this.draft();
    if (!draft || !building) return;
    const depths = new Map();
    const rows = building.components.map(c => {
      const depth = (depths.get(c.parentId) ?? -1) + 1;
      depths.set(c.id, depth);
      return [c.id, '↳ '.repeat(depth) + (c.name || (c.parentId === null ? 'Primary component' : c.id))];
    });
    const selected = building.components.find(c => c.id === draft.componentId);
    const adding = draft.action === 'add', organizing = draft.action === 'organize';
    this.options('componentTarget', [['', 'Whole building'], ...rows], draft.componentId);
    this.options('componentAction', [['transform', 'Transform'], ['add', 'Add rectangle'],
      ...(selected ? [['organize','Rename or reparent']] : []),
      ...(selected?.parentId ? [['remove','Remove component']] : [])], draft.action);
    this.options('componentParent', rows.filter(([key]) => key !== selected?.id), draft.parentId);
    const get = this.get;
    get('componentTransformFields').hidden = draft.action !== 'transform';
    get('componentRectangleFields').hidden = !adding;
    get('componentAngleRow').hidden = !adding && draft.action !== 'transform';
    get('componentNameRow').hidden = !adding && !organizing;
    get('componentParentRow').hidden = !organizing || !selected?.parentId;
    get('componentName').value = draft.name;
    for (const [key, id] of Object.entries(componentFields)) {
      const input = get(id);
      if (document.activeElement !== input)
        input.value = Number.isFinite(draft[key]) ? String(Number(draft[key].toFixed(3))) : '';
    }
  }
}

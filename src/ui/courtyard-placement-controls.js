import { distanceToSegment } from '../core/boundary.js';
import { courtyardPlacementHosts, courtyardPlacementOptions } from '../editor/courtyard-placement.js';

const courtyardInputIds = {
  hostId: 'structureCourtyardHost', portalId: 'structurePortal', action: 'structurePortalAction',
  replacementId: 'structurePortalReplacement', courtyardId: 'structurePortalCourtyard',
  innerEdge: 'structurePortalInnerEdge', outerEdge: 'structurePortalOuterEdge',
  innerOffset: 'structurePortalInnerOffset', outerOffset: 'structurePortalOuterOffset',
  width: 'structurePortalWidth', only: 'structureCourtyardOnly'
};

export class CourtyardPlacementControls {
  constructor(get, getCity, changed) {
    this.get = get;
    this.session = null;
    for (const [key, id] of Object.entries(courtyardInputIds)) get(id).addEventListener('change', () => {
      if (!this.session?.isActive || this.session.operation !== 'add') return;
      const input = get(id), state = this.session.active.courtyard;
      if (key === 'hostId') {
        Object.assign(state, {hostId: input.value, portalId: '', courtyardId: '', replacementId: '',
          only: Boolean(input.value && state.only), action: 'save', innerEdge: 0, outerEdge: 0});
      } else if (key === 'portalId') {
        Object.assign(state, {portalId: input.value, action: input.value && !state.only ? 'use' : 'save', replacementId: ''});
        const host = getCity()?.buildings.find(b => b.id === state.hostId);
        const portal = courtyardPlacementOptions(host).portals.find(p => p.id === state.portalId);
        if (portal) Object.assign(state, courtyardExistingOpeningValues(host, portal));
      } else if (key === 'only') {
        state.only = input.checked;
        state.action = state.portalId && !state.only ? 'use' : 'save';
      } else if (key === 'courtyardId') {
        Object.assign(state, {courtyardId: input.value, innerEdge: 0, outerEdge: 0});
      } else if (['innerEdge', 'outerEdge', 'width'].includes(key)) {
        state[key] = input.value === '' ? NaN : Number(input.value);
      } else if (key === 'innerOffset' || key === 'outerOffset') {
        state[key] = input.value === '' ? NaN : Number(input.value) / 100;
      } else {
        state[key] = input.value;
      }
      changed();
    });
  }

  options(id, rows, value) {
    const select = this.get(id);
    const current = select.options ?? [];
    if (current.length !== rows.length || rows.some(([key, name], i) =>
      current[i].value !== key || current[i].textContent !== name)) {
      select.replaceChildren(...rows.map(([key, name]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = name;
        return option;
      }));
    }
    if (select.value !== String(value)) select.value = value;
    return select.value;
  }

  sync(city, session) {
    const get = this.get;
    this.session = session;
    const hosts = session.operation === 'add' ? courtyardPlacementHosts(city, session.propertyId) : [];
    get('structureCourtyardAccess').hidden = hosts.length === 0;
    if (!hosts.length) return;
    const state = session.active.courtyard ??= {hostId: '', portalId: '', action: 'save', replacementId: '',
      courtyardId: '', innerEdge: 0, outerEdge: 0, innerOffset: .5, outerOffset: .5, width: 1.5, only: false};
    this.options(courtyardInputIds.hostId, [['', 'None'], ...hosts.map(host =>
      [host.id, host.customName || host.id])], state.hostId);
    const host = hosts.find(b => b.id === state.hostId);
    get('structurePortalOptions').hidden = !host;
    get('structureCourtyardOnlyLabel').hidden = !host;
    get(courtyardInputIds.only).checked = Boolean(host && state.only);
    get('structurePortalOpenings').hidden = !host || state.action !== 'save';
    get('structurePortalActionLabel').hidden = !host || !state.portalId;
    get('structurePortalReplacementLabel').hidden = !host || state.action !== 'remove';
    if (!host) return;
    const {courtyards, portals} = courtyardPlacementOptions(host);
    this.options(courtyardInputIds.portalId, [['', 'New portal'], ...portals.map(p => [p.id, p.id])], state.portalId);
    this.options(courtyardInputIds.action, state.only ? [['save', 'Place openings'], ['remove', 'Remove']]
      : [['use', 'Use existing'], ['save', 'Place openings']], state.action);
    this.options(courtyardInputIds.replacementId, [['', 'None'], ...portals.filter(p => p.id !== state.portalId)
      .map(p => [p.id, p.id])], state.replacementId);
    const courtyard = courtyards.find(r => r.id === state.courtyardId) ?? courtyards[0];
    state.courtyardId = courtyard.id;
    this.options(courtyardInputIds.courtyardId, courtyards.map((r, i) => [r.id, 'Courtyard ' + (i + 1)]), courtyard.id);
    const exterior = host.geometry.regions.find(r => r.id === courtyard.parentId);
    for (const [key, ring, label] of [['innerEdge', courtyard.ring, 'C'], ['outerEdge', exterior.ring, 'E']]) {
      state[key] = Math.min(state[key], ring.length - 1);
      this.options(courtyardInputIds[key], ring.map((p, i) => [String(i), label + (i + 1)]), state[key]);
    }
    for (const key of ['innerOffset', 'outerOffset', 'width']) {
      const input = get(courtyardInputIds[key]);
      if (document.activeElement !== input) input.value = Number.isFinite(state[key])
        ? String(Number((state[key] * (key === 'width' ? 1 : 100)).toFixed(4))) : '';
    }
  }
}

function courtyardExistingOpeningValues(host, portal) {
  const openings = {courtyardId: portal.courtyardId, width: Math.hypot(
    portal.inner[1].x - portal.inner[0].x, portal.inner[1].y - portal.inner[0].y)};
  for (const [key, points, id] of [['inner', portal.inner, portal.courtyardId], ['outer', portal.outer, portal.exteriorId]]) {
    const ring = host.geometry.regions.find(r => r.id === id).ring;
    const index = ring.findIndex((a, i) => points.every(p => distanceToSegment(p, a, ring[(i + 1) % ring.length]) <= 1e-6));
    const a = ring[index], b = ring[(index + 1) % ring.length];
    const midpoint = {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2};
    openings[key + 'Edge'] = index;
    openings[key + 'Offset'] = Math.hypot(midpoint.x - a.x, midpoint.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
  }
  return openings;
}

import {
  COURTYARD_ACCESS_LIMITS, inspectCourtyardPortal, makeCourtyardPortal, resolveCourtyardAccess
} from '../core/courtyard-access.js';

export function courtyardPlacementHosts(city, propertyId) {
  return city.buildings.filter(b => b.propertyId === propertyId && b.footprint && b.holes?.length);
}

export function courtyardPlacementOptions(host) {
  if (!host) return {courtyards: [], portals: []};
  return {
    courtyards: host.geometry.regions.filter(r => r.kind === 'void'),
    portals: host.geometry.version === 2 ? host.geometry.courtyardAccess.portals : []
  };
}

function writeCourtyardAccess(host, portals, occupants) {
  const geometry = {...host.geometry};
  if (portals.length) {
    if (geometry.version === 1 && Object.hasOwn(geometry, 'courtyardAccess'))
      throw Error('Existing courtyardAccess metadata cannot be overwritten.');
    const previous = geometry.version === 2 ? geometry.courtyardAccess : {};
    geometry.version = 2;
    geometry.courtyardAccess = {...previous, portals, occupants};
  } else {
    const access = geometry.courtyardAccess;
    if (Object.keys(access).some(key => !['portals', 'occupants'].includes(key)))
      throw Error('Removing the last portal would discard courtyard access metadata.');
    geometry.version = 1;
    delete geometry.courtyardAccess;
  }
  host.geometry = geometry;
}

function nextCourtyardPortalId(portals) {
  for (let i = 1; i <= COURTYARD_ACCESS_LIMITS.portals; i++) {
    const id = 'PORTAL-' + String(i).padStart(2, '0');
    if (!portals.some(portal => portal.id === id)) return id;
  }
  throw Error('This building has reached its portal limit.');
}

// Modifies only a detached candidate. Its caller validates the complete city
// and round-trips the project before the editor may record a transaction.
export function editCourtyardPlacement(city, propertyId, spec, building = null) {
  const host = courtyardPlacementHosts(city, propertyId).find(b => b.id === spec.hostId);
  if (!host) throw Error('Choose an enclosing courtyard building on this property.');
  const {portals} = courtyardPlacementOptions(host);
  const occupants = host.geometry.version === 2 ? host.geometry.courtyardAccess.occupants : [];
  const existing = portals.find(portal => portal.id === spec.portalId);
  if (spec.portalId && !existing) throw Error('The selected portal is no longer available.');
  const action = spec.action;
  if (!['use', 'save', 'remove'].includes(action) || (action !== 'save' && !existing))
    throw Error('Choose an existing portal or place a new one.');
  if (action === 'remove') {
    const remaining = portals.filter(portal => portal !== existing);
    const replacement = remaining.find(portal => portal.id === spec.replacementId);
    if (!replacement && occupants.some(link => link.portalId === existing.id))
      throw Error('Select a replacement portal for the buildings using ' + existing.id + '.');
    const links = occupants.map(link => link.portalId === existing.id ? {...link, portalId: replacement.id} : link);
    writeCourtyardAccess(host, remaining, links);
    return {paths: resolveCourtyardUsers(city, host, replacement, links.filter(link => link.portalId === replacement?.id))};
  }
  const portal = action === 'use' ? existing : {
    ...existing, ...makeCourtyardPortal(host, spec, existing?.id ?? nextCourtyardPortalId(portals))
  };
  const next = existing ? portals.map(entry => entry === existing ? portal : entry) : [...portals, portal];
  const links = building ? [...occupants, {buildingId: building.id, portalId: portal.id}] : occupants;
  let work = 0;
  const {strip} = inspectCourtyardPortal(city, host, portal, units => {
    work += units;
    if (work > COURTYARD_ACCESS_LIMITS.searchWork) throw Error('Courtyard validation reached its work limit.');
  });
  writeCourtyardAccess(host, next, links);
  const paths = resolveCourtyardUsers(city, host, portal, links.filter(link => link.portalId === portal.id));
  return {strip, paths};
}

function resolveCourtyardUsers(city, host, portal, links) {
  return links.map(link => {
    const occupant = city.buildings.find(b => b.id === link.buildingId);
    if (!occupant) throw Error('A courtyard building is no longer available.');
    const result = resolveCourtyardAccess(city, occupant, {host, portal});
    if (!result.route) throw Error(result.issue.message);
    Object.assign(occupant, result.route);
    return occupant.accessPath;
  });
}

export function detachCourtyardBuilding(city, building) {
  if (building.geometry.version === 2 && building.geometry.courtyardAccess.occupants.length)
    throw Error('Remove or relocate this building’s courtyard occupants before deleting the enclosing building.');
  for (const host of city.buildings) {
    if (host.geometry.version !== 2) continue;
    const {portals, occupants} = host.geometry.courtyardAccess;
    const remaining = occupants.filter(link => link.buildingId !== building.id);
    if (remaining.length !== occupants.length) writeCourtyardAccess(host, portals, remaining);
  }
}

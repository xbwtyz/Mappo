import assert from 'node:assert/strict';
import { writeSimpleBuildingS10 } from '../../src/core/building-project-s10.js';
import { deriveOccupiedPlots } from '../../src/editor/building-application.js';
import { createProject } from '../../src/core/city-model.js';
import { defaultWorkspace, copyJson } from '../../src/data/project-format.js';
import { prepareBuildingStructure3H } from '../../src/editor/building-structures.js';

export function courtyardFixture({ skewed = false } = {}) {
  const project = copyJson(createProject({seed: 's10c-courtyard', size: 'small', morphology: 'planned'}));
  const property = project.city.properties.find(p => p.id === 'PROP-00011');
  project.city.buildings = project.city.buildings.filter(b => b.propertyId !== property.id);
  property.buildingIds = [];
  const workspace = defaultWorkspace(project);
  const position = {u: property.local.x + property.local.width / 2,
    v: property.local.y + property.local.depth / 2};
  const spec = {width: 22, depth: 26, angle: 0, type: 'house', preset: 'courtyard', ...position};
  const request = {operation: 'add', propertyId: property.id, buildingId: 'BLD-MAN-COURTYARD-HOST', spec};
  const result = prepareBuildingStructure3H(project, workspace, request);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const accepted = result.candidate;
  const index = accepted.city.buildings.findIndex(b => b.id === request.buildingId);
  let host = accepted.city.buildings[index];
  if (skewed) {
    const ring = host.holes[0];
    const center = {x: (ring[0].x + ring[2].x) / 2, y: (ring[0].y + ring[2].y) / 2};
    const cos = Math.cos(-.14), sin = Math.sin(-.14);
    const rotated = ring.map(p => {
      const x = p.x - center.x, y = p.y - center.y;
      return {x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos};
    });
    // Match the supplied map: E1 and C4 face each other at a slight angle.
    const holes = [[...rotated.slice(1), rotated[0]]];
    host = writeSimpleBuildingS10(host, {footprint: host.footprint, holes});
    host.plotIds = deriveOccupiedPlots(accepted.city, property, host);
    accepted.city.buildings[index] = host;
  }
  const courtyardId = host.geometry.regions.find(r => r.kind === 'void').id;
  const access = {hostId: host.id, action: 'save', courtyardId, innerEdge: skewed ? 3 : 0, outerEdge: 0,
    innerOffset: .5, outerOffset: .5, width: 1.5};
  const occupant = {operation: 'add', propertyId: property.id, buildingId: 'BLD-MAN-COURTYARD-OCCUPANT',
    spec: {...position, width: 2.5, depth: 3, angle: 0, type: 'workshop', preset: 'rectangle'},
    courtyard: access};
  return {project: accepted, workspace, host, occupant};
}

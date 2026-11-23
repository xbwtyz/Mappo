import assert from 'node:assert/strict';
import { courtyardFixture } from './courtyard-fixture.js';
import { prepareBuildingStructure3H } from '../../src/editor/building-structures.js';

export function buildingComponentFixture() {
  const {project, workspace, host, occupant} = courtyardFixture();
  const property = project.city.properties.find(p => p.id === host.propertyId);
  const primarySpec = {...occupant.spec, width: 4, depth: 4, u: occupant.spec.u - 6};
  const result = prepareBuildingStructure3H(project, workspace, {operation:'replace',
    buildingId:host.id, propertyId:property.id, spec:primarySpec});
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const original = result.candidate.city.buildings.find(b => b.id === host.id);
  const center = {x: footprintCenter(original, 'x'), y: footprintCenter(original, 'y')};
  const first = {action:'add', name:'North tower', x:center.x, y:center.y - 8, width:3, depth:3, angle:0};
  const second = {...first, name:'Rear tower', x:first.x + 7};
  return {project:result.candidate, workspace, property, original, first, second};
}

function footprintCenter(building, axis) {
  return building.footprint.reduce((total, point) => total + point[axis], 0) / building.footprint.length;
}

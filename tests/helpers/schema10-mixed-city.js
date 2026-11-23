import assert from 'node:assert/strict';
import { buildingComponentFixture } from './building-component-fixture.js';
import { prepareBuildingComponents } from '../../src/editor/building-component-application.js';
import { prepareBuildingStructure3H } from '../../src/editor/building-structures.js';
import { preparePropertyBuildingClear4E } from '../../src/editor/property-building-clear-4e.js';

export function mixedCityFixtureS10() {
  const { project, workspace, original, first, second } = buildingComponentFixture();
  const findBuilding = (source, id) => source.city.buildings.find(building => building.id === id);
  const accept = receipt => {
    assert.equal(receipt.ok, true, JSON.stringify(receipt.issues));
    return receipt.candidate;
  };
  let city = accept(prepareBuildingComponents(project, workspace, original.id, first));
  city = accept(prepareBuildingComponents(city, workspace, original.id, second));
  const incoming = findBuilding(city, original.id).components.find(part => part.name === first.name);
  city = accept(prepareBuildingComponents(city, workspace, original.id, {
    action: 'join', componentId: 'BC-ROOT', incomingId: incoming.id, transform: {dy: 5.5}, confirmJoin: true
  }));

  const courtyardPropertyId = 'PROP-00018';
  const hostId = 'BLD-MAN-MIXED-HOST';
  const occupantId = 'BLD-MAN-MIXED-OCCUPANT';
  city = accept(preparePropertyBuildingClear4E(city, workspace, courtyardPropertyId));
  const {local} = city.city.properties.find(property => property.id === courtyardPropertyId);
  const spec = {u: local.x + local.width / 2, v: local.y + local.depth / 2,
    width: 20, depth: 22, angle: 0, type: 'house', preset: 'courtyard'};
  const request = {operation:'add', buildingId:hostId, propertyId:courtyardPropertyId, spec};
  city = accept(prepareBuildingStructure3H(city, workspace, request));
  const courtyardId = findBuilding(city, hostId).geometry.regions.find(region => region.kind === 'void').id;
  city = accept(prepareBuildingStructure3H(city, workspace, {
    ...request, buildingId:occupantId, spec:{...spec, width:3, depth:3, preset:'rectangle'},
    courtyard:{hostId, action:'save', courtyardId, innerEdge:0, outerEdge:0,
      innerOffset:.5, outerOffset:.5, width:1.5}
  }));
  return {project:city, workspace, hostId, occupantId, joinedId:original.id, joinedPropertyId:original.propertyId};
}

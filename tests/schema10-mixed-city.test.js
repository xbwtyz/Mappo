import assert from 'node:assert/strict';
import test from 'node:test';

import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { distanceToSegment } from '../src/core/boundary.js';
import { validateCourtyardAccess } from '../src/core/courtyard-access.js';
import { occupiedPlotAreaS10 } from '../src/core/building-occupancy-s10.js';
import { prepareJunctionReflowC7 } from '../src/core/neighborhood-reflow.js';
import { copyJson, createProjectDocument, decodeProjectDocument, encodeProjectDocument } from '../src/data/project-format.js';
import { prepareBuildingApply } from '../src/editor/building-application.js';
import { prepareBuildingComponents } from '../src/editor/building-component-application.js';
import { preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { preparePropertySplitE2, PropertySplitSessionE2 } from '../src/editor/property-split-e2.js';
import { validateRoadApplyC2 } from '../src/editor/road-application.js';
import { mixedCityFixtureS10 } from './helpers/schema10-mixed-city.js';

const {project, workspace, hostId, occupantId, joinedId, joinedPropertyId} = mixedCityFixtureS10();
const building = (source, id) => source.city.buildings.find(row => row.id === id);

function candidate(receipt) {
  assert.equal(receipt.ok, true, JSON.stringify(receipt.issues));
  return receipt.candidate;
}

function assertHistoryAndSave(states, transactions) {
  const history = new AcceptedEditHistoryD01();
  history.clear(states[0]);
  for (const [index, state] of states.slice(1).entries())
    assert.equal(history.observe(state, transactions[index]).status, 'recorded');
  let current = states.at(-1);
  for (const [direction, sequence] of [
    ['undo', states.slice(0, -1).reverse()], ['redo', states.slice(1)]
  ]) {
    for (const expected of sequence) {
      const receipt = history.prepare(direction, current, workspace);
      assert.equal(receipt.ok, true, receipt.reason);
      // History and portable saves compare JSON values, where -0 and 0 encode alike.
      assert.deepEqual(receipt.candidate, copyJson(expected));
      history.accept(direction, receipt.entry, receipt.candidate);
      current = receipt.candidate;
    }
  }
  const document = createProjectDocument(current, workspace);
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(document)).project, copyJson(current));
}

test('Schema 10 mixed city preserves the portal and joined outline through building edits and history', () => {
  const movedOccupant = candidate(prepareBuildingApply(project, workspace, occupantId, {dx: .25, dy: .5}));
  const before = building(movedOccupant, joinedId);
  const tower = before.components.find(part => part.name === 'Rear tower');
  const after = candidate(prepareBuildingComponents(movedOccupant, workspace, joinedId, {
    action: 'transform', componentId: tower.id, transform: {dy: .4}
  }));
  const root = before.geometry.regions.find(region => region.componentId === 'BC-ROOT');
  assert.equal(root.ring.length, 8);
  assert.equal(before.geometry.regions.length, 2);
  assert.deepEqual(building(after, joinedId).geometry.regions.find(region => region.id === root.id), root);
  assert.deepEqual(building(after, hostId), building(project, hostId));
  assert.deepEqual(building(after, occupantId), building(movedOccupant, occupantId));
  assertHistoryAndSave([project, movedOccupant, after], [
    { family: 'building', operation: 'building-geometry', label: 'Move building', targetIds: [occupantId] },
    { family: 'building', operation: 'building-structure', label: 'Edit building components', targetIds: [joinedId] },
  ]);
});

test('Schema 10 mixed city recomputes plot occupancy and blocks a split through a joined building', () => {
  const start = JSON.stringify(project);
  const edit = new PropertyEditSession3I();
  assert.equal(edit.start(project.city, joinedPropertyId), true);
  assert.equal(edit.setDivider(0, .8), true);
  const divided = candidate(preparePropertyApply3I(project, workspace, edit));
  const before = building(project, joinedId), after = building(divided, joinedId);
  const occupied = divided.city.plots.filter(plot => plot.propertyId === joinedPropertyId &&
    occupiedPlotAreaS10(after.geometry, plot.boundary) > 1e-5).map(plot => plot.id);
  assert.equal(before.plotIds.length, 2);
  assert.equal(occupied.length, 1);
  assert.deepEqual(after.plotIds, occupied);
  assert.deepEqual(after.geometry, before.geometry);
  assert.deepEqual(building(divided, hostId), building(project, hostId));
  assert.deepEqual(building(divided, occupantId), building(project, occupantId));

  const split = new PropertySplitSessionE2();
  assert.equal(split.start(divided.city, joinedPropertyId), true);
  assert.equal(split.setT(.5), true);
  const dividedSnapshot = JSON.stringify(divided);
  const blocked = preparePropertySplitE2(divided, workspace, split);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.candidate, null);
  assert.ok(blocked.issues.some(issue => issue.code === 'building' && issue.targetId === joinedId));
  assert.equal(JSON.stringify(divided), dividedSnapshot);
  assert.equal(JSON.stringify(project), start);
  assertHistoryAndSave([project, divided], [{ family: 'property', operation: 'property-and-plot',
    label: 'Edit plot partitions', targetIds: [joinedPropertyId] }]);
});

test('Schema 10 mixed city requires consent to reconnect fixed courtyard buildings after a frontage move', () => {
  const start = JSON.stringify(project);
  const occupant = building(project, occupantId);
  const frontage = project.city.roads.find(road => road.id === occupant.frontageRoadId);
  const next = id => project.city.nodes.find(node => node.id === id);
  const nearby = next('N-0153');
  assert.ok(project.city.roads.some(road => [road.a, road.b].includes(nearby.id) &&
    [road.a, road.b].includes(frontage.a)));
  const point = {x: nearby.x + .5, y: nearby.y};
  const inspected = prepareJunctionReflowC7(project, nearby.id, point);
  assert.ok(inspected.candidateProject, JSON.stringify(inspected.unresolved));
  const roadEdit = candidate(validateRoadApplyC2(project, workspace, {
    selection: {kind: 'junction', id: nearby.id}, point, buildingDecisions: new Map()
  }, inspected));
  assert.equal(roadEdit.city.nodes.find(node => node.id === nearby.id).x, point.x);
  for (const id of [occupantId, hostId, joinedId]) assert.deepEqual(building(roadEdit, id), building(project, id));

  const junction = next(frontage.a);
  const movedFrontage = {x: junction.x, y: junction.y + .5};
  const blocked = prepareJunctionReflowC7(project, junction.id, movedFrontage);
  assert.equal(blocked.candidateProject, null);
  assert.ok(blocked.unresolved.some(issue => issue.id === occupantId && issue.code === 'access-decision-required'));
  assert.deepEqual(blocked.parcelReview.find(review => review.id === occupant.propertyId).options,
    [{kind:'reshape',targetId:null,label:'Reshape property and reconnect courtyard access'}]);
  assert.equal(validateRoadApplyC2(project, workspace, {selection:{kind:'junction', id:junction.id},
    point: movedFrontage, buildingDecisions:new Map()}, blocked).ok, false);
  const reshape = new Map([[occupant.propertyId, {kind: 'reshape', targetId: null}]]);
  const preview = prepareJunctionReflowC7(project, junction.id, movedFrontage, new Map(), {parcelChoices: reshape});
  assert.ok(preview.candidateProject, JSON.stringify(preview.unresolved));
  const repaired = candidate(validateRoadApplyC2(project, workspace, {
    selection: {kind: 'junction', id: junction.id}, point: movedFrontage,
    buildingDecisions: new Map(), parcelChoices: reshape
  }, preview));
  const [a, b] = [frontage.a, frontage.b].map(id => repaired.city.nodes.find(node => node.id === id));
  for (const id of [hostId, occupantId]) {
    const original = building(project, id), fixed = building(repaired, id);
    assert.deepEqual(fixed.geometry, original.geometry);
    assert.equal(fixed.propertyId, original.propertyId);
    assert.notDeepEqual(fixed.accessPath, original.accessPath);
    assert.equal(fixed.frontageRoadId, frontage.id);
    assert.ok(distanceToSegment(fixed.accessPath.at(-1), a, b) <= 1e-5);
  }
  assert.deepEqual(building(repaired, joinedId), building(project, joinedId));
  validateCourtyardAccess(repaired.city, () => {});
  assertHistoryAndSave([project, roadEdit], [{ family: 'road', operation: 'road-reflow',
    label: 'Move road junction', targetIds: [nearby.id] }]);
  assertHistoryAndSave([project, repaired], [{ family: 'road', operation: 'road-reflow',
    label: 'Move road junction', targetIds: [junction.id] }]);

  const invalidPoint = {...movedFrontage, y: junction.y + 3};
  const infeasible = prepareJunctionReflowC7(project, junction.id, invalidPoint, new Map(), {parcelChoices: reshape});
  assert.equal(infeasible.candidateProject, null);
  assert.ok(infeasible.unresolved.some(issue => /Property boundaries overlap/.test(issue.message)));
  assert.equal(validateRoadApplyC2(project, workspace, {selection:{kind:'junction', id:junction.id},
    point: invalidPoint, buildingDecisions:new Map(), parcelChoices:reshape}, infeasible).ok, false);
  assert.equal(JSON.stringify(project), start);
});

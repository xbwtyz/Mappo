import assert from 'node:assert/strict';

import { prepareBuildingApply, inspectBuildingPreview } from '../../src/editor/building-application.js';
import { inspectPropertyEdit3I, preparePropertyApply3I } from '../../src/editor/property-application.js';
import { preparePropertyBuildingClear4E } from '../../src/editor/property-building-clear-4e.js';
import { PropertyEditSession3I } from '../../src/editor/property-edit.js';
import { inspectPropertySplitE2, preparePropertySplitE2, PropertySplitSessionE2 } from '../../src/editor/property-split-e2.js';
import { validateRoadApplyC2 } from '../../src/editor/road-application.js';
import { buildRoadGraph } from '../../src/core/road-graph.js';
import { createProject } from '../../src/core/city-model.js';
import { prepareJunctionReflowC7 } from '../../src/core/neighborhood-reflow.js';
import { defaultWorkspace } from '../../src/data/project-format.js';
import { prepareBuildingStructure3H } from '../../src/editor/building-structures.js';
import { courtyardFixture } from './courtyard-fixture.js';
import { mixedCityFixtureS10 } from './schema10-mixed-city.js';

function building(fixture, target, transform) {
  const {project, workspace} = fixture;
  const preview = inspectBuildingPreview(project, target, transform);
  const apply = prepareBuildingApply(project, workspace, target, transform);
  return {preview, apply};
}

function property(fixture, target, input) {
  const {project, workspace} = fixture;
  const session = new PropertyEditSession3I();
  assert.ok(session.start(project.city, target));
  if ('ratio' in input) {
    assert.ok(session.setDivider(0, input.ratio));
  } else {
    const {index, dx, dy, insertAfter} = input;
    if (insertAfter != null) assert.ok(session.addVertex(insertAfter));
    const {x, y} = session.boundary[index];
    assert.ok(session.setCorner(index, {x: x + dx, y: y + dy}));
  }
  const preview = inspectPropertyEdit3I(project, session);
  const apply = preparePropertyApply3I(project, workspace, session);
  session.reset();
  assert.equal(session.isPending, false);
  return {preview, apply};
}

function split(fixture, target, {ratio}) {
  const {project, workspace} = fixture;
  const session = new PropertySplitSessionE2();
  assert.ok(session.start(project.city, target));
  assert.ok(session.setT(ratio));
  const preview = inspectPropertySplitE2(project, session);
  const apply = preparePropertySplitE2(project, workspace, session);
  session.stop();
  assert.equal(session.active, false);
  return {preview, apply};
}

function junction(fixture, target, {dx, dy, parcel, choice}) {
  const {project, workspace} = fixture;
  const node = project.city.nodes.find(row => row.id === target);
  const point = {x: node.x + dx, y: node.y + dy};
  const parcelChoices = new Map(parcel ? [[parcel, {kind: choice, targetId: null}]] : []);
  const buildingDecisions = new Map();
  const proposal = prepareJunctionReflowC7(project, target, point, buildingDecisions, {parcelChoices});
  const preview = {ok: Boolean(proposal.candidateProject), issues: proposal.unresolved};
  const apply = validateRoadApplyC2(project, workspace, {
    selection: {kind: 'junction', id: target}, point, buildingDecisions, parcelChoices
  }, proposal);
  return {preview, apply, proposal};
}

const run = {building, property, split, junction};

export const auditControls = {
  'courtyard-cross-plot': {fixture: 'skewed', kind: 'building', target: 'BLD-MAN-COURTYARD-OCCUPANT', input: {dy: 2}},
  'courtyard-wall': {fixture: 'skewed', kind: 'building', target: 'BLD-MAN-COURTYARD-OCCUPANT', input: {dy: 10}},
  'multipart-split': {fixture: 'mixed-after-divider', kind: 'split', target: 'PROP-00011', input: {ratio: .5}},
  'irregular-split-occupied': {fixture: 'organic', kind: 'split', target: 'PROP-00003', input: {ratio: .5}},
  'irregular-split-vacant': {fixture: 'organic-vacant', kind: 'split', target: 'PROP-00003', input: {ratio: .5}},
  'nearby-junction': {fixture: 'mixed', kind: 'junction', target: 'N-0153', input: {dx: .5, dy: 0}},
  'portal-frontage': {fixture: 'mixed', kind: 'junction', target: 'N-0154', input: {dx: 0, dy: .5}},
  'portal-frontage-reshape': {fixture: 'mixed', kind: 'junction', target: 'N-0154',
    input: {dx: 0, dy: .5, parcel: 'PROP-00018', choice: 'reshape'}},
};

const layouts = new Map([
  ['organic', {seed: '3i-property-draft', size: 'small', morphology: 'organic', irregularProperties: true}],
  ['radial', {seed: 'adjustment-audit-radial', size: 'small', morphology: 'radial'}],
  ['linear', {seed: 'adjustment-audit-linear', size: 'small', morphology: 'linear'}],
]);

export function createAdjustmentAudit() {
  const fixtures = new Map();

  function fixture(name) {
    if (fixtures.has(name)) return fixtures.get(name);
    let result;
    if (name === 'mixed') {
      result = mixedCityFixtureS10();
    } else if (name === 'mixed-after-divider') {
      const mixed = fixture('mixed');
      const {apply} = property(mixed, mixed.joinedPropertyId, {ratio: .8});
      assert.ok(apply.ok, JSON.stringify(apply.issues));
      result = {...mixed, project: apply.candidate};
    } else if (name === 'organic-vacant') {
      const {target} = auditControls['irregular-split-vacant'];
      const organic = fixture('organic');
      const receipt = preparePropertyBuildingClear4E(organic.project, organic.workspace, target);
      assert.ok(receipt.ok, JSON.stringify(receipt.issues));
      result = {...organic, project: receipt.candidate};
    } else if (name === 'skewed') {
      const {project, workspace, host, occupant} = courtyardFixture({skewed: true});
      const receipt = prepareBuildingStructure3H(project, workspace, occupant);
      assert.ok(receipt.ok, JSON.stringify(receipt.issues));
      result = {project: receipt.candidate, workspace, hostId: host.id, occupantId: occupant.buildingId};
    } else {
      assert.ok(layouts.has(name), 'Unknown fixture ' + name);
      const project = createProject(layouts.get(name));
      result = {project, workspace: defaultWorkspace(project)};
    }
    fixtures.set(name, result);
    return result;
  }

  function execute(spec) {
    const source = fixture(spec.fixture);
    const before = JSON.stringify([source.project, source.workspace]);
    const {preview, apply, proposal} = run[spec.kind](source, spec.target, spec.input);
    assert.equal(JSON.stringify([source.project, source.workspace]), before, 'Edit mutated accepted state');
    assert.equal(Boolean(apply.candidate), apply.ok, 'Apply eligibility and candidate disagree');
    assert.ok(apply.ok || apply.issues?.length, 'Rejection lacks a diagnostic');
    return {preview, apply, proposal};
  }

  function* cases() {
    yield* Object.values(auditControls);
    for (const name of ['mixed', 'skewed', ...layouts.keys()]) {
      const source = fixture(name);
      const {city} = source.project;
      const graph = buildRoadGraph(city);
      const ordinary = [], protectedNodes = [];
      for (const [id, incident] of graph.incidentRoads) {
        const target = incident.some(road => graph.roadClasses.get(road)?.protected) ? protectedNodes : ordinary;
        target.push(id);
      }
      const roads = name === 'mixed' ? ['N-0153', 'N-0154', 'N-0155'] :
        [...ordinary.slice(0, 2), ...protectedNodes.slice(0, 1)];
      const buildings = [...new Set([
        source.occupantId, ...city.buildings.filter(row => !row.components || row.components.length <= 1)
          .slice(0, 2).map(row => row.id)
      ].filter(Boolean))];
      const properties = [...new Set([
        ...city.properties.filter(row => row.id === source.joinedPropertyId),
        ...city.properties.filter(row => row.boundary.length === 4 && row.plotIds.length >= 2).slice(0, 3),
        ...city.properties.filter(row => row.boundary.length > 4 && row.boundary.length < 12).slice(0, 2)
      ])];
      for (const target of buildings) {
        for (const delta of [-10, -4, -2, -.5, .5, 2, 4, 10]) {
          for (const input of [{dx: delta}, {dy: delta}]) {
            yield {fixture: name, kind: 'building', target, input};
          }
        }
        for (const angle of [-Math.PI / 2, -.5, .5, Math.PI / 2]) {
          yield {fixture: name, kind: 'building', target, input: {angle}};
        }
        for (const [scaleX, scaleY] of [[.3, .3], [.7, 1.2], [1.2, .7], [1.35, 1.35], [2, 2]]) {
          yield {fixture: name, kind: 'building', target, input: {scaleX, scaleY}};
        }
      }
      if (source.occupantId) {
        for (const dx of [-4, -2, 2, 4]) {
          for (const dy of [-4, -2, 2, 4]) {
            for (const angle of [-.6, 0, .6]) {
              yield {fixture: name, kind: 'building', target: source.occupantId, input: {dx, dy, angle}};
            }
          }
        }
      }
      for (const {id: target, boundary} of properties) {
        for (const ratio of [.05, .2, .35, .5, .65, .8, .95]) {
          yield {fixture: name, kind: 'split', target, input: {ratio}};
          if (boundary.length === 4) yield {fixture: name, kind: 'property', target, input: {ratio}};
        }
        for (const [dx, dy] of [[-8, 0], [-1, 0], [1, 0], [8, 0], [0, -8], [0, -1], [0, 1], [0, 8]]) {
          yield {fixture: name, kind: 'property', target, input: {index: 2, dx, dy}};
          yield {fixture: name, kind: 'property', target, input: {insertAfter: 2, index: 3, dx, dy}};
        }
      }
      for (const target of roads) {
        for (const delta of [-12, -3, -.5, .5, 3, 12]) {
          for (const [dx, dy] of [[delta, 0], [0, delta]]) {
            yield {fixture: name, kind: 'junction', target, input: {dx, dy}};
          }
        }
      }
    }
  }

  return {fixture, execute, cases};
}

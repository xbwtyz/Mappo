import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareRoadIntentC1 } from '../src/core/road-intent-c1.js';
import { normalizeRoadCrossingsC3 } from '../src/core/road-crossings.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const radial = () => createProject({seed:'c2-radial',size:'small',morphology:'radial'});
const crossingRoad = 'RD-0103', crossingOffset = {x:0,y:15};
const connectionCases = [
  ['RD-0099', {kind:'remove'}, -1],
  ['RD-0098', {kind:'add',endpoint:'a',target:'N-0160'}, 1],
  ['RD-0099', {kind:'reconnect',endpoint:'b',target:'N-0184'}, 0],
];

test('An ordinary crossing becomes one shared junction and locally splits a developed neighborhood', () => {
  const project = radial(), city = project.city;
  const before = structuredClone(project);
  const draft = prepareRoadIntentC1(project, crossingRoad, crossingOffset);
  assert.ok(draft.issues.some(row => row.code === 'unnormalized-crossing'));
  const result = prepareNeighborhoodReflowC3(project, crossingRoad, crossingOffset);
  assert.ok(result.candidateProject, result.unresolved[0]?.message);
  assert.deepEqual(project,before);
  assert.deepEqual(prepareNeighborhoodReflowC3(project,crossingRoad,crossingOffset).ledger,result.ledger);
  const candidate = result.candidateProject.city;
  const junction = result.ledger.find(row => row.disposition === 'created-junction');
  const graph = buildRoadGraph(candidate);
  assert.equal(graph.valid,true);
  assert.equal(graph.adjacency.get(junction.newId).length,4);
  assert.equal(candidate.blocks.length,city.blocks.length + 1);
  const counterparts = new Map(candidate.buildings.map(building => [building.id,building]));
  const unchanged = city.buildings.filter(building => counterparts.has(building.id));
  assert.ok(unchanged.length > 0);
  for (const building of unchanged)
    assert.deepEqual(counterparts.get(building.id).footprint,building.footprint);
  assert.ok(result.ledger.some(row => row.kind === 'building' && row.disposition === 'retained'));
  const split = result.ledger.find(row => row.kind === 'block' && row.successorIds?.length > 1);
  assert.ok(split);
  const protectedDraft = structuredClone(draft.proposedCity);
  const intersection = buildRoadGraph(protectedDraft).issues.find(row => row.code === 'unnormalized-crossing');
  protectedDraft.roads.find(road => road.id === intersection.roadIds[0]).plaza = true;
  assert.throws(() => normalizeRoadCrossingsC3(protectedDraft),/protected infrastructure/);
});

for (const [road,edit,delta] of connectionCases)
  test('C3 ' + edit.kind + ' produces valid block ownership and deterministic IDs', () => {
    const project = radial();
    const result = prepareRoadTopologyReflowC3(project,road,null,edit);
    assert.ok(result.candidateProject,result.unresolved[0]?.message);
    assert.equal(result.candidateProject.city.blocks.length,project.city.blocks.length+delta);
    assert.deepEqual(prepareRoadTopologyReflowC3(project,road,null,edit).candidateProject,result.candidateProject);
  });

test('Topology reflow blocks custom development and cross-district merges', () => {
  const project = radial();
  const crossing = prepareNeighborhoodReflowC3(project,crossingRoad,crossingOffset);
  const replacement = crossing.ledger.find(row => row.kind === 'property' && row.oldId && !row.newId);
  assert.ok(replacement);
  project.city.properties.find(row => row.id === replacement.oldId).customName = 'My property';
  const blocked = prepareNeighborhoodReflowC3(project,crossingRoad,crossingOffset);
  assert.equal(blocked.candidateProject,null);
  assert.equal(blocked.unresolved[0].code,'parcel-decision-required');
  const merge = prepareRoadTopologyReflowC3(radial(),'RD-0098',null,{kind:'remove'});
  assert.equal(merge.candidateProject,null);
  assert.equal(merge.unresolved[0].code,'district-decision-required');
});

test('The standalone applies a crossing and road removal with Undo, Redo and portable save', async () => {
  const app = await buildingAppHarness();
  const project = radial(), road = app.state().roadWorkspace;
  for (const [roadId, input, delta] of [
    [crossingRoad,() => road.session.updateRoadIntent(crossingOffset,{defer:false}),1],
    ['RD-0099',() => app.el('roadRemoveC3').handlers.click(),-1],
  ]) {
    app.apply({project,workspace:defaultWorkspace(project)});
    const before = JSON.stringify(app.state().project), rev = app.state().files.revision;
    road.start();
    road.session.schedule = run => run();
    road.session.select({kind:'road',id:roadId});
    input();
    assert.equal(app.el('roadApplyB4').disabled,false,road.session.reconciliation?.unresolved[0]?.message);
    assert.equal(app.state().files.revision,rev);
    app.el('roadApplyB4').handlers.click();
    assert.equal(app.state().project.city.blocks.length,project.city.blocks.length+delta);
    const after = JSON.stringify(app.state().project);
    assert.equal(app.state().files.revision,rev+1);
    assert.equal(app.moveRoadHistory('undo'),true);
    assert.equal(JSON.stringify(app.state().project),before);
    assert.equal(app.moveRoadHistory('redo'),true);
    assert.equal(JSON.stringify(app.state().project),after);
    const doc = app.capture();
    const loaded = decodeProjectDocument(encodeProjectDocument(createProjectDocument(doc.project,doc.workspace)));
    assert.equal(JSON.stringify(loaded.project),after);
  }
});

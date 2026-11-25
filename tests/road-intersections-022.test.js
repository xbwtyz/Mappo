import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import { assertRoadUndoProject } from './helpers/road-undo-project.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { normalizeRoadCrossingsC3 } from '../src/core/road-crossings.js';
import { prepareJunctionIntentC7 } from '../src/core/road-intent-c1.js';
import { prepareJunctionReflowC7, prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

// Ordinary closed perimeter with two independently named crossing endpoints.
// Accepted road records remain untouched; normalization acts on a draft only.
function coincidentCrossing() {
  const nodes = [
    ['A', 0, 0], ['B', 10, 0], ['C', 10, 10], ['D', 0, 10],
    ['X', 5, 5], ['Y', 5, 5],
  ].map(([id,x,y]) => ({id,x,y}));
  const roads = [
    ['A','B'], ['B','C'], ['C','D'], ['D','A'],
    ['A','X'], ['X','C'], ['B','Y'], ['Y','D'],
  ].map(([a,b],i) => ({id:'R-'+i,a,b,kind:'lane'}));
  return {nodes,roads};
}
const codes = report => report.issues.map(issue=>issue.code);
const streetTopology = city => city.roads.map(road =>
  [road.id, ...[road.a, road.b].sort()].join(':')).sort();

// P1: actual generated-city regression. Prior 0.2.1 rejects the exact move
// with "Two existing corners coincide. Offset the street...".
const planned = () => createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const from = 'N-0139', to = 'N-0140';
const movedPoint = project => {
  const node = project.city.nodes.find(record=>record.id===to);
  assert.ok(node,'Locked destination junction must exist');
  return {x:node.x,y:node.y};
};

test('0.2.2 P1/P2 consolidates exactly coincident ordinary endpoints without changing accepted inputs',()=>{
  const city=coincidentCrossing(), before=structuredClone(city);
  assert.ok(codes(buildRoadGraph(city)).includes('unnormalized-crossing'));
  const result=normalizeRoadCrossingsC3(city);
  assert.equal(result.graph.valid,true,JSON.stringify(result.graph.issues));
  assert.deepEqual(result.consolidatedNodeIds,['Y']);
  assert.equal(result.city.nodes.length,city.nodes.length-1);
  assert.equal(result.city.roads.length,city.roads.length);
  assert.deepEqual(streetTopology(result.city),streetTopology(normalizeRoadCrossingsC3(city).city));
  assert.deepEqual(city,before,'Normalization must not mutate accepted records');
  const reordered={...city,nodes:city.nodes.toReversed(), roads:city.roads.toReversed()
    .map(road=>({...road,a:road.b,b:road.a}))};
  const again=normalizeRoadCrossingsC3(reordered);
  assert.equal(again.graph.valid,true,JSON.stringify(again.graph.issues));
  assert.deepEqual(again.consolidatedNodeIds,result.consolidatedNodeIds);
  assert.deepEqual(streetTopology(again.city),streetTopology(result.city));
});

test('0.2.2 P2 supports ordinary multi-contact on an established junction',()=>{
  const city=coincidentCrossing();
  city.nodes=city.nodes.filter(node=>node.id!=='Y');
  city.roads=city.roads.filter(road=>road.a!=='Y' && road.b!=='Y');
  city.roads.push({id:'BD',a:'B',b:'D',kind:'lane'});
  const old=structuredClone(city);
  const candidate=normalizeRoadCrossingsC3(city);
  assert.equal(candidate.graph.valid,true,JSON.stringify(candidate.graph.issues));
  assert.ok(candidate.splitRoadIds.includes('BD'));
  assert.deepEqual(city,old);
});

test('0.2.2 P2 resolves simultaneous interior crossings plus an existing ordinary endpoint',()=>{
  // The first crossing creates a temporary junction; later contacts reach an
  // existing endpoint at the same coordinate. Older C3 threw instead of
  // consolidating all cuts onto the real accepted endpoint.
  const nodes=[
    ['A',0,0],['B',10,0],['C',10,10],['D',0,10],['E',5,8],['T',5,5],
  ].map(([id,x,y])=>({id,x,y}));
  const roads=[
    ['A','B'],['B','C'],['C','D'],['D','A'],
    ['A','C'],['B','D'],['D','E'],['E','T'],
  ].map(([a,b],i)=>({id:'R-'+i,a,b,kind:'lane'}));
  const city={nodes,roads}, before=structuredClone(city);
  assert.equal(buildRoadGraph(city).issues.filter(issue=>issue.code==='unnormalized-crossing').length,3);
  const result=normalizeRoadCrossingsC3(city);
  assert.equal(result.graph.valid,true,JSON.stringify(result.graph.issues));
  assert.deepEqual(result.splitRoadIds,['R-4','R-5']);
  assert.deepEqual(result.junctionIds,[],'All contacts use accepted junction T');
  assert.deepEqual(city,before);
});

test('0.2.2 P2 refuses protected or authored identities, duplicate edges and collinear interior overlaps',()=>{
  const protectedRoad=coincidentCrossing();
  protectedRoad.roads.find(road=>road.b==='X').bridgeId='BR-EXISTING';
  assert.throws(()=>normalizeRoadCrossingsC3(protectedRoad),/protected infrastructure/);
  const authored=coincidentCrossing();
  authored.nodes.find(node=>node.id==='Y').extensions={future:{owner:'custom'}};
  assert.throws(()=>normalizeRoadCrossingsC3(authored),/metadata/);
  const protectedFace=coincidentCrossing();
  protectedFace.plaza={id:'SQUARE',vertices:['A','Y','C']};
  assert.throws(()=>normalizeRoadCrossingsC3(protectedFace),/protected face ownership/);
  const duplicates=coincidentCrossing();
  duplicates.roads.push({id:'R-EXTRA',a:'A',b:'Y',kind:'lane'});
  assert.throws(()=>normalizeRoadCrossingsC3(duplicates),/duplicate a street/);
  const overlapped=coincidentCrossing();
  overlapped.nodes.find(node=>node.id==='Y').x=5;
  overlapped.nodes.find(node=>node.id==='Y').y=0;
  assert.throws(()=>normalizeRoadCrossingsC3(overlapped),/Overlapping|overlap|cross|contact/i);
});

test('0.2.2 P3 generated Planned-city fixture reconciles coincident junction without losing protected or authored work',()=>{
  const project=planned(), before=structuredClone(project),point=movedPoint(project);
  const intent=prepareJunctionIntentC7(project,from,point);
  assert.ok(intent.issues.some(issue=>issue.code==='unnormalized-crossing'));
  const result=prepareJunctionReflowC7(project,from,point);
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  const candidate=result.candidateProject;
  assert.equal(candidate.city.nodes.length,project.city.nodes.length-1);
  assert.equal(buildRoadGraph(candidate.city).valid,true);
  assert.equal(validateStoredProject(candidate),candidate);
  assert.equal(candidate.schemaVersion,PROJECT_SCHEMA_VERSION);
  assert.deepEqual(project,before,'Accepted project must be unchanged by preview');
  assert.deepEqual(prepareJunctionReflowC7(project,from,point).candidateProject,candidate);
  const document=createProjectDocument(candidate,defaultWorkspace(candidate));
  assert.equal(JSON.stringify(decodeProjectDocument(encodeProjectDocument(document)).project),
    JSON.stringify(candidate),'Portable round trip must preserve JSON-equivalent project state.');
  assert.ok(result.ledger.some(row=>row.kind==='junction' && row.oldId && !row.newId));
  const unrelated=project.city.roads.filter(road=>candidate.city.roads.some(next=>
    next.id===road.id && next.a===road.a && next.b===road.b));
  assert.ok(unrelated.length>50,'Unrelated streets must retain their geometry and IDs');
  const custom=planned();
  // A provenance-safe blocker: an authored property in the affected region
  // must never be destroyed just to resolve a newly merged junction.
  const change=result.ledger.find(row=>row.kind==='property' && row.oldId && !row.newId);
  assert.ok(change,'Fixture should affect at least one generated property');
  custom.city.properties.find(row=>row.id===change.oldId).customName='Saved custom shop';
  const rejected=prepareJunctionReflowC7(custom,from,movedPoint(custom));
  assert.equal(rejected.candidateProject,null);
  assert.ok(rejected.unresolved.length>0);
  assert.equal(custom.city.properties.find(row=>row.id===change.oldId).customName,'Saved custom shop');
});

test('0.2.2 P3 pre-existing simple crossings remain supported',()=>{
  const project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
  const result=prepareNeighborhoodReflowC3(project,'RD-0103',{x:0,y:15});
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  assert.equal(buildRoadGraph(result.candidateProject.city).valid,true);
});

test('0.2.2 P4 standalone road workspace Apply, Undo/Redo and Cancel are atomic',async()=>{
  const app=await buildingAppHarness();
  const project=planned();
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace;
  road.start();
  road.session.schedule=run=>run();
  road.session.select({kind:'junction',id:from});
  const before=JSON.stringify(app.state().project),revision=app.state().files.revision;
  road.session.update(movedPoint(project),{defer:false});
  assert.equal(app.el('roadApplyB4').disabled,false,road.session.reconciliation?.unresolved[0]?.message);
  assert.equal(JSON.stringify(app.state().project),before);
  app.el('roadApplyB4').handlers.click();
  const after=JSON.stringify(app.state().project);
  assert.notEqual(after,before);
  assert.equal(app.state().files.revision,revision+1);
  assert.equal(app.moveRoadHistory('undo'),true);
  assertRoadUndoProject(JSON.stringify(app.state().project),before,after);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),after);
  const saved=app.capture();
  assert.equal(JSON.stringify(decodeProjectDocument(encodeProjectDocument(
    createProjectDocument(saved.project,saved.workspace))).project),after);
  road.exit();
});

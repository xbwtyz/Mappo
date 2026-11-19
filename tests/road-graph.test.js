import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createProject } from '../src/core/city-model.js';
import { makeStartingOutline } from '../src/editor/outline.js';
import { buildRoadGraph, analyzeRoadGraph, proposeJunctionMove, classifyRoad, ROAD_GRAPH_LIMITS } from '../src/core/road-graph.js';
import { createRoadNodeNormalizer, traceRoadFaces } from '../src/core/road-topology.js';
import { createProjectDocument, defaultWorkspace, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const parity = JSON.parse(await readFile(new URL('./fixtures/road-generation-parity-0.1.json', import.meta.url), 'utf8'));
const fromFixture = fixture => createProject(fixture.shape ? {...fixture.options, boundary: makeStartingOutline(fixture.shape,fixture.options.seed,fixture.options.size)} : fixture.options);
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const triangle = () => ({
  nodes: [{id:'A',x:0,y:0},{id:'B',x:10,y:0},{id:'C',x:0,y:10}],
  roads: [{id:'AB',a:'A',b:'B',kind:'primary'},{id:'BC',a:'B',b:'C',kind:'secondary'},{id:'CA',a:'C',b:'A',kind:'lane'}]
});
const codes = report => report.issues.map(issue => issue.code);
const base = createProject({seed:'a1-preview',morphology:'organic'});
const graph = buildRoadGraph(base.city);
const ordinary = [...graph.nodesById.keys()].find(id => graph.incidentRoads.get(id).every(r => !graph.roadClasses.get(r).protected));
assert.ok(ordinary);

test('98 frozen 0.1 golden cities retain exact geometry, IDs and metadata after extraction', () => {
  assert.equal(parity.baseline, '785e9cb2a44c40819e91a636523ac397b6660f9e');
  for (const fixture of parity.fixtures) {
    const city = fromFixture(fixture).city;
    assert.equal(createHash('sha256').update(JSON.stringify(city)).digest('hex'), fixture.sha256, JSON.stringify(fixture.options));
    const report = analyzeRoadGraph(freeze(city));
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    const faces = traceRoadFaces(city.nodes, city.roads);
    assert.equal(faces.length, city.blocks.length + 1 + city.waterFaces.length + city.terrainFaces.length);
  }
});

test('snap and face traversal primitives retain generator tolerances and winding', () => {
  const nodes = [], normalize = createRoadNodeNormalizer(nodes, true);
  const a = normalize({x:.00000049,y:0});
  assert.equal(normalize({x:.00000051,y:0}), a, 'adjacent snap buckets coalesce around obstacles');
  assert.equal(normalize({x:2,y:0}).id, 'N-0002');
  const city = triangle(), before = JSON.stringify(city);
  assert.deepEqual(traceRoadFaces(city.nodes,city.roads), [{vertices:['A','B','C'],area:50}]);
  assert.equal(JSON.stringify(city), before);
});

test('indexes, nested metadata and adjacency are detached and genuinely read-only', () => {
  const city = triangle(); city.roads[0].extensions = {future:{tag:'original'}};
  const before = JSON.stringify(city), graph = buildRoadGraph(freeze(city));
  assert.equal(graph.valid,true);
  assert.equal(graph.nodesById.set, undefined);
  assert.equal(graph.roadsById.delete, undefined);
  assert.throws(() => { graph.nodesById.get('A').x = 10; }, TypeError);
  assert.throws(() => { graph.roadsById.get('AB').extensions.future.tag = 'changed'; }, TypeError);
  assert.throws(() => { graph.adjacency.get('A').push('unknown'); }, TypeError);
  graph.nodesById.forEach((node,id,index) => assert.equal(index,graph.nodesById));
  assert.notEqual(graph.nodesById.get('A'),city.nodes[0]);
  assert.equal(JSON.stringify(city),before);
  const mutable = triangle(), detached = buildRoadGraph(mutable);
  mutable.nodes[0].x = 99;
  assert.equal(detached.nodesById.get('A').x,0);
});

test('analysis and invalid diagnostics are deterministic under record/key reordering', () => {
  const city = triangle(); city.roads.push({...city.roads[0],id:'AB-duplicate'}); city.nodes.push({id:'ORPHAN',x:20,y:20});
  const reordered = {roads:city.roads.toReversed().map(r => Object.fromEntries(Object.entries(r).reverse())),nodes:city.nodes.toReversed()};
  assert.deepEqual(analyzeRoadGraph(city),analyzeRoadGraph(reordered));
  assert.deepEqual([...buildRoadGraph(city).adjacency], [...buildRoadGraph(reordered).adjacency]);
  const ambiguous = triangle(); ambiguous.nodes.push({...ambiguous.nodes[0],x:1});
  assert.deepEqual(analyzeRoadGraph(ambiguous),analyzeRoadGraph({...ambiguous,nodes:ambiguous.nodes.toReversed()}));
});

test('broken endpoints, ID collisions, self-loops, duplicates, orphans and disconnection have exact IDs', () => {
  const city = triangle();
  city.nodes.push({id:'D',x:30,y:30},{id:'E',x:40,y:40},{id:'ORPHAN',x:50,y:0});
  city.roads.push({id:'DE',a:'D',b:'E',kind:'lane'},{id:'LOOP',a:'A',b:'A',kind:'lane'},
    {id:'MISSING',a:'A',b:'absent',kind:'lane'},{id:'AB2',a:'B',b:'A',kind:'lane'});
  const report = analyzeRoadGraph(city);
  for(const code of ['self-loop','missing-endpoint','duplicate-edge','orphan-junction','dangling-junction','disconnected-graph']) assert.ok(codes(report).includes(code),code);
  assert.deepEqual(report.issues.find(i => i.code === 'missing-endpoint').roadIds,['MISSING']);
  assert.deepEqual(report.issues.find(i => i.code === 'duplicate-edge').roadIds,['AB','AB2']);
  const duplicate = triangle(); duplicate.roads.push({...duplicate.roads[0]}); duplicate.nodes.push({...duplicate.nodes[0]});
  assert.ok(codes(analyzeRoadGraph(duplicate)).includes('duplicate-node-id'));
  assert.ok(codes(analyzeRoadGraph(duplicate)).includes('duplicate-road-id'));
});

test('planarity catches crossings, T contacts and collinear overlaps including shared endpoints', () => {
  const city = {nodes:[{id:'A',x:0,y:0},{id:'B',x:10,y:0},{id:'C',x:5,y:-5},{id:'D',x:5,y:5}],roads:[{id:'AB',a:'A',b:'B',kind:'lane'},{id:'CD',a:'C',b:'D',kind:'lane'}]};
  assert.ok(codes(analyzeRoadGraph(city)).includes('unnormalized-crossing'));
  city.nodes[2].y = 0;
  assert.ok(codes(analyzeRoadGraph(city)).includes('unnormalized-crossing'));
  city.nodes[3] = {id:'D',x:15,y:0};
  assert.ok(codes(analyzeRoadGraph(city)).includes('unnormalized-crossing'));
  city.roads[1].a = 'A';
  assert.ok(codes(analyzeRoadGraph(city)).includes('overlapping-roads'));
  assert.equal(buildRoadGraph(triangle()).valid,true,'ordinary shared endpoints allowed');
});

test('all special-edge metadata is classified and preserved', () => {
  for(const field of ['boundary','plaza','bank','waterBoundary','foothill','terrainBoundary','bridgeId','passId']) {
    const city = triangle(); city.roads[0][field] = field.endsWith('Id') ? 'FEATURE-1' : true;
    city.roads[0].extensions = {future:'kept'};
    const graph = buildRoadGraph(city);
    assert.equal(graph.roadClasses.get('AB').protected,true,field);
    assert.deepEqual(graph.roadsById.get('AB'),city.roads[0]);
    assert.ok(codes(proposeJunctionMove(city,'A',{x:1,y:1})).includes('protected-junction'),field);
    assert.equal(proposeJunctionMove(city,'A',{x:0,y:0}).graphValid,true,'unchanged protected junction is inspectable');
  }
  assert.equal(classifyRoad(triangle().roads[0]).protected,false);
  const special = fromFixture(parity.fixtures.at(-1)).city;
  const classes = new Set([...buildRoadGraph(special).roadClasses.values()].flatMap(c => c.reasons));
  for(const reason of ['boundary','plaza','bank','bridge','waterBoundary','foothill']) assert.ok(classes.has(reason),reason);
});

test('temporary ordinary-junction candidate changes only detached coordinates and incident-road list', () => {
  const city = freeze(copy(base.city)), before = JSON.stringify(city), node = graph.nodesById.get(ordinary);
  const proposal = proposeJunctionMove(city,ordinary,{x:node.x+.01,y:node.y+.01});
  assert.equal(proposal.graphValid,true,JSON.stringify(proposal.issues));
  assert.equal(proposal.canApplyIn02A,false);
  assert.deepEqual(proposal.changedRoadIds,graph.incidentRoads.get(ordinary));
  assert.equal(proposal.graph.nodesById.get(ordinary).x,node.x+.01);
  for(const [id,n] of graph.nodesById) if(id!==ordinary) assert.deepEqual(proposal.graph.nodesById.get(id),n);
  assert.deepEqual([...proposal.graph.roadsById],[...graph.roadsById]);
  assert.equal(JSON.stringify(city),before);
  assert.equal(proposal.safe,undefined,'A1 never claims dependency safety');
  assert.equal(proposeJunctionMove(city,ordinary,node).changedRoadIds.length,0);
});

test('candidate rejection explains collapse, crossing, boundary escape, protected and invalid input', () => {
  const crossing = {nodes:[{id:'A',x:0,y:0},{id:'B',x:10,y:0},{id:'C',x:10,y:10},{id:'D',x:0,y:10}],roads:[{id:'AB',a:'A',b:'B',kind:'lane'},{id:'BC',a:'B',b:'C',kind:'lane'},{id:'CD',a:'C',b:'D',kind:'lane'},{id:'DA',a:'D',b:'A',kind:'lane'}]};
  assert.ok(codes(proposeJunctionMove(crossing,'B',{x:-5,y:5})).includes('unnormalized-crossing'));
  const city = triangle();
  const collapsed = proposeJunctionMove(city,'A',{x:10,y:0});
  assert.ok(codes(collapsed).includes('degenerate-road'));
  assert.equal(collapsed.graphValid,false);
  for(const point of [{x:NaN,y:0},{x:0,y:Infinity},{x:1e6,y:0},null]) {
    const proposal = proposeJunctionMove(city,'A',point);
    assert.ok(codes(proposal).includes('candidate-coordinate'));
    assert.equal(proposal.graph,null);
  }
  assert.ok(codes(proposeJunctionMove(city,'absent',{x:0,y:0})).includes('junction-not-found'));
  assert.ok(codes(proposeJunctionMove(base.city,ordinary,{x:9999,y:9999})).includes('boundary-escape'));
  city.roads[0].a = 'absent';
  assert.equal(proposeJunctionMove(city,'B',{x:1,y:1}).graph,null,'invalid accepted graph cannot produce a candidate');
});

test('invalid shapes, out-of-range coordinates and bounded pathological work fail closed', () => {
  for (const city of [null,{}, {nodes:[],roads:[]}]) assert.equal(analyzeRoadGraph(city).valid,false);
  const city = triangle(); city.nodes[0].x = NaN; city.roads[0].kind = 'future-unsupported';
  assert.ok(codes(analyzeRoadGraph(city)).includes('node-coordinate'));
  assert.ok(codes(analyzeRoadGraph(city)).includes('road-kind'));
  assert.ok(codes(analyzeRoadGraph({nodes:new Array(ROAD_GRAPH_LIMITS.nodes+1),roads:[]})).includes('graph-limit'));
  const pathological = triangle();
  pathological.roads = Array.from({length:3500},(_,i) => ({...pathological.roads[0],id:`R-${String(i).padStart(5,'0')}`}));
  const graph = buildRoadGraph(pathological);
  assert.ok(codes(graph).includes('graph-work-limit'));
  assert.ok(graph.work <= ROAD_GRAPH_LIMITS.work+1);
});

test('save/recovery document bytes and schema 9 remain unchanged by graph analysis and candidates', () => {
  const document = createProjectDocument(base,defaultWorkspace(base)), before = encodeProjectDocument(document);
  const node = graph.nodesById.get(ordinary);
  analyzeRoadGraph(freeze(document.project.city));
  proposeJunctionMove(document.project.city,ordinary,{x:node.x+.01,y:node.y+.01});
  assert.equal(encodeProjectDocument(document),before);
  assert.equal(document.project.schemaVersion,9);
  assert.deepEqual(decodeProjectDocument(before),document);
});

test('compiled A1 graph APIs match modular outcomes without adding product globals', async () => {
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  let script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  // Stop before app initialization and expose APIs only inside this test VM.
  script = script.slice(0,script.indexOf('// src/app.js'))+'globalThis.a1 = {analyzeRoadGraph, proposeJunctionMove};\n})();';
  const context = vm.createContext({});
  vm.runInContext(script,context);
  const normalize = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(normalize(context.a1.analyzeRoadGraph(base.city)),normalize(analyzeRoadGraph(base.city)));
  const point = graph.nodesById.get(ordinary);
  const bundled = context.a1.proposeJunctionMove(base.city,ordinary,point);
  assert.equal(bundled.graphValid,true);
  assert.deepEqual(normalize([...bundled.graph.nodesById]),normalize([...graph.nodesById]));
});

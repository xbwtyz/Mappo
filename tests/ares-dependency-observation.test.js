import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { createAresDependencyObservation, matchesAresDependencySource, createAresDependencyIndex } from '../src/core/ares-dependency-observation.js';
import { APP_VERSION } from '../src/core/version.js';
const make=()=>createProject({seed:'ares-p2-planned',size:'small',morphology:'planned'});
const project=make(),graph=buildRoadGraph(project.city);
let ids;
outer:for(const incident of graph.incidentRoads.values()){
  for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
    const pair=[incident[i],incident[j]];if(resolveRoadGroupB1(graph,pair).eligible){ids=pair;break outer;}
  }
}
const context=(p=project,permissions={})=>({version:1,sessionId:'p2-b',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(p,7,ids,{x:0,y:75},permissions)});
const budget=()=>createSpatialPreservationBudget();
const ref=(collection,id)=>({collection,id});
const observe=(p=project,c=context(p))=>createAresDependencyObservation(p,c,budget());
let cached;
const observation=()=>cached??=(observe());
test('P2 source-bound dependency graph contains exact roots, typed ownership and immutable observations',async()=>{
  const before=JSON.stringify(project),o=await observation();
  assert.equal(o.status,'observed');assert.match(o.snapshotFingerprint,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(o.nodes[0]));assert.ok(Object.isFrozen(o.edges[0]));
  for(const id of ids)assert.ok(o.roots.some(r=>r.collection==='roads'&&r.id===id));
  for(const row of o.discovery.blockers)assert.ok(o.roots.some(r=>r.collection==='properties'&&r.id===row.propertyRef.id));
  const property=project.city.properties[0];
  assert.ok(o.edges.some(e=>e.from.id===property.id&&e.to.id===property.blockId&&e.relation==='block'));
  assert.equal(JSON.stringify(project),before);assert.equal(Object.hasOwn(o,'writable'),false);
});
test('P2 indexed neighbor queries match exhaustive reference and deduplicate repeated roots',async()=>{
  const o=await observation(),index=createAresDependencyIndex(o,budget());
  const roots=[...o.roots,...o.roots];
  const a=index.neighbors(roots,budget()),b=index.neighbors(roots.slice().reverse(),budget(),{algorithm:'reference'});
  assert.deepEqual(a,b);assert.ok(a.edges.length);assert.ok(a.nodes.length);
  assert.ok(Object.isFrozen(a.nodes));assert.throws(()=>index.neighbors([ref('roads','missing')],budget()),/Unknown/);
});
test('P2 protected infrastructure and authored land remain protected even with demolition permission',async()=>{
  const p=make(),property=p.city.properties[0];property.customName='Protected authored parcel';
  const o=await observe(p,context(p,{destruction:true,regeneration:true}));
  const get=(collection,id)=>o.nodes.find(n=>n.ref.collection===collection&&n.ref.id===id);
  assert.equal(get('properties',property.id).classification,'protected');
  for(const id of property.plotIds)assert.equal(get('plots',id).classification,'protected');
  for(const id of property.buildingIds)assert.equal(get('buildings',id).classification,'protected');
  const protectedRoad=[...graph.roadClasses].find(([,c])=>c.protected)[0];
  assert.equal(get('roads',protectedRoad).classification,'protected');
  assert.equal(get('nodes',graph.roadsById.get(protectedRoad).a).classification,'protected');
  assert.ok(o.nodes.every(n=>!Object.hasOwn(n,'writable')));
});
test('P2 snapshot binding rejects stale revision, intent, permissions and metadata',async()=>{
  const o=await observation(),c=context();
  assert.equal(await matchesAresDependencySource(o,project,c,budget()),true);
  assert.equal(await matchesAresDependencySource(o,project,{...c,operation:{...c.operation,revision:8}},budget()),false);
  assert.equal(await matchesAresDependencySource(o,project,context(project,{destruction:true}),budget()),false);
  const p=make();p.city.name+=' changed';
  assert.equal(await matchesAresDependencySource(o,p,c,budget()),false);
  const signed=make();signed.city.nodes[0].x=-0;
  const other=make();other.city.nodes[0].x=0;
  const changed={...o,snapshotFingerprint:await (async()=>{
    // Hash-only source binding check; no unsupported geometry operation.
    const {aresReplayJson}=await import('../src/core/ares-diagnostic-replay.js');
    const bytes=new TextEncoder().encode(aresReplayJson(signed));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  })()};
  assert.equal(await matchesAresDependencySource(changed,other,c,budget()),false);
});
test('P2 deterministic source evidence and budget failures never publish partial neighbor results',async()=>{
  const o=await observation(),again=await observe();
  assert.deepEqual(again,o);
  const tiny=()=>createSpatialPreservationBudget({work:1,stateExpansions:1});
  await assert.rejects(()=>createAresDependencyObservation(project,context(),tiny()),/budget/);
  assert.throws(()=>createAresDependencyIndex(o,tiny()),/budget/);
  const index=createAresDependencyIndex(o,budget());
  assert.throws(()=>index.neighbors(o.roots,tiny()),/budget/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget, spatialRefKey } from '../src/core/spatial-recovery-contract.js';
import { discoverAresAdaptationScope, verifyAresOutsideScope } from '../src/core/ares-adaptation-scope.js';
import { createAresDependencyObservation } from '../src/core/ares-dependency-observation.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { APP_VERSION } from '../src/core/version.js';

const make=()=>createProject({seed:'ares-p2-planned',size:'small',morphology:'planned'});
const project=make(),graph=buildRoadGraph(project.city);
let ids;
outer:for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
  const pair=[incident[i],incident[j]];if(resolveRoadGroupB1(graph,pair).eligible){ids=pair;break outer;}
}
const ctx=(p=project,permissions={},offset={x:0,y:75})=>({version:1,sessionId:'p2-c',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(p,7,ids,offset,permissions)});
const budget=()=>createSpatialPreservationBudget();
const limits={maxObjects:10000,maxHops:8};
const run=(p=project,c=ctx(p),l=limits)=>discoverAresAdaptationScope(p,c,l,budget());
const clone=p=>JSON.parse(aresReplayJson(p));
let safe;
async function getSafe(){
  if(!safe){
    for(const offset of [{x:.001,y:0},{x:0,y:.001},{x:1,y:0},{x:0,y:1}]){
      const c=ctx(project,{},offset),s=await run(project,c);
      if(s.status==='observed'&&s.reviewRefs.length){safe={c,s};break;}
    }
    if(!safe)throw Error('No observed small scope fixture.');
  }
  return safe;
}
test('P2 scope derives roots and expands deterministic ownership without flooding contextual anchors',async()=>{
  const c=ctx(),before=aresReplayJson(project),s=await run(),o=await createAresDependencyObservation(project,c,budget());
  assert.notEqual(s.status,'scope-limited');
  assert.deepEqual(s,await run());
  for(const r of o.roots)assert.ok(s.entries.some(e=>spatialRefKey(e.ref)===spatialRefKey(r)));
  for(const e of s.entries.filter(e=>['districts','blocks','walls','waterFeatures'].includes(e.ref.collection)))
    assert.notEqual(e.role,'review-candidate');
  for(const r of s.reviewRefs)assert.ok(s.entries.some(e=>e.role==='review-candidate'&&spatialRefKey(e.ref)===spatialRefKey(r)));
  assert.ok(s.entries.length<o.nodes.length);
  assert.equal(aresReplayJson(project),before);assert.ok(Object.isFrozen(s.entries));
});
test('P2 explicit depth and affected-object limits fail closed, with no review refs',async()=>{
  for(const l of [{maxObjects:1,maxHops:8},{maxObjects:10000,maxHops:0}]){
    const s=await run(project,ctx(),l);
    assert.equal(s.status,'scope-limited');assert.ok(s.entries.length<=l.maxObjects);
    assert.ok(s.unresolvedRefs.length);assert.deepEqual(s.reviewRefs,[]);
    assert.equal(s.diagnostics[0].reason,'scope-limited');
  }
  for(const l of [undefined,null,{maxObjects:0,maxHops:1},{maxObjects:20,maxHops:-1},{maxObjects:1,maxHops:1,allowWrites:true}])
    await assert.rejects(()=>discoverAresAdaptationScope(project,ctx(),l,budget()),/limits/);
});
test('P2 protected setback property remains protected even with explicit destruction permission',async()=>{
  const p=make(),c=ctx(p,{destruction:true}),o=await createAresDependencyObservation(p,c,budget());
  assert.ok(o.discovery.blockers.length);
  const id=o.discovery.blockers[0].propertyRef.id;
  p.city.properties.find(q=>q.id===id).customName='Authored obstacle';
  const s=await run(p,c);
  assert.equal(s.status,'protected-blocker');assert.deepEqual(s.reviewRefs,[]);
  assert.ok(s.entries.some(e=>e.ref.id===id&&e.role==='protected'));
  assert.ok(s.diagnostics.some(d=>d.reason==='protected-content'));
});
test('P2 outside-scope gate preserves all unrelated records and rejects membership, metadata and stale source',async()=>{
  const {c,s}=await getSafe(),allowed=new Set(s.reviewRefs.map(spatialRefKey));
  const good=clone(project);
  assert.equal((await verifyAresOutsideScope(project,good,s,c,budget())).status,'outside-scope-preserved');
  const selected=good.city.roads.find(r=>r.id===ids[0]);selected.kind=selected.kind==='lane'?'secondary':'lane';
  // A scope-only pass is not geometry or permission verification.
  assert.equal((await verifyAresOutsideScope(project,good,s,c,budget())).status,'outside-scope-preserved');
  const bad=clone(project),outside=bad.city.properties.find(p=>!allowed.has(spatialRefKey({collection:'properties',id:p.id})));
  assert.ok(outside);outside.customName='Unexpected edit';
  const result=await verifyAresOutsideScope(project,bad,s,c,budget());
  assert.equal(result.status,'outside-scope-changed');
  assert.ok(result.violations.some(v=>v.ref?.id===outside.id));
  const removed=clone(project);removed.city.properties.pop();
  assert.ok((await verifyAresOutsideScope(project,removed,s,c,budget())).violations.some(v=>v.code==='scope-membership-change'));
  const root=clone(project);root.city.name+=' changed';
  assert.ok((await verifyAresOutsideScope(project,root,s,c,budget())).violations.some(v=>v.code==='outside-collection-change'));
  await assert.rejects(()=>verifyAresOutsideScope(root,good,s,c,budget()),/Stale/);
  await assert.rejects(()=>verifyAresOutsideScope(project,good,{...s},c,budget()),/scope required/);
});
test('P2 budget exhaustion propagates; incomplete or protected scope never qualifies preservation',async()=>{
  const tiny=()=>createSpatialPreservationBudget({work:1,stateExpansions:1});
  await assert.rejects(()=>discoverAresAdaptationScope(project,ctx(),limits,tiny()),/budget/);
  const s=await run(project,ctx(),{maxObjects:1,maxHops:0});
  await assert.rejects(()=>verifyAresOutsideScope(project,clone(project),s,ctx(),budget()),/scope required/);
  const safe=await getSafe();
  await assert.rejects(()=>verifyAresOutsideScope(project,clone(project),safe.s,safe.c,tiny()),/budget/);
});

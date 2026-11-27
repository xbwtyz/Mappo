import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from '../src/core/road-intent-c1.js';
import { normalizeSpatialRoadGroup, discoverSpatialRoadRetirementEligibility, searchSpatialRetirementSubsetRoadGroup, verifySpatialRetirementWitness } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget, createSpatialOperation, spatialRefKey } from '../src/core/spatial-recovery-contract.js';
import { discoverAresRoadSetbacks } from '../src/core/ares-road-discovery.js';
import { createAresDependencyObservation } from '../src/core/ares-dependency-observation.js';
import { discoverAresAdaptationScope, verifyAresOutsideScope } from '../src/core/ares-adaptation-scope.js';
import { createLareContext, discoverLareParcelScope } from '../src/core/reconciliation-context.js';
import { analyzeRoadImpact } from '../src/core/road-impact.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { stampRoadGenerated } from '../src/core/road-provenance.js';
import { APP_VERSION } from '../src/core/version.js';

// Read-only research fixture: the same frozen original seed, IDs, exact
// movements and permission choices as hosted refusal forensics 45934318758.
// Historical reported metrics are from a trial, not necessarily the original
// project; do not assert equivalence of different geometry states.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/ares-p2-historical-setbacks.json',import.meta.url),'utf8'));
const project=createProject(fixture.options);
const sha=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const budget=()=>createSpatialDestructionBudget();
const before=sha(project);
const context=(operation,id)=>({version:1,sourceVersion:APP_VERSION,sessionId:'p2-e1-'+id,operation});
test('P2 historical corpus reproduces the exact persisted frozen source project',()=>{
  validateStoredProject(project);assert.equal(before,fixture.historicalBaseline);
  assert.equal(fixture.cases.length,4);
  for(const c of fixture.cases){
    for(const id of c.ids)assert.ok(project.city.roads.some(r=>r.id===id),id);
    for(const id of c.properties)assert.ok(project.city.properties.some(r=>r.id===id),id);
  }
});
function reducedReference(project,eligibility,refs){
  // Test-only reconstruction of the documented existing SRE reduced
  // baseline. Independent membership comparison and stored-project validation
  // are required; no product retirement entry points are widened.
  const keys=new Set(refs.map(spatialRefKey)),p=JSON.parse(JSON.stringify(project));
  for(const group of eligibility.propertyGroups)assert.ok(group.refs.every(r=>keys.has(spatialRefKey(r))));
  for(const collection of ['properties','plots','buildings']){
    const before=p.city[collection];
    p.city[collection]=before.filter(r=>!keys.has(spatialRefKey({collection,id:r.id})));
    assert.equal(before.length-p.city[collection].length,refs.filter(r=>r.collection===collection).length);
  }
  const plots=new Map(p.city.plots.map(r=>[r.id,r]));
  for(const property of p.city.properties){
    const surviving=property.buildingIds.filter(id=>!keys.has(spatialRefKey({collection:'buildings',id})));
    if(surviving.length!==property.buildingIds.length){
      property.buildingIds=surviving;stampRoadGenerated(property,property.plotIds.map(id=>plots.get(id)));
    }
  }
  validateStoredProject(p);return p;
}
function compareDiscovery(p,c){
  const indexed=discoverAresRoadSetbacks(p,c,budget()),reference=discoverAresRoadSetbacks(p,c,budget(),{algorithm:'reference'});
  assert.equal(indexed.status,'observed');assert.deepEqual(indexed,reference);return indexed;
}
function matchingRows(result,id){
  return result.blockers.filter(b=>b.propertyRef.id===id).map(b=>({roadId:b.roadRef.id,blockId:b.blockRef.id,...b.diagnostic.measurements}));
}
for(const c of fixture.cases)test('P2 exact historical movement '+c.id+' — source, scope and direct-scale replay',async()=>{
  assert.equal(before,fixture.historicalBaseline);
  const op=normalizeSpatialRoadGroup(project,0,c.ids,c.offset,fixture.permissions);
  const draft=prepareRoadGroupIntentB1(project,c.ids,c.offset),topology=readRoadGroupTopologyB1(project,draft);
  assert.ok(draft.topologyResolved&&draft.facesResolved&&topology.identity.valid&&!topology.identity.requiresReview);
  const changedBlocks=new Set(topology.identity.changed.filter(f=>f.kind==='block').map(f=>f.id));
  const eligibility=discoverSpatialRoadRetirementEligibility(project,op,budget());
  const refs=[...new Map([...eligibility.propertyGroups.flatMap(g=>g.refs),...eligibility.buildingRefs].map(r=>[spatialRefKey(r),r])).values()];
  assert.equal(eligibility.propertyGroups.length,c.groups);
  assert.equal(refs.length,c.retirementRefs);
  const obs=await createAresDependencyObservation(project,context(op,c.id),budget());
  const original=compareDiscovery(project,context(op,c.id));
  assert.deepEqual(obs.discovery,original);
  const reduced=reducedReference(project,eligibility,refs);
  const preserving=createSpatialOperation({...op,permissions:{...op.permissions,destruction:false}});
  const reducedDiscovery=compareDiscovery(reduced,context(preserving,c.id+'-reduced'));
  // Lock independently observed E1 results, not an invented solver answer.
  assert.equal(original.blockers.length,c.e1Evidence.originalBlockers);
  assert.equal(reducedDiscovery.blockers.length,c.e1Evidence.reducedBlockers);
  assert.deepEqual([...new Set(reducedDiscovery.blockers.map(b=>b.propertyRef.id))].sort(),c.properties.slice().sort());
  const impact=analyzeRoadImpact(project,{operation:'translate-road',graph:buildRoadGraph(draft.proposedCity)});
  assert.ok(impact.complete&&impact.status!=='invalid');
  const legacyContext=createLareContext(project,draft,new Map(),budget());
  const legacyScope=discoverLareParcelScope(legacyContext,project.city,draft,
    new Map(topology.identity.changed.filter(f=>f.kind==='block').map(f=>[f.id,f.record])),impact.issues,budget()).adapt();
  const scope=await discoverAresAdaptationScope(project,context(op,c.id),{maxObjects:10000,maxHops:8},budget());
  assert.equal(scope.status,'observed');
  assert.deepEqual(scope.unresolvedRefs,[]);
  const properties=c.properties.map(id=>{
    const record=project.city.properties.find(p=>p.id===id);
    const originalRows=matchingRows(original,id),reducedRows=matchingRows(reducedDiscovery,id);
    const label=obs.nodes.find(n=>n.ref.collection==='properties'&&n.ref.id===id);
    assert.ok(record&&label);
    const eligible=eligibility.propertyGroups.some(g=>g.propertyId===id);
    const survives=reduced.city.properties.some(p=>p.id===id);
    assert.equal(survives,!eligible);
    const expected=fixture.e1Evidence.properties[id];
    assert.equal(record.blockId,expected.blockId);
    assert.equal(record.frontageRoadId,expected.frontageRoadId);
    assert.equal(changedBlocks.has(record.blockId),false);
    assert.equal(legacyContext.properties.some(p=>p.id===id),false);
    assert.equal(legacyScope.role(id),'observable');
    assert.equal(legacyScope.authorized.some(p=>p.id===id),false);
    assert.ok(impact.issues.some(i=>i.code==='road-setback'&&i.kind==='property'&&i.id===id));
    assert.equal(eligible,false);assert.equal(survives,true);
    assert.equal(label.classification,'review-candidate');
    assert.equal(label.reason,'generated-property-review');
    assert.ok(scope.reviewRefs.some(r=>r.collection==='properties'&&r.id===id));
    assert.ok(scope.entries.some(e=>e.ref.collection==='blocks'&&e.ref.id===record.blockId&&e.role==='observe-only'));
    const expectedRow={roadId:expected.conflictingRoadId,blockId:expected.blockId,unit:'map-unit',...fixture.e1Evidence.measurements};
    assert.equal(originalRows.length,1);assert.equal(reducedRows.length,1);
    for(const row of [...originalRows,...reducedRows]){
      assert.equal(row.roadId,expectedRow.roadId);assert.equal(row.blockId,expectedRow.blockId);assert.equal(row.unit,expectedRow.unit);
      for(const field of ['newDistance','requiredDistance','oldDistance','oldRequiredDistance'])
        assert.ok(Math.abs(row[field]-expectedRow[field])<1e-10,field);
    }
    return {id,blockId:record.blockId,frontageRoadId:record.frontageRoadId,
      blockChanged:changedBlocks.has(record.blockId),eligible,survives,classification:label.classification,reason:label.reason,
      originalRows,reducedRows};
  });
  // Re-run the exact diagnostic direct-scale trial through the current
  // public API, without altered allowances or a solver implementation change.
  const trial=await searchSpatialRetirementSubsetRoadGroup(project,op,refs,budget(),{diagnosticScale:.8});
  assert.equal(trial.status,c.historicalStatus);
  let verified=false;
  if(trial.status==='verified-witness'){
    const candidate=await verifySpatialRetirementWitness(project,op,trial.delta,budget());
    validateStoredProject(candidate);assert.equal(sha(candidate),trial.delta.candidateFingerprint);
    verified=true;
  }else assert.equal(trial.delta,null);
  assert.equal(sha(project),before);
  const report={id:c.id,source:before,historicalRun:fixture.historicalRun,groups:eligibility.propertyGroups.length,
    refs:refs.length,changedBlocks:[...changedBlocks].sort(),changedRoads:original.changedRoads.map(r=>r.ref.id),
    originalBlockers:original.blockers.length,reducedBlockers:reducedDiscovery.blockers.length,
    properties,trial:{status:trial.status,verified,exhausted:trial.exhausted,stats:trial.stats}};
  console.log('ARES_P2_HISTORICAL '+JSON.stringify(report));
  console.log('ARES_P2_SCOPE_CAUSE '+JSON.stringify({id:c.id,oldScope:properties.map(p=>({id:p.id,role:legacyScope.role(p.id)})),
    newScope:properties.map(p=>({id:p.id,role:scope.entries.find(e=>e.ref.collection==='properties'&&e.ref.id===p.id).role})),
    scopeStatus:scope.status,scopeEntries:scope.entries.length,reviewRefs:scope.reviewRefs.length}));
});

test('P2 cross-block review is not an unlimited permission or proof of solvability',async()=>{
  const c=fixture.cases.find(c=>c.id==='five-branch'),op=normalizeSpatialRoadGroup(project,0,c.ids,c.offset,fixture.permissions);
  const ctx=context(op,c.id+'-cap');
  const limited=await discoverAresAdaptationScope(project,ctx,{maxObjects:1,maxHops:0},budget());
  assert.equal(limited.status,'scope-limited');assert.deepEqual(limited.reviewRefs,[]);
  await assert.rejects(()=>verifyAresOutsideScope(project,JSON.parse(aresReplayJson(project)),limited,ctx,budget()),/scope required/);
  const scope=await discoverAresAdaptationScope(project,ctx,{maxObjects:10000,maxHops:8},budget());
  assert.equal(scope.status,'observed');
  const candidate=JSON.parse(aresReplayJson(project));
  const review=new Set(scope.reviewRefs.map(spatialRefKey));
  const external=candidate.city.properties.find(p=>!review.has(spatialRefKey({collection:'properties',id:p.id})));
  assert.ok(external);external.customName='Unauthorized outside-scope change';
  const result=await verifyAresOutsideScope(project,candidate,scope,ctx,budget());
  assert.equal(result.status,'outside-scope-changed');assert.ok(result.violations.some(v=>v.ref?.id===external.id));
  assert.equal(sha(project),before);
});

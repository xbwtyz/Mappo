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
  const properties=c.properties.map(id=>{
    const record=project.city.properties.find(p=>p.id===id);
    const originalRows=matchingRows(original,id),reducedRows=matchingRows(reducedDiscovery,id);
    const label=obs.nodes.find(n=>n.ref.collection==='properties'&&n.ref.id===id);
    assert.ok(record&&label);
    const eligible=eligibility.propertyGroups.some(g=>g.propertyId===id);
    const survives=reduced.city.properties.some(p=>p.id===id);
    assert.equal(survives,!eligible);
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
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP6LockedDryPipeline,bindP6RoadRecords} from '../scripts/development/research/ares-p6-locked-pipeline.mjs';
import {observeP6TopologyIdentity} from '../scripts/development/research/ares-p6-topology-identity.mjs';
import {observeP6ConvexClearance} from '../scripts/development/research/ares-p6-block-capacity.mjs';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';
import {materializeLockedRtreCase} from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import {P6_A_CASES,readP6ArchivedRoadEvidence} from '../scripts/development/research/ares-p6-ownership-observe.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {createHash} from 'node:crypto';
import {aresReplayJson} from '../src/core/ares-diagnostic-replay.js';
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
for(const id of P6_A_CASES)test('P6 locked pipeline '+id,async()=>{
 const r=await observeP6LockedDryPipeline(id);
 assert.equal(r.authority,'none');assert.equal(r.valid,false);assert.equal(r.landVerified,false);
 if(id==='t:t-radial-01'){assert.equal(r.status,'road-refused');assert.equal(r.pipeline,undefined);return;}
 assert.equal(r.roadAudit,'topology-final-verified',JSON.stringify(r));
 assert.ok(r.bindingMatched,JSON.stringify(r));
 assert.ok(['diagnostics-complete','pipeline-refused','work-limit'].includes(r.status));
 assert.ok(r.stats.work<=8000000);
 if(r.pipeline){assert.equal(r.sourceUnchanged,true);assert.equal(r.pipeline.valid,false);assert.equal(r.pipeline.authority,'none');}
 if(id==='t:t-linear-08'){
  assert.equal(r.status,'diagnostics-complete',JSON.stringify(r));
  assert.equal(r.pipeline.blockPlan.status,'block-plan-observed');
  assert.equal(r.pipeline.districts.passed,true);
  assert.equal(r.pipeline.defenses.passed,true);
 }
 // Legacy execution is a test-only oracle, not extra P6 search or work allowance.
 if(id==='t:t-linear-04'||id==='t:t-radial-09'){
  assert.equal(r.status,'pipeline-refused');
  assert.equal(r.pipeline.ledger.at(-1).name,'refusal-evidence');
  assert.ok(r.pipeline.ledger.at(-1).work>0);
  const source=materializeLockedRtreCase(id).project.city;
  const prior=readP6ArchivedRoadEvidence(id);
  const bound=bindP6RoadRecords(source,prior.construction.witness,r.fingerprint,root());
  assert.equal(bound.status,'matched');
  const legacy=extractRoadFaces(buildRoadGraph(bound.candidate),source);
  const e=r.pipeline.evidence;
  assert.ok(e.issues.length);
  if(id==='t:t-radial-09'){
   assert.equal(r.pipeline.reason,'invalid-candidate-extraction');
   assert.equal(legacy.valid,false);
   assert.deepEqual(e.issues,legacy.issues);
   assert.deepEqual(e.coverage,legacy.coverage);
   assert.equal(e.faceCount,legacy.faces.length);
   assert.equal(e.smallFaces.authority,'none');
   const tiny=legacy.faces.filter(f=>f.kind==='block'&&f.area<=1);
   assert.equal(tiny.length,6);
   assert.deepEqual(e.smallFaces.rows.map(x=>[x.key,x.area]),tiny.map(f=>[f.key,f.area]));
   assert.ok(e.smallFaces.rows.every(x=>x.edges.length===x.vertices&&x.edges.every(y=>y.length>0)));
  }else{
   assert.equal(r.pipeline.reason,'unproven-lineage');
   assert.ok(legacy.valid);
   const match=matchExistingFaces(source,legacy);
   const lineage=buildRoadFaceLineage023(source,legacy,match);
   assert.equal(lineage.valid,false);
   assert.deepEqual(e.issues,lineage.issues);
   for(const key of ['added','removed','split','merged','ambiguous'])assert.deepEqual(e[key],match[key]);
   assert.equal(e.preservedCount,match.preserved.length);
   assert.equal(e.changedCount,match.changed.length);
   assert.equal(e.unmatchedGeometry.authority,'none');
   assert.equal(e.unmatchedGeometry.rows.length,1);
   const pair=e.unmatchedGeometry.rows[0];
   assert.equal(pair.oldId,'BLK-0053');
   assert.equal(pair.candidateKey,match.added[0].candidateKey);
   assert.ok(pair.oldArea>0&&pair.newArea>0&&pair.overlap>=0);
   assert.ok(Number.isFinite(pair.meanDisplacement));
   const topology=e.topologyIdentity;
   assert.equal(topology.status,'topology-correspondence-observed');
   assert.equal(topology.oldId,'BLK-0053');
   assert.equal(topology.candidateKey,match.added[0].candidateKey);
   assert.equal(topology.valid,false);assert.equal(topology.authority,'none');
   assert.equal(topology.ownership,'not-assigned');
   assert.equal(topology.landFit,'not-evaluated');
   const capacity=e.capacity;
   assert.equal(capacity.status,'capacity-observed');
   assert.equal(capacity.authority,'none');assert.equal(capacity.landVerified,false);
   assert.equal(capacity.properties.length,4);assert.equal(capacity.buildings.length,4);
   assert.ok(capacity.buildingArea>capacity.faceArea);
   assert.equal(capacity.rigidInBlockAreaImpossible,true);
   assert.ok(capacity.areaUpperBound<=capacity.faceArea);
   assert.equal(capacity.relocation,'not-evaluated');
   assert.ok(topology.retainedAreaRatio<0.01);
   assert.deepEqual(topology.directBlockReferences.properties,source.properties.filter(p=>p.blockId===topology.oldId).map(p=>p.id));
   const identity={...match,valid:false,correspondenceValid:true,authority:'none'};
   const b=root();
   const observed=observeP6TopologyIdentity(source,legacy,identity,b);
   assert.deepEqual(observed,topology);
   assert.equal(observeP6TopologyIdentity(source,legacy,{...identity,removed:[...identity.removed,...identity.removed]},root()).status,'not-proven');
   assert.equal(observeP6TopologyIdentity(source,legacy,{...identity,preserved:identity.preserved.slice(1)},root()).reason,'incomplete-census');
   const wrongCycle={...source,blocks:source.blocks.map(r=>r.id===topology.oldId?{...r,vertices:[...r.vertices].reverse()}:r)};
   assert.equal(observeP6TopologyIdentity(wrongCycle,legacy,identity,root()).reason,'different-directed-cycle');
   const otherRoad={...legacy,faces:legacy.faces.map(f=>f.key===topology.candidateKey?{...f,roadIds:[f.roadIds[1],...f.roadIds.slice(1)]}:f)};
   assert.equal(observeP6TopologyIdentity(source,otherRoad,identity,root()).reason,'different-boundary-road');
  }
  console.log('P6_REFUSAL_EVIDENCE '+JSON.stringify({id,legacyParity:true,...e}));
 }
 console.log('P6_LOCKED_PIPELINE '+JSON.stringify({id,status:r.status,reason:r.pipeline?.reason??r.reason,bindingWork:r.bindingWork,work:r.stats.work,roadAuditWork:r.roadAuditWork,ledger:r.pipeline?.ledger,districts:r.pipeline?.districts,defenses:r.pipeline?.defenses,authority:'none'}));
});
test('P6 locked pipeline refuses arbitrary recipes and detects changed graph records',async()=>{
 await assert.rejects(observeP6LockedDryPipeline('t:t-planned-14'));
 const city={nodes:[{id:'a',x:0,y:0},{id:'b',x:1,y:0}],roads:[{id:'r',a:'a',b:'b',kind:'lane'}]};
 const w={requested:[{ref:{id:'a'},point:{x:2,y:3}}],neighbors:[],lineage:[],contacts:[]};
 const expected=createHash('sha256').update(aresReplayJson({nodes:[{id:'a',x:2,y:3},city.nodes[1]],roads:city.roads})).digest('hex');
 assert.equal(bindP6RoadRecords(city,w,expected,root()).status,'matched');
 const tampered={...w,requested:[{ref:{id:'a'},point:{x:2,y:4}}]};
 const r=bindP6RoadRecords(city,tampered,expected,root());
 assert.equal(r.status,'mismatch');assert.equal(r.candidate,undefined);
});

test('P6 convex clearance necessary bounds, empty and nonconvex controls',()=>{
 const square=(size)=>({polygon:[{x:0,y:0},{x:size,y:0},{x:size,y:size},{x:0,y:size}],roadIds:['a','b','c','d']});
 const graph={roadsById:new Map(['a','b','c','d'].map(id=>[id,{kind:'lane'}]))};
 const normal=observeP6ConvexClearance(square(20),graph,root());
 assert.equal(normal.status,'bounded-convex');
 assert.ok(Math.abs(normal.areaUpperBound-10.1*10.1)<.001);
 assert.equal(observeP6ConvexClearance(square(5),graph,root()).areaUpperBound,0);
 const concave={...square(20),polygon:[{x:0,y:0},{x:20,y:0},{x:10,y:5},{x:20,y:20},{x:0,y:20}]};
 assert.equal(observeP6ConvexClearance(concave,graph,root()).status,'unsupported-nonconvex');
});

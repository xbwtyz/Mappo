import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP6LockedDryPipeline,bindP6RoadRecords} from '../scripts/development/research/ares-p6-locked-pipeline.mjs';
import {observeP6TopologyIdentity} from '../scripts/development/research/ares-p6-topology-identity.mjs';
import {observeP6ConvexClearance} from '../scripts/development/research/ares-p6-block-capacity.mjs';
import {shapeContained,shapeWellFormed} from '../src/core/building-validation.js';
import {propertyFits} from '../src/core/placement.js';
import {validatePlotTiling027} from '../src/core/plot-partition-027.js';
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
  assert.equal(r.pipeline.blockOwnership.status,'block-ownership-observed');
  assert.equal(r.pipeline.blockOwnership.authority,'none');
  assert.equal(r.pipeline.blockLabels.status,'block-label-preview-observed');
  assert.equal(r.pipeline.blockLabels.authority,'none');
  assert.equal(r.pipeline.affectedProperties.status,'affected-properties-observed');
  assert.equal(r.pipeline.affectedProperties.authority,'none');
  assert.ok(r.pipeline.affectedProperties.rows.length>0);
  assert.equal(r.pipeline.propertyAudit.status,'matched');
  assert.equal(r.pipeline.propertyFit.status,'property-fit-observed');
  assert.equal(r.pipeline.parcelReshapes.status,'parcel-reshape-observed');
  assert.equal(r.pipeline.parcelReshapes.rows.length,r.pipeline.propertyFit.rows.length);
  // Qualify the corrected face-key index against the full locked fixture.
  // Independent raw source and legacy extraction are test-only oracles.
  const source=materializeLockedRtreCase(id).project.city;
  const prior=readP6ArchivedRoadEvidence(id);
  const bound=bindP6RoadRecords(source,prior.construction.witness,r.fingerprint,root());
  assert.equal(bound.status,'matched');
  const legacy=extractRoadFaces(buildRoadGraph(bound.candidate),source);
  assert.ok(legacy.valid);
  const rawProperties=new Map(source.properties.map(p=>[p.id,p]));
  const rawFaces=new Map(legacy.faces.filter(f=>f.kind==='block').map(f=>[f.key,f]));
  const fitRows=new Map(r.pipeline.propertyFit.rows.map(p=>[p.id,p]));
  const crossTab={},observedCounts={worldPreserved:0,reshaped:0,noCandidate:0,protected:0,unsupported:0};
  const noCandidate={withoutOriginalFrontage:0,noAttempt:0,attempted:0};
  let candidateCount=0,attempts=0;
  assert.equal(fitRows.size,60);
  assert.equal(r.pipeline.propertyFit.counts.unchangedShapeOption,32);
  assert.equal(r.pipeline.propertyFit.counts.noUnchangedShapeOption,28);
  const seen=new Set();
  for(const row of r.pipeline.parcelReshapes.rows){
   assert.ok(!seen.has(row.id));seen.add(row.id);
   const p=rawProperties.get(row.id),fit=fitRows.get(row.id);
   assert.ok(p&&fit);
   assert.ok(Object.hasOwn(observedCounts,row.classification));
   observedCounts[row.classification]++;
   const group=crossTab[fit.classification]??={worldPreserved:0,reshaped:0,noCandidate:0,protected:0,unsupported:0};
   group[row.classification]++;
   attempts+=row.attempts;candidateCount+=row.options.length;
   assert.ok(row.options.length<=24&&row.options.length<=row.attempts);
   assert.equal(row.options.length>0,['worldPreserved','reshaped'].includes(row.classification));
   if(row.classification==='noCandidate'){
    if(!fit.options.some(o=>o.originalFrontagePresent))noCandidate.withoutOriginalFrontage++;
    else if(row.attempts===0)noCandidate.noAttempt++;
    else noCandidate.attempted++;
   }
   for(const option of row.options){
    const face=rawFaces.get(option.key);
    assert.ok(face&&fit.options.some(o=>o.key===option.key&&o.originalFrontagePresent));
    assert.equal(option.frontageRoadId,p.frontageRoadId);
    assert.equal(option.authority,'none');
    assert.ok(face.roadIds.includes(p.frontageRoadId));
    assert.ok(shapeWellFormed(option.boundary)&&shapeContained(option.boundary,face.polygon));
    const edges=face.polygon.map((a,i)=>({a,b:face.polygon[(i+1)%face.polygon.length],road:legacy.graph.roadsById.get(face.roadIds[i])}));
    assert.ok(propertyFits(option.boundary,face.polygon,edges));
    assert.deepEqual(option.plots.map(q=>q.id),p.plotIds);
    validatePlotTiling027(option.boundary,option.plots);
    for(const building of source.buildings.filter(b=>b.propertyId===p.id))
     for(const region of building.geometry.regions)assert.ok(shapeContained(region.ring,option.boundary));
    if(option.family==='world-preserved')assert.deepEqual(option.boundary,p.boundary);
   }
  }
  const conflicts=r.pipeline.parcelConflicts;
  assert.equal(conflicts.status,'parcel-conflicts-observed');
  assert.equal(conflicts.counts.candidates,candidateCount);
  assert.equal(conflicts.authority,'none');
  const rejections={frontage:0,boundary:0,setback:0,fixedBuilding:0,plotTiling:0};
  const unresolvedRejections={...rejections};
  for(const row of r.pipeline.parcelReshapes.rows){
   assert.equal(row.attempts,row.options.length+Object.values(row.rejections).reduce((n,v)=>n+v,0));
   for(const key of Object.keys(rejections)){rejections[key]+=row.rejections[key];if(row.classification==='noCandidate')unresolvedRejections[key]+=row.rejections[key];}
  }
  console.log('P6_LOCKED_PARCEL_CONFLICTS '+JSON.stringify({id,counts:conflicts.counts,rejections,unresolvedRejections,authority:'none'}));
  const cooperative=r.pipeline.cooperativeParcels;
  assert.equal(cooperative.status,'cooperative-parcels-observed');
  assert.equal(cooperative.authority,'none');assert.equal(cooperative.landVerified,false);
  assert.equal(cooperative.selected.length,32);assert.equal(cooperative.unresolved.length,28);
  assert.equal(cooperative.allObservedOwnersCovered,false);
  assert.equal(cooperative.selection,'compatible-candidate-bearing-subset');
  console.log('P6_LOCKED_COOPERATIVE_PARCELS '+JSON.stringify({id,selected:cooperative.selected.length,unresolved:cooperative.unresolved.length,attempts:cooperative.attempts,authority:'none'}));
  const access=r.pipeline.sameFrontageAccess;
  assert.equal(access.status,'same-frontage-access-observed');assert.equal(access.authority,'none');
  assert.deepEqual(access.unresolvedProperties,cooperative.unresolved);
  const selectedIds=new Set(cooperative.selected.map(row=>row.id));
  assert.deepEqual(access.rows.map(row=>row.id).sort(),source.buildings.filter(b=>selectedIds.has(b.propertyId)).map(b=>b.id).sort());
  for(const row of access.rows)if(row.route){
   const original=source.buildings.find(b=>b.id===row.id);
   assert.deepEqual(row.route.entrance,original.entrance);assert.equal(row.route.frontageRoadId,original.frontageRoadId);
  }
  assert.equal(Object.values(access.counts).reduce((n,v)=>n+v,0),access.rows.length);
  for(const row of access.rows){
   assert.equal(!!row.route,['retained','repaired'].includes(row.classification));
   if(row.route){
    const road=bound.candidate.roads.find(x=>x.id===row.frontageRoadId);
    const a=bound.candidate.nodes.find(x=>x.id===road?.a),b=bound.candidate.nodes.find(x=>x.id===road?.b);
    assert.ok(a&&b);
    const end=row.route.accessPath.at(-1),dx=b.x-a.x,dy=b.y-a.y;
    const t=((end.x-a.x)*dx+(end.y-a.y)*dy)/(dx*dx+dy*dy);
    assert.ok(t>=-1e-6&&t<=1+1e-6);
    assert.ok(Math.hypot(end.x-a.x-t*dx,end.y-a.y-t*dy)<=1e-6);
   }
  }
  console.log('P6_LOCKED_SAME_FRONTAGE_ACCESS '+JSON.stringify({id,counts:access.counts,unknown:access.unknown.length,authority:'none'}));
  const alternatives=r.pipeline.alternativeFrontages;
  assert.equal(alternatives.status,'alternative-frontage-observed');assert.equal(alternatives.permission,'not-granted');
  assert.equal(alternatives.rows.length,fitRows.size);
  for(const row of alternatives.rows)for(const option of row.options){
   const face=rawFaces.get(option.key),i=face.roadIds.indexOf(row.originalFrontage),m=face.roadIds.length;
   assert.ok(i>=0&&[(i+m-1)%m,(i+1)%m].includes(option.edgeIndex));assert.equal(option.roadId,face.roadIds[option.edgeIndex]);
   assert.equal(option.authority,'none');
  }
  console.log('P6_LOCKED_ALTERNATIVE_FRONTAGES '+JSON.stringify({id,counts:alternatives.counts,options:alternatives.rows.reduce((n,r)=>n+r.options.length,0),authority:'none'}));
  const fixed=r.pipeline.fixedBuildings;
  assert.equal(fixed.status,'fixed-buildings-observed');assert.equal(fixed.authority,'none');assert.equal(fixed.landVerified,false);
  assert.deepEqual(fixed.rows.map(row=>row.id).sort(),source.buildings.filter(b=>fitRows.has(b.propertyId)).map(b=>b.id).sort());
  const deferredPolicy={rigid:0,fixed:0};
  for(const row of fixed.rows)if(!selectedIds.has(row.propertyId))deferredPolicy[row.permission.mode]++;
  console.log('P6_LOCKED_FIXED_BUILDINGS '+JSON.stringify({id,counts:fixed.counts,policies:fixed.policies,deferredPolicy,authority:'none'}));
  const rigid=r.pipeline.rigidTranslations;
  assert.equal(rigid.status,'rigid-translations-observed');assert.equal(rigid.authority,'none');assert.equal(rigid.landVerified,false);
  for(const row of rigid.rows)if(row.witness){
   const p=rawProperties.get(row.id),option=r.pipeline.parcelReshapes.rows.find(x=>x.id===row.id).conditionalOptions[row.witness.optionIndex];
   assert.deepEqual(row.witness.buildings.map(b=>b.id),p.buildingIds);
   for(const b of row.witness.buildings){
    const original=source.buildings.find(x=>x.id===b.id);
    if(row.witness.phase==='translation')assert.equal(b.transform.angle,0);
    assert.ok(Number.isFinite(b.transform.angle));assert.ok(Math.abs(b.area-original.area)<=.02);
    assert.ok(shapeContained(b.geometry.regions[0].ring,option.boundary));
    assert.ok(b.occupiedPlotIds.every(id=>p.plotIds.includes(id)));
   }
  }
  assert.equal(rigid.rows.filter(row=>row.witness?.phase==='translation').length,16);
  assert.ok(rigid.rows.filter(row=>row.witness?.phase==='translation').every(row=>row.rotationAttempts===0));
  console.log('P6_LOCKED_RIGID_ROTATION_FALLBACK '+JSON.stringify({id,translation:rigid.rows.filter(row=>row.witness?.phase==='translation').length,rotation:rigid.rows.filter(row=>row.witness?.phase==='rotation').length,rotationAttempts:rigid.rows.reduce((n,r)=>n+r.rotationAttempts,0),authority:'none'}));
  console.log('P6_LOCKED_RIGID_TRANSLATIONS '+JSON.stringify({id,counts:rigid.counts,conditional:rigid.rows.reduce((n,r)=>n+r.conditionalCount,0),attempts:rigid.rows.reduce((n,r)=>n+r.attempts,0),moved:rigid.rows.reduce((n,r)=>n+(r.witness?.buildings.filter(b=>b.transform.dx!==0||b.transform.dy!==0).length??0),0),authority:'none'}));
  assert.equal(seen.size,fitRows.size);
  assert.deepEqual(observedCounts,r.pipeline.parcelReshapes.counts);
  assert.ok(r.stats.expansions>=attempts&&r.stats.expansions<=32768);
  console.log('P6_LOCKED_PARCEL_RESHAPES '+JSON.stringify({id,counts:observedCounts,attempts,candidateCount,crossTab,noCandidate,geometryOracle:'legacy-predicates',authority:'none'}));
  assert.equal(r.pipeline.propertyFit.rows.length,r.pipeline.propertyAudit.expandedCount);
  console.log('P6_LOCKED_PROPERTY_FIT '+JSON.stringify({id,counts:r.pipeline.propertyFit.counts}));
  assert.equal(r.pipeline.propertyAudit.baseCount,r.pipeline.affectedProperties.rows.length);
  console.log('P6_LOCKED_PROPERTY_AUDIT '+JSON.stringify({id,base:r.pipeline.propertyAudit.baseCount,expanded:r.pipeline.propertyAudit.expandedCount,extra:r.pipeline.propertyAudit.extraCount,knownScope:r.pipeline.propertyAudit.knownScopeCount,unsupported:r.pipeline.propertyAudit.unsupportedDependentGeometry.length,coverage:r.pipeline.propertyAudit.geometryCoverage}));
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

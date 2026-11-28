import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeRoadCrossingsC3,draftRoadConnectionC3,roadTopologyId} from '../src/core/road-crossings.js';
import {prepareJunctionIntentC7} from '../src/core/road-intent-c1.js';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';

import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {observeP6ParcelReshapes} from '../scripts/development/research/ares-p6-parcel-reshapes.mjs';
import {stampRoadGenerated} from '../src/core/road-provenance.js';
import {validatePlotTiling027} from '../src/core/plot-partition-027.js';
import {observeP6PropertyFit} from '../scripts/development/research/ares-p6-property-fit.mjs';
import {shapeContained} from '../src/core/building-validation.js';
import {propertyFits} from '../src/core/placement.js';
import {auditP6AffectedProperties} from '../scripts/development/research/ares-p6-property-audit.mjs';
import {observeP6AffectedProperties} from '../scripts/development/research/ares-p6-affected-properties.mjs';
import {previewP6BlockLabels} from '../scripts/development/research/ares-p6-block-label-preview.mjs';
import {observeP6BlockOwnership} from '../scripts/development/research/ares-p6-block-ownership.mjs';
import {planP6BlockRecords,equalP6BlockRecord} from '../scripts/development/research/ares-p6-block-record-plan.mjs';
import {observeP6DryPipeline} from '../scripts/development/research/ares-p6-budgeted-pipeline.mjs';
import {buildP6BudgetedLineage} from '../scripts/development/research/ares-p6-budgeted-lineage.mjs';
import {generateFortifications} from '../src/generators/fortifications.js';
function fixture(kind){
  const planned=kind==='R2';
  const project=createProject({seed:planned?'c2-planned':'c2-radial',size:'small',morphology:planned?'planned':'radial'});
  const before=structuredClone(project);
  let draft;
  if(planned){
    const to=project.city.nodes.find(n=>n.id==='N-0140');
    draft=prepareJunctionIntentC7(project,'N-0139',{x:to.x,y:to.y});
  }else draft=draftRoadConnectionC3(project.city,'RD-0098',{kind:'remove'});
  const normalized=normalizeRoadCrossingsC3(structuredClone(draft.proposedCity),
    planned?{preferredNodeId:'N-0140'}:{});
  const extraction=extractRoadFaces(normalized.graph,project.city);
  const matching=matchExistingFaces(project.city,extraction);
  return {project,before,extraction,matching,candidate:{nodes:[...normalized.graph.nodesById.values()],roads:[...normalized.graph.roadsById.values()]}};
}



const root=work=>createSpatialPreservationBudget({work,stateExpansions:32768});
const rows=['preserved','changed','added','removed','split','merged','ambiguous'];
function verify(source,candidate,legacy,extraction,label){
 const before=JSON.stringify([source,candidate]),b=root(8000000);
 b.spend(7);
 const result=observeP6DryPipeline(source,candidate,b);
 assert.ok(result.diagnosticsComplete,JSON.stringify(result));
 assert.equal(result.valid,false);assert.equal(result.authority,'none');
 assert.equal(result.identity.valid,false);assert.equal(result.lineage.valid,false);
 for(const key of rows)assert.deepEqual(result.identity[key],legacy[key]);
 const old=buildRoadFaceLineage023(source,extraction,legacy);
 assert.ok(old.valid);
 for(const key of ['faces','groups','reverse','issues'])assert.deepEqual(result.lineage[key],old[key]);
 assert.equal(buildP6BudgetedLineage(source,extraction,result.identity,root(8000000)).valid,false);
 for(const [key,code] of [['districts','district-reference'],['defenses','defense-reference']]){
  assert.equal(result[key].checked,true);
  assert.equal(result[key].passed,!legacy.issues.some(i=>i.code===code));
 }
 const used=b.snapshot().work-7;assert.equal(result.ledger.reduce((n,r)=>n+r.work,0),used);
 assert.equal(result.ledger.length,15);
 const plan=result.blockPlan;
 assert.equal(plan.status,'block-plan-observed');assert.equal(plan.valid,false);
 assert.equal(plan.authority,'none');assert.equal(plan.landVerified,false);
 assert.equal(plan.rows.length,extraction.faces.filter(f=>f.kind==='block').length);
 assert.deepEqual(plan.reverse,old.reverse);
 assert.equal(plan.retained,legacy.preserved.filter(r=>r.kind==='block').length+legacy.changed.filter(r=>r.kind==='block').length);
 const matches=new Map([...legacy.preserved,...legacy.changed].map(r=>[r.candidateKey,r]));
 const faces=new Map(extraction.faces.map(f=>[f.key,f]));
 for(const row of plan.rows){
  if(row.status==='retained-record-proposal')assert.deepEqual(row.record,matches.get(row.key).record);
  else{
   assert.equal(row.status,'unallocated-structural-shell');assert.equal(row.record,undefined);assert.equal(row.geometry.id,undefined);
   assert.deepEqual(row.geometry.vertices,faces.get(row.key).vertices);
   assert.equal(row.geometry.area,Math.round(faces.get(row.key).area*100)/100);
  }
 }
 assert.equal(plan.structural>0,label!=='fortified-unchanged');
 const ownership=result.blockOwnership;
 assert.equal(ownership.status,'block-ownership-observed');
 assert.equal(ownership.valid,false);assert.equal(ownership.authority,'none');assert.equal(ownership.landVerified,false);
 assert.equal(ownership.retained,plan.retained);
 assert.equal(ownership.allocation,'not-performed');assert.equal(ownership.retirement,'not-authorized');
 assert.equal(ownership.allocationTypeRegistered,false);
 assert.deepEqual(ownership.ledger.map(r=>({oldId:r.oldId,candidateKeys:r.candidateKeys})),old.reverse);
 const expectedRefs=source.blocks.map(block=>({oldId:block.id,references:['properties','plots','buildings','openSpaces'].flatMap(collection=>source[collection].filter(r=>r.blockId===block.id).map(r=>({collection,id:r.id}))).sort((a,b)=>a.collection<b.collection?-1:a.collection>b.collection?1:a.id<b.id?-1:a.id>b.id?1:0)})).sort((a,b)=>a.oldId<b.oldId?-1:a.oldId>b.oldId?1:0);
 assert.deepEqual(ownership.ledger.map(({oldId,references})=>({oldId,references})),expectedRefs);
 assert.equal(ownership.pendingFaces.length,plan.structural);
 assert.equal(ownership.minimumNewIds,Math.max(0,plan.rows.length-source.blocks.length));
 assert.equal(ownership.minimumRetirements,Math.max(0,source.blocks.length-plan.rows.length));
 assert.equal(observeP6BlockOwnership(source,{...plan,reverse:plan.reverse.slice(1)},root(8000000)).status,'refused');
 assert.equal(observeP6BlockOwnership({...source,properties:[...source.properties,{id:'invalid-test-reference',blockId:'absent'}]},plan,root(8000000)).reason,'invalid-land-reference');
 assert.throws(()=>observeP6BlockOwnership(source,plan,root(1)),LareBudgetExceeded);
 console.log('P6_BLOCK_OWNERSHIP '+JSON.stringify({label,retained:ownership.retained,pendingOld:ownership.pendingOld,pendingFaces:ownership.pendingFaces.length,minimumNewIds:ownership.minimumNewIds,minimumRetirements:ownership.minimumRetirements,references:ownership.ledger.reduce((n,r)=>n+r.references.length,0),authority:'none'}));
 const preview=result.blockLabels;
 assert.equal(preview.status,'block-label-preview-observed');assert.equal(preview.authority,'none');
 assert.equal(preview.valid,false);assert.equal(preview.landVerified,false);
 assert.equal(preview.allocation,'not-performed');assert.equal(preview.retirement,'not-authorized');
 const usedLabels=new Set([source.plaza.id,...source.blocks.map(r=>r.id),...(source.waterFaces??[]).map(r=>r.id),...(source.terrainFaces??[]).map(r=>r.id)]);
 const expectedLabels=new Map([...legacy.preserved,...legacy.changed].filter(r=>r.kind==='block').map(r=>[r.candidateKey,r.id]));
 for(const g of [...legacy.split,...legacy.merged,...legacy.ambiguous])for(const k of g.candidateKeys)
  expectedLabels.set(k,g.oldIds.length===1&&g.candidateKeys.length===1?g.oldIds[0]:roadTopologyId('BLK-X',k,usedLabels));
 assert.deepEqual(preview.rows.map(r=>[r.key,r.label]),[...expectedLabels].sort(([a],[b])=>a<b?-1:a>b?1:0));
 assert.equal(new Set(preview.rows.map(r=>r.label)).size,preview.rows.length);
 assert.deepEqual(preview.reverse.map(r=>({oldId:r.oldId,successorLabels:r.successorLabels})),old.reverse.map(r=>({oldId:r.oldId,successorLabels:r.candidateKeys.map(k=>expectedLabels.get(k))})));
 assert.equal(preview.historicalNonreuse,'not-established');
 assert.throws(()=>previewP6BlockLabels(source,plan,ownership,result.identity,result.lineage,root(1)),LareBudgetExceeded);
 if(plan.structural){
  const k=preview.rows.find(r=>r.kind==='new-label-preview').key;
  const id=expectedLabels.get(k);
  const collision={...source,waterFaces:[...(source.waterFaces??[]),{id}]};
  const collided=previewP6BlockLabels(collision,plan,ownership,result.identity,result.lineage,root(8000000));
  assert.equal(collided.status,'block-label-preview-observed');
  assert.ok(collided.rows.find(r=>r.key===k).label!==id);
  const predecessor=preview.rows.find(r=>r.key===k).predecessorIds[0];
  const opaque={...source,blocks:source.blocks.map(r=>r.id===predecessor?{...r,ownerNote:'keep'}:r)};
  const flagged=previewP6BlockLabels(opaque,plan,ownership,result.identity,result.lineage,root(8000000));
  assert.ok(flagged.rows.find(r=>r.key===k).blockers.includes('opaque-predecessor'));
 }
 console.log('P6_BLOCK_LABEL_PREVIEW '+JSON.stringify({label,newLabels:preview.newLabels,potentialRetirements:preview.potentialRetirements,blockedChoices:preview.blockedChoices,authority:'none'}));
 const discovery=result.affectedProperties;
 assert.equal(discovery.status,'affected-properties-observed',JSON.stringify(discovery));
 assert.equal(discovery.authority,'none');assert.equal(discovery.valid,false);assert.equal(discovery.landVerified,false);
 assert.equal(discovery.scanned,source.properties.length);
 const changedBlocks=new Set([...legacy.changed.filter(r=>r.kind==='block').map(r=>r.id),...[...legacy.split,...legacy.merged,...legacy.ambiguous].flatMap(g=>g.oldIds)]);
 assert.deepEqual(discovery.affectedBlockIds,[...changedBlocks].sort());
 const beforeNodes=new Map(source.nodes.map(r=>[r.id,r])),afterNodes=new Map(candidate.nodes.map(r=>[r.id,r]));
 const beforeRoads=new Map(source.roads.map(r=>[r.id,r])),afterRoads=new Map(candidate.roads.map(r=>[r.id,r]));
 const expectedRoads=[...new Set([...beforeRoads.keys(),...afterRoads.keys()])].filter(id=>{
  const x=beforeRoads.get(id),y=afterRoads.get(id);
  return !x||!y||x.a!==y.a||x.b!==y.b||x.kind!==y.kind||[x.a,x.b].some(k=>beforeNodes.get(k).x!==afterNodes.get(k)?.x||beforeNodes.get(k).y!==afterNodes.get(k)?.y);
 }).sort();
 assert.deepEqual(discovery.changedRoadIds,expectedRoads);
 const found=new Map(discovery.rows.map(r=>[r.id,r]));
 for(const p of source.properties){
  if(changedBlocks.has(p.blockId))assert.ok(found.get(p.id)?.reasons.includes('changed-block'));
  if(expectedRoads.includes(p.frontageRoadId))assert.ok(found.get(p.id)?.reasons.includes('changed-frontage'));
 }
 for(const r of discovery.rows){
  const p=source.properties.find(p=>p.id===r.id);
  assert.deepEqual(r.plotIds,[...p.plotIds].sort());assert.deepEqual(r.buildingIds,[...p.buildingIds].sort());
  assert.deepEqual(r.candidateKeys,old.reverse.find(x=>x.oldId===p.blockId).candidateKeys);
  assert.equal(r.classification,'observe-only');
 }
 if(label==='fortified-unchanged')assert.equal(discovery.rows.length,0);
 const oldGraph=buildRoadGraph(source),newGraph=buildRoadGraph(candidate);
 assert.throws(()=>observeP6AffectedProperties(source,oldGraph,newGraph,plan,ownership,root(1)),LareBudgetExceeded);
 const invalid={...source,properties:source.properties.map((p,i)=>i===0?{...p,blockId:'missing'}:p)};
 assert.equal(observeP6AffectedProperties(invalid,oldGraph,newGraph,plan,ownership,root(8000000)).reason,'missing-property-block');
 console.log('P6_AFFECTED_PROPERTIES '+JSON.stringify({label,scanned:discovery.scanned,affected:discovery.rows.length,changedRoads:discovery.changedRoadIds.length,counts:discovery.counts,authority:'none'}));
 const audit=result.propertyAudit;
 assert.equal(audit.status,'matched');assert.equal(audit.authority,'none');assert.equal(audit.landVerified,false);
 assert.equal(audit.baseCount,discovery.rows.length);
 assert.deepEqual(audit.rows.filter(r=>r.baseObserved).map(r=>r.id),discovery.rows.map(r=>r.id));
 assert.equal(audit.extraCount,audit.expandedCount-audit.baseCount);
 assert.ok(audit.knownScopeCount<=10000);
 if(label==='fortified-unchanged')assert.equal(audit.expandedCount,0);
 if(discovery.rows.length)assert.equal(auditP6AffectedProperties(source,candidate,result.identity,result.lineage,{...discovery,rows:discovery.rows.slice(1)},root(8000000)).status,'mismatch');
 assert.throws(()=>auditP6AffectedProperties(source,candidate,result.identity,result.lineage,discovery,root(1)),LareBudgetExceeded);
 if(discovery.changedRoadIds.length){
  // Detached negative geometry control: a dependent path reaches a changed
  // street while its owning parcel is outside the original property survey.
  const other=source.buildings.find(x=>!found.has(x.propertyId));
  const roadId=discovery.changedRoadIds[0],road=beforeRoads.get(roadId)??afterRoads.get(roadId);
  const point=(beforeRoads.has(roadId)?beforeNodes:afterNodes).get(road.a);
  assert.ok(other&&point);
  const extended={...source,buildings:source.buildings.map(x=>x.id===other.id?{...x,accessPath:[...x.accessPath,{x:point.x,y:point.y}]}:x)};
  const expanded=auditP6AffectedProperties(extended,candidate,result.identity,result.lineage,discovery,root(8000000));
  assert.equal(expanded.status,'matched');
  assert.ok(expanded.rows.find(r=>r.id===other.propertyId)?.dependentGeometryHits.some(r=>r.id===other.id&&r.roadIds.includes(roadId)));
 }
 console.log('P6_PROPERTY_AUDIT '+JSON.stringify({label,base:audit.baseCount,expanded:audit.expandedCount,extra:audit.extraCount,knownScope:audit.knownScopeCount,unsupported:audit.unsupportedDependentGeometry.length,coverage:audit.geometryCoverage,authority:'none'}));
 const fit=result.propertyFit;
 assert.equal(fit.status,'property-fit-observed');assert.equal(fit.authority,'none');assert.equal(fit.landVerified,false);
 assert.deepEqual(fit.rows.map(r=>r.id),audit.rows.map(r=>r.id));
 for(const r of fit.rows){
  const p=source.properties.find(x=>x.id===r.id);
  assert.deepEqual(r.options.map(x=>x.key),audit.rows.find(x=>x.id===r.id).candidateKeys);
  for(const option of r.options){
   const face=extraction.faces.find(x=>x.key===option.key);
   const edges=face.polygon.map((a,i)=>({a,b:face.polygon[(i+1)%face.polygon.length],road:extraction.graph.roadsById.get(face.roadIds[i])}));
   const expected=shapeContained(p.boundary,face.polygon)&&propertyFits(p.boundary,face.polygon,edges);
   assert.equal(option.fixedGeometry,expected?'fits-original-boundary':'original-boundary-does-not-fit');
   assert.equal(option.originalFrontagePresent,face.roadIds.includes(p.frontageRoadId));
   assert.equal(option.ownership,'not-assigned');
  }
 }
 assert.equal(fit.counts.unchangedShapeOption+fit.counts.noUnchangedShapeOption+fit.counts.unresolved,fit.rows.length);
 assert.throws(()=>observeP6PropertyFit(source,extraction,audit,root(1)),LareBudgetExceeded);
 if(audit.rows.length)assert.equal(observeP6PropertyFit(source,extraction,{...audit,rows:[{...audit.rows[0],candidateKeys:['absent']}]},root(8000000)).reason,'invalid-successor-face');
 console.log('P6_PROPERTY_FIT '+JSON.stringify({label,rows:fit.rows.length,counts:fit.counts,authority:'none'}));
 const reshapes=result.parcelReshapes;
 assert.equal(reshapes.status,'parcel-reshape-observed');assert.equal(reshapes.authority,'none');assert.equal(reshapes.landVerified,false);
 assert.deepEqual(reshapes.rows.map(r=>r.id),fit.rows.map(r=>r.id));
 for(const row of reshapes.rows){
  const p=source.properties.find(x=>x.id===row.id);
  for(const option of row.options){
   const face=extraction.faces.find(x=>x.key===option.key);
   assert.equal(option.frontageRoadId,p.frontageRoadId);assert.equal(option.authority,'none');
   assert.deepEqual(option.plots.map(q=>q.id),p.plotIds);
   assert.ok(shapeContained(option.boundary,face.polygon));
   assert.ok(propertyFits(option.boundary,face.polygon,face.polygon.map((a,i)=>({a,b:face.polygon[(i+1)%face.polygon.length],road:extraction.graph.roadsById.get(face.roadIds[i])}))));
   validatePlotTiling027(option.boundary,option.plots);
   for(const building of source.buildings.filter(x=>x.propertyId===p.id))for(const region of building.geometry.regions)assert.ok(shapeContained(region.ring,option.boundary));
   if(option.family==='world-preserved')assert.deepEqual(option.boundary,p.boundary);
  }
 }
 assert.equal(Object.values(reshapes.counts).reduce((n,c)=>n+c,0),fit.rows.length);
 assert.throws(()=>observeP6ParcelReshapes(source,extraction,fit,root(1)),LareBudgetExceeded);
 console.log('P6_PARCEL_RESHAPES '+JSON.stringify({label,counts:reshapes.counts,attempts:reshapes.rows.reduce((n,r)=>n+r.attempts,0),authority:'none'}));
 const changed=[...result.identity.preserved,...result.identity.changed].find(m=>m.kind==='block');
 const tamper=items=>items.map(m=>m===changed?{...m,record:{...m.record,unexpectedMetadata:'wrong'}}:m);
 assert.equal(planP6BlockRecords(source,extraction,{...result.identity,preserved:tamper(result.identity.preserved),changed:tamper(result.identity.changed)},result.lineage,root(8000000)).reason,'record-mismatch');
 assert.equal(planP6BlockRecords(source,extraction,result.identity,{...result.lineage,faces:result.lineage.faces.slice(1)},root(8000000)).status,'refused');
 assert.equal(planP6BlockRecords(source,extraction,result.identity,{...result.lineage,reverse:[]},root(8000000)).reason,'reverse-lineage-mismatch');
 console.log('P6_BLOCK_RECORD_PLAN '+JSON.stringify({label,retained:plan.retained,structural:plan.structural,sourceBlocks:source.blocks.length,successorBlocks:plan.rows.length,authority:'none'}));
 assert.deepEqual(observeP6DryPipeline(source,candidate,b),result);
 assert.equal(b.snapshot().work,7+2*used);
 assert.throws(()=>observeP6DryPipeline(source,candidate,root(used-1)),LareBudgetExceeded);
 assert.equal(JSON.stringify([source,candidate]),before);
 console.log('P6_DRY_PIPELINE '+JSON.stringify({label,work:used,ledger:result.ledger,districts:result.districts.passed,defenses:result.defenses.passed,authority:'none'}));
}
for(const kind of ['R1','R2'])test('P6 combined dry changed fixture '+kind,()=>{
 const {project,extraction,matching,candidate}=fixture(kind);
 verify(project.city,candidate,matching,extraction,kind);
});
test('P6 combined dry unchanged fortified control',()=>{
 const source=generateFortifications(createProject({seed:'wall-stress',size:'small',morphology:'planned'}).city,{seed:'wall-stress',gateCount:4,towerSpacing:100});
 // Use independent legacy graph/extraction only as the outside-budget oracle.
 const graph=buildRoadGraph(source),extraction=extractRoadFaces(graph,source);
 verify(source,source,matchExistingFaces(source,extraction),extraction,'fortified-unchanged');
});
test('P6 combined dry refusal controls',()=>{
 const source=createProject({seed:'p6-pipeline-invalid',size:'small',morphology:'radial'}).city;
 const b=root(8000000),r=observeP6DryPipeline(source,{nodes:source.nodes,roads:[...source.roads,{...source.roads[0]}]},b);
 assert.equal(r.reason,'invalid-candidate-graph');assert.equal(r.valid,false);assert.equal(r.diagnosticsComplete,false);
 assert.equal(observeP6DryPipeline({...source,waterFeatures:[{}]},source,b).reason,'unsupported-landscape');
 assert.throws(()=>observeP6DryPipeline(source,source),/Shared P6 budget/);
});

test('P6 block record semantic equality accepts key order only',()=>{
 const a={id:'b',data:{z:-0,a:[1,2]},area:1};
 const c={area:1,data:{a:[1,2],z:-0},id:'b'};
 assert.ok(equalP6BlockRecord(a,c,root(8000000)));
 assert.ok(!equalP6BlockRecord(a,{...c,data:{...c.data,z:0}},root(8000000)));
 assert.ok(!equalP6BlockRecord(a,{...c,data:{...c.data,a:[2,1]}},root(8000000)));
 assert.ok(!equalP6BlockRecord(a,{...c,extra:true},root(8000000)));
 assert.throws(()=>equalP6BlockRecord(a,c,root(1)),LareBudgetExceeded);
});

test('P6 bounded affine parcel candidates preserve plot IDs and refuse protected or fixed obstruction',()=>{
 const rect=(x,y,w,d)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
 const p={id:'p',blockId:'old',plotIds:['q'],buildingIds:[],frontageRoadId:'r0',boundary:rect(10,2,20,12)};
 const q={id:'q',propertyId:'p',blockId:'old',frontageRoadId:'r0',boundary:rect(10,2,20,12)};
 stampRoadGenerated(p,[q]);
 const face={kind:'block',key:'face',polygon:rect(0,0,60,40),roadIds:['r0','r1','r2','r3']};
 const extraction={valid:true,faces:[face],graph:{roadsById:new Map(face.roadIds.map(id=>[id,{id,kind:'lane'}]))}};
 const fit={status:'property-fit-observed',authority:'none',rows:[{id:'p',oldBlockId:'old',options:[{key:'face',originalFrontagePresent:true}]}]};
 const source={properties:[p],plots:[q],buildings:[]};
 const before=JSON.stringify(source),result=observeP6ParcelReshapes(source,extraction,fit,root(8000000));
 assert.equal(result.rows[0].classification,'reshaped');
 assert.ok(result.rows[0].options.every(o=>o.family==='positive-affine'&&o.plots[0].id==='q'));
 assert.equal(JSON.stringify(source),before);
 const protectedSource={...source,properties:[{...p,customName:'Keep'}]};
 assert.equal(observeP6ParcelReshapes(protectedSource,extraction,fit,root(8000000)).rows[0].classification,'protected');
 const fixed={...p,buildingIds:['b']};stampRoadGenerated(fixed,[q]);
 const blocked={...source,properties:[fixed],buildings:[{id:'b',propertyId:'p',geometry:{regions:[{ring:rect(12,2.2,2,1)}]}}]};
 assert.equal(observeP6ParcelReshapes(blocked,extraction,fit,root(8000000)).rows[0].classification,'noCandidate');
});

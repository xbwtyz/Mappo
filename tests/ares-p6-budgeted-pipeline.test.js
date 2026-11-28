import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeRoadCrossingsC3,draftRoadConnectionC3} from '../src/core/road-crossings.js';
import {prepareJunctionIntentC7} from '../src/core/road-intent-c1.js';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';

import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {planP6BlockRecords} from '../scripts/development/research/ares-p6-block-record-plan.mjs';
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
 assert.equal(result.ledger.length,9);
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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeRoadCrossingsC3,draftRoadConnectionC3} from '../src/core/road-crossings.js';
import {prepareJunctionIntentC7} from '../src/core/road-intent-c1.js';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';

import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {matchP6BudgetedIdentity} from '../scripts/development/research/ares-p6-budgeted-identity.mjs';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {extractP6BudgetedDryFaces} from '../scripts/development/research/ares-p6-budgeted-dry-faces.mjs';
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
  return {project,before,extraction,matching};
}



const root=work=>createSpatialPreservationBudget({work,stateExpansions:32768});
const rows=['preserved','changed','added','removed','split','merged','ambiguous'];
const comparable=r=>Object.fromEntries(rows.map(k=>[k,r[k]]));
for(const kind of ['R1','R2'])test('P6 identity dry correspondence parity '+kind,()=>{
 const {project,extraction,matching}=fixture(kind);
 const before=JSON.stringify(project),accepted=buildRoadGraph(project.city),b=root(8000000);
 const dry=extractP6BudgetedDryFaces(extraction.graph,project.city,b);
 const initial=b.snapshot().work;
 const r=matchP6BudgetedIdentity(project.city,dry,accepted,b);
 assert.equal(r.correspondenceValid,matching.valid,JSON.stringify(r.issues));
 assert.deepEqual(comparable(r),comparable(matching));
 assert.deepEqual(r.issues,matching.issues.filter(i=>!['district-reference','defense-reference'].includes(i.code)));
 assert.equal(r.valid,false);assert.equal(r.canApplyIn02A,false);
 const used=b.snapshot().work-initial;assert.ok(used>0);
 assert.deepEqual(matchP6BudgetedIdentity(project.city,dry,accepted,b),r);
 assert.equal(b.snapshot().work,initial+2*used);
 const short=root(initial+used-1);
 extractP6BudgetedDryFaces(extraction.graph,project.city,short);
 assert.throws(()=>matchP6BudgetedIdentity(project.city,dry,accepted,short),LareBudgetExceeded);
 assert.equal(JSON.stringify(project),before);
 console.log('P6_IDENTITY_BUDGET '+JSON.stringify({kind,extractionWork:initial,identityWork:used,legacyParity:true,authority:'none'}));
});
test('P6 identity unchanged city, required baseline and budget',()=>{
 const project=createProject({seed:'p6-identity-control',size:'small',morphology:'organic'});
 const graph=buildRoadGraph(project.city),b=root(8000000);
 const dry=extractP6BudgetedDryFaces(graph,project.city,b);
 const r=matchP6BudgetedIdentity(project.city,dry,graph,b);
 assert.ok(r.correspondenceValid,JSON.stringify(r.issues));
 assert.deepEqual(comparable(r),comparable(matchExistingFaces(project.city,dry)));
 assert.equal(r.valid,false);
 assert.throws(()=>matchP6BudgetedIdentity(project.city,dry,null,b),/Validated baseline graph/);
 assert.throws(()=>matchP6BudgetedIdentity(project.city,dry,graph),/Shared P6 budget/);
});

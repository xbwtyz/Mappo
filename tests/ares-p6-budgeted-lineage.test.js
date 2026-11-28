import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeRoadCrossingsC3,draftRoadConnectionC3} from '../src/core/road-crossings.js';
import {prepareJunctionIntentC7} from '../src/core/road-intent-c1.js';
import {extractRoadFaces,matchExistingFaces} from '../src/core/road-faces.js';
import {buildRoadFaceLineage023} from '../src/core/road-face-lineage-023.js';

import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {buildP6BudgetedLineage} from '../scripts/development/research/ares-p6-budgeted-lineage.mjs';
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
const comparable=({workUnits,...rest})=>rest;
for(const kind of ['R1','R2'])test('P6 lineage shared-budget parity '+kind,()=>{
 const {project,extraction,matching}=fixture(kind);
 const before=JSON.stringify(project), b=root(8000000);
 const legacy=buildRoadFaceLineage023(project.city,extraction,matching);
 assert.ok(legacy.valid,JSON.stringify(legacy.issues));
 const dry=extractP6BudgetedDryFaces(extraction.graph,project.city,b);
 assert.ok(dry.valid,JSON.stringify(dry.issues));
 assert.deepEqual(dry.faces,extraction.faces);
 const initial=b.snapshot().work;
 const first=buildP6BudgetedLineage(project.city,dry,matching,b);
 assert.deepEqual(comparable(first),comparable(legacy));
 const used=b.snapshot().work-initial;
 assert.equal(first.workUnits,used);assert.ok(used>0);
 const repeat=buildP6BudgetedLineage(project.city,dry,matching,b);
 assert.deepEqual(repeat,first);assert.equal(b.snapshot().work,initial+2*used);
 const short=root(initial+used-1);
 extractP6BudgetedDryFaces(extraction.graph,project.city,short);
 assert.throws(()=>buildP6BudgetedLineage(project.city,dry,matching,short),LareBudgetExceeded);
 assert.equal(JSON.stringify(project),before);
 console.log('P6_LINEAGE_BUDGET '+JSON.stringify({kind,extractionWork:initial,lineageWork:used,faces:first.faces.length,groups:first.groups.length,legacyParity:true,authority:'none'}));
});
test('P6 lineage refuses incomplete inputs and preserves opaque fields',()=>{
 const {project,extraction,matching}=fixture('R1');
 const a=project.city.blocks.find(b=>b.id==='BLK-0029');a.customZoningNote='owner-preserved';
 const b=root(8000000);
 const r=buildP6BudgetedLineage(project.city,extraction,matching,b);
 assert.ok(r.valid);
 assert.equal(r.faces.find(f=>f.relation==='merge').predecessors.find(p=>p.blockId===a.id).hasOpaqueFields,true);
 const altered={...matching,merged:matching.merged.map(g=>({...g,overlapArea:g.overlapArea+100}))};
 const failed=buildP6BudgetedLineage(project.city,extraction,altered,b);
 assert.equal(failed.valid,false);assert.deepEqual(failed.faces,[]);
 assert.throws(()=>buildP6BudgetedLineage(project.city,extraction,matching),/Shared P6 budget/);
 assert.equal(a.customZoningNote,'owner-preserved');
});
